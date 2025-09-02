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

const { app, BrowserWindow, ipcMain, screen, Menu } = require("electron");
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

	const template = [
		{
			label: 'Marketplace',
			submenu: [
				{ label: 'Launch', click: () => win.loadFile(path.join(__dirname, "public", "marketplace.html")) },
				{ type: 'separator' },
				{ label: 'Ollama', click: () => win.loadFile(path.join(__dirname, "public", "marketplace", "ollama.html")) },
				{ label: 'Spaces', click: () => win.loadFile(path.join(__dirname, "public", "marketplace", "spaces.html")) },
			]
		},
		{
			label: 'Edit',
			submenu: [
				{ label: 'Undo', role: 'undo' },
				{ label: 'Redo', role: 'redo' },
				{ type: 'separator' },
				{ label: 'Cut', role: 'cut' },
				{ label: 'Copy', role: 'copy' },
				{ label: 'Paste', role: 'paste' }
			]
		},
		{
			label: 'Window',
			submenu: [
				{ role: 'minimize' },
				{ role: 'close' }
			]
		},
		{
			label: 'View',
			submenu: [
				{
				label: 'Toggle Developer Tools',
				accelerator: process.platform === 'darwin' ? 'Cmd+Alt+I' : 'Ctrl+Shift+I',
				click: (_item: Electron.MenuItem, focusedWindow: Electron.BrowserWindow | undefined) => {
				if (focusedWindow) {
					focusedWindow.webContents.toggleDevTools();
				}
				}
				},
				{ role: 'reload' }
			]
		},

		{
			label: 'Help',
			submenu: [
				{
					label: 'GitHub',
					click: async () => {
						const { shell } = require('electron');
						await shell.openExternal('https://github.com/sharktide/inferenceport-ai');
					}
				},
				{ label: 'Report Bug', click: async () => {
					const { shell } = require('electron');
					await shell.openExternal('https://github.com/sharktide/inferenceport-ai/issues/new')
				}},
				{ label: 'Pull Request', click: async () => {
					const { shell } = require('electron');
					await shell.openExternal('https://github.com/sharktide/inferenceport-ai/pulls/new')
				}}
			]
		}
	];


	win.loadFile("public/index.html");
	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);

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