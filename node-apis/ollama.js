"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const { app, ipcMain, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const os = require('os');
const isWindows = os.platform() === "win32";
const ollamaPath = isWindows
    ? ".\\vendor\\electron-ollama\\ollama.exe"
    : "./vendor/electron-ollama/ollama";
let chatHistory = [];
let chatProcess = null;
const dataDir = path.join(app.getPath("userData"), "chat-sessions");
const sessionFile = path.join(dataDir, "sessions.json");
function stripAnsi(str) {
    return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}
let chatAbortController = null;
function register() {
    try {
        execFileAsync(ollamaPath);
    }
    catch {
        void 0;
    }
    ipcMain.handle("ollama:list", async () => {
        return new Promise((resolve, reject) => {
            const isMac = os.platform() === "darwin";
            const resolveCommand = (cb) => {
                return cb(`${ollamaPath} list`);
            };
            resolveCommand((resolvedCmd) => {
                exec(resolvedCmd, (err, stdout) => {
                    if (err)
                        return reject(err);
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
    ipcMain.handle("ollama:run", async (_event, modelName) => {
        return new Promise((resolve, reject) => {
            exec(`${ollamaPath} run ${modelName}`, (err, stdout) => {
                if (err)
                    return reject(err);
                resolve(stdout);
            });
        });
    });
    ipcMain.handle("ollama:delete", async (_event, modelName) => {
        return new Promise((resolve, reject) => {
            exec(`${ollamaPath} rm ${modelName}`, (err, stdout, stderr) => {
                if (err)
                    return reject(stderr || err.message);
                resolve(stdout);
            });
        });
    });
    ipcMain.on("ollama:chat-stream", async (event, modelName, userMessage) => {
        chatHistory.push({ role: "user", content: userMessage });
        chatAbortController = new AbortController();
        try {
            const res = await fetch("http://localhost:11434/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: modelName,
                    messages: chatHistory,
                    stream: true,
                }),
                signal: chatAbortController.signal,
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
                if (done)
                    break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n").filter((line) => line.trim());
                for (const line of lines) {
                    try {
                        const json = JSON.parse(line);
                        const token = json.message?.content || "";
                        fullResponse += token;
                        event.sender.send("ollama:chat-token", token);
                    }
                    catch (err) {
                        event.sender.send("ollama:chat-error", `JSON parse error: ${err}`);
                    }
                }
            }
            chatHistory.push({ role: "assistant", content: fullResponse });
            event.sender.send("ollama:chat-done");
        }
        catch (err) {
            if (err.name === "AbortError") {
                event.sender.send("ollama:chat-aborted");
            }
            else {
                event.sender.send("ollama:chat-error", `${err}`);
            }
        }
    });
    ipcMain.on("ollama:stop", (event) => {
        if (chatAbortController) {
            console.log("[CHAT] Aborting chat stream");
            chatAbortController.abort();
            chatAbortController = null;
        }
    });
    ipcMain.handle("ollama:pull", (_event, modelName) => {
        return new Promise((resolve, reject) => {
            const child = spawn(ollamaPath, ["pull", modelName]);
            const sendProgress = (data) => {
                const clean = stripAnsi(data.toString());
                const payload = { model: modelName, output: clean };
                const win = BrowserWindow.getAllWindows()[0];
                if (win) {
                    win.webContents.send("ollama:pull-progress", payload);
                }
            };
            child.stdout.on("data", sendProgress);
            child.stderr.on("data", sendProgress);
            child.on("close", () => resolve(`${modelName} pulled`));
            child.on("error", (err) => reject(err.message));
        });
    });
    ipcMain.handle("sessions:load", () => loadSessions());
    ipcMain.handle("sessions:save", (_event, sessions) => saveSessions(sessions));
    ipcMain.handle('ollama:available', async () => {
        try {
            const { stdout } = await execFileAsync(ollamaPath, ['--version'], { timeout: 7000 });
            return typeof stdout === 'string' && stdout.trim().length > 0;
        }
        catch (err) {
            return false;
        }
    });
}
function saveSessions(sessions) {
    if (!fs.existsSync(dataDir))
        fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(sessionFile, JSON.stringify(sessions, null, 2));
}
function loadSessions() {
    if (fs.existsSync(sessionFile)) {
        try {
            const raw = fs.readFileSync(sessionFile, "utf-8");
            return JSON.parse(raw);
        }
        catch (err) {
            console.error("Failed to load sessions:", err);
        }
    }
    return {};
}
module.exports = { register };
//# sourceMappingURL=ollama.js.map