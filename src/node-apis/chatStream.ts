import { ipcMain } from "electron";
import type { ToolList, ToolDefinition, ChatHistoryEntry } from "./types/index.types.d.ts";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import crypto from "crypto";
import toolSchema from "./assets/tools.json" with { type: "json" };
import {
    GenerateImage,
    duckDuckGoSearch,
    generateVideo,
    generateAudioOrSFX,
    type ImageGenerateRequest,
    type VideoGenerateRequest,
} from "./helper/tools.js";

import {
	save_stream, is52458,
} from "./utils.js";

import {
    issueProxyToken
} from "./auth.js"
let chatHistory: ChatHistoryEntry[] = [];
const availableTools = toolSchema as ToolDefinition[];
let chatAbortController: AbortController | null = null;
export async function createOpenAIClient(baseURL?: string): Promise<OpenAI> {
	console.log("Creating openai client");
	console.log(baseURL);
	if (!baseURL) {
		return new OpenAI({
			baseURL: "http://localhost:11434/v1/",
			apiKey: "ollama",
		});
	}

	if (is52458(baseURL)) {
		const token = await issueProxyToken();
		baseURL = baseURL.replace(/\/$/, "");
		return new OpenAI({
			baseURL: `${baseURL}/v1`,
			apiKey: token,
		});
	}

	if (baseURL == "lightning") {
		return new OpenAI({
			baseURL: "https://sharktide-lightning.hf.space/gen",
			apiKey: "No key needed, rate limited by user",
		});
	}

	return new OpenAI({
		baseURL,
		apiKey: "ollama",
	});
}

const IMAGE_MODE_VALUES = ["auto", "fantasy", "realistic"] as const;
const VIDEO_RATIO_VALUES = ["3:2", "2:3", "1:1"] as const;
const VIDEO_MODE_VALUES = ["normal", "fun"] as const;
const DEFAULT_IMAGE_MODE = "auto";
const DEFAULT_VIDEO_DURATION = 5;

type ImageMode = (typeof IMAGE_MODE_VALUES)[number];
type VideoRatio = (typeof VIDEO_RATIO_VALUES)[number];
type VideoMode = (typeof VIDEO_MODE_VALUES)[number];
type AudioGenerateRequest = { prompt: string };

type NormalizedImageRequest = ImageGenerateRequest & {
	prompt: string;
	mode: ImageMode;
};

type NormalizedVideoRequest = VideoGenerateRequest & {
	prompt: string;
	ratio: VideoRatio;
	mode: VideoMode;
	duration: number;
	image_urls: string[];
};

type NormalizedAudioRequest = AudioGenerateRequest & {
	prompt: string;
};

type PendingToolResolver<T> = {
	resolve: (value: T | null) => void;
	reject: (reason?: unknown) => void;
};

const pendingImageToolResolvers = new Map<
    string,
    PendingToolResolver<NormalizedImageRequest>
>();
const pendingVideoToolResolvers = new Map<
    string,
    PendingToolResolver<NormalizedVideoRequest>
>();
const pendingAudioToolResolvers = new Map<
    string,
    PendingToolResolver<NormalizedAudioRequest>
>();

function normalizeImageMode(value: unknown): ImageMode {
    if (typeof value === "string") {
        const mode = value.trim() as ImageMode;
        if (IMAGE_MODE_VALUES.includes(mode)) return mode;
    }
    return DEFAULT_IMAGE_MODE;
}

function normalizePrompt(
    value: unknown,
    errorMessage: string,
    source: "model" | "user",
): string {
    const prompt = typeof value === "string" ? value.trim() : "";
    if (!prompt && source === "user") throw new Error(errorMessage);
    return prompt;
}

function normalizeImageRequest(
    args: unknown,
    source: "model" | "user",
): NormalizedImageRequest {
    const obj =
        args && typeof args === "object"
            ? (args as Record<string, unknown>)
            : {};

    return {
        prompt: normalizePrompt(obj.prompt, "Image prompt is required", source),
        mode: normalizeImageMode(obj.mode),
    };
}

function normalizeVideoRatio(value: unknown): VideoRatio {
    if (typeof value === "string") {
        const ratio = value.trim() as VideoRatio;
        if (VIDEO_RATIO_VALUES.includes(ratio)) return ratio;
    }
    return "3:2";
}

function normalizeVideoMode(value: unknown): VideoMode {
    if (typeof value === "string") {
        const mode = value.trim() as VideoMode;
        if (VIDEO_MODE_VALUES.includes(mode)) return mode;
    }
    return "normal";
}

