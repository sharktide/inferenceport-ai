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
import { generateTryItApiKey } from "./getApiKey.js";
//@ts-ignore
import type { IpcMain, IpcMainEvent } from 'electron';
const fs = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
const os = require('os');

const isDev = !app.isPackaged;

const ollamaBinary = process.platform === "win32"
  	? "ollama.exe"
  	: "ollama";

const ollamaPath = isDev
	? path.join("vendor", "electron-ollama", ollamaBinary)
  : path.join(process.resourcesPath, "vendor", "electron-ollama", ollamaBinary);


type ChatMessage = {
	role: "user" | "assistant" | "tool";
	content: string;
	tool_calls?: { function: any }[];
	name?: string;
};

const tools = [
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
						prompt: "string",
						description: "Describe the image you want in great detail (10-30 words)",
					},
					width: {
						width: "number",
						description: "width of image in pixels up to 1920",
					},
					height: {
						height: "number",
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

async function GenerateImage(prompt: string, height: number, width: number) {
    const image_url = 'https://nwgeoyqlnoxpwirtpdbc.supabase.co/functions/v1/swift-api';
    const API_KEY = generateTryItApiKey();
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53Z2VveXFsbm94cHdpcnRwZGJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1ODU0MzgsImV4cCI6MjA4MTE2MTQzOH0.KIyR8JTncBQz4YnYo4JfsY24i9Gne77FJOv9d2qVUBk';

    const response = await fetch(image_url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "API-KEY": API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message: prompt,
            width,
            height,
            I_AGREE_THAT_HACKING_IS_A_SERIOUS_CRIME_AND_I_AM_NOT_ABUSING_THIS_API: true // Feel free to use this API, but please don't spam
        })
    });

    if (!response.ok) {
        throw { status: response.status, type: 'generate' };
    }

    const result = await response.json();
    if (!result.image) {
        throw { status: 500, type: 'generate' };
    }

    return result.image;
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

			chatHistory.push({ role: "user", content: userMessage });

			try {
			const body = {
				model: modelName,
				stream: true,
				messages: [
				{ role: "system", content: "You are a helpful assistant that does what the user wants and uses tools when appropriate." },
				...chatHistory,
				],
				tools,
			};

			const res = await fetch("http://localhost:11434/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				signal: chatAbortController.signal,
			});

			if (!res.body) {
				event.sender.send("ollama:chat-error", "No response stream");
				return;
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
				let toolResult: any = null;

				const args =
					typeof toolCall.function.arguments === "string"
					? JSON.parse(toolCall.function.arguments)
					: toolCall.function.arguments;

				if (toolCall.function.name === "duckduckgo_search") {
					toolResult = await duckDuckGoSearch(args.query);
				} else if (toolCall.function.name === "generate_image") {
					toolResult = await GenerateImage(args.prompt, args.height, args.width);
				}

				chatHistory.push({
					role: "tool",
					name: toolCall.function.name,
					content: JSON.stringify(toolResult),
				});
				}
				const followUpRes = await fetch(
				"http://localhost:11434/api/chat",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
					model: modelName,
					stream: true,
					messages: chatHistory,
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
				event.sender.send("ollama:chat-aborted");;
			} else {
				console.error("Chat error:", err);
				event.sender.send("ollama:chat-error", String(err));
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
			return JSON.parse(raw);
		} catch (err) {
			console.error("Failed to load sessions:", err);
		}
	}
	return {};
}

module.exports = { register, serve };
