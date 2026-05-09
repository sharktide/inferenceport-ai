import { ipcMain } from "electron";
import type {
	ToolList,
	ToolDefinition,
	ChatHistoryEntry,
	MessageContent,
	UserContentPart,
} from "./types/index.types.d.ts";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import crypto from "crypto";
import toolSchema from "./assets/tools.json" with { type: "json" };
import {
    GenerateImage,
    duckDuckGoSearch,
    ollamaSearch,
    readWebPage,
    generateVideo,
    generateAudioOrSFX,
    type ImageGenerateRequest,
    type VideoGenerateRequest,
} from "./helper/tools.js";
import {
	executeCustomTool,
	getCustomToolByFunctionName,
	getLocalCustomToolById,
	toToolDefinition,
} from "./helper/customTools.js";
import { getLightningClientId } from "./helper/lightningClient.js";

import {
	save_stream, is52458,
} from "./utils.js";

import {
    issueProxyToken,
	getSession,
} from "./auth.js"
import { broadcastIpcEvent } from "./helper/ipcBridge.js";
import { defaultSecure52458Fetch } from "./helper/proxy52458Client.js";

const chatHistories = new Map<string, ChatHistoryEntry[]>();
const DEFAULT_CHAT_HISTORY_KEY = "__default__";

function normalizeHistoryKey(value: unknown): string {
	if (typeof value !== "string") return DEFAULT_CHAT_HISTORY_KEY;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : DEFAULT_CHAT_HISTORY_KEY;
}

function getChatHistoryForSession(sessionId: unknown): ChatHistoryEntry[] {
	const key = normalizeHistoryKey(sessionId);
	const existing = chatHistories.get(key);
	if (existing) return existing;
	const created: ChatHistoryEntry[] = [];
	chatHistories.set(key, created);
	return created;
}

