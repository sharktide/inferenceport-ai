//@ts-nocheck
const { marked } = require("marked");
const fs = require("fs");
const path = require("path");
const { shell, app, ipcMain, BrowserWindow } = require("electron");

function register() {
	ipcMain.handle(
		"utils:web_open",
		async (_event: Electron.IpcMainEvent, url: string) => {
			shell.openExternal(url);
		}
	);

	ipcMain.on("utils:markdown_parse", (event, markdown: string) => {
		try {
			const html = marked.parse(markdown);
			event.returnValue = html;
		} catch (err) {
			event.returnValue = `<p>Error parsing markdown: ${
				err instanceof Error ? err.message : String(err)
			}</p>`;
		}
	});

	ipcMain.handle('utils:saveFile', async (_event, filePath: string, content: string) => {
		try {
			const dir = path.dirname(filePath);
			await fs.mkdirSync(dir, { recursive: true });
			await fs.writeFileSync(filePath, content);
		} catch (err) {
			console.error('Failed to save file:', err);
			throw err;
		}
	});

	const AppDataDir = app.getPath("userData");

	ipcMain.handle("utils:getPath", () => {
		return AppDataDir;
	});
}

module.exports = {
	register,
};
