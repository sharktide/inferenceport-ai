/*
Copyright 2025 Rihaan Meher

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { app, ipcMain, BrowserWindow } from "electron";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";

import fs, { constants } from "fs";
import path from "path";
import crypto, { type UUID } from "crypto";
import { exec, spawn } from "child_process";
import { execFile } from "child_process";
import { promisify } from "util";
import net from "net";
import type {
	ToolDefinition,
	ChatHistoryEntry,
	ModelInfo,
	PullProgress,
	PullChunk,
	PullSection,
	ToolList,
	ToolParametersSchema,
} from "./types/index.types.d.ts";
import {
	startProxyServer,
	stopProxyServer,
	getServerLogs,
} from "./helper/server.js";
import {
	is52458,
	save_stream,
	load_blob,
} from "./utils.js";
import toolSchema from "./assets/tools.json" with { type: "json" };
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import OpenAI from "openai";
import { getSession } from "./auth.js";
import {
	GenerateImage,
	duckDuckGoSearch,
	generateVideo,
	generateAudioOrSFX,
	type ImageGenerateRequest,
	type VideoGenerateRequest,
} from "./helper/tools.js";

const logDir: string = path.join(app.getPath("userData"), "logs");
const logFile = path.join(logDir, "InferencePort-Server.log");
const execFileAsync = promisify(execFile);
const availableTools = toolSchema as ToolDefinition[];
const systemPrompt =
	"You are a helpful assistant that does what the user wants and uses tools when appropriate. Don't use single backslashes! Use tools to help the user with their requests. You have the abilities to search the web and generate images/video/audio if the user enables them and you should tell the user to enable them if they are asking for them and you don't have access to the tool. When you generate media, it is automatically displayed to the user, so do not include URLs in your responses. For image generation, fill prompt and mode (auto/fantasy/realistic), using auto by default unless the user asks for a style. For video generation, fill prompt/ratio/mode/duration, and leave image_urls empty unless the user explicitly provided source images. Do not be technical with the user unless they ask for it.";

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

function normalizePrompt(value: unknown, errorMessage: string): string {
	const prompt = typeof value === "string" ? value.trim() : "";
	if (!prompt) throw new Error(errorMessage);
	return prompt;
}

function normalizeImageRequest(
	args: unknown,
	_source: "model" | "user",
): NormalizedImageRequest {
	const obj =
		args && typeof args === "object"
			? (args as Record<string, unknown>)
			: {};

	return {
		prompt: normalizePrompt(obj.prompt, "Image prompt is required"),
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
		prompt: normalizePrompt(obj.prompt, "Video prompt is required"),
		ratio: normalizeVideoRatio(obj.ratio),
		mode: normalizeVideoMode(obj.mode),
		duration: normalizeVideoDuration(obj.duration),
		image_urls:
			source === "user" ? normalizeImageUrls(obj.image_urls) : [],
	};
}

function normalizeAudioRequest(
	args: unknown,
	_source: "model" | "user",
): NormalizedAudioRequest {
	const obj =
		args && typeof args === "object"
			? (args as Record<string, unknown>)
			: {};

	return {
		prompt: normalizePrompt(obj.prompt, "Audio prompt is required"),
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

const isDev = !app.isPackaged;

const ollamaBinary =
	process.platform === "win32"
		? "ollama.exe"
		: process.platform === "linux"
			? "bin/ollama"
			: "ollama";

const ollamaPath = isDev
	? path.join("vendor", "electron-ollama", ollamaBinary)
	: path.join(
			process.resourcesPath,
			"vendor",
			"electron-ollama",
			ollamaBinary,
		);

let chatHistory: ChatHistoryEntry[] = [];
let chatProcess: ReturnType<typeof spawn> | null = null;

async function issueProxyToken(): Promise<string> {
	console.log("Issuing Proxy Token");
	const session = await getSession();
	const jwt = session.access_token;

	const res = await fetch(
		"https://dpixehhdbtzsbckfektd.supabase.co/functions/v1/issue-token",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${jwt}`,
				"Content-Type": "application/json",
			},
		},
	);

	if (!res.ok) {
		throw new Error(`Token issue failed: ${res.statusText}`);
	}

	const { token } = await res.json();
	if (!token) throw new Error("No token returned");

	return token;
}

async function createOpenAIClient(baseURL?: string): Promise<OpenAI> {
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
function renderBar(completed = 0, total = 0, width = 20): string {
	if (!total) return "[                  ]";
	const ratio = Math.min(completed / total, 1);
	const filled = Math.round(ratio * width);
	return `[${"█".repeat(filled)}${" ".repeat(width - filled)}]`;
}

function formatBytes(bytes?: number): string {
	if (typeof bytes !== "number" || Number.isNaN(bytes)) {
		return "0B";
	}

	const units = ["B", "KB", "MB", "GB", "TB"];
	let i = 0;
	let n = bytes;

	while (n >= 1024 && i < units.length - 1) {
		n /= 1024;
		i++;
	}
	if (units[i] === "GB") return `${n.toFixed(1)} ${units[i]}`;
	else return `${n.toFixed(0)} ${units[i]}`;
}

function timeAgo(dateString: string | Date | undefined): string {
	if (!dateString) return "Unknown";

	const date =
		typeof dateString === "string" ? new Date(dateString) : dateString;
	if (isNaN(date.getTime())) return "Unknown";

	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const seconds = Math.floor(diff / 1000);

	const intervals = [
		{ label: "year", seconds: 31536000 },
		{ label: "month", seconds: 2592000 },
		{ label: "week", seconds: 604800 },
		{ label: "day", seconds: 86400 },
		{ label: "hour", seconds: 3600 },
		{ label: "minute", seconds: 60 },
		{ label: "second", seconds: 1 },
	];

	for (const { label, seconds: sec } of intervals) {
		const count = Math.floor(seconds / sec);
		if (count > 0) return `${count} ${label}${count > 1 ? "s" : ""} ago`;
	}

	return "just now";
}

function renderProgress(sections: Map<string, PullSection>): string {
	const lines: string[] = [];

	for (const section of sections.values()) {
		const total = section.total;
		const completed = section.completed ?? 0;

		if (!total) {
			lines.push(section.label);
			continue;
		}

		const bar = renderBar(completed, total);
		const pct = Math.floor((completed / total) * 100);

		lines.push(`${bar} ${pct}%`);
	}

	return lines.join("\n");
}

const dataDir: string = path.join(app.getPath("userData"), "chat-sessions");
const sessionFile: string = path.join(dataDir, "sessions.json");

function stripAnsi(str: string): string {
	return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

let cachedSupportsTools: string[] | null = null;
let writeInProgress: Promise<void> | null = null;
const dataFilePath = path.join(dataDir, "supportsTools.json");

async function ensureDir() {
	await fs.promises.mkdir(path.dirname(dataFilePath), { recursive: true });
}

function isPortOpen(port: number, host = "127.0.0.1", timeout = 2000) {
	return new Promise((resolve) => {
		const socket = net.connect({ port, host });
		const timer = setTimeout(() => {
			socket.destroy();
			resolve(false);
		}, timeout);

		socket.on("connect", () => {
			clearTimeout(timer);
			socket.destroy();
			resolve(true);
		});
		socket.on("error", () => {
			clearTimeout(timer);
			resolve(false);
		});
	});
}

export async function serve(): Promise<string> {
	if (await isPortOpen(11434)) {
		return "Ollama server already running";
	}

	return new Promise((resolve, reject) => {
		exec(
			`"${ollamaPath}" serve`,
			(err: Error | null, stdout: string, stderr: string) => {
				if (err) {
					err.message += `: ${stderr}`;
					reject(err);
				} else {
					resolve(stdout);
				}
			},
		);
	});
}

export async function fetchSupportedTools(): Promise<{
	supportsTools: string[];
}> {
	const response = await fetch(
		"https://cdn.jsdelivr.net/gh/sharktide/inferenceport-ai@main/MISC/prod/toolSupportingModels.json",
	);

	if (!response.ok) {
		throw new Error(
			`Failed to fetch tool-supporting models: ${response.statusText}`,
		);
	}

	let data: unknown;
	try {
		data = await response.json();
	} catch {
		throw new Error("Failed to parse tool-supporting models JSON");
	}

	let supportsTools: string[];
	if (Array.isArray(data) && data.every((name) => typeof name === "string")) {
		supportsTools = data;
	} else if (
		data &&
		typeof data === "object" &&
		"supportsTools" in data &&
		Array.isArray((data as any).supportsTools) &&
		(data as any).supportsTools.every(
			(name: any) => typeof name === "string",
		)
	) {
		supportsTools = (data as { supportsTools: string[] }).supportsTools;
	} else {
		throw new Error("Invalid tool-supporting models JSON shape");
	}

	cachedSupportsTools = supportsTools;

	await ensureDir();
	const writeTask = fs.promises.writeFile(
		dataFilePath,
		JSON.stringify({ supportsTools }, null, 2),
		"utf-8",
	);
	writeInProgress = writeTask;
	await writeTask;
	writeInProgress = null;

	return { supportsTools };
}

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

type ParsedModelfile = {
	from?: string;
	system: string;
	template: string;
	license: string[];
	parameters: Record<string, any>;
	messages: Array<{ role: string; content: string }>;
};

function stripWrappingQuotes(value: string): string {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1).trim();
	}
	return value;
}

function parseModelfileContent(content: string): ParsedModelfile {
	const lines = content.split(/\r?\n/);

	let from: string | undefined;
	let system = "";
	let template = "";
	let license: string[] = [];
	let parameters: Record<string, any> = {};
	let messages: Array<{ role: string; content: string }> = [];

	let currentBlock: "system" | "template" | null = null;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;

		if (/^SYSTEM\b/i.test(line)) {
			currentBlock = "system";
			system += rawLine.replace(/^SYSTEM\s*/i, "") + "\n";
			continue;
		}

		if (/^TEMPLATE\b/i.test(line)) {
			currentBlock = "template";
			template += rawLine.replace(/^TEMPLATE\s*/i, "") + "\n";
			continue;
		}

		if (/^FROM\b/i.test(line)) {
			const parsedFrom = line.replace(/^FROM\s+/i, "").trim();
			from = stripWrappingQuotes(parsedFrom);
			currentBlock = null;
			continue;
		}

		if (/^LICENSE\b/i.test(line)) {
			const l = line.replace(/^LICENSE\s+/i, "").trim();
			if (l) license.push(l);
			currentBlock = null;
			continue;
		}

		if (/^PARAMETER\b/i.test(line)) {
			const rest = line.replace(/^PARAMETER\s+/i, "");
			const [key, ...valueParts] = rest.split(" ");
			const value = valueParts.join(" ").trim();

			if (!key) continue;

			const parsed =
				!isNaN(Number(value)) && value !== "" ? Number(value) : value;

			parameters[key] = parsed;
			currentBlock = null;
			continue;
		}

		if (/^MESSAGE\b/i.test(line)) {
			const rest = line.replace(/^MESSAGE\s+/i, "");
			const firstSpace = rest.indexOf(" ");
			if (firstSpace === -1) continue;

			const role = rest.substring(0, firstSpace).trim();
			const content = rest.substring(firstSpace + 1).trim();

			messages.push({ role, content });
			currentBlock = null;
			continue;
		}

		if (currentBlock === "system") {
			system += rawLine + "\n";
		} else if (currentBlock === "template") {
			template += rawLine + "\n";
		}
	}

	return {
		system: system.trim(),
		template: template.trim(),
		license,
		parameters,
		messages,
		...(from !== undefined ? { from } : {}),
	};
}

