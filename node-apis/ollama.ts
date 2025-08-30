//@ts-ignore
const { app, ipcMain, BrowserWindow } = require("electron");
//@ts-ignore
const fs = require("fs");
//@ts-ignore
const path = require("path");
const { exec, spawn } = require("child_process");

type ChatMessage = {
	role: "user" | "assistant";
	content: string;
};

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

//@ts-ignore
function register(): void {
	ipcMain.handle("ollama:list", async (): Promise<ModelInfo[]> => {
		return new Promise((resolve, reject) => {
			exec("ollama list", (err: Error | null, stdout: string) => {
				if (err) return reject(err);
				const lines = stdout.trim().split("\n").slice(1);
				const models = lines
					.filter((line: string) => line.trim())
					.map((line: string) => {
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

	ipcMain.handle("ollama:reset", () => {
		chatHistory = [];
	});

	ipcMain.handle(
		"ollama:run",
		async (_event: unknown, modelName: string): Promise<string> => {
			return new Promise((resolve, reject) => {
				exec(`ollama run ${modelName}`, (err: Error | null, stdout: string) => {
					if (err) return reject(err);
					resolve(stdout);
				});
			});
		}
	);

	ipcMain.handle(
		"ollama:delete",
		async (_event: unknown, modelName: string): Promise<string> => {
			return new Promise((resolve, reject) => {
				exec(
					`ollama rm ${modelName}`,
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
			//@ts-ignore
			event: Electron.IpcMainEvent,
			modelName: string,
			userMessage: string
		) => {
			chatHistory.push({ role: "user", content: userMessage });

			const res = await fetch("http://localhost:11434/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: modelName,
					messages: chatHistory,
					stream: true,
				}),
			});

			const reader = res.body?.getReader();
			const decoder = new TextDecoder();
			let fullResponse = "";

			if (!reader) {
				event.sender.send("ollama:chat-error", "No response stream");
				return;
			}

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });
				const lines = chunk.split("\n").filter((line) => line.trim());

				for (const line of lines) {
					try {
						const json = JSON.parse(line);
						const token = json.message?.content || "";
						fullResponse += token;
						event.sender.send("ollama:chat-token", token);
					} catch (err) {
						event.sender.send(
							"ollama:chat-error",
							`JSON parse error: ${
								err instanceof Error ? err.message : String(err)
							}`
						);
					}
				}
			}

			chatHistory.push({ role: "assistant", content: fullResponse });
			event.sender.send("ollama:chat-done");
		}
	);

	ipcMain.on("ollama:stop", () => {
		if (chatProcess) {
			console.log("[CHAT] Killing chat process");
			chatProcess.kill();
			chatProcess = null;
		}
	});

	ipcMain.handle(
		"ollama:pull",
		(_event: unknown, modelName: string): Promise<string> => {
			return new Promise((resolve, reject) => {
				const child = spawn("ollama", ["pull", modelName]);

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
		(_event: unknown, sessions: Record<string, unknown>) =>
			saveSessions(sessions)
	);
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

module.exports = { register };
