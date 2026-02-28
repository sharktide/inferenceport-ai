import { app, ipcMain } from "electron";
import fs from "fs";
import path from "path";

export type StartupProxyUser = {
	email: string;
	role: string;
};

export type StartupSettings = {
	runAtLogin: boolean;
	autoStartProxy: boolean;
	proxyPort: number;
	proxyUsers: StartupProxyUser[];
	uiPort: number;
};

const RESERVED_PORT_MIN = 52440;
const RESERVED_PORT_MAX = 52459;

const settingsFilePath = path.join(
	app.getPath("userData"),
	"startup-settings.json",
);

const defaultSettings: StartupSettings = {
	runAtLogin: false,
	autoStartProxy: false,
	proxyPort: 52458,
	proxyUsers: [],
	uiPort: 52459,
};

function sanitizeUsers(users: unknown): StartupProxyUser[] {
	if (!Array.isArray(users)) return [];
	return users
		.filter(
			(entry): entry is { email: unknown; role: unknown } =>
				!!entry && typeof entry === "object",
		)
		.map((entry) => ({
			email: typeof entry.email === "string" ? entry.email.trim() : "",
			role:
				typeof entry.role === "string" && entry.role.trim().length > 0
					? entry.role.trim()
					: "member",
		}))
		.filter((entry) => entry.email.length > 0);
}

function sanitizeSettings(raw: Partial<StartupSettings>): StartupSettings {
	return {
		runAtLogin: Boolean(raw.runAtLogin),
		autoStartProxy: Boolean(raw.autoStartProxy),
		proxyPort:
			typeof raw.proxyPort === "number" &&
			Number.isFinite(raw.proxyPort) &&
			raw.proxyPort > 0
				? Math.round(raw.proxyPort)
				: defaultSettings.proxyPort,
		proxyUsers: sanitizeUsers(raw.proxyUsers),
		uiPort:
			typeof raw.uiPort === "number" &&
			Number.isFinite(raw.uiPort) &&
			raw.uiPort > 0
				? Math.round(raw.uiPort)
				: defaultSettings.uiPort,
	};
}

function readSettingsFile(): StartupSettings {
	try {
		if (!fs.existsSync(settingsFilePath)) return defaultSettings;
		const raw = fs.readFileSync(settingsFilePath, "utf-8");
		const parsed = JSON.parse(raw) as Partial<StartupSettings>;
		return sanitizeSettings({ ...defaultSettings, ...parsed });
	} catch {
		return defaultSettings;
	}
}

function writeSettingsFile(settings: StartupSettings): void {
	const dir = path.dirname(settingsFilePath);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	const tmp = `${settingsFilePath}.tmp-${process.pid}`;
	fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), { mode: 0o600 });
	fs.renameSync(tmp, settingsFilePath);
}

function setOpenAtLogin(enabled: boolean): void {
	try {
		if (app.isPackaged) {
			app.setLoginItemSettings({
				openAtLogin: enabled,
				openAsHidden: true,
				args: ["--background-server"],
			});
		} else {
			throw new Error("Skipping open-at-login update in development mode");
		}
	} catch (err) {
		console.warn("Failed to update open-at-login setting", err);
	}
}

function readOpenAtLogin(): boolean {
	try {
		return app.getLoginItemSettings({
			args: ["--background-server"],
		}).openAtLogin;
	} catch {
		try {
			return app.getLoginItemSettings().openAtLogin;
		} catch {
			return false;
		}
	}
}

export function getStartupSettings(): StartupSettings {
	const fileSettings = readSettingsFile();
	return {
		...fileSettings,
		runAtLogin: readOpenAtLogin() || fileSettings.runAtLogin,
	};
}

export function updateStartupSettings(
	patch: Partial<StartupSettings>,
): StartupSettings {
	const current = readSettingsFile();

	if (
		typeof patch.uiPort === "number" &&
		patch.uiPort !== current.uiPort &&
		patch.uiPort >= RESERVED_PORT_MIN &&
		patch.uiPort <= RESERVED_PORT_MAX
	) {
		throw new Error(
			`UI port ${patch.uiPort} is reserved (${RESERVED_PORT_MIN}-${RESERVED_PORT_MAX})`,
		);
	}

	const merged = sanitizeSettings({
		...current,
		...patch,
	});
	writeSettingsFile(merged);

	if ("runAtLogin" in patch) {
		setOpenAtLogin(Boolean(merged.runAtLogin));
	}

	return getStartupSettings();
}

export default function registerStartupHandlers(): void {
	ipcMain.handle("startup:get-settings", () => {
		return getStartupSettings();
	});

	ipcMain.handle(
		"startup:update-settings",
		(_event, patch: Partial<StartupSettings>) => {
			return updateStartupSettings(patch || {});
		},
	);
}

app.whenReady().then(() => {
	if (!app.isPackaged) return;

	const login = app.getLoginItemSettings({
		args: ["--background-server"],
	});

	if (login.openAtLogin) {
		app.setLoginItemSettings({
			openAtLogin: true,
			openAsHidden: true,
			args: ["--background-server"],
		});
	}
});
