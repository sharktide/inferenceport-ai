const { app, ipcMain, BrowserWindow } = require("electron");
const fs = require("fs")
const path = require("path")
const { exec, spawn } = require("child_process");

let chatHistory = [];
let chatProcess = null;
const dataDir = path.join(app.getPath("userData"), "chat-sessions");
const sessionFile = `${dataDir}/sessions.json`;

function stripAnsi(str) {
    return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function register() {
    ipcMain.handle("ollama:list", async () => {
        return new Promise((resolve, reject) => {
            exec("ollama list", (err, stdout) => {
                if (err) return reject(err);
                const lines = stdout.trim().split("\n");
                const modelLines = lines.slice(1); // Skip header
                const models = modelLines
                    .filter((line) => line.trim())
                    .map((line) => {
                        const parts = line.trim().split(/\s{2,}/); // split by 2+ spaces
                        return {
                            name: parts[0],
                            id: parts[1],
                            size: parts[2],
                            modified: parts[3],
                        };
                    });
                resolve(models);
            });
        });
    });

    ipcMain.handle("ollama:reset", () => {
        chatHistory = [];
    });

    ipcMain.handle("ollama:run", async (_, modelName) => {
        return new Promise((resolve, reject) => {
            exec(`ollama run ${modelName}`, (err, stdout) => {
                if (err) return reject(err);
                resolve(stdout);
            });
        });
    });

    ipcMain.handle("ollama:delete", async (_, modelName) => {
        return new Promise((resolve, reject) => {
            exec(`ollama rm ${modelName}`, (err, stdout, stderr) => {
                if (err) return reject(stderr || err.message);
                resolve(stdout);
            });
        });
    });

    ipcMain.on("ollama:chat-stream", async (event, modelName, userMessage) => {
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

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";

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
                        `JSON parse error: ${err.message}`
                    );
                }
            }
        }

        chatHistory.push({ role: "assistant", content: fullResponse });
        event.sender.send("ollama:chat-done");
    });

    ipcMain.on("ollama:stop", () => {
        if (chatProcess) {
            console.log(`[CHAT] Killing chat process`);
            chatProcess.kill();
            chatProcess = null;
        }
    });

    ipcMain.handle("ollama:pull", (_, modelName) => {
        return new Promise((resolve, reject) => {
            const child = spawn("ollama", ["pull", modelName]);

            child.stdout.on("data", (data) => {
                const clean = stripAnsi(data.toString());
                BrowserWindow.getAllWindows()[0].webContents.send(
                    "ollama:pull-progress",
                    {
                        model: modelName,
                        output: clean,
                    }
                );
            });

            child.stderr.on("data", (data) => {
                const clean = stripAnsi(data.toString());
                BrowserWindow.getAllWindows()[0].webContents.send(
                    "ollama:pull-progress",
                    {
                        model: modelName,
                        output: clean,
                    }
                );
            });

            child.on("close", () => {
                resolve(`${modelName} pulled`);
            });

            child.on("error", (err) => {
                reject(err.message);
            });
        });
    });
    ipcMain.handle('sessions:load', () => loadSessions());
    ipcMain.handle('sessions:save', (_, sessions) => saveSessions(sessions));

}

function saveSessions(sessions) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
  fs.writeFileSync(sessionFile, JSON.stringify(sessions, null, 2));
}

function loadSessions() {
  if (fs.existsSync(sessionFile)) {
    try {
      const raw = fs.readFileSync(sessionFile);
      return JSON.parse(raw);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }
  return {};
}


module.exports = { register };