function buildModelName(fileName: string, extensionPattern: RegExp): string {
	return fileName
		.replace(extensionPattern, "")
		.replace(/[^a-zA-Z0-9:_-]/g, "-")
		.toLowerCase();
}

function isGGUFReference(fromValue: string): boolean {
	return /\.gguf$/i.test(stripWrappingQuotes(fromValue).trim());
}

function createPayloadFromModelfile(
	modelName: string,
	parsed: ParsedModelfile,
) {
	if (!parsed.from) {
		throw new Error("Modelfile missing FROM directive");
	}

	const payload: any = {
		model: modelName,
		from: parsed.from,
		stream: false,
	};

	if (parsed.system) payload.system = parsed.system;
	if (parsed.template) payload.template = parsed.template;
	if (parsed.license.length) payload.license = parsed.license;
	if (Object.keys(parsed.parameters).length)
		payload.parameters = parsed.parameters;
	if (parsed.messages.length) payload.messages = parsed.messages;
	return payload;
}

async function ensureBlobUploaded(
	base: string,
	authHeaders: Record<string, string>,
	buffer: Buffer,
): Promise<string> {
	const hash = crypto.createHash("sha256").update(buffer).digest("hex");
	const digest = `sha256:${hash}`;

	const headRes = await fetch(`${base}/api/blobs/${digest}`, {
		method: "HEAD",
		headers: authHeaders,
	});

	if (headRes.status === 404) {
		const uploadRes = await fetch(`${base}/api/blobs/${digest}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/octet-stream",
				...authHeaders,
			},
			body: new Uint8Array(buffer),
		});

		if (!uploadRes.ok) {
			const text = await uploadRes.text();
			throw new Error(`Blob upload failed: ${uploadRes.status} ${text}`);
		}
	} else if (!headRes.ok && headRes.status !== 200) {
		throw new Error(`Blob check failed: ${headRes.status}`);
	}

	return digest;
}

let chatAbortController: AbortController | null = null;
export default function register(): void {
	try {
		execFileAsync(ollamaPath);
	} catch {
		void 0;
	}

	ipcMain.handle("ollama:get-server-logs", async (): Promise<string> => {
		return await getServerLogs();
	});

	ipcMain.handle(
		"ollama:start-proxy-server",
		async (
			_event: IpcMainInvokeEvent,
			port: number = 52458,
			users: { email: string; role: string }[] = [],
		) => {
			startProxyServer(port, users);
			return `Server starting on port ${port}...`;
		},
	);
	ipcMain.handle("ollama:stop-proxy-server", async () => {
		stopProxyServer();
		return "Stopping server...";
	});
	ipcMain.handle("ollama:fetch-tool-models", async () => {
		return await fetchSupportedTools();
	});

	ipcMain.handle("ollama:get-tool-models", async () => {
		if (cachedSupportsTools) {
			return { supportsTools: cachedSupportsTools };
		}

		if (writeInProgress) {
			await writeInProgress;
		}

		try {
			const data = await fs.promises.readFile(dataFilePath, "utf-8");
			const parsed = JSON.parse(data) as { supportsTools: string[] };
			cachedSupportsTools = parsed.supportsTools;
			return parsed;
		} catch {
			return { supportsTools: [] };
		}
	});
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

				// Remove surrounding quotes if any
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
	ipcMain.handle(
		"ollama:list",
		async (
			_event: IpcMainInvokeEvent,
			clientUrl?: string,
		): Promise<ModelInfo[]> => {
			if (clientUrl) {
				const base = clientUrl.replace(/\/$/, "");
				const res = await fetch(`${base}/api/tags`, {
					headers: {
						Authorization: `Bearer ${await issueProxyToken()}`,
					},
				});

				if (res.status === 401 || res.status === 403) {
					const err: any = new Error("unauthorized");
					err.code = "UNAUTHORIZED";
					throw err;
				}

				if (!res.ok) {
					const err: any = new Error(res.statusText);
					err.code = "REMOTE_LIST_FAILED";
					throw err;
				}

				const data = await res.json();
				return (data.models || []).map((m: any) => ({
					name: m.name,
					id: m.digest ?? "remote",
					size: formatBytes(m.size ?? 0) ?? "Unknown",
					modified: timeAgo(m.modified_at) ?? "Unknown",
				}));
			}

			// --- local path unchanged ---
			return new Promise((resolve, reject) => {
				exec(`"${ollamaPath}" list`, (error, stdout) => {
					if (error) return reject(error);

					const lines = stdout.trim().split("\n").slice(1);
					resolve(
						lines.map((line) => {
							const parts = line.trim().split(/\s{2,}/);
							return {
								name: parts[0] ?? "Unknown",
								id: parts[1] ?? "Unknown",
								size: parts[2] ?? "Unknown",
								modified: parts[3] ?? "Unknown",
							};
						}),
					);
				});
			});
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

	ipcMain.handle(
		"ollama:run",
		async (
			_event: IpcMainInvokeEvent,
			modelName: string,
		): Promise<string> => {
			return new Promise((resolve, reject) => {
				exec(
					// nosemgrep: javascript.lang.security.detect-child-process
					`"${ollamaPath}" run ${modelName}`,
					(err: Error | null, stdout: string) => {
						if (err) return reject(err);
						resolve(stdout);
					},
				);
			});
		},
	);

	ipcMain.handle(
		"ollama:delete",
		async (
			_event: IpcMainInvokeEvent,
			modelName: string,
			clientUrl?: string,
		): Promise<string> => {
			if (clientUrl) {
				const base = clientUrl.replace(/\/$/, "");
				console.log(base);
				console.log(JSON.stringify({ model: modelName }));
				const res = await fetch(`${base}/api/delete`, {
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${await issueProxyToken()}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ model: modelName }),
				});

				if (res.status === 401 || res.status === 403) {
					const err: any = new Error("unauthorized");
					err.code = "UNAUTHORIZED";
					throw err;
				}

				if (!res.ok) {
					const err: any = new Error(res.statusText);
					err.code = "REMOTE_DELETE_FAILED";
					throw err;
				}

				return `${modelName} deleted from remote`;
			}

			return new Promise((resolve, reject) => {
				exec(
					`"${ollamaPath}" rm ${modelName}`,
					(err: Error | null, stdout: string, stderr: string) => {
						if (err) return reject(stderr || err.message);
						resolve(stdout);
					},
				);
			});
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
			const abortController = new AbortController();
			chatAbortController = abortController;

			let aborted = false;

			const abortIfNeeded = () => {
				if (abortController.signal.aborted) {
					aborted = true;
					throw new DOMException("Chat aborted", "AbortError");
				}
			};

			let tools: ToolDefinition[] = [];
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

					const choice = chunk.choices?.[0];
					const delta = choice?.delta;
					if (!delta) continue;

					if (delta.content) {
						assistantMessage += delta.content;
						event.sender.send("ollama:chat-token", delta.content);
					}

					if (delta.tool_calls) {
						for (const call of delta.tool_calls) {
							const entry = toolCallBuffer.get(call.index) ?? {
								arguments: "",
							};

							if (call.id) entry.id = call.id;
							if (call.function?.name)
								entry.name = call.function.name;
							if (call.function?.arguments)
								entry.arguments += call.function.arguments;

							toolCallBuffer.set(call.index, entry);
						}
					}
				}

				abortIfNeeded();

				const finalizedToolCalls = [...toolCallBuffer.entries()].map(
					([_index, data]) => ({
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

				if (finalizedToolCalls.length) {
					chatHistory.push({
						role: "assistant",
						content: "",
						tool_calls: finalizedToolCalls,
					});

					for (const toolCall of finalizedToolCalls) {
						abortIfNeeded();
						let parsedArgs: unknown = {};
						try {
							parsedArgs = JSON.parse(
								toolCall.function.arguments || "{}",
							);
						} catch {
							parsedArgs = {};
						}

						const args =
							parsedArgs && typeof parsedArgs === "object"
								? (parsedArgs as Record<string, unknown>)
								: {};

						let toolResult: any;
						let toolState: "resolved" | "canceled" = "resolved";
						let resolvedImageRequest:
							| NormalizedImageRequest
							| undefined;
						let resolvedVideoRequest:
							| NormalizedVideoRequest
							| undefined;
						let resolvedAudioRequest:
							| NormalizedAudioRequest
							| undefined;

						if (toolCall.function.name === "duckduckgo_search") {
							event.sender.send("ollama:new_tool_call", {
								id: toolCall.id,
								name: toolCall.function.name,
								arguments: toolCall.function.arguments,
								state: "pending",
							});
							const query =
								typeof args.query === "string"
									? args.query.trim()
									: "";
							if (!query) throw new Error("Search query is required");
							toolResult = await duckDuckGoSearch(query);
						}

						if (toolCall.function.name === "generate_image") {
							const suggestedImageRequest = normalizeImageRequest(
								args,
								"model",
							);

							event.sender.send("ollama:new_tool_call", {
								id: toolCall.id,
								name: toolCall.function.name,
								arguments: JSON.stringify(
									suggestedImageRequest,
								),
								tool_options: suggestedImageRequest,
								state: "awaiting_input",
							});

							const selectedImageRequest =
								await waitForImageRequestInput(
									toolCall.id,
									suggestedImageRequest,
									abortController.signal,
								);

							abortIfNeeded();

							if (!selectedImageRequest) {
								toolState = "canceled";
								toolResult =
									"Image generation was canceled before execution.";
							} else {
								resolvedImageRequest = selectedImageRequest;
								event.sender.send("ollama:new_tool_call", {
									id: toolCall.id,
									name: toolCall.function.name,
									arguments: JSON.stringify(
										selectedImageRequest,
									),
									tool_options: selectedImageRequest,
									state: "pending",
								});

								const { dataUrl } = await GenerateImage(
									selectedImageRequest,
								);

								event.sender.send("ollama:new-asset", {
									role: "image",
									content: dataUrl,
								});

								toolResult =
									"Image generated successfully and shown to the user.";
							}
						}

						if (toolCall.function.name === "generate_video") {
							const suggestedVideoRequest = normalizeVideoRequest(
								args,
								"model",
							);

							event.sender.send("ollama:new_tool_call", {
								id: toolCall.id,
								name: toolCall.function.name,
								arguments:
									JSON.stringify(suggestedVideoRequest),
								tool_options: suggestedVideoRequest,
								state: "awaiting_input",
							});

							const selectedVideoRequest =
								await waitForVideoRequestInput(
									toolCall.id,
									suggestedVideoRequest,
									abortController.signal,
								);

							abortIfNeeded();

							if (!selectedVideoRequest) {
								toolState = "canceled";
								toolResult =
									"Video generation was canceled before execution.";
							} else {
								resolvedVideoRequest = selectedVideoRequest;
								event.sender.send("ollama:new_tool_call", {
									id: toolCall.id,
									name: toolCall.function.name,
									arguments: JSON.stringify(
										selectedVideoRequest,
									),
									tool_options: selectedVideoRequest,
									state: "pending",
								});

								const video: ArrayBuffer = await generateVideo(
									selectedVideoRequest,
								);
								const videoBlob = new Blob([video], {
									type: "video/mp4",
								});
								const assetID = await save_stream(videoBlob);
								event.sender.send("ollama:new-asset", {
									role: "video",
									content: assetID,
								});
								toolResult =
									"Video generated successfully and shown to the user.";
							}
						}

						if (toolCall.function.name === "generate_audio") {
							const suggestedAudioRequest = normalizeAudioRequest(
								args,
								"model",
							);

							event.sender.send("ollama:new_tool_call", {
								id: toolCall.id,
								name: toolCall.function.name,
								arguments: JSON.stringify(
									suggestedAudioRequest,
								),
								tool_options: suggestedAudioRequest,
								state: "awaiting_input",
							});

							const selectedAudioRequest =
								await waitForAudioRequestInput(
									toolCall.id,
									suggestedAudioRequest,
									abortController.signal,
								);

							abortIfNeeded();

							if (!selectedAudioRequest) {
								toolState = "canceled";
								toolResult =
									"Audio generation was canceled before execution.";
							} else {
								resolvedAudioRequest = selectedAudioRequest;
								event.sender.send("ollama:new_tool_call", {
									id: toolCall.id,
									name: toolCall.function.name,
									arguments: JSON.stringify(
										selectedAudioRequest,
									),
									tool_options: selectedAudioRequest,
									state: "pending",
								});

								const audio: ArrayBuffer =
									await generateAudioOrSFX(
										selectedAudioRequest.prompt,
									);
								const audioBlob = new Blob([audio], {
									type: "audio/mpeg",
								});
								const assetID = await save_stream(audioBlob);
								event.sender.send("ollama:new-asset", {
									role: "audio",
									content: assetID,
								});
								toolResult =
									"Audio generated successfully and shown to the user.";
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
							...((resolvedImageRequest ||
								resolvedVideoRequest ||
								resolvedAudioRequest)
								? {
										arguments: JSON.stringify(
											resolvedImageRequest ||
												resolvedVideoRequest ||
												resolvedAudioRequest,
										),
										tool_options:
											resolvedImageRequest ||
											resolvedVideoRequest ||
											resolvedAudioRequest,
									}
								: {}),
						});
					}

					let followUpOpenAI: OpenAI = openai;

					followUpOpenAI = await createOpenAIClient(clientUrl);

					const followUpStream =
						await followUpOpenAI.chat.completions.create(
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
							event.sender.send(
								"ollama:chat-token",
								delta.content,
							);
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
			} catch (err) {
				if (err instanceof DOMException && err.name === "AbortError") {
					event.sender.send("ollama:chat-aborted");
				} else {
					event.sender.send("ollama:chat-error", String(err));
				}
			} finally {
				const pendingResolvers = [
					...pendingImageToolResolvers.values(),
					...pendingVideoToolResolvers.values(),
					...pendingAudioToolResolvers.values(),
				];
				pendingImageToolResolvers.clear();
				pendingVideoToolResolvers.clear();
				pendingAudioToolResolvers.clear();
				for (const pending of pendingResolvers) {
					pending.reject(
						new DOMException("Chat ended", "AbortError"),
					);
				}

				if (chatAbortController === abortController) {
					chatAbortController = null;
				}
			}
		},
	);

	ipcMain.on("ollama:stop", (event: IpcMainEvent) => {
		if (chatAbortController) {
			console.log("[CHAT] Aborting chat stream");
			chatAbortController.abort();
			chatAbortController = null;
		}
	});

	ipcMain.handle(
		"ollama:pull",
		(
			_event: IpcMainInvokeEvent,
			modelName: string,
			clientUrl?: string,
		): Promise<string> => {
			const sections = new Map<string, PullSection>();
			if (!clientUrl) {
				clientUrl = "http://localhost:11434";
			}

			return new Promise(async (resolve, reject) => {
				try {
					const base = clientUrl.replace(/\/$/, "");
					let res: Response;
					if (clientUrl === "http://localhost:11434") {
						res = await fetch(`${base}/api/pull`, {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ name: modelName }),
						});
					} else {
						res = await fetch(`${base}/api/pull`, {
							method: "POST",
							headers: {
								Authorization: `Bearer ${await issueProxyToken()}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ name: modelName }),
						});
					}
					if (res.status === 401 || res.status === 403) {
						const err: any = new Error("unauthorized");
						err.code = "UNAUTHORIZED";
						reject(err);
						return;
					}

					if (!res.ok) {
						const err: any = new Error(res.statusText);
						err.code = "REMOTE_PULL_FAILED";
						reject(err);
						return;
					}

					if (res.body) {
						const reader = res.body.getReader();
						const decoder = new TextDecoder();
						const win = BrowserWindow.getAllWindows()[0];

						try {
							while (true) {
								const { done, value } = await reader.read();
								if (done) break;

								const chunk = decoder.decode(value, {
									stream: true,
								});
								const lines = chunk.split("\n");

								for (const line of lines) {
									if (!line.trim()) continue;

									let parsed: PullChunk;
									try {
										parsed = JSON.parse(line);
									} catch {
										continue;
									}

									if (parsed.status && !parsed.digest) {
										sections.set(parsed.status, {
											label: parsed.status,
										});
									}

									if (parsed.digest) {
										const key = parsed.digest.slice(0, 12);

										const section =
											sections.get(key) ??
											sections
												.set(key, {
													label: `pulling ${key}`,
													completed: 0,
												})
												.get(key)!;

										if (
											section &&
											parsed.total !== undefined
										) {
											section.total = parsed.total;
										}
										if (
											section &&
											parsed.completed !== undefined
										) {
											section.completed =
												parsed.completed;
										}
									}

									const payload: PullProgress = {
										model: modelName,
										output: renderProgress(sections),
									};

									if (win) {
										win.webContents.send(
											"ollama:pull-progress",
											payload,
										);
									}
								}
							}
						} catch (e) {
							reject(e);
							return;
						}
					}

					resolve(`${modelName} pulled from remote`);
				} catch (err) {
					reject(err);
				}
				return;
			});
		},
	);

	ipcMain.handle(
		"ollama:import-gguf",
		async (
			_event: IpcMainInvokeEvent,
			fileName: string,
			data: Uint8Array | null,
			isModelFile: boolean,
			clientUrl?: string,
		): Promise<string> => {
			if (!data) throw new Error("No file data provided");

			const base = clientUrl
				? clientUrl.replace(/\/+$/, "")
				: "http://localhost:11434";

			const authHeaders: Record<string, string> = clientUrl
				? { Authorization: `Bearer ${await issueProxyToken()}` }
				: {};
			
			const safeName = fileName
				.replace(/[^a-zA-Z0-9._-]/g, "_")
				.slice(0, 20)
				.concat("-gguf72");
			const buffer = Buffer.from(data);

			try {
				if (isModelFile) {
					const parsed = parseModelfileContent(
						buffer.toString("utf-8"),
					);
					if (!parsed.from) {
						throw new Error("Modelfile missing FROM directive");
					}

					if (isGGUFReference(parsed.from)) {
						throw new Error(
							"Modelfile references a .gguf file. Import the Modelfile and GGUF together.",
						);
					}

					const modelName = buildModelName(safeName, /\.modelfile$/i);
					const payload = createPayloadFromModelfile(
						modelName,
						parsed,
					);
					console.log(payload)
					const createRes = await fetch(`${base}/api/create`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							...authHeaders,
						},
						body: JSON.stringify(payload),
					});

					if (!createRes.ok) {
						const text = await createRes.text();
						throw new Error(
							`Create failed: ${createRes.status} ${text}`,
						);
					}

					return `Model '${modelName}' created from Modelfile`;
				}

				const digest = await ensureBlobUploaded(
					base,
					authHeaders,
					buffer,
				);
				const modelName = buildModelName(safeName, /\.gguf$/i);
				console.log(modelName, digest);
				const createRes = await fetch(`${base}/api/create`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...authHeaders,
					},
					body: JSON.stringify({
						model: modelName,
						files: {
							[safeName]: digest,
						},
						stream: false,
					}),
				});

				if (!createRes.ok) {
					const text = await createRes.text();
					throw new Error(
						`GGUF create failed: ${createRes.status} ${text}`,
					);
				}

				return `GGUF model '${modelName}' created successfully`;
			} catch (err) {
				throw err;
			}
		},
	);

	ipcMain.handle(
		"ollama:import-gguf-multi",
		async (
			_event: IpcMainInvokeEvent,
			modelfileData: Uint8Array | null,
			ggufName: string,
			ggufData: Uint8Array | null,
			clientUrl?: string,
		): Promise<string> => {
			if (!modelfileData) throw new Error("No Modelfile data provided");
			if (!ggufData) throw new Error("No GGUF data provided");

			const isRemote = !!clientUrl;

			const base = isRemote
				? clientUrl!.replace(/\/+$/, "")
				: "http://localhost:11434";

			const authHeaders: Record<string, string> = isRemote
				? { Authorization: `Bearer ${await issueProxyToken()}` }
				: {};

			const safeModelfileName = ggufName
				.replace(/[^a-zA-Z0-9._-]/g, "_")
				.slice(0, 20)
				.concat("-gguf72");

			const modelfileBuffer = Buffer.from(modelfileData);
			const ggufBuffer = Buffer.from(ggufData);

			const parsed = parseModelfileContent(
				modelfileBuffer.toString("utf-8"),
			);

			if (!parsed.from) {
				throw new Error("Modelfile missing FROM directive");
			}

			if (!isGGUFReference(parsed.from)) {
				throw new Error(
					"Provided Modelfile does not reference a .gguf file",
				);
			}

			const digest = await ensureBlobUploaded(
				base,
				authHeaders,
				ggufBuffer,
			);

			const modelName = buildModelName(
				safeModelfileName.concat("-gguf"),
				 /\.gguf$/i,
			);

			console.log(modelName, digest);

			const payload = createPayloadFromModelfile(modelName, {
				...parsed,
			});

			payload.files = {
				[modelName]: digest,
			};

			delete payload.from;

			console.log(payload)

			const createRes = await fetch(`${base}/api/create`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...authHeaders,
				},
				body: JSON.stringify(payload),
			});

			if (!createRes.ok) {
				const text = await createRes.text();
				throw new Error(`Create failed: ${createRes.status} ${text}`);
			}

			return `Model '${modelName}' created from Modelfile + GGUF`;
		},
	);

	ipcMain.handle("sessions:load", () => loadSessions());
	ipcMain.handle(
		"sessions:save",
		(
			_event: Electron.IpcMainInvokeEvent,
			sessions: Record<string, unknown>,
		) => saveSessions(sessions),
	);

	ipcMain.handle("ollama:available", async () => {
		try {
			const { stdout } = await execFileAsync(ollamaPath, ["--version"], {
				timeout: 7000,
			});
			return typeof stdout === "string" && stdout.trim().length > 0;
		} catch (err) {
			return false;
		}
	});
}

function saveSessions(sessions: Record<string, unknown>): void {
	if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
	fs.writeFileSync(sessionFile, JSON.stringify(sessions, null, 2));
}

function loadSessions(): Record<string, unknown> {
	if (fs.existsSync(sessionFile)) {
		try {
			const raw = fs.readFileSync(sessionFile, "utf-8");
			console.log("Session loading: ", raw);
			return JSON.parse(raw);
		} catch (err) {
			console.error("Failed to load sessions:", err);
		}
	}
	return {};
}
