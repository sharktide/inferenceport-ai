const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const ollamaHandlers = require("./node-apis/ollama");
const utilsHandlers = require("./node-apis/utils");
const spaces = require('./node-apis/spaces');

function createWindow() {
	const primaryDisplay = screen.getPrimaryDisplay();
	const { width, height } = primaryDisplay.workAreaSize;
	const win = new BrowserWindow({
		width: width,
		height: height,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
		},
		icon: path.join(__dirname, 'public', 'assets', 'img', 'logo.png')
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
	spaces.register();
	createWindow();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});