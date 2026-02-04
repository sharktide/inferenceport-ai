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

import fs from "fs";
import path from "path";
import { exec, spawn } from "child_process";
import { execFile } from "child_process";
import type { ExecException } from "child_process";
import { promisify } from "util";
import os from "os";
import net from "net";
import type {
	ToolDefinition,
	ChatHistoryEntry,
	ModelInfo,
	PullProgress,
	PullChunk,
	PullSection,
} from "./types/index.types.d.ts";
import { startProxyServer, stopProxyServer } from "./helper/server.js";
import toolSchema from "./assets/tools.json" with { type: "json" };
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import OpenAI from "openai";
import { getSession } from "./auth.js";

const execFileAsync = promisify(execFile);
const availableTools = toolSchema as ToolDefinition[];
const systemPrompt =
	"You are a helpful assistant that does what the user wants and uses tools when appropriate. Don't use single backslashes! Use tools to help the user with their requests. You have the abilities to search the web and generate images if the user enables them and you should tell the user to enable them if they are asking for them and you don't have access to the tool. When you generate images, they are automatically displayed to the user, so do not include URLs in your responses. Do not be technical with the user unless they ask for it.";

const isDev = !app.isPackaged;

const ollamaBinary = process.platform === "win32" ? "ollama.exe" : "ollama";

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

function is52458(url: string): boolean {
	try {
		const u = new URL(url);
		return u.port === "52458";
	} catch {
		return false;
	}
}

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

	return `${n.toFixed(1)}${units[i]}`;
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

		lines.push(
			`${section.label} ${bar} ${pct}% (${formatBytes(
				completed,
			)} / ${formatBytes(total)})`,
		);
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

async function duckDuckGoSearch(query: string) {
	const res = await fetch(
		`https://api.duckduckgo.com/?q=${encodeURIComponent(
			query,
		)}&format=json&no_html=1&skip_disambig=1`,
	);
	const data = await res.json();

	return {
		abstract: data.AbstractText,
		heading: data.Heading,
		related: (data.RelatedTopics || []).slice(0, 5).map((r: any) => ({
			text: r.Text,
			url: r.FirstURL,
		})),
	};
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

async function GenerateImage(prompt: string, width: number, height: number) {
	const trace = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

	LOG(trace, "ENTER GenerateImage", { prompt, width, height });

	const url =
		`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
		`?width=${width}&height=${height}`;

	LOG(trace, "FETCH URL", url);

	let response: Response;
	try {
		response = await fetch(url);
		LOG(trace, "FETCH RESOLVED", {
			ok: response.ok,
			status: response.status,
			statusText: response.statusText,
			headers: Object.fromEntries(response.headers.entries()),
		});
	} catch (e) {
		LOG_ERR(trace, "FETCH THREW", e);
		throw e;
	}

	if (!response.ok) {
		LOG_ERR(trace, "NON-OK RESPONSE", {
			status: response.status,
			statusText: response.statusText,
		});
		throw new Error(`Image fetch failed: ${response.status}`);
	}

	const contentType = response.headers.get("content-type");
	LOG(trace, "CONTENT-TYPE", contentType);

	let arrayBuffer: ArrayBuffer;
	try {
		arrayBuffer = await response.arrayBuffer();
		LOG(trace, "ARRAYBUFFER RECEIVED", {
			byteLength: arrayBuffer.byteLength,
		});
	} catch (e) {
		LOG_ERR(trace, "ARRAYBUFFER FAILED", e);
		throw e;
	}

	if (arrayBuffer.byteLength === 0) {
		LOG_ERR(trace, "EMPTY IMAGE BUFFER");
		throw new Error("Empty image buffer");
	}

	let base64: string;
	try {
		base64 = Buffer.from(arrayBuffer).toString("base64");
		LOG(trace, "BASE64 ENCODED", {
			length: base64.length,
			head: base64.slice(0, 32),
		});
	} catch (e) {
		LOG_ERR(trace, "BASE64 ENCODE FAILED", e);
		throw e;
	}

	LOG(trace, "EXIT GenerateImage OK");

	return {
		dataUrl: `data:${contentType || "image/png"};base64,${base64}`,
	};
}

function LOG(trace: string, label: string, ...args: any[]) {
	const time = new Date().toISOString();
	console.log(`[${time}] [${trace}] ${label}`, ...args);
}

function LOG_ERR(trace: string, label: string, ...args: any[]) {
	const time = new Date().toISOString();
	console.error(`[${time}] [${trace}] ❌ ${label}`, ...args);
}

let chatAbortController: AbortController | null = null;
export default function register(): void {
	try {
		execFileAsync(ollamaPath);
	} catch {
		void 0;
	}
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
					size: m.size ?? "Unknown",
					modified: m.modified_at ?? "Unknown",
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
			search: boolean,
			imageGen: boolean,
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

			let tools: any[] = [];
			if (search) tools.push(availableTools[0]);
			if (imageGen) tools.push(availableTools[1]);

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
					{ name?: string; arguments: string }
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
					([index, data]) => ({
						id: `call_${index}`,
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

						event.sender.send("ollama:new_tool_call", {
							id: toolCall.id,
							name: toolCall.function.name,
							arguments: toolCall.function.arguments,
							state: "pending",
						});

						const args = JSON.parse(toolCall.function.arguments);
						let toolResult: any;

						if (toolCall.function.name === "duckduckgo_search") {
							toolResult = await duckDuckGoSearch(args.query);
						}

						if (toolCall.function.name === "generate_image") {
							const { dataUrl } = await GenerateImage(
								args.prompt,
								args.width,
								args.height,
							);

							event.sender.send("ollama:new-asset", {
								role: "image",
								content: dataUrl,
							});

							toolResult = "Image generated successfully.";
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
							state: "resolved",
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
			console.log(clientUrl)

			return new Promise(async (resolve, reject) => {
				if (clientUrl) {
					try {
						const base = clientUrl.replace(/\/$/, "");
						const res = await fetch(`${base}/api/pull`, {
							method: "POST",
							headers: {
								Authorization: `Bearer ${await issueProxyToken()}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ name: modelName }),
						});

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
											const key = parsed.digest.slice(
												0,
												12,
											);

											const section =
												sections.get(key) ??
												sections.set(key, {
													label: `pulling ${key}`,
													completed: 0,
												}).get(key)!;

											if (section && parsed.total !== undefined) {
												section.total = parsed.total;
											}
											if (section && parsed.completed !== undefined) {
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
				}

				// --- local path unchanged ---
				const child = spawn(ollamaPath, ["pull", modelName]);

				const sendProgress = (data: Buffer) => {
					const clean = stripAnsi(data.toString());
					const payload: PullProgress = {
						model: modelName,
						output: clean,
					};
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("ollama:pull-progress", payload);
					}
				};

				child.stdout.on("data", sendProgress);
				child.stderr.on("data", sendProgress);

				child.on("close", () => resolve(`${modelName} pulled`));
				child.on("error", (err: Error) => reject(err.message));
			});
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
