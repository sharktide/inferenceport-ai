type StorageChange = {
	type: "set" | "remove" | "clear";
	key?: string;
	value?: string;
};

declare global {
	interface Window {
		__inferenceportStorageSyncInstalled__?: boolean;
	}
}

function readAllLocalStorage(): Record<string, string> {
	const out: Record<string, string> = {};
	for (let i = 0; i < localStorage.length; i += 1) {
		const key = localStorage.key(i);
		if (!key) continue;
		const value = localStorage.getItem(key);
		if (value === null) continue;
		out[key] = value;
	}
	return out;
}

export function installLocalStorageSync(): void {
	if (window.__inferenceportStorageSyncInstalled__) return;
	if (!window.storageSync || typeof window.storageSync.getAll !== "function") {
		return;
	}

	window.__inferenceportStorageSyncInstalled__ = true;

	const storageProto = Object.getPrototypeOf(localStorage) as Storage;
	const nativeSetItem = storageProto.setItem.bind(localStorage);
	const nativeRemoveItem = storageProto.removeItem.bind(localStorage);
	const nativeClear = storageProto.clear.bind(localStorage);

	let isApplyingRemote = false;

	const applyRemoteChange = (change: StorageChange) => {
		isApplyingRemote = true;
		try {
			if (change.type === "clear") {
				nativeClear();
				return;
			}

			if (change.type === "remove" && change.key) {
				nativeRemoveItem(change.key);
				return;
			}

			if (change.type === "set" && change.key && change.value !== undefined) {
				nativeSetItem(change.key, change.value);
			}
		} finally {
			isApplyingRemote = false;
		}
	};

	const syncInitialState = async () => {
		try {
			const remote = await window.storageSync.getAll();
			const local = readAllLocalStorage();

			for (const [key, value] of Object.entries(remote)) {
				if (localStorage.getItem(key) === null) {
					nativeSetItem(key, value);
				}
			}

			for (const [key, value] of Object.entries(local)) {
				if (remote[key] !== value) {
					await window.storageSync.setItem(key, value);
				}
			}
		} catch (err) {
			console.warn("Storage sync init failed", err);
		}
	};

	storageProto.setItem = function (key: string, value: string): void {
		nativeSetItem(key, value);
		if (isApplyingRemote) return;
		void window.storageSync.setItem(key, value).catch(() => void 0);
	};

	storageProto.removeItem = function (key: string): void {
		nativeRemoveItem(key);
		if (isApplyingRemote) return;
		void window.storageSync.removeItem(key).catch(() => void 0);
	};

	storageProto.clear = function (): void {
		nativeClear();
		if (isApplyingRemote) return;
		void window.storageSync.clear().catch(() => void 0);
	};

	window.storageSync.onChange((change) => {
		applyRemoteChange(change);
	});

	void syncInitialState();
}
