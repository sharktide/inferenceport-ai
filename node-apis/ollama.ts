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

const { app, ipcMain, BrowserWindow } = require("electron");
//@ts-ignore
import type { IpcMain, IpcMainEvent } from 'electron';
const fs = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
const os = require('os');

const systemPrompt = "You are a helpful assistant that does what the user wants and uses tools when appropriate. Don't use single backslashes! Use tools to help the user with their requests. You have the abilities to search the web and generate images if the user enables them and you should tell the user to enable them if they are asking for them and you don't have access to the tool. When you generate images, they are automatically displayed to the user, so do not include URLs in your responses. Do not be technical with the user unless they ask for it.";

const isDev = !app.isPackaged;

const ollamaBinary = process.platform === "win32"
  	? "ollama.exe"
  	: "ollama";

const ollamaPath = isDev
	? path.join("vendor", "electron-ollama", ollamaBinary)
  : path.join(process.resourcesPath, "vendor", "electron-ollama", ollamaBinary);


type ChatMessage = {
	role: "user" | "assistant" | "tool" | "system" | "image";
	content: string;
	tool_calls?: { function: any }[];
	name?: string | undefined;
	asset?: { id: string; type: "image"; mime: string; base64: string };
};

const availableTools = [
	{
		type: "function",
		function: {
			name: "duckduckgo_search",
			description: "Search the web using DuckDuckGo",
			parameters: {
				type: "object",
				properties: {
					query: {
						type: "string",
						description: "Search query",
					},
				},
				required: ["query"],
			},
		},
	}, {
		type: "function",
		function: {
			name: "generate_image",
			description: "Generate an image from a prompt and resolution",
			parameters: {
				type: "object",
				properties: {
					prompt: {
						type: "string",
						description: "Describe the image you want in great detail (10-30 words)",
					},
					width: {
						type: "number",
						description: "width of image in pixels up to 1920",
					},
					height: {
						type: "number",
						description: "height of image in pixels up to 1920",
					},
				},
				required: ["prompt", "width", "height"],
			},
		},
	},
];

type ModelInfo = {
	name: string;
	id: string;
	size: string;
	modified: string;
};

type PullProgress = {
	model: string;
	output: string;
};

let chatHistory: ChatMessage[] = [];
let chatProcess: ReturnType<typeof spawn> | null = null;

const dataDir: string = path.join(app.getPath("userData"), "chat-sessions");
const sessionFile: string = path.join(dataDir, "sessions.json");

