/**
 * Tool Settings Manager
 * Handles persistent storage and synchronization of tool enable/disable settings
 */

export interface ToolSettings {
	webSearch: boolean;
	imageGen: boolean;
	videoGen: boolean;
	audioGen: boolean;
	searchEngines: string[]; // ["duckduckgo", "ollama"]
}

type SettingsChangeCallback = (settings: ToolSettings) => void;

const STORAGE_KEYS = {
	WEB_SEARCH: "tools_web_search",
	IMAGE_GEN: "tools_image_gen",
	VIDEO_GEN: "tools_video_gen",
	AUDIO_GEN: "tools_audio_gen",
	SEARCH_ENGINES: "tools_search_engines",
	// Deprecated keys (for migration)
	LEGACY_SEARCH_ENGINE: "search_engine",
};

const DEFAULT_SETTINGS: ToolSettings = {
	webSearch: false,
	imageGen: false,
	videoGen: false,
	audioGen: false,
	searchEngines: ["duckduckgo"],
};

let currentSettings: ToolSettings = DEFAULT_SETTINGS;
const changeListeners: Set<SettingsChangeCallback> = new Set();

/**
 * Initialize settings from localStorage
 * Migrate legacy search_engine setting if present
 */
export function initializeSettings(): ToolSettings {
	const settings: ToolSettings = {
		webSearch: localStorage.getItem(STORAGE_KEYS.WEB_SEARCH) === "true",
		imageGen: localStorage.getItem(STORAGE_KEYS.IMAGE_GEN) === "true",
		videoGen: localStorage.getItem(STORAGE_KEYS.VIDEO_GEN) === "true",
		audioGen: localStorage.getItem(STORAGE_KEYS.AUDIO_GEN) === "true",
		searchEngines: parseSearchEngines(),
	};

	currentSettings = settings;
	return settings;
}

/**
 * Parse search engines from localStorage
 * Handles both JSON array and legacy comma-separated formats
 */
function parseSearchEngines(): string[] {
	const stored = localStorage.getItem(STORAGE_KEYS.SEARCH_ENGINES);

	if (stored) {
		try {
			const parsed = JSON.parse(stored);
			if (Array.isArray(parsed) && parsed.length > 0) {
				return parsed;
			}
		} catch {
			const engines = stored.split(",").map((e) => e.trim());
			if (engines.length > 0) return engines;
		}
	}

	// Check for legacy search_engine key
	const legacyEngine = localStorage.getItem(STORAGE_KEYS.LEGACY_SEARCH_ENGINE);
	if (legacyEngine) {
		return [legacyEngine];
	}

	return DEFAULT_SETTINGS.searchEngines;
}

/**
 * Get current tool settings
 */
export function getSettings(): ToolSettings {
	return { ...currentSettings };
}

/**
 * Update a single tool setting
 */
export function setToolEnabled(
	tool: "webSearch" | "imageGen" | "videoGen" | "audioGen",
	enabled: boolean,
): void {
	const storageKeys: Record<string, string> = {
		webSearch: STORAGE_KEYS.WEB_SEARCH,
		imageGen: STORAGE_KEYS.IMAGE_GEN,
		videoGen: STORAGE_KEYS.VIDEO_GEN,
		audioGen: STORAGE_KEYS.AUDIO_GEN,
	};

	const storageKey = storageKeys[tool];
	if (!storageKey) {
		console.warn(`Unknown tool: ${tool}`);
		return;
	}

	currentSettings[tool] = enabled;
	localStorage.setItem(storageKey, enabled ? "true" : "false");
	notifyListeners();
}

/**
 * Set search engines (can be multiple)
 */
export function setSearchEngines(engines: string[]): void {
	const validEngines = engines.filter((e) =>
		["duckduckgo", "ollama"].includes(e),
	);

	if (validEngines.length === 0) {
		console.warn(
			"No valid search engines provided",
		);
	}

	currentSettings.searchEngines = validEngines;
	localStorage.setItem(STORAGE_KEYS.SEARCH_ENGINES, JSON.stringify(validEngines));
	notifyListeners();
}

/**
 * Update multiple settings at once
 */
export function updateSettings(partial: Partial<ToolSettings>): void {
	const newSettings = { ...currentSettings, ...partial };

	if ("webSearch" in partial) {
		currentSettings.webSearch = newSettings.webSearch;
		localStorage.setItem(
			STORAGE_KEYS.WEB_SEARCH,
			newSettings.webSearch ? "true" : "false",
		);
	}

	if ("imageGen" in partial) {
		currentSettings.imageGen = newSettings.imageGen;
		localStorage.setItem(
			STORAGE_KEYS.IMAGE_GEN,
			newSettings.imageGen ? "true" : "false",
		);
	}

	if ("videoGen" in partial) {
		currentSettings.videoGen = newSettings.videoGen;
		localStorage.setItem(
			STORAGE_KEYS.VIDEO_GEN,
			newSettings.videoGen ? "true" : "false",
		);
	}

	if ("audioGen" in partial) {
		currentSettings.audioGen = newSettings.audioGen;
		localStorage.setItem(
			STORAGE_KEYS.AUDIO_GEN,
			newSettings.audioGen ? "true" : "false",
		);
	}

	if ("searchEngines" in partial && partial.searchEngines) {
		const validEngines = partial.searchEngines.filter((e) =>
			["duckduckgo", "ollama"].includes(e),
		);
		if (validEngines.length > 0) {
			currentSettings.searchEngines = validEngines;
			localStorage.setItem(
				STORAGE_KEYS.SEARCH_ENGINES,
				JSON.stringify(validEngines),
			);
		}
	}

	notifyListeners();
}

/**
 * Listen for settings changes
 * Returns unsubscribe function
 */
export function onSettingsChange(
	callback: SettingsChangeCallback,
): () => void {
	changeListeners.add(callback);
	return () => {
		changeListeners.delete(callback);
	};
}

/**
 * Notify all listeners of settings changes
 */
function notifyListeners(): void {
	const settingsCopy = { ...currentSettings };
	changeListeners.forEach((callback) => {
		try {
			callback(settingsCopy);
		} catch (err) {
			console.error("Error in settings change listener:", err);
		}
	});
}

/**
 * Clear all tool settings (reset to defaults)
 */
export function resetSettings(): void {
	Object.values(STORAGE_KEYS).forEach((key) => {
		localStorage.removeItem(key);
	});
	currentSettings = { ...DEFAULT_SETTINGS };
	notifyListeners();
}

/**
 * Check if a specific search engine is enabled
 */
export function isSearchEngineEnabled(engine: string): boolean {
	return currentSettings.searchEngines.includes(engine);
}
