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

import { app, BrowserWindow, ipcMain, screen, Menu, dialog, shell, globalShortcut } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import path from "path";

import fixPath from "fix-path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IPC_WS_PORT_HEADLESS = 52456;
const IPC_WS_PORT_FOREGROUND = 52457;
const DEFAULT_WEB_UI_PORT = 52459;

let stopWebUiServer: (() => void) | null = null;
let stopIpcWebSocketBridge: (() => void) | null = null;

let mainWindow: any = null;
let pendingDeepLink: string | null = null;
const backgroundServerMode = process.argv.includes("--background-server");
const SNIP_HOTKEY =
	process.platform === "darwin"
		? "Command+Shift+/"
		: "Control+Shift+/";

let snipWindow: BrowserWindow | null = null;
let snipChatWindow: BrowserWindow | null = null;
let snipHotkeyRegistered = false;
let setSnipTarget: (target: unknown) => void = () => void 0;

const LOG_BACKGROUND_TASKS =
	!app.isPackaged ||
	process.env.INFERENCEPORT_DEBUG_BG_TASKS === "1";

function fireAndForget<T>(promise: Promise<T>, label: string) {
	promise
		.then((result) => {
			if (LOG_BACKGROUND_TASKS) {
				console.info(
					`[fireAndForget] [${label}] resolved:`,
					result === undefined ? "<no value>" : result,
				);
			}
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

		const { supabase } = await import("./node-apis/auth.js");

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
		show: false,
		backgroundColor: "#0b0f17",
		webPreferences: {
			preload: path.join(__dirname, "preload.cjs"),
		},
		icon: path.join(__dirname, "public", "assets", "img", "logo.png"),
	});

	mainWindow.once("ready-to-show", () => {
		try {
			mainWindow?.show();
		} catch {
			void 0;
		}
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
						await shell.openExternal(
							"https://github.com/sharktide/inferenceport-ai",
						);
					},
				},
				{
					label: "Report Bug",
					click: async () => {
						await shell.openExternal(
							"https://github.com/sharktide/inferenceport-ai/issues/new",
						);
					},
				},
				{
					label: "Pull Request",
					click: async () => {
						await shell.openExternal(
							"https://github.com/sharktide/inferenceport-ai/pulls/new",
						);
					},
				},
			],
		},
	];

	const publicDir = path.join(__dirname, "public");
	mainWindow.loadFile(path.join(publicDir, "boot.html"));
	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
}

function updateSnipHotkey(shouldEnable: boolean): void {
	if (snipHotkeyRegistered) {
		globalShortcut.unregister(SNIP_HOTKEY);
		snipHotkeyRegistered = false;
	}

	if (!shouldEnable) return;

	const registered = globalShortcut.register(SNIP_HOTKEY, () => {
		openSnipOverlay();
	});

	if (!registered) {
		console.warn("Failed to register snip hotkey:", SNIP_HOTKEY);
		return;
	}

	snipHotkeyRegistered = true;
}

function openSnipOverlay(): void {
	if (snipWindow) {
		snipWindow.focus();
		return;
	}

	const cursorPoint = screen.getCursorScreenPoint();
	const display = screen.getDisplayNearestPoint(cursorPoint);
	setSnipTarget({
		displayId: display.id,
		bounds: display.bounds,
		scaleFactor: display.scaleFactor,
	});

	snipWindow = new BrowserWindow({
		x: display.bounds.x,
		y: display.bounds.y,
		width: display.bounds.width,
		height: display.bounds.height,
		frame: false,
		transparent: true,
		resizable: false,
		movable: false,
		skipTaskbar: true,
		alwaysOnTop: true,
		fullscreenable: false,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.cjs"),
			sandbox: false,
		},
	});

	snipWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	snipWindow.setAlwaysOnTop(true, "screen-saver");

	snipWindow.on("closed", () => {
		setSnipTarget(null);
		snipWindow = null;
	});

	const snipPath = path.join(__dirname, "public", "renderer", "snip.html");
	snipWindow.loadFile(snipPath);
}

function closeSnipOverlay(): void {
	if (!snipWindow) return;
	snipWindow.close();
	snipWindow = null;
	setSnipTarget(null);
}

