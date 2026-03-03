import { app, ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { broadcastIpcEvent } from "./helper/ipcBridge.js";

type SharedStorage = Record<string, string>;

const storageFilePath = path.join(
	app.getPath("userData"),
	"shared-local-storage.json",
);

function readStorage(): SharedStorage {
	try {
		if (!fs.existsSync(storageFilePath)) return {};
		const raw = fs.readFileSync(storageFilePath, "utf-8");
		const parsed = JSON.parse(raw) as SharedStorage;
		if (!parsed || typeof parsed !== "object") return {};
		return parsed;
	} catch {
		return {};
	}
}

function writeStorage(storage: SharedStorage): void {
	const dir = path.dirname(storageFilePath);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	const tmp = `${storageFilePath}.tmp-${process.pid}`;
	fs.writeFileSync(tmp, JSON.stringify(storage, null, 2), { mode: 0o600 });
	fs.renameSync(tmp, storageFilePath);
}

export default function registerStorageSyncHandlers(): void {
	ipcMain.handle("storage:get-all", () => {
		return readStorage();
	});

	ipcMain.handle("storage:set-item", (_event, key: string, value: string) => {
		const storage = readStorage();
		storage[key] = value;
		writeStorage(storage);
		broadcastIpcEvent("storage:changed", {
			type: "set",
			key,
			value,
		});
		return true;
	});

	ipcMain.handle("storage:remove-item", (_event, key: string) => {
		const storage = readStorage();
		if (key in storage) {
			delete storage[key];
			writeStorage(storage);
		}
		broadcastIpcEvent("storage:changed", {
			type: "remove",
			key,
		});
		return true;
	});

	ipcMain.handle("storage:clear", () => {
		writeStorage({});
		broadcastIpcEvent("storage:changed", {
			type: "clear",
		});
		return true;
	});
}
