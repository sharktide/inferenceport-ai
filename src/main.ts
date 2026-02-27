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

import { app, BrowserWindow, ipcMain, screen, Menu, dialog, shell } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import path from "path";

import ollamaHandlers, {
	serve,
} from "./node-apis/ollama.js";
import { fetchSupportedTools } from "./node-apis/helper/tools.js";
import utilsHandlers from "./node-apis/utils.js";
import authHandlers, { supabase as supabaseClient } from "./node-apis/auth.js";
import chatStreamHandlers from "./node-apis/chatStream.js";
import spacesHandlers from "./node-apis/spaces.js";

import fixPath from "fix-path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

fixPath();
const supabase = supabaseClient;

let mainWindow: any = null;
let pendingDeepLink: string | null = null;

function fireAndForget<T>(promise: Promise<T>, label: string) {
	promise
		.then((result) => {
			console.info(
				`[fireAndForget] [${label}] resolved:`,
				result === undefined ? "<no value>" : result,
			);
		})
		.catch((err) => {
			const stackLine = (err?.stack || String(err)).split("\n")[0];
			console.warn(`[fireAndForget] [${label}] rejected:`, stackLine);
		});
}

function getDeepLinkRoute(parsed: URL): string {
	const host = parsed.hostname || "";
	const pathname = parsed.pathname || "/";
	const rawRoute = host ? `/${host}${pathname}` : pathname;
	const normalized = rawRoute.replace(/\/{2,}/g, "/");
	return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function isAuthCallbackDeepLink(parsed: URL): boolean {
	const route = getDeepLinkRoute(parsed).replace(/\/+$/, "").toLowerCase();
	return route === "/auth/callback" || route === "/authcallback";
}

async function handleAuthCallback(url: string): Promise<boolean> {
	try {
		const parsed = new URL(url);
		if (!isAuthCallbackDeepLink(parsed)) return false;

		const hashParams = new URLSearchParams(parsed.hash.slice(1));
		const queryParams = parsed.searchParams;

		const access_token =
			hashParams.get("access_token") || queryParams.get("access_token");
		const refresh_token =
			hashParams.get("refresh_token") || queryParams.get("refresh_token");

		if (!access_token || !refresh_token) {
			console.warn(
				"OAuth callback deep link did not include both tokens; continuing as a normal deep link.",
			);
			return false;
		}

		await supabase.auth.setSession({ access_token, refresh_token });
		console.info("Supabase session set successfully");

		if (mainWindow) {
			const publicDir = path.join(__dirname, "public");
			mainWindow.loadFile(path.join(publicDir, "auth.html"), {
				query: { deeplink: "signin-success" },
			});
		}

		return true;
	} catch (err) {
		console.error("Failed to handle auth callback:", err);
		return false;
	}
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
							path.join(__dirname, "public", "marketplace.html"),
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
								"ollama.html",
							),
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
		        { role: 'zoomIn' },
				{ role: 'zoomOut' },
				{ role: 'resetZoom' },
				{
					label: "Toggle Developer Tools",
					accelerator:
						process.platform === "darwin"
							? "Cmd+Alt+I"
							: "Ctrl+Shift+I",
					click: (
						_item: Electron.MenuItem,
						focusedWindow: Electron.BaseWindow | undefined,
						_event: Electron.KeyboardEvent,
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
							"https://github.com/sharktide/inferenceport-ai",
						);
					},
				},
				{
					label: "Report Bug",
					click: async () => {
						const { shell } = require("electron");
						await shell.openExternal(
							"https://github.com/sharktide/inferenceport-ai/issues/new",
						);
					},
				},
				{
					label: "Pull Request",
					click: async () => {
						const { shell } = require("electron");
						await shell.openExternal(
							"https://github.com/sharktide/inferenceport-ai/pulls/new",
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
		const route = getDeepLinkRoute(parsed);

		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.show();
		mainWindow.focus();

		const normalizedRoute = route.replace(/\/+$/, "") || "/index";
		const relative =
			normalizedRoute === "/"
				? "index"
				: normalizedRoute.replace(/^\/+/, "");

		const publicDir = path.join(__dirname, "public");
		const target = path.join(publicDir, `${relative}.html`);

		const resolved = path.resolve(target);
		if (!resolved.startsWith(publicDir)) {
			console.warn("Blocked invalid deep link path:", route);
			return;
		}
		if (!fs.existsSync(resolved)) {
			mainWindow.loadFile(path.join(publicDir, "index.html"));
			return;
		}

		mainWindow.loadFile(resolved, {
			query: Object.fromEntries(parsed.searchParams.entries()),
			hash: parsed.hash.replace(/^#/, ""),
		});
	} catch (e) {
		console.warn("Failed to open deep link", e);
	}
}

function safeWriteJSONAtomic(filePath: string, data: any) {
    const json = JSON.stringify(data, null, 2);

    const fd = fs.openSync(
        filePath,
        fs.constants.O_CREAT |
        fs.constants.O_TRUNC |
        fs.constants.O_WRONLY,
        0o600
    );

    try {
        fs.writeFileSync(fd, json);
    } finally {
        fs.closeSync(fd);
    }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
	app.quit();
}
const deeplinkArg = process.argv.find(arg =>
	arg.startsWith("inferenceport-ai://"),
);

if (deeplinkArg) {
	pendingDeepLink = deeplinkArg;
}

app.on("second-instance", async (_event, argv) => {
    const urlArg = argv.find(a => a?.startsWith("inferenceport-ai://"));
    if (!urlArg) return;

    if (await handleAuthCallback(urlArg)) {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
        return;
    }

    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        openFromDeepLink(urlArg);
    }
});



app.on("open-url", async (event, url) => {
	event.preventDefault();

	if (await handleAuthCallback(url)) return;

	if (!mainWindow) {
		pendingDeepLink = url;
		return;
	}

	openFromDeepLink(url);
});

app.whenReady().then(async () => {
	const chatDir = path.join(app.getPath("userData"), "chat-sessions");

	try {
		if (process.defaultApp) {
			app.setAsDefaultProtocolClient(
				"inferenceport-ai",
				process.execPath,
				[path.resolve(process.argv[1]!)],
			);
		} else {
			app.setAsDefaultProtocolClient("inferenceport-ai");
		}
	} catch (e) {
		console.warn("Unable to set protocol client", e);
	}

	ipcMain.handle("session:getPath", () => chatDir);

	authHandlers();
	chatStreamHandlers();
	ollamaHandlers();
	utilsHandlers();
	spacesHandlers();

	createWindow();

	(async function checkForUpdate() {
		try {
			const res = await fetch("https://sharktide-lightning.hf.space/status");
			if (!res.ok) return;
			const data = await res.json();
			const latest = data.latest;
			if (typeof latest === "string" && isNewerVersion(latest, app.getVersion())) {
				const skipKey = `skip-update-${latest}`;
				const storePath = path.join(app.getPath("userData"), "update-skips.json");
				let skipData: Record<string, boolean> = {};
				if (fs.existsSync(storePath)) {
					try { skipData = JSON.parse(fs.readFileSync(storePath, "utf8")); } catch { skipData = {}; }
				}
				if (skipData[skipKey]) return;
				const result = await dialog.showMessageBox(mainWindow, {
					type: "info",
					buttons: (process.platform !== "win32")
						? ["Open Link", "Cancel", "Skip This Release"]
						: ["Open Link", "Microsoft Store", "Cancel", "Skip This Release"],
					defaultId: 0,
					cancelId: 1,
					title: "Update Available",
					message: `A new version (${latest}) is available!\nDownload it from our website\n${process.platform === "win32" ? "or from the Microsoft Store" : ""}`,
					detail: "Link: https://inference.js.org/install.html\nYou can skip this release to not be notified again."
				});
				if (result.response === 0) {
					await shell.openExternal("https://inference.js.org/install.html");
				} else if ((process.platform !== "win32" && result.response === 2) || (process.platform === "win32" && result.response === 3)) {
					skipData[skipKey] = true;
					safeWriteJSONAtomic(storePath, skipData);
				} else if (process.platform === "win32" && result.response === 1 ) {
					await shell.openExternal("https://apps.microsoft.com/detail/9p5d3xx84l28")
				}
				if (mainWindow) {
					mainWindow.focus();
				}
			}
		} catch (e) {
			void 0
		}
	})();

	function isNewerVersion(b: string, a: string): boolean {
		const pa = a.split(".").map(Number);
		const pb = b.split(".").map(Number);

		for (let i = 0; i < 3; ++i) {
			const av = pa[i] || 0;
			const bv = pb[i] || 0;
			if (bv > av) return true;
			if (bv < av) return false;
		}
		return false;
	}

	if (pendingDeepLink) {
		const handled = await handleAuthCallback(pendingDeepLink);
		if (!handled) {
			openFromDeepLink(pendingDeepLink);
		}
		pendingDeepLink = null;
	}

	fireAndForget(serve(), "serve");
	fireAndForget(fetchSupportedTools(), "fetchSupportedTools");
});

app.on("window-all-closed", () => {
	app.quit();
});
