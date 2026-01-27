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
import type { ToolDefinition, Role, AssetRole, ChatMessage, ChatAsset, ModelInfo, PullProgress } from "./types/index.types.d.ts";
import toolSchema from "./assets/tools.json" with { type: "json" };

const execFileAsync = promisify(execFile);
const availableTools = (toolSchema as ToolDefinition[])
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
			ollamaBinary
	  );



let chatHistory: ChatMessage[] = [];
let chatProcess: ReturnType<typeof spawn> | null = null;

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
		exec(`"${ollamaPath}" serve`, (err: Error | null, stdout: string, stderr: string) => {
			if (err) {
				err.message += `: ${stderr}`;
				reject(err);
			} else {
				resolve(stdout);
			}
		});
	});
}

export async function fetchSupportedTools(): Promise<{ supportsTools: string[] }> {
    const response = await fetch(
        "https://cdn.jsdelivr.net/gh/sharktide/inferenceport-ai@main/MISC/prod/toolSupportingModels.json"
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch tool-supporting models: ${response.statusText}`);
    }

    let data: unknown;
    try {
        data = await response.json();
    } catch (err) {
        throw new Error("Failed to parse tool-supporting models JSON");
    }

    if (
        !data ||
        typeof data !== "object" ||
        !("supportsTools" in data) ||
        !Array.isArray((data as any).supportsTools) ||
        !(data as any).supportsTools.every((name: any) => typeof name === "string")
    ) {
        throw new Error("Invalid tool-supporting models JSON shape");
    }

    const supportsTools = (data as { supportsTools: string[] }).supportsTools;

    cachedSupportsTools = supportsTools;

    await ensureDir();
    const writeTask = fs.promises.writeFile(
        dataFilePath,
        JSON.stringify({ supportsTools }, null, 2),
        "utf-8"
    );
    writeInProgress = writeTask;
    await writeTask;
    writeInProgress = null;

    return { supportsTools };
}


// ====================== Tool Functions ======================
async function duckDuckGoSearch(query: string) {
	const res = await fetch(
		`https://api.duckduckgo.com/?q=${encodeURIComponent(
			query
		)}&format=json&no_html=1&skip_disambig=1`
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

function createAssetId(): string {
	return `img_${Math.random().toString(36).slice(2, 8)}`;
}

function messagesForModel(history: ChatMessage[]): ChatMessage[] {
	return history.map(({ content, role }) => ({ content, role }));
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

	ipcMain.handle("ollama:fetch-tool-models", async () => {return await fetchSupportedTools();});

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

	ipcMain.handle("ollama:list", async (): Promise<ModelInfo[]> => {
		return new Promise((resolve, reject) => {
			const isMac = os.platform() === "darwin";

			const resolveCommand = (cb: (cmd: string) => void) => {
				return cb(`"${ollamaPath}" list`);
			};
			//nosemgrep: javascript.lang.security.detect-child-process
			resolveCommand((resolvedCmd) => {
				//nosemgrep: javascript.lang.security.detect-child-process
				exec(
					resolvedCmd,
					{},
					(error: ExecException | null, stdout: string) => {
						if (error) return reject(error);

						const lines = stdout.trim().split("\n").slice(1);
						const models = lines
							.filter((line) => line.trim())
							.map((line) => {
								const parts = line.trim().split(/\s{2,}/);
								return {
									name: parts[0] ?? "Unknown",
									id: parts[1] ?? "Unknown",
									size: parts[2] ?? "Unknown",
									modified: parts[3] ?? "Unknown",
								};
							});
						resolve(models);
					}
				);
			});
		});
	});

	ipcMain.handle("ollama:reset", () => {
		chatHistory = [];
	});

	ipcMain.handle(
		"ollama:run",
		async (
			_event: IpcMainInvokeEvent,
			modelName: string
		): Promise<string> => {
			return new Promise((resolve, reject) => {
				exec(
					// nosemgrep: javascript.lang.security.detect-child-process
					`"${ollamaPath}" run ${modelName}`,
					(err: Error | null, stdout: string) => {
						if (err) return reject(err);
						resolve(stdout);
					}
				);
			});
		}
	);

	ipcMain.handle(
		"ollama:delete",
		async (
			_event: IpcMainInvokeEvent,
			modelName: string
		): Promise<string> => {
			return new Promise((resolve, reject) => {
				exec(
					`"${ollamaPath}" rm ${modelName}`,
					(err: Error | null, stdout: string, stderr: string) => {
						if (err) return reject(stderr || err.message);
						resolve(stdout);
					}
				);
			});
		}
	);

	ipcMain.on(
		"ollama:chat-stream",
		async (
			event: IpcMainEvent,
			modelName: string,
			userMessage: string,
			search: boolean,
			imageGen: boolean
		) => {
			chatAbortController = new AbortController();

			let tools: any[] = [];

			if (search) tools.push(availableTools[0]); // Add search tool if enabled
			if (imageGen) tools.push(availableTools[1]); // Add image generation tool if enabled

			chatHistory.push({ role: "user", content: userMessage });

			try {
				const body = {
					model: modelName,
					stream: true,
					messages: [
						{ role: "system", content: systemPrompt },
						...messagesForModel(chatHistory),
					],
					tools,
				};
				let res;
				res = await fetch("http://localhost:11434/api/chat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
					signal: chatAbortController.signal,
				});

				if (!res.body) {
					event.sender.send(
						"ollama:chat-error",
						"No response stream"
					);
					return;
				}

				if (!res.ok) {
					body.tools = [];
					res = await fetch("http://localhost:11434/api/chat", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(body),
						signal: chatAbortController.signal,
					});
					if (!res.body) {
						event.sender.send(
							"ollama:chat-error",
							"No response stream"
						);
						return;
					}
					if (!res.ok) {
						const errorText = await res.text();
						event.sender.send(
							"ollama:chat-error",
							`Error: ${res.status} ${errorText}`
						);
						return;
					}
				}

				const reader = res.body.getReader();
				const decoder = new TextDecoder();

				let buffer = "";
				let assistantMessage = "";
				let pendingToolCalls: any[] = [];

				while (true) {
					const { value, done } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop()!;

					for (const line of lines) {
						if (!line.trim()) continue;

						let json: any;
						try {
							json = JSON.parse(line);
						} catch {
							continue;
						}

						if (json.message?.content) {
							assistantMessage += json.message.content;
							event.sender.send(
								"ollama:chat-token",
								json.message.content
							);
						}

						if (json.message?.tool_calls) {
							pendingToolCalls.push(...json.message.tool_calls);
						}

						if (json.done === true) break;
					}
				}

				if (assistantMessage.trim()) {
					chatHistory.push({
						role: "assistant",
						content: assistantMessage,
					});
				}

				if (pendingToolCalls.length > 0) {
					for (const toolCall of pendingToolCalls) {
						let asset: any = null;
						let toolResult: any = null;

						const args =
							typeof toolCall.function.arguments === "string"
								? JSON.parse(toolCall.function.arguments)
								: toolCall.function.arguments;

						if (toolCall.function.name === "duckduckgo_search") {
							toolResult = await duckDuckGoSearch(args.query);
						} else if (
							toolCall.function.name === "generate_image"
						) {
							LOG("GenerateImage", "TOOL CALL START", toolCall);

							const { dataUrl } = await GenerateImage(
								args.prompt,
								args.width,
								args.height
							);
							LOG("GenerateImage", "TOOL CALL SUCCESS", {
								hasDataUrl: !!dataUrl,
							});

							const assetToSend: ChatAsset = {
								role: "image",
								content: dataUrl,
							};

							console.log("Sending new asset:", assetToSend);

							event.sender.send("ollama:new-asset", assetToSend);

							toolResult = "Image generated successfully.";
						}

						chatHistory.push({
							role: "tool",
							content: JSON.stringify(toolResult),
						});
						saveSessions({ chatHistory });
					}
					const followUpRes = await fetch(
						"http://localhost:11434/api/chat",
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								model: modelName,
								stream: true,
								messages: [
									{ role: "system", content: systemPrompt },
									...messagesForModel(chatHistory),
								],
								tools,
							}),
							signal: chatAbortController.signal,
						}
					);

					if (!followUpRes.body) {
						event.sender.send(
							"ollama:chat-error",
							"No follow-up stream"
						);
						return;
					}

					const followUpReader = followUpRes.body.getReader();
					buffer = "";
					assistantMessage = "";

					while (true) {
						const { value, done } = await followUpReader.read();
						if (done) break;

						buffer += decoder.decode(value, { stream: true });
						const lines = buffer.split("\n");
						buffer = lines.pop()!;

						for (const line of lines) {
							if (!line.trim()) continue;

							let json: any;
							try {
								json = JSON.parse(line);
							} catch {
								continue;
							}

							if (json.message?.content) {
								assistantMessage += json.message.content;
								event.sender.send(
									"ollama:chat-token",
									json.message.content
								);
							}

							if (json.done === true) break;
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
				if ((err as Error).name === "AbortError") {
					event.sender.send("ollama:chat-aborted");
				} else {
					event.sender.send("ollama:chat-error", `${err}`);
				}
			} finally {
				chatAbortController = null;
			}
		}
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
		(_event: IpcMainInvokeEvent, modelName: string): Promise<string> => {
			return new Promise((resolve, reject) => {
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
		}
	);

	ipcMain.handle("sessions:load", () => loadSessions());
	ipcMain.handle(
		"sessions:save",
		(
			_event: Electron.IpcMainInvokeEvent,
			sessions: Record<string, unknown>
		) => saveSessions(sessions)
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
