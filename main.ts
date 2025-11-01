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
const authHandlers = require("./node-apis/auth")
const spaces = require('./node-apis/spaces');
const fixPath = require("fix-path").default;
fixPath();

let mainWindow: any = null;

function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    mainWindow = new BrowserWindow({
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
				{ label: 'Launch', click: () => mainWindow.loadFile(path.join(__dirname, "public", "marketplace.html")) },
				{ type: 'separator' },
				{ label: 'Ollama', click: () => mainWindow.loadFile(path.join(__dirname, "public", "marketplace", "ollama.html")) },
				{ label: 'Spaces', click: () => mainWindow.loadFile(path.join(__dirname, "public", "marketplace", "spaces.html")) },
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


	mainWindow.loadFile("public/index.html");
	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
}

function openFromDeepLink(url: string) {
	if (!mainWindow) return;
	try {
		const parsed = new URL(url);
		const pathname = parsed.pathname || '/';
		const host = parsed.hostname || '';
		// map common paths
		if (pathname === '/' || pathname === '') {
			mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));
			return;
		}
		// remove leading slash
		const cleaned = pathname.replace(/^\//, '');
		// handle basic routes
		if (cleaned.startsWith('marketplace')) {
			// e.g. inferenceport-ai://marketplace/ollama
			const parts = cleaned.split('/');
			if (parts.length >= 2 && parts[1]) {
				const page = parts[1];
				if (page === 'ollama') {
					mainWindow.loadFile(path.join(__dirname, 'public', 'marketplace', 'ollama.html'));
					return;
				}
				if (page === 'spaces') {
					mainWindow.loadFile(path.join(__dirname, 'public', 'marketplace', 'spaces.html'));
					return;
				}
			}
			mainWindow.loadFile(path.join(__dirname, 'public', 'marketplace.html'));
			return;
		}

		if (cleaned === 'installed') {
			mainWindow.loadFile(path.join(__dirname, 'public', 'installed.html'));
			return;
		}

		if (cleaned === 'settings' || cleaned === 'profile' || cleaned === 'account') {
			mainWindow.loadFile(path.join(__dirname, 'public', 'settings.html'));
			return;
		}

		if (cleaned === 'auth' || cleaned === 'login' || cleaned === 'signin') {
			mainWindow.loadFile(path.join(__dirname, 'public', 'auth.html'));
			return;
		}

		if (cleaned === 'reset-pswrd') {
			mainWindow.loadFile(path.join(__dirname, 'public', 'reset-pswrd.html'));
			return;
		}

		// fallback
		mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));
	} catch (e) {
		console.warn('Failed to open deep link', e);
	}
}

// register protocol handling and single-instance behaviour
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
	app.quit();
}

app.on('second-instance', (_event: any, argv: string[]) => {
	// windows deep link arrives in argv as the protocol url
	const urlArg = argv.find(a => a && a.startsWith('inferenceport-ai://'));
	if (urlArg) {
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.focus();
			openFromDeepLink(urlArg);
		}
	}
});

// macOS open-url
app.on('open-url', (event: any, url: string) => {
	event.preventDefault();
	if (mainWindow) openFromDeepLink(url);
});

app.whenReady().then(() => {
	const chatDir = path.join(app.getPath("userData"), "chat-sessions");

	try {
		if (process.defaultApp) {
			app.setAsDefaultProtocolClient('inferenceport-ai', process.execPath, [
				path.resolve(process.argv[1])]
			);
		} else {
			app.setAsDefaultProtocolClient('inferenceport-ai');
		}

	} catch (e) {
		console.warn('Unable to set protocol client', e);
	}

	ipcMain.handle("session:getPath", () => {
		return chatDir;
	});
	ollamaHandlers.register();
	utilsHandlers.register();
	authHandlers.register()
	spaces.register();
	createWindow();
});

app.on("window-all-closed", () => {
	app.quit();
});
