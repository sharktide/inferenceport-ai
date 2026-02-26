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

import { app, ipcMain } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import fs from "fs";
import path from "path";
import { importGGUF, importGGUFMulti } from "./helper/createModel.js";
import { exec } from "child_process";
import { execFile } from "child_process";
import { promisify } from "util";
import net from "net";
import type {
	ModelInfo,
} from "./types/index.types.d.ts";
import {
	startProxyServer,
	stopProxyServer,
	getServerLogs,
} from "./helper/server.js";
import { pullModel, deleteModel, listModels } from "./helper/ollamaFSops.js";
import { cache, fetchSupportedTools } from "./helper/tools.js";
const execFileAsync = promisify(execFile);

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

const dataDir: string = path.join(app.getPath("userData"), "chat-sessions");
const sessionFile: string = path.join(dataDir, "sessions.json");

const dataFilePath = path.join(dataDir, "supportsTools.json");

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
		if (cache.cachedSupportsTools) {
			return { supportsTools: cache.cachedSupportsTools };
		}

		if (cache.writeInProgress) {
			await cache.writeInProgress;
		}

		try {
			const data = await fs.promises.readFile(dataFilePath, "utf-8");
			const parsed = JSON.parse(data) as { supportsTools: string[] };
			cache.cachedSupportsTools = parsed.supportsTools;
			return parsed;
		} catch {
			return { supportsTools: [] };
		}
	});

	ipcMain.handle(
		"ollama:list",
		async (
			_event: IpcMainInvokeEvent,
			clientUrl?: string,
		): Promise<ModelInfo[]> => {
			return await listModels(clientUrl);
		},
	);

	ipcMain.handle(
		"ollama:delete",
		async (
			_event: IpcMainInvokeEvent,
			modelName: string,
			clientUrl?: string,
		): Promise<string> => {
			return await deleteModel(_event, modelName, clientUrl);
		},
	);

	ipcMain.handle(
		"ollama:pull",
		(
			_event: IpcMainInvokeEvent,
			modelName: string,
			clientUrl?: string,
		): Promise<string> => {
			return pullModel(_event, modelName, clientUrl);
		}
			
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
			return await importGGUF(
				fileName,
				data,
				isModelFile,
				clientUrl,
			)
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
			return await importGGUFMulti(
				modelfileData,
				ggufName,
				ggufData,
				clientUrl
			)
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
