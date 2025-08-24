const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const ollamaHandlers = require("./node-apis/ollama");
const utilsHandlers = require("./node-apis/utils");

function createWindow() {
	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
		},
	});

	win.loadFile("public/index.html");
}

app.whenReady().then(() => {
	const chatDir = path.join(app.getPath("userData"), "chat-sessions");

	ipcMain.handle("session:getPath", () => {
		return chatDir;
	});
	ollamaHandlers.register();
	utilsHandlers.register();
	createWindow();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
