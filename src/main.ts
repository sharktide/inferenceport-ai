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

import { app, BrowserWindow, ipcMain, screen, Menu } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import path from "path";
import ollamaHandlers, {
	serve,
	fetchSupportedTools,
} from "./node-apis/ollama.js";
import utilsHandlers from "./node-apis/utils.js";
import authHandlers from "./node-apis/auth.js";
import spaces from "./node-apis/spaces.js";
import fixPath from "fix-path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

fixPath();

let mainWindow: any = null;

function fireAndForget<T>(promise: Promise<T>, label: string) {
  promise
    .then((result) => {
      console.info(`[fireAndForget] [${label}] resolved:`, 
        result === undefined ? "<no value>" : result);
    })
    .catch((err) => {
      const stackLine = (err?.stack || String(err)).split("\n")[0];
      console.warn(`[fireAndForget] [${label}] rejected:`, stackLine);
    });
}


function createWindow() {
	const primaryDisplay = screen.getPrimaryDisplay();
	const { width, height } = primaryDisplay.workAreaSize;
	mainWindow = new BrowserWindow({
		width: width,
		height: height,
		webPreferences: {
			preload: path.join(__dirname, "preload.cjs"),
		},
		icon: path.join(__dirname, "public", "assets", "img", "logo.png"),
	});

	const template: MenuItemConstructorOptions[] = [
		{
			label: "Marketplace",
			submenu: [
				{
					label: "Launch",
					click: () =>
						mainWindow.loadFile(
							path.join(__dirname, "public", "marketplace.html")
						),
				},
				{ type: "separator" },
				{
					label: "Ollama",
					click: () =>
						mainWindow.loadFile(
							path.join(
								__dirname,
								"public",
								"marketplace",
								"ollama.html"
							)
						),
				},
				{
					label: "Spaces",
					click: () =>
						mainWindow.loadFile(
							path.join(
								__dirname,
								"public",
								"marketplace",
								"spaces.html"
							)
						),
				},
			],
		},
		{
			label: "Edit",
			submenu: [
				{ label: "Undo", role: "undo" },
				{ label: "Redo", role: "redo" },
				{ type: "separator" },
				{ label: "Cut", role: "cut" },
				{ label: "Copy", role: "copy" },
				{ label: "Paste", role: "paste" },
			],
		},
		{
			label: "Window",
			submenu: [{ role: "minimize" }, { role: "close" }],
		},
		{
			label: "View",
			submenu: [
				{
					label: "Toggle Developer Tools",
					accelerator:
						process.platform === "darwin"
							? "Cmd+Alt+I"
							: "Ctrl+Shift+I",
					click: (
						_item: Electron.MenuItem,
						focusedWindow: Electron.BaseWindow | undefined,
						_event: Electron.KeyboardEvent
					) => {
						if (focusedWindow instanceof BrowserWindow) {
							focusedWindow.webContents.toggleDevTools();
						}
					},
				},
				{ role: "reload" },
			],
		},

		{
			label: "Help",
			submenu: [
				{
					label: "GitHub",
					click: async () => {
						const { shell } = require("electron");
						await shell.openExternal(
							"https://github.com/sharktide/inferenceport-ai"
						);
					},
				},
				{
					label: "Report Bug",
					click: async () => {
						const { shell } = require("electron");
						await shell.openExternal(
							"https://github.com/sharktide/inferenceport-ai/issues/new"
						);
					},
				},
				{
					label: "Pull Request",
					click: async () => {
						const { shell } = require("electron");
						await shell.openExternal(
							"https://github.com/sharktide/inferenceport-ai/pulls/new"
						);
					},
				},
			],
		},
	];

	mainWindow.loadFile("public/index.html");
	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
}

function openFromDeepLink(url: string) {
	if (!mainWindow) return;
	try {
		const parsed = new URL(url);
		const pathname = parsed.pathname || "/";
		const host = parsed.hostname || "";
		if (pathname === "/" || pathname === "") {
			mainWindow.loadFile(path.join(__dirname, "public", "index.html"));
			return;
		}
		const cleaned = pathname.replace(/^\//, "");
		if (cleaned.startsWith("marketplace")) {
			const parts = cleaned.split("/");
			if (parts.length >= 2 && parts[1]) {
				const page = parts[1];
				if (page === "ollama") {
					mainWindow.loadFile(
						path.join(
							__dirname,
							"public",
							"marketplace",
							"ollama.html"
						)
					);
					return;
				}
				if (page === "spaces") {
					mainWindow.loadFile(
						path.join(
							__dirname,
							"public",
							"marketplace",
							"spaces.html"
						)
					);
					return;
				}
			}
			mainWindow.loadFile(
				path.join(__dirname, "public", "marketplace.html")
			);
			return;
		}

		if (cleaned === "installed") {
			mainWindow.loadFile(
				path.join(__dirname, "public", "installed.html")
			);
			return;
		}

		if (
			cleaned === "settings" ||
			cleaned === "profile" ||
			cleaned === "account"
		) {
			mainWindow.loadFile(
				path.join(__dirname, "public", "settings.html")
			);
			return;
		}

		if (cleaned === "auth" || cleaned === "login" || cleaned === "signin") {
			mainWindow.loadFile(path.join(__dirname, "public", "auth.html"));
			return;
		}

		if (cleaned === "reset-pswrd") {
			mainWindow.loadFile(
				path.join(__dirname, "public", "reset-pswrd.html")
			);
			return;
		}

		mainWindow.loadFile(path.join(__dirname, "public", "index.html"));
	} catch (e) {
		console.warn("Failed to open deep link", e);
	}
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
	app.quit();
}

app.on("second-instance", (_event: any, argv: string[]) => {
	const urlArg = argv.find((a) => a && a.startsWith("inferenceport-ai://"));
	if (urlArg) {
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.focus();
			openFromDeepLink(urlArg);
		}
	}
});

app.on("open-url", (event: any, url: string) => {
	event.preventDefault();
	if (mainWindow) openFromDeepLink(url);
});

app.whenReady().then(() => {
	const chatDir = path.join(app.getPath("userData"), "chat-sessions");

	try {
		if (process.defaultApp) {
			app.setAsDefaultProtocolClient(
				"inferenceport-ai",
				process.execPath,
				[path.resolve(process.argv[1]!)]
			);
		} else {
			app.setAsDefaultProtocolClient("inferenceport-ai");
		}
	} catch (e) {
		console.warn("Unable to set protocol client", e);
	}

	ipcMain.handle("session:getPath", () => chatDir);
	ollamaHandlers();
	utilsHandlers();
	authHandlers();
	spaces();
	createWindow();

	fireAndForget(serve(), "serve");
	fireAndForget(fetchSupportedTools(), "fetchSupportedTools");
});

app.on("window-all-closed", () => {
	app.quit();
});

app.on("window-all-closed", () => {
	app.quit();
});