function stripAnsi(str: string): string {
	return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

async function serve(): Promise<string> {
  return new Promise((resolve, reject) => {
		exec(`"${ollamaPath}" serve`, (err: Error | null, stdout: string) => {
			if (err) return reject(err);
			resolve(stdout);
		});
  });
}
// ====================== Tool Functions ======================
async function duckDuckGoSearch(query: string) {
	const res = await fetch(
		`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
	);
	const data = await res.json();

	return {
		abstract: data.AbstractText,
		heading: data.Heading,
		related: (data.RelatedTopics || [])
			.slice(0, 5)
			.map((r: any) => ({
				text: r.Text,
				url: r.FirstURL,
			})),
	};
}

function createAssetId(): string {
	return `img_${Math.random().toString(36).slice(2, 8)}`;
}

function messagesForModel(history: ChatMessage[]): ChatMessage[] {
	return history.map(({ content, role, name }) => ({ content, role, name }));
}

async function GenerateImage(
  prompt: string,
  width: number,
  height: number
) {
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
    asset: {
      base64,
      mime: contentType || "image/unknown",
      width,
      height,
      trace,
    },
  };
}


function LOG(trace: string, label: string, ...args: any[]) {
  const time = new Date().toISOString();
  console.log(
    `[${time}] [${trace}] ${label}`,
    ...args
  );
}

function LOG_ERR(trace: string, label: string, ...args: any[]) {
  const time = new Date().toISOString();
  console.error(
    `[${time}] [${trace}] ❌ ${label}`,
    ...args
  );
}


// ====================== End Tool Functions ======================

let chatAbortController: AbortController | null = null;
function register(): void {
	try {
		execFileAsync(ollamaPath);
	} catch {
		void 0;
	}
	ipcMain.handle("ollama:list", async (): Promise<ModelInfo[]> => {
		return new Promise((resolve, reject) => {
			const isMac = os.platform() === "darwin";

			const resolveCommand = (cb: (cmd: string) => void) => {
				return cb(`"${ollamaPath}" list`);
			};

			resolveCommand((resolvedCmd) => {
				exec(resolvedCmd, (err: Error, stdout: string) => {
					if (err) return reject(err);

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
				});
			});
		});
	});

	ipcMain.handle("ollama:reset", () => {
		chatHistory = [];
	});

	ipcMain.handle(
		"ollama:run",
		async (_event: IpcMainEvent, modelName: string): Promise<string> => {
			return new Promise((resolve, reject) => {
				exec(`"${ollamaPath}" run ${modelName}`, (err: Error | null, stdout: string) => {
					if (err) return reject(err);
					resolve(stdout);
				});
			});
		}
	);

	ipcMain.handle(
		"ollama:delete",
		async (_event: IpcMainEvent, modelName: string): Promise<string> => {
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
			imageGen: boolean,
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
				event.sender.send("ollama:chat-error", "No response stream");
				return;
			}

			if (!res.ok) {
				body.tools = []
				res = await fetch("http://localhost:11434/api/chat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
					signal: chatAbortController.signal,
				});
				if (!res.body) {
					event.sender.send("ollama:chat-error", "No response stream");
					return;
				}
				if (!res.ok) {
					const errorText = await res.text();
					event.sender.send("ollama:chat-error", `Error: ${res.status} ${errorText}`);
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
					event.sender.send("ollama:chat-token", json.message.content);
				}

				if (json.message?.tool_calls) {
					pendingToolCalls.push(...json.message.tool_calls);
				}

				if (json.done === true) break;
				}
			}

			if (assistantMessage.trim()) {
				chatHistory.push({ role: "assistant", content: assistantMessage });
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
				} else if (toolCall.function.name === "generate_image") {
					LOG("GenerateImage", "TOOL CALL START", toolCall);

					toolResult = await GenerateImage(args.prompt, args.height, args.width);
				  	LOG("GenerateImage", "TOOL CALL SUCCESS", {
						hasAsset: !!toolResult?.asset,
					});
					asset = toolResult.asset;
					toolResult = toolResult.modelPayload;
				}

				chatHistory.push({
					role: "tool",
					name: toolCall.function.name,
					content: JSON.stringify(toolResult),
					asset
				});
				event.sender.send("ollama:image-result", asset);
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
					event.sender.send("ollama:chat-error", "No follow-up stream");
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
						event.sender.send("ollama:chat-token", json.message.content);
						}

						if (json.done === true) break;
					}
				}

				if (assistantMessage.trim()) {
				chatHistory.push({ role: "assistant", content: assistantMessage });
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
		(_event: IpcMainEvent, modelName: string): Promise<string> => {
			return new Promise((resolve, reject) => {
				const child = spawn(ollamaPath, ["pull", modelName]);

				const sendProgress = (data: Buffer) => {
					const clean = stripAnsi(data.toString());
					const payload: PullProgress = { model: modelName, output: clean };
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
		(_event: Electron.IpcMainEvent, sessions: Record<string, unknown>) =>
			saveSessions(sessions)
	);

	ipcMain.handle('ollama:available', async () => {
		  try {
			const { stdout } = await execFileAsync(ollamaPath, ['--version'], { timeout: 7000 });
			return typeof stdout === 'string' && stdout.trim().length > 0;
		} catch (err) {
			return false;
		}
	})
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

module.exports = { register, serve };