function normalizeVideoDuration(value: unknown): number {
    let parsed = DEFAULT_VIDEO_DURATION;
    if (typeof value === "number" && Number.isFinite(value)) {
        parsed = Math.round(value);
    } else if (
        typeof value === "string" &&
        value.trim().length > 0 &&
        !Number.isNaN(Number(value))
    ) {
        parsed = Math.round(Number(value));
    }
    return Math.min(30, Math.max(1, parsed));
}

function normalizeImageUrls(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .slice(0, 2);
}

function normalizeVideoRequest(
    args: unknown,
    source: "model" | "user",
): NormalizedVideoRequest {
    const obj =
        args && typeof args === "object"
            ? (args as Record<string, unknown>)
            : {};

    return {
        prompt: normalizePrompt(obj.prompt, "Video prompt is required", source),
        ratio: normalizeVideoRatio(obj.ratio),
        mode: normalizeVideoMode(obj.mode),
        duration: normalizeVideoDuration(obj.duration),
        image_urls:
            source === "user" ? normalizeImageUrls(obj.image_urls) : [],
    };
}

function normalizeAudioRequest(
    args: unknown,
    source: "model" | "user",
): NormalizedAudioRequest {
    const obj =
        args && typeof args === "object"
            ? (args as Record<string, unknown>)
            : {};

    return {
        prompt: normalizePrompt(obj.prompt, "Audio prompt is required", source),
    };
}

function waitForToolRequestInput<T>(
    resolverMap: Map<string, PendingToolResolver<T>>,
    toolCallId: string,
    fallback: T,
    abortSignal: AbortSignal,
    timeoutMs = 90000,
): Promise<T | null> {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            clearTimeout(timer);
            resolverMap.delete(toolCallId);
            abortSignal.removeEventListener("abort", onAbort);
        };

        const onAbort = () => {
            cleanup();
            reject(new DOMException("Chat aborted", "AbortError"));
        };

        const timer = setTimeout(() => {
            cleanup();
            resolve(fallback);
        }, timeoutMs);

        resolverMap.set(toolCallId, {
            resolve: (value) => {
                cleanup();
                resolve(value);
            },
            reject: (reason) => {
                cleanup();
                reject(reason);
            },
        });

        abortSignal.addEventListener("abort", onAbort, { once: true });
    });
}

function waitForImageRequestInput(
    toolCallId: string,
    fallback: NormalizedImageRequest,
    abortSignal: AbortSignal,
    timeoutMs = 90000,
): Promise<NormalizedImageRequest | null> {
    return waitForToolRequestInput(
        pendingImageToolResolvers,
        toolCallId,
        fallback,
        abortSignal,
        timeoutMs,
    );
}

function waitForVideoRequestInput(
    toolCallId: string,
    fallback: NormalizedVideoRequest,
    abortSignal: AbortSignal,
    timeoutMs = 90000,
): Promise<NormalizedVideoRequest | null> {
    return waitForToolRequestInput(
        pendingVideoToolResolvers,
        toolCallId,
        fallback,
        abortSignal,
        timeoutMs,
    );
}

function waitForAudioRequestInput(
    toolCallId: string,
    fallback: NormalizedAudioRequest,
    abortSignal: AbortSignal,
    timeoutMs = 90000,
): Promise<NormalizedAudioRequest | null> {
    return waitForToolRequestInput(
        pendingAudioToolResolvers,
        toolCallId,
        fallback,
        abortSignal,
        timeoutMs,
    );
}

const systemPrompt =
	"You are a helpful assistant that does what the user wants and uses tools when appropriate. Don't use single backslashes! Use tools to help the user with their requests. You have the abilities to search the web and generate images/video/audio if the user enables them and you should tell the user to enable them if they are asking for them and you don't have access to the tool. When you generate media, it is automatically displayed to the user, so do not include URLs in your responses. For image generation, fill prompt and mode (auto/fantasy/realistic), using auto by default unless the user asks for a style. For video generation, fill prompt/ratio/mode/duration, and leave image_urls empty unless the user explicitly provided source images. Do not be technical with the user unless they ask for it.";

function messagesForModel(history: ChatHistoryEntry[]): any[] {
	return history.map((m) => {
		if (m.role === "tool") {
			return {
				role: "tool",
				tool_call_id: (m as any).tool_call_id,
				content: m.content,
			};
		}

		if (m.role === "assistant" && (m as any).tool_calls) {
			return {
				role: "assistant",
				content: "",
				tool_calls: (m as any).tool_calls,
			};
		}

		return { role: m.role, content: m.content };
	});
}

/**
 * Registers the **ollama:chat‑stream** IPC handler.
 * Call this once (e.g. at the end of `register.ts`).
 */
