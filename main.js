const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const ollamaHandlers = require("./node-apis/ollama");

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, "public", "scripts", "preload.js"),
        },
    });

    win.loadFile("public/index.html");
}

app.whenReady().then(() => {
    const dataDir = path.join(app.getPath("userData"), "chat-sessions");

    ipcMain.handle("session:getPath", () => {
        return dataDir;
    });

    createWindow();
    ollamaHandlers.register();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