const availableTools = toolSchema as ToolDefinition[];
let chatAbortController: AbortController | null = null;
const snipAbortControllers = new Map<string, AbortController>();

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
			fetch: defaultSecure52458Fetch as typeof fetch,
		});
	}

	if (baseURL == "lightning") {
		let lightningApiKey = "public";
		const defaultHeaders: Record<string, string> = {};
		try {
			defaultHeaders["X-Client-ID"] = await getLightningClientId();
		} catch (_err) {
			void 0;
		}
		try {
			const session = await getSession();
			if (session?.access_token) {
				lightningApiKey = session.access_token;
			}
		} catch (_e) {
			void 0;
		}
		return new OpenAI({
			baseURL: "https://sharktide-lightning.hf.space/gen",
			apiKey: lightningApiKey,
			defaultHeaders,
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
	image_urls: string[];
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
const pendingCustomToolResolvers = new Map<
	string,
	PendingToolResolver<boolean>
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
	    image_urls: normalizeImageUrls(obj.image_urls, "image"),
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

function normalizeImageUrls(value: unknown, type: "image" | "video"): string[] {
    if (!Array.isArray(value)) return [];

    const limit = type === "image" ? 4 : 2;

    return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((url) => {
            if (!url) return false;

            return (
                url.startsWith("http://") ||
                url.startsWith("https://") ||
                url.startsWith("data:image/") ||
                url.startsWith("blob:")
            );
        })
        .slice(0, limit);
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
        image_urls: normalizeImageUrls(obj.image_urls, "video"),
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

function waitForCustomToolApproval(
	toolCallId: string,
	abortSignal: AbortSignal,
	timeoutMs = 90000,
): Promise<boolean | null> {
	return waitForToolRequestInput(
		pendingCustomToolResolvers,
		toolCallId,
		false,
		abortSignal,
		timeoutMs,
	);
}

async function persistGeneratedImage(dataUrl: string, sessionId?: string): Promise<string> {
	const trimmed = typeof dataUrl === "string" ? dataUrl.trim() : "";
	if (!trimmed) return trimmed;
	if (!trimmed.startsWith("data:")) return trimmed;

	try {
		const imageResponse = await fetch(trimmed);
		if (!imageResponse.ok) return trimmed;
		const blob = await imageResponse.blob();
		const mimeType = blob.type || "image/png";
		return await save_stream(blob, {
			kind: "image",
			mimeType,
			sessionId: sessionId || null,
			name: `generated-image-${Date.now()}.${mimeType.includes("svg") ? "svg" : mimeType.split("/")[1] || "png"}`,
		});
	} catch (err) {
		console.warn("[chatStream] Failed to persist generated image:", err);
		return trimmed;
	}
}

function toInlineMediaDataUrl(
	bytes: Uint8Array | ArrayBuffer,
	mimeType: string,
): string {
	const typed = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	return `data:${mimeType};base64,${Buffer.from(typed).toString("base64")}`;
}

async function ensureInlineImageDataUrl(
	value: string,
): Promise<string> {
	const trimmed = typeof value === "string" ? value.trim() : "";
	if (!trimmed) return trimmed;
	if (trimmed.startsWith("data:")) return trimmed;
	try {
		const response = await fetch(trimmed);
		if (!response.ok) return trimmed;
		const blob = await response.blob();
		const mimeType = blob.type || "image/png";
		return toInlineMediaDataUrl(await blob.arrayBuffer(), mimeType);
	} catch {
		return trimmed;
	}
}

async function runDirectImageToolCall(
	toolCallId: string,
	payload?: unknown,
): Promise<void> {
	const suggested = normalizeImageRequest(payload ?? {}, "model");
	let toolState: "resolved" | "canceled" = "resolved";
	let toolResult: string | undefined;
	let resolvedToolOptions: NormalizedImageRequest | null = suggested;
	const abortController = new AbortController();

	try {
		broadcastIpcEvent("ollama:new_tool_call", {
			id: toolCallId,
			name: "generate_image",
			arguments: JSON.stringify(suggested),
			tool_options: suggested,
			state: "awaiting_input",
		});

		const selected = await waitForImageRequestInput(
			toolCallId,
			suggested,
			abortController.signal,
		);

		if (!selected) {
			toolState = "canceled";
			toolResult = "Image generation was canceled before execution.";
		} else if (!selected.prompt) {
			toolState = "canceled";
			toolResult =
				"Image generation was canceled because a prompt was not provided.";
			resolvedToolOptions = selected;
		} else {
			resolvedToolOptions = selected;
			broadcastIpcEvent("ollama:new_tool_call", {
				id: toolCallId,
				name: "generate_image",
				arguments: JSON.stringify(selected),
				tool_options: selected,
				state: "pending",
			});

			const { dataUrl } = await GenerateImage(selected);
			const persisted = await ensureInlineImageDataUrl(dataUrl);
			broadcastIpcEvent("ollama:new-asset", {
				role: "image",
				content: persisted,
				mimeType: persisted.startsWith("data:image/svg")
					? "image/svg+xml"
					: "image/png",
			});
			toolResult = "Image generated successfully and shown to the user.";
		}
	} catch (err: any) {
		toolState = "canceled";
		toolResult = `Image generation failed: ${String(err)}`;
	}

	broadcastIpcEvent("ollama:new_tool_call", {
		id: toolCallId,
		name: "generate_image",
		result: toolResult ?? "Tool completed.",
		state: toolState,
		...(resolvedToolOptions
			? {
					arguments: JSON.stringify(resolvedToolOptions),
					tool_options: resolvedToolOptions,
			  }
			: {}),
	});
}

async function runDirectVideoToolCall(
	toolCallId: string,
	payload?: unknown,
): Promise<void> {
	const suggested = normalizeVideoRequest(payload ?? {}, "model");
	let toolState: "resolved" | "canceled" = "resolved";
	let toolResult: string | undefined;
	let resolvedToolOptions: NormalizedVideoRequest | null = suggested;
	const abortController = new AbortController();

	try {
		broadcastIpcEvent("ollama:new_tool_call", {
			id: toolCallId,
			name: "generate_video",
			arguments: JSON.stringify(suggested),
			tool_options: suggested,
			state: "awaiting_input",
		});

		const selected = await waitForVideoRequestInput(
			toolCallId,
			suggested,
			abortController.signal,
		);

		if (!selected) {
			toolState = "canceled";
			toolResult = "Video generation was canceled before execution.";
		} else if (!selected.prompt) {
			toolState = "canceled";
			toolResult =
				"Video generation was canceled because a prompt was not provided.";
			resolvedToolOptions = selected;
		} else {
			resolvedToolOptions = selected;
			broadcastIpcEvent("ollama:new_tool_call", {
				id: toolCallId,
				name: "generate_video",
				arguments: JSON.stringify(selected),
				tool_options: selected,
				state: "pending",
			});

			const video = await generateVideo(selected);
			const assetID = toInlineMediaDataUrl(video, "video/mp4");
			broadcastIpcEvent("ollama:new-asset", {
				role: "video",
				content: assetID,
				mimeType: "video/mp4",
			});
			toolResult = "Video generated successfully and shown to the user.";
		}
	} catch (err: any) {
		toolState = "canceled";
		toolResult = `Video generation failed: ${String(err)}`;
	}

	broadcastIpcEvent("ollama:new_tool_call", {
		id: toolCallId,
		name: "generate_video",
		result: toolResult ?? "Tool completed.",
		state: toolState,
		...(resolvedToolOptions
			? {
					arguments: JSON.stringify(resolvedToolOptions),
					tool_options: resolvedToolOptions,
			  }
			: {}),
	});
}

async function runDirectAudioToolCall(
	toolCallId: string,
	payload?: unknown,
): Promise<void> {
	const suggested = normalizeAudioRequest(payload ?? {}, "model");
	let toolState: "resolved" | "canceled" = "resolved";
	let toolResult: string | undefined;
	let resolvedToolOptions: NormalizedAudioRequest | null = suggested;
	const abortController = new AbortController();

	try {
		broadcastIpcEvent("ollama:new_tool_call", {
			id: toolCallId,
			name: "generate_audio",
			arguments: JSON.stringify(suggested),
			tool_options: suggested,
			state: "awaiting_input",
		});

		const selected = await waitForAudioRequestInput(
			toolCallId,
			suggested,
			abortController.signal,
		);

		if (!selected) {
			toolState = "canceled";
			toolResult = "Audio generation was canceled before execution.";
		} else if (!selected.prompt) {
			toolState = "canceled";
			toolResult =
				"Audio generation was canceled because a prompt was not provided.";
			resolvedToolOptions = selected;
		} else {
			resolvedToolOptions = selected;
			broadcastIpcEvent("ollama:new_tool_call", {
				id: toolCallId,
				name: "generate_audio",
				arguments: JSON.stringify(selected),
				tool_options: selected,
				state: "pending",
			});

			const audio = await generateAudioOrSFX(selected.prompt);
			const assetID = toInlineMediaDataUrl(audio, "audio/mpeg");
			broadcastIpcEvent("ollama:new-asset", {
				role: "audio",
				content: assetID,
				mimeType: "audio/mpeg",
			});
			toolResult = "Audio generated successfully and shown to the user.";
		}
	} catch (err: any) {
		toolState = "canceled";
		toolResult = `Audio generation failed: ${String(err)}`;
	}

	broadcastIpcEvent("ollama:new_tool_call", {
		id: toolCallId,
		name: "generate_audio",
		result: toolResult ?? "Tool completed.",
		state: toolState,
		...(resolvedToolOptions
			? {
				arguments: JSON.stringify(resolvedToolOptions),
				tool_options: resolvedToolOptions,
			}
			: {}),
	});
}


const systemPrompt =
  "CRITICAL RULE: Every response MUST use HTML <span data-color=\\\"{COLOR NAME}\\\"> tags to color main points and headings UNLESS THE USER ASKS FOR NO COLOR" +
  "COLORS MUST HAVE MEANING AND CONSISTENCY ACROSS THE ENTIRE CONVERSATION IF USED. " +  "You may ONLY use the following semantic color names: " +
  "green, pink, blue, red, orange, yellow, purple, teal, gold, coral. " +
  "Never output text formatted with explicit black or white colors — no exceptions. " +
  "Use a variety of colors throughout every response to distinguish headings, sections, and key terms UNLESS THE USER ASKS NO COLOR. " +
  "Color should guide the reader and reinforce meaning. " +
  "Keep code blocks plain, but color headings and important points in surrounding text. " +
  "Ensure sufficient contrast for readability, but NO DARK OR EXTRA‑BRIGHT COLORS. " +
  "Use only the color options provided in the format provided. " +
  "Avoid grey, black, or white text — use unformatted text instead. " +
  "Do not over‑color responses. Use color intentionally and sparingly. " +

  "CRITICAL RULE: MARKDOWN FORMATTING SUCH AS #, ##, ###, ####, #####, **, * MUST BE PLACED OUTSIDE <span> tags in most scenarios. " +
  "EXAMPLE OF WHAT NOT TO DO: <span data-color=\\\"{COLOR NAME}\\\"># This is a heading</span> " +
  "EXAMPLE OF WHAT TO DO: # <span data-color=\\\"{COLOR NAME}\\\">This is a heading</span> " +

  "You are a helpful, friendly AI assistant. Use tools when appropriate to help the user. " +
  "If the user asks for a capability you don't have access to (web search, image/video/audio generation), " +
  "tell them to enable it in settings. When generating media, do not include URLs — it is displayed automatically. " +

  "Media generation rules: " +
  "Images: provide prompt and mode (auto/fantasy/realistic; default: auto). " +
  "Video: provide prompt, ratio, mode, and duration; leave image_urls empty unless the user explicitly provides source images. " +
  "CRITICAL RULE: Never ask the user to upload an image or video before you call the tool. Always call the tool first, then the user can automatically upload if needed. " +
  "You can render SVG images by outputting SVG code in a code block tagged exactly as:\n" +
  "```svg\n<svg>...</svg>\n```\n" +
  "(Always open with ```svg, then a newline, then the SVG XML, then a newline, then closing triple backticks.) " +

  "Never use single backslashes. Don't be overly technical unless the user asks. You may use emojis where appropriate. " +
  "CRITICAL RULE Never use square brackets or parenthesis \\(\\) spanning multiple lines within latex eg. \\[...\\]. RESPONSE must be USING ONLY $ AND $$ FOR LATEX " +
  "REMINDER: Color every response with <span data-color=\\\"{COLOR NAME}\\\"> tags. Never return plain text UNLESS THE USER ASKS TO NOT USE COLOR. " +
  "And use markdown for everything other than coloring your text. Use tables, lists, and other markdown elements.";


function flattenNonUserContent(content: MessageContent): string {
	if (typeof content === "string") return content;
	return content
		.filter((p): p is Extract<UserContentPart, { type: "text" }> => p.type === "text")
		.map((p) => p.text)
		.join("\n");
}

function messagesForModel(history: ChatHistoryEntry[]): any[] {
	return history.map((m) => {
		if (m.role === "tool") {
			return {
				role: "tool",
				tool_call_id: (m as any).tool_call_id,
				content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
			};
		}

		if (m.role === "assistant" && (m as any).tool_calls) {
			return {
				role: "assistant",
				content: "",
				tool_calls: (m as any).tool_calls,
			};
		}

		// Only user messages may legally be multimodal content arrays for Chat Completions.
		if (m.role === "user") {
			return { role: "user", content: m.content };
		}

		return { role: m.role, content: flattenNonUserContent(m.content) };
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
        ipcMain.handle("ollama:reset", (_event, sessionId?: string) => {
            if (typeof sessionId === "string" && sessionId.trim()) {
                chatHistories.delete(sessionId.trim());
                return;
            }
            chatHistories.clear();
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
        ipcMain.handle(
            "ollama:resolve-custom-tool-call",
            async (
                _event: IpcMainInvokeEvent,
                toolCallId: string,
                approved: unknown,
            ): Promise<boolean> => {
                if (!toolCallId || typeof toolCallId !== "string") return false;
                const pending = pendingCustomToolResolvers.get(toolCallId);
                if (!pending) return false;
                pending.resolve(Boolean(approved));
                return true;
            },
        );
        ipcMain.handle(
            "ollama:start-image-tool-call",
            async (
                _event: IpcMainInvokeEvent,
                payload?: unknown,
            ): Promise<string> => {
                const toolCallId = `call_${crypto.randomUUID()}`;
                void runDirectImageToolCall(toolCallId, payload);
                return toolCallId;
            },
        );

        ipcMain.handle(
            "ollama:start-video-tool-call",
            async (
                _event: IpcMainInvokeEvent,
                payload?: unknown,
            ): Promise<string> => {
                const toolCallId = `call_${crypto.randomUUID()}`;
                void runDirectVideoToolCall(toolCallId, payload);
                return toolCallId;
            },
        );

        ipcMain.handle(
            "ollama:start-audio-tool-call",
            async (
                _event: IpcMainInvokeEvent,
                payload?: unknown,
            ): Promise<string> => {
                const toolCallId = `call_${crypto.randomUUID()}`;
                void runDirectAudioToolCall(toolCallId, payload);
                return toolCallId;
            },
        );

	ipcMain.on(
		"ollama:chat-stream",
		async (
			event: IpcMainEvent,
			modelName: string,
			userMessage: MessageContent,
			toolList: ToolList,
			clientUrl?: string,
			sessionId?: string,
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

			const tools: ToolDefinition[] = [];
			const customToolIds = Array.isArray(toolList.customToolIds)
				? toolList.customToolIds
						.filter((entry): entry is string => typeof entry === "string")
						.map((entry) => entry.trim())
						.filter((entry) => entry.length > 0)
				: [];
			const customToolDefinitions = customToolIds
				.map((id) => getLocalCustomToolById(id))
				.filter((tool): tool is NonNullable<typeof tool> => Boolean(tool))
				.map((tool) => toToolDefinition(tool));
			const toolsEnabled =
				toolList.search ||
				toolList.imageGen ||
				toolList.audioGen ||
				toolList.videoGen ||
				customToolDefinitions.length > 0;
			
			if (toolsEnabled) {
				if (toolList.search) {
					const readWebPageTool = availableTools.find(t => t.function.name === "read_web_page");
					if (readWebPageTool) tools.push(readWebPageTool);
				}
				if (toolList.search) {
					if (toolList.searchEngine.includes("ollama")) {
						tools.push(availableTools.find(t => t.function.name === "ollama_search") as ToolDefinition);
					}
					if (toolList.searchEngine.includes("duckduckgo")) {
						tools.push(availableTools.find(t => t.function.name === "duckduckgo_search") as ToolDefinition);
					}
					if (toolList.searchEngine.length === 0) console.warn("Search enabled, but no search engines provided")
				}
				if (toolList.imageGen) {
					tools.push(availableTools.find(t => t.function.name === "generate_image") as ToolDefinition);
				}
				if (toolList.audioGen) {
					tools.push(availableTools.find(t => t.function.name === "generate_audio") as ToolDefinition);
				}
				if (toolList.videoGen) {
					tools.push(availableTools.find(t => t.function.name === "generate_video") as ToolDefinition);
				}
				if (customToolDefinitions.length > 0) {
					tools.push(...customToolDefinitions);
				}
				console.log(tools)
			}

			const chatHistory = getChatHistoryForSession(sessionId);
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
						broadcastIpcEvent("ollama:chat-token", delta.content);
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
							broadcastIpcEvent("ollama:new_tool_call", {
								id: toolCall.id,
								name: toolCall.function.name,
								arguments: toolCall.function.arguments,
								state: "pending",
							});
							const query = typeof args.query === "string" ? args.query.trim() : "";
							if (!query) throw new Error("Search query is required");
							toolResult = await duckDuckGoSearch(query);
						}

						/* ---- Ollama search --------------------------------------------------- */
						if (toolCall.function.name === "ollama_search") {
							broadcastIpcEvent("ollama:new_tool_call", {
								id: toolCall.id,
								name: toolCall.function.name,
								arguments: toolCall.function.arguments,
								state: "pending",
							});
							const query = typeof args.query === "string" ? args.query.trim() : "";
							if (!query) throw new Error("Search query is required");
							toolResult = await ollamaSearch(query);
						}

						/* ---- Read web page --------------------------------------------------- */
						if (toolCall.function.name === "read_web_page") {
							broadcastIpcEvent("ollama:new_tool_call", {
								id: toolCall.id,
								name: toolCall.function.name,
								arguments: toolCall.function.arguments,
								state: "pending",
							});
							const url = typeof args.url === "string" ? args.url.trim() : "";
							if (!url) throw new Error("URL is required");
							toolResult = await readWebPage(url);
						}

						/* ---- Image generation ---------------------------------------------------- */
						if (toolCall.function.name === "generate_image") {
							const suggested = normalizeImageRequest(args, "model");
							resolvedToolOptions = suggested;

							broadcastIpcEvent("ollama:new_tool_call", {
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
								broadcastIpcEvent("ollama:new_tool_call", {
									id: toolCall.id,
									name: toolCall.function.name,
									arguments: JSON.stringify(selected),
									tool_options: selected,
									state: "pending",
								});

								const { dataUrl } = await GenerateImage(selected);
								const persisted = await persistGeneratedImage(
									dataUrl,
									sessionId,
								);
								broadcastIpcEvent("ollama:new-asset", {
									role: "image",
									content: persisted,
									mimeType: persisted.startsWith("data:image/svg")
										? "image/svg+xml"
										: "image/png",
								});
								toolResult = "Image generated successfully and shown to the user.";
							}
						}

						if (toolCall.function.name === "generate_video") {
							const suggested = normalizeVideoRequest(args, "model");
							resolvedToolOptions = suggested;

							broadcastIpcEvent("ollama:new_tool_call", {
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
								broadcastIpcEvent("ollama:new_tool_call", {
									id: toolCall.id,
									name: toolCall.function.name,
									arguments: JSON.stringify(selected),
									tool_options: selected,
									state: "pending",
								});

								const video = await generateVideo(selected);
								const videoBlob = new Blob([video], { type: "video/mp4" });
								const assetID = await save_stream(videoBlob, {
									kind: "video",
									mimeType: "video/mp4",
									sessionId: sessionId || null,
									name: `generated-video-${Date.now()}.mp4`,
								});
								broadcastIpcEvent("ollama:new-asset", {
									role: "video",
									content: assetID,
									mimeType: "video/mp4",
								});
								toolResult = "Video generated successfully and shown to the user.";
							}
						}

						/* ---- Audio generation ---------------------------------------------------- */
						if (toolCall.function.name === "generate_audio") {
							const suggested = normalizeAudioRequest(args, "model");
							resolvedToolOptions = suggested;

							broadcastIpcEvent("ollama:new_tool_call", {
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
								broadcastIpcEvent("ollama:new_tool_call", {
									id: toolCall.id,
									name: toolCall.function.name,
									arguments: JSON.stringify(selected),
									tool_options: selected,
									state: "pending",
								});

								const audio = await generateAudioOrSFX(selected.prompt);
								const audioBlob = new Blob([audio], { type: "audio/mpeg" });
								const assetID = await save_stream(audioBlob, {
									kind: "audio",
									mimeType: "audio/mpeg",
									sessionId: sessionId || null,
									name: `generated-audio-${Date.now()}.mp3`,
								});
								broadcastIpcEvent("ollama:new-asset", {
									role: "audio",
									content: assetID,
									mimeType: "audio/mpeg",
								});
								toolResult = "Audio generated successfully and shown to the user.";
							}
						}

						const customTool = getCustomToolByFunctionName(
							toolCall.function.name,
						);
						if (customTool) {
							broadcastIpcEvent("ollama:new_tool_call", {
								id: toolCall.id,
								name: toolCall.function.name,
								arguments: toolCall.function.arguments,
								state: "awaiting_approval",
								customTool: {
									id: customTool.id,
									name: customTool.name,
									authorEmail: customTool.authorEmail,
									language: customTool.language,
								},
							});

							const approved = await waitForCustomToolApproval(
								toolCall.id,
								abortController.signal,
							);

							abortIfNeeded();

							if (!approved) {
								toolState = "canceled";
								toolResult =
									"Custom tool execution was canceled by the user.";
							} else {
								broadcastIpcEvent("ollama:new_tool_call", {
									id: toolCall.id,
									name: toolCall.function.name,
									arguments: toolCall.function.arguments,
									state: "pending",
									customTool: {
										id: customTool.id,
										name: customTool.name,
										authorEmail: customTool.authorEmail,
										language: customTool.language,
									},
								});
								toolResult = await executeCustomTool(customTool, args);
							}
						}

						if (typeof toolResult === "undefined") {
							toolResult = "Tool completed.";
						}

						const toolContent =
							typeof toolResult === "string"
								? toolResult
								: JSON.stringify(toolResult);

						chatHistory.push({
							role: "tool",
							content: toolContent,
							tool_call_id: toolCall.id,
						});

						broadcastIpcEvent("ollama:new_tool_call", {
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
							broadcastIpcEvent("ollama:chat-token", delta.content);
						}
					}
					if (assistantMessage.trim()) {
						chatHistory.push({
							role: "assistant",
							content: assistantMessage,
						});
					}
				}

				broadcastIpcEvent("ollama:chat-done");
			} catch (err: any) {
				if (err instanceof DOMException && err.name === "AbortError") {
					broadcastIpcEvent("ollama:chat-aborted");
				} else {
					broadcastIpcEvent("ollama:chat-error", String(err));
				}
			} finally {
				const allPending = [
					...pendingImageToolResolvers.values(),
					...pendingVideoToolResolvers.values(),
					...pendingAudioToolResolvers.values(),
					...pendingCustomToolResolvers.values(),
				];
				pendingImageToolResolvers.clear();
				pendingVideoToolResolvers.clear();
				pendingAudioToolResolvers.clear();
				pendingCustomToolResolvers.clear();

				for (const pending of allPending) {
					pending.reject(new DOMException("Chat ended", "AbortError"));
				}

				if (chatAbortController === abortController) {
					chatAbortController = null;
				}
			}
		},
	);

	ipcMain.on(
		"snip:chat-stream",
		async (
			event: IpcMainEvent,
			modelName: string,
			userMessage: MessageContent,
			clientUrl?: string,
			sessionId?: string,
		) => {
			const key = normalizeHistoryKey(sessionId);

			snipAbortControllers.get(key)?.abort();

			const abortController = new AbortController();
			snipAbortControllers.set(key, abortController);

			const abortIfNeeded = () => {
				if (abortController.signal.aborted) {
					throw new DOMException("Chat aborted", "AbortError");
				}
			};

			const chatHistory = getChatHistoryForSession(sessionId);
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
						stream: true,
					},
					{ signal: abortController.signal },
				);

				let assistantMessage = "";

				for await (const chunk of stream) {
					abortIfNeeded();
					const delta = chunk.choices?.[0]?.delta;
					if (!delta) continue;

					if (delta.content) {
						assistantMessage += delta.content;
						event.sender.send("snip:chat-token", delta.content);
					}
				}

				chatHistory.push({ role: "assistant", content: assistantMessage });
				event.sender.send("snip:chat-done");
			} catch (err: any) {
				if (err?.name === "AbortError") {
					event.sender.send("snip:chat-done");
					return;
				}
				event.sender.send("snip:chat-error", String(err?.message || err));
			} finally {
				if (snipAbortControllers.get(key) === abortController) {
					snipAbortControllers.delete(key);
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