export default function registerChatStream() {
        ipcMain.handle(
            "ollama:auto-name-session",
            async (
                _event: IpcMainInvokeEvent,
                model: string,
                prompt: string,
                clientUrl?: string,
            ): Promise<string> => {
                try {
                    const openai = await createOpenAIClient(clientUrl);
                    const messages: ChatCompletionMessageParam[] = [
                        {
                            role: "system",
                            content: `
                            You are an assistant that generates a concise, descriptive, memorable title
                            for a conversation based on its content.
                            Do NOT include quotes, punctuation at the ends, or extra words.
                            Keep it under 5 words.
                                    `.trim(),
                        },
                        {
                            role: "user",
                            content: `Conversation prompt:\n${prompt}`,
                        },
                    ];
    
                    const completion = await openai.chat.completions.create({
                        model,
                        messages,
                        max_tokens: 20,
                    });
    
                    let title =
                        completion.choices?.[0]?.message?.content?.trim() ??
                        "Untitled Session";
    
                    if (
                        (title.startsWith('"') && title.endsWith('"')) ||
                        (title.startsWith("'") && title.endsWith("'"))
                    ) {
                        title = title.slice(1, -1).trim();
                    }
    
                    return title || "Untitled Session";
                } catch (err) {
                    console.error("Auto-name session failed:", err);
                    return "Untitled Session";
                }
            },
        );
        ipcMain.handle("ollama:reset", () => {
            chatHistory = [];
        });
    
        ipcMain.handle(
            "ollama:resolve-image-tool-call",
            async (
                _event: IpcMainInvokeEvent,
                toolCallId: string,
                payload: unknown,
            ): Promise<boolean> => {
                if (!toolCallId || typeof toolCallId !== "string") return false;
                const pending = pendingImageToolResolvers.get(toolCallId);
                if (!pending) return false;
    
                if (payload === null) {
                    pending.resolve(null);
                    return true;
                }
    
                const normalized = normalizeImageRequest(payload, "user");
                pending.resolve(normalized);
                return true;
            },
        );
    
        ipcMain.handle(
            "ollama:resolve-video-tool-call",
            async (
                _event: IpcMainInvokeEvent,
                toolCallId: string,
                payload: unknown,
            ): Promise<boolean> => {
                if (!toolCallId || typeof toolCallId !== "string") return false;
                const pending = pendingVideoToolResolvers.get(toolCallId);
                if (!pending) return false;
    
                if (payload === null) {
                    pending.resolve(null);
                    return true;
                }
    
                const normalized = normalizeVideoRequest(payload, "user");
                pending.resolve(normalized);
                return true;
            },
        );
    
        ipcMain.handle(
            "ollama:resolve-audio-tool-call",
            async (
                _event: IpcMainInvokeEvent,
                toolCallId: string,
                payload: unknown,
            ): Promise<boolean> => {
                if (!toolCallId || typeof toolCallId !== "string") return false;
                const pending = pendingAudioToolResolvers.get(toolCallId);
                if (!pending) return false;
    
                if (payload === null) {
                    pending.resolve(null);
                    return true;
                }
    
                const normalized = normalizeAudioRequest(payload, "user");
                pending.resolve(normalized);
                return true;
            },
        );
	ipcMain.on(
		"ollama:chat-stream",
		async (
			event: IpcMainEvent,
			modelName: string,
			userMessage: string,
			toolList: ToolList,
			clientUrl?: string,
		) => {
            console.log(toolList)
			/* ------------------------------------------------------------------
			 *  The whole body of the original listener is copied verbatim.
			 *  Only a few small adjustments were needed:
			 *   – all imported symbols that lived in the same file are now
			 *     imported from "./register".
			 *   – the function is wrapped in a named export.
			 * ------------------------------------------------------------------ */
			const abortController = new AbortController();
			chatAbortController = abortController;

			const abortIfNeeded = () => {
				if (abortController.signal.aborted) {
					throw new DOMException("Chat aborted", "AbortError");
				}
			};

			const tools = [];
			if (toolList.search) tools.push(availableTools[0]!);
			if (toolList.imageGen) tools.push(availableTools[1]!);
			if (toolList.audioGen) tools.push(availableTools[2]!);
			if (toolList.videoGen) tools.push(availableTools[3]!);

			chatHistory.push({ role: "user", content: userMessage });

			const openai = await createOpenAIClient(clientUrl);

			try {
				const messages = [
					{ role: "system", content: systemPrompt },
					...messagesForModel(chatHistory),
				];

				const stream = await openai.chat.completions.create(
					{
						model: modelName,
						messages,
						tools,
						stream: true,
					},
					{ signal: abortController.signal },
				);

				let assistantMessage = "";
				const toolCallBuffer = new Map<
					number,
					{ id?: string; name?: string; arguments: string }
				>();

				for await (const chunk of stream) {
					abortIfNeeded();

					const delta = chunk.choices?.[0]?.delta;
					if (!delta) continue;

					if (delta.content) {
						assistantMessage += delta.content;
						event.sender.send("ollama:chat-token", delta.content);
					}

					if (delta.tool_calls) {
						for (const call of delta.tool_calls) {
							const entry = toolCallBuffer.get(call.index) ?? { arguments: "" };
							if (call.id) entry.id = call.id;
							if (call.function?.name) entry.name = call.function.name;
							if (call.function?.arguments) entry.arguments += call.function.arguments;
							toolCallBuffer.set(call.index, entry);
						}
					}
				}

				const finalizedToolCalls = [...toolCallBuffer.entries()].map(
					([, data]) => ({
						id:
							data.id && data.id.trim()
								? data.id
								: `call_${crypto.randomUUID()}`,
						type: "function",
						function: {
							name: data.name!,
							arguments: data.arguments,
						},
					}),
				);

				if (assistantMessage.trim()) {
					chatHistory.push({
						role: "assistant",
						content: assistantMessage,
					});
				}

				/* --------------------------------------------------------------- *
				 *   TOOL‑CALL PROCESSING – this block is exactly the same as in
				 *   the original file, only the helpers are imported from
				 *   "./register".  The logic (search, generate_image, generate_video,
				 *   generate_audio) stays untouched.
				 * --------------------------------------------------------------- */
				if (finalizedToolCalls.length) {
					chatHistory.push({
						role: "assistant",
						content: "",
						tool_calls: finalizedToolCalls,
					});

					for (const toolCall of finalizedToolCalls) {
						abortIfNeeded();

						const args = (() => {
							try {
								return JSON.parse(toolCall.function.arguments || "{}");
							} catch {
								return {};
							}
						})() as Record<string, unknown>;

						let toolResult: any;
						let toolState: "resolved" | "canceled" = "resolved";
						let resolvedToolOptions: any;

						/* ---- DuckDuckGo search --------------------------------------------------- */
						if (toolCall.function.name === "duckduckgo_search") {
							event.sender.send("ollama:new_tool_call", {
								id: toolCall.id,
								name: toolCall.function.name,
								arguments: toolCall.function.arguments,
								state: "pending",
							});
							const query = typeof args.query === "string" ? args.query.trim() : "";
							if (!query) throw new Error("Search query is required");
							toolResult = await duckDuckGoSearch(query);
						}

						/* ---- Image generation ---------------------------------------------------- */
						if (toolCall.function.name === "generate_image") {
							const suggested = normalizeImageRequest(args, "model");
							resolvedToolOptions = suggested;

							event.sender.send("ollama:new_tool_call", {
								id: toolCall.id,
								name: toolCall.function.name,
								arguments: JSON.stringify(suggested),
								tool_options: suggested,
								state: "awaiting_input",
							});

							const selected = await waitForImageRequestInput(
								toolCall.id,
								suggested,
								abortController.signal,
							);

							abortIfNeeded();

							if (!selected) {
								toolState = "canceled";
								toolResult = "Image generation was canceled before execution.";
							} else if (!selected.prompt) {
								toolState = "canceled";
								toolResult = "Image generation was canceled because a prompt was not provided.";
							} else {
								resolvedToolOptions = selected;
								event.sender.send("ollama:new_tool_call", {
									id: toolCall.id,
									name: toolCall.function.name,
									arguments: JSON.stringify(selected),
									tool_options: selected,
									state: "pending",
								});

								const { dataUrl } = await GenerateImage(selected);
								event.sender.send("ollama:new-asset", {
									role: "image",
									content: dataUrl,
								});
								toolResult = "Image generated successfully and shown to the user.";
							}
						}

						/* ---- Video generation ---------------------------------------------------- */
						if (toolCall.function.name === "generate_video") {
							const suggested = normalizeVideoRequest(args, "model");
							resolvedToolOptions = suggested;

							event.sender.send("ollama:new_tool_call", {
								id: toolCall.id,
								name: toolCall.function.name,
								arguments: JSON.stringify(suggested),
								tool_options: suggested,
								state: "awaiting_input",
							});

							const selected = await waitForVideoRequestInput(
								toolCall.id,
								suggested,
								abortController.signal,
							);

							abortIfNeeded();

							if (!selected) {
								toolState = "canceled";
								toolResult = "Video generation was canceled before execution.";
							} else if (!selected.prompt) {
								toolState = "canceled";
								toolResult = "Video generation was canceled because a prompt was not provided.";
							} else {
								resolvedToolOptions = selected;
								event.sender.send("ollama:new_tool_call", {
									id: toolCall.id,
									name: toolCall.function.name,
									arguments: JSON.stringify(selected),
									tool_options: selected,
									state: "pending",
								});

								const video = await generateVideo(selected);
								const videoBlob = new Blob([video], { type: "video/mp4" });
								const assetID = await save_stream(videoBlob);
								event.sender.send("ollama:new-asset", {
									role: "video",
									content: assetID,
								});
								toolResult = "Video generated successfully and shown to the user.";
							}
						}

						/* ---- Audio generation ---------------------------------------------------- */
						if (toolCall.function.name === "generate_audio") {
							const suggested = normalizeAudioRequest(args, "model");
							resolvedToolOptions = suggested;

							event.sender.send("ollama:new_tool_call", {
								id: toolCall.id,
								name: toolCall.function.name,
								arguments: JSON.stringify(suggested),
								tool_options: suggested,
								state: "awaiting_input",
							});

							const selected = await waitForAudioRequestInput(
								toolCall.id,
								suggested,
								abortController.signal,
							);

							abortIfNeeded();

							if (!selected) {
								toolState = "canceled";
								toolResult = "Audio generation was canceled before execution.";
							} else if (!selected.prompt) {
								toolState = "canceled";
								toolResult = "Audio generation was canceled because a prompt was not provided.";
							} else {
								resolvedToolOptions = selected;
								event.sender.send("ollama:new_tool_call", {
									id: toolCall.id,
									name: toolCall.function.name,
									arguments: JSON.stringify(selected),
									tool_options: selected,
									state: "pending",
								});

								const audio = await generateAudioOrSFX(selected.prompt);
								const audioBlob = new Blob([audio], { type: "audio/mpeg" });
								const assetID = await save_stream(audioBlob);
								event.sender.send("ollama:new-asset", {
									role: "audio",
									content: assetID,
								});
								toolResult = "Audio generated successfully and shown to the user.";
							}
						}

						if (typeof toolResult === "undefined") {
							toolResult = "Tool completed.";
						}

						chatHistory.push({
							role: "tool",
							content: JSON.stringify(toolResult),
							tool_call_id: toolCall.id,
						});

						event.sender.send("ollama:new_tool_call", {
							id: toolCall.id,
							name: toolCall.function.name,
							result: toolResult,
							state: toolState,
							...(resolvedToolOptions
								? {
										arguments: JSON.stringify(resolvedToolOptions),
										tool_options: resolvedToolOptions,
								  }
								: {}),
						});
					}

					/* ----------------------------------------------------------------------- *
					 *   AFTER ALL TOOL CALLS – let the model produce a follow‑up reply.
					 * ----------------------------------------------------------------------- */
					const followUpOpenAI = await createOpenAIClient(clientUrl);
					const followUpStream = await followUpOpenAI.chat.completions.create(
						{
							model: modelName,
							messages: [
								{ role: "system", content: systemPrompt },
								...messagesForModel(chatHistory),
							],
							stream: true,
						},
						{ signal: abortController.signal },
					);

					assistantMessage = "";
					for await (const chunk of followUpStream) {
						abortIfNeeded();
						const delta = chunk.choices?.[0]?.delta;
						if (delta?.content) {
							assistantMessage += delta.content;
							event.sender.send("ollama:chat-token", delta.content);
						}
					}
					if (assistantMessage.trim()) {
						chatHistory.push({
							role: "assistant",
							content: assistantMessage,
						});
					}
				}

				event.sender.send("ollama:chat-done");
			} catch (err: any) {
				if (err instanceof DOMException && err.name === "AbortError") {
					event.sender.send("ollama:chat-aborted");
				} else {
					event.sender.send("ollama:chat-error", String(err));
				}
			} finally {
				const allPending = [
					...pendingImageToolResolvers.values(),
					...pendingVideoToolResolvers.values(),
					...pendingAudioToolResolvers.values(),
				];
				pendingImageToolResolvers.clear();
				pendingVideoToolResolvers.clear();
				pendingAudioToolResolvers.clear();

				for (const pending of allPending) {
					pending.reject(new DOMException("Chat ended", "AbortError"));
				}

				if (chatAbortController === abortController) {
					chatAbortController = null;
				}
			}
		},
	);
    ipcMain.on("ollama:stop", (): void => {
        if (chatAbortController) {
            console.log("[CHAT] Aborting chat stream");
            chatAbortController.abort();
            chatAbortController = null;
        }
    });
}