function openSnipChat(payload: { dataUrl: string; width?: number; height?: number }): void {
	if (snipChatWindow) {
		snipChatWindow.show();
		snipChatWindow.focus();
		snipChatWindow.webContents.send("snip:image", payload);
		return;
	}

	snipChatWindow = new BrowserWindow({
		width: 460,
		height: 640,
		minWidth: 360,
		minHeight: 480,
		resizable: true,
		alwaysOnTop: true,
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, "preload.cjs"),
		},
	});
	snipChatWindow.center();

	snipChatWindow.on("closed", () => {
		snipChatWindow = null;
	});

	const chatPath = path.join(
		__dirname,
		"public",
		"renderer",
		"snip-chat.html",
	);
	snipChatWindow.loadFile(chatPath);

	snipChatWindow.webContents.once("did-finish-load", () => {
		snipChatWindow?.webContents.send("snip:image", payload);
	});
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

async function checkForUpdate(): Promise<void> {
	try {
		const res = await fetch("https://sharktide-lightning.hf.space/status");
		if (!res.ok) return;
		const data = await res.json();
		const latest = data.latest;
		if (
			typeof latest !== "string" ||
			!isNewerVersion(latest, app.getVersion())
		) {
			return;
		}

		const skipKey = `skip-update-${latest}`;
		const storePath = path.join(app.getPath("userData"), "update-skips.json");
		let skipData: Record<string, boolean> = {};
		if (fs.existsSync(storePath)) {
			try {
				skipData = JSON.parse(fs.readFileSync(storePath, "utf8"));
			} catch {
				skipData = {};
			}
		}
		if (skipData[skipKey]) return;

		if (!mainWindow) return;
		const result = await dialog.showMessageBox(mainWindow, {
			type: "info",
			buttons:
				process.platform !== "win32"
					? ["Open Link", "Cancel", "Skip This Release"]
					: [
							"Open Link",
							"Microsoft Store",
							"Cancel",
							"Skip This Release",
						],
			defaultId: 0,
			cancelId: 1,
			title: "Update Available",
			message: `A new version (${latest}) is available!\nDownload it from our website\n${process.platform === "win32" ? "or from the Microsoft Store" : ""}`,
			detail:
				"Link: https://inference.js.org/install.html\nYou can skip this release to not be notified again.",
		});
		if (result.response === 0) {
			await shell.openExternal("https://inference.js.org/install.html");
		} else if (
			(process.platform !== "win32" && result.response === 2) ||
			(process.platform === "win32" && result.response === 3)
		) {
			skipData[skipKey] = true;
			safeWriteJSONAtomic(storePath, skipData);
		} else if (process.platform === "win32" && result.response === 1) {
			await shell.openExternal("https://apps.microsoft.com/detail/9p5d3xx84l28");
		}

		mainWindow?.focus();
	} catch {
		void 0;
	}
}

let backendInitPromise: Promise<void> | null = null;
let fixPathApplied = false;

function maybeApplyFixPath(): void {
	if (fixPathApplied) return;
	if (process.platform !== "darwin") return;
	fixPathApplied = true;
	try {
		fixPath();
	} catch (err) {
		console.warn("fix-path failed", err);
	}
}

