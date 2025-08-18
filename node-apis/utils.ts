//@ts-ignore
const { shell, app, ipcMain, BrowserWindow } = require('electron');

//@ts-ignore
function register() {
    ipcMain.handle("utils:web_open", async (_: Electron.IpcRendererEvent, url: string) => {
        shell.openExternal(url);
    })
}

module.exports = {
    register
};
