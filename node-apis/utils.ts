//@ts-nocheck
const { marked } = require("marked");
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
}

module.exports = {
	register,
};