async function initBackend(): Promise<void> {
	if (backendInitPromise) return backendInitPromise;

	backendInitPromise = (async () => {
		maybeApplyFixPath();

		const chatDir = path.join(app.getPath("userData"), "chat-sessions");

		const startupModule = await import("./node-apis/startup.js");
		const startupSettings = startupModule.getStartupSettings();
		const uiPort = startupSettings.uiPort || DEFAULT_WEB_UI_PORT;
		const wsPort = backgroundServerMode
			? IPC_WS_PORT_HEADLESS
			: IPC_WS_PORT_FOREGROUND;

		const bridgeModule = await import("./node-apis/helper/ipcBridge.js");
		stopIpcWebSocketBridge = bridgeModule.stopIpcWebSocketBridge;
		bridgeModule.initIpcWebSocketBridge({
			port: wsPort,
			allowedOrigins: [
				`http://127.0.0.1:${uiPort}`,
				`http://localhost:${uiPort}`,
			],
		});

		const webUiModule = await import("./node-apis/helper/webUiServer.js");
		stopWebUiServer = webUiModule.stopWebUiServer;

		ipcMain.handle("session:getPath", () => chatDir);

		const [authModule, chatStreamModule, ollamaModule, utilsModule, spacesModule, storageSyncModule] =
			await Promise.all([
				import("./node-apis/auth.js"),
				import("./node-apis/chatStream.js"),
				import("./node-apis/ollama.js"),
				import("./node-apis/utils.js"),
				import("./node-apis/spaces.js"),
				import("./node-apis/storageSync.js"),
			]);

		authModule.default();
		chatStreamModule.default();
		ollamaModule.default();
		utilsModule.default();
		spacesModule.default();
		storageSyncModule.default();
		startupModule.default();

		setSnipTarget = utilsModule.setSnipTarget as unknown as (target: unknown) => void;

		ipcMain.on("snip:ready", (event) => {
			if (!snipWindow || event.sender !== snipWindow.webContents) return;
			snipWindow.show();
			snipWindow.focus();
		});
		ipcMain.handle(
			"snip:complete",
			(_event, payload: { dataUrl: string; width?: number; height?: number }) => {
				if (payload?.dataUrl) {
					openSnipChat(payload);
				}
				closeSnipOverlay();
				return true;
			},
		);
		ipcMain.handle("snip:cancel", () => {
			closeSnipOverlay();
			return true;
		});

		const applySnipHotkeySetting = (settings: { snipHotkeyInBackground?: boolean }) => {
			const shouldEnable = backgroundServerMode
				? Boolean(settings?.snipHotkeyInBackground)
				: true;
			updateSnipHotkey(shouldEnable);
		};

		applySnipHotkeySetting(startupSettings);
		startupModule.onStartupSettingsChange(applySnipHotkeySetting);

		if (
			startupSettings.autoStartProxy &&
			startupSettings.proxyUsers.length > 0
		) {
			try {
				const serverModule = await import("./node-apis/helper/server.js");
				serverModule.startProxyServer(
					startupSettings.proxyPort || 52458,
					startupSettings.proxyUsers,
				);
				console.info("Auto-started proxy server from startup settings");
			} catch (err) {
				console.warn("Failed to auto-start proxy server", err);
			}
		}

		if (pendingDeepLink) {
			const handled = await handleAuthCallback(pendingDeepLink);
			if (!handled) {
				if (!mainWindow && !backgroundServerMode) createWindow();
				openFromDeepLink(pendingDeepLink);
			}
			pendingDeepLink = null;
		} else if (!backgroundServerMode && mainWindow) {
			const publicDir = path.join(__dirname, "public");
			mainWindow.loadFile(path.join(publicDir, "index.html"));
		}

		// Background services: start after UI is responsive.
		setTimeout(() => {
			void checkForUpdate();
		}, 8_000);

		setTimeout(() => {
			fireAndForget(webUiModule.startWebUiServer(uiPort, "127.0.0.1", wsPort), "startWebUiServer");
		}, 500);

		setTimeout(() => {
			fireAndForget(ollamaModule.serve(), "serve");
		}, 15_000);

		setTimeout(() => {
			void import("./node-apis/helper/tools.js").then((toolsModule) => {
				fireAndForget(toolsModule.fetchSupportedTools(), "fetchSupportedTools");
				fireAndForget(toolsModule.fetchSupportedVisionModels(), "fetchSupportedVisionModels");
			});
		}, 20_000);
	})();

	return backendInitPromise;
}

if (!backgroundServerMode) {
	const gotLock = app.requestSingleInstanceLock();
	if (!gotLock) {
		app.quit();
	}
}

const deeplinkArg = process.argv.find(arg =>
	arg.startsWith("inferenceport-ai://"),
);

if (deeplinkArg) {
	pendingDeepLink = deeplinkArg;
}

app.on("second-instance", async (_event, argv) => {
	if (backgroundServerMode) return;
	await app.whenReady();
	await initBackend();
    const urlArg = argv.find(a => a?.startsWith("inferenceport-ai://"));
    if (!urlArg) {
		if (!mainWindow) createWindow();
		else {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.show();
			mainWindow.focus();
		}
		return;
	}

    if (await handleAuthCallback(urlArg)) {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
        return;
    }

    if (!mainWindow) createWindow();
    if (mainWindow) {
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.show();
		mainWindow.focus();
		openFromDeepLink(urlArg);
	}
});



app.on("open-url", async (event, url) => {
	event.preventDefault();
	await app.whenReady();
	await initBackend();

	if (await handleAuthCallback(url)) return;

	if (!mainWindow) {
		pendingDeepLink = url;
		return;
	}

	openFromDeepLink(url);
});

app.whenReady().then(async () => {
	if (!backgroundServerMode) {
		createWindow();
	}

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

	await initBackend();
});

app.on("before-quit", () => {
	try {
		stopWebUiServer?.();
	} catch {
		void 0;
	}
	try {
		stopIpcWebSocketBridge?.();
	} catch {
		void 0;
	}
});

app.on("will-quit", () => {
	globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
	if (backgroundServerMode) return;
	try {
		stopWebUiServer?.();
	} catch {
		void 0;
	}
	try {
		stopIpcWebSocketBridge?.();
	} catch {
		void 0;
	}
	app.quit();
});
