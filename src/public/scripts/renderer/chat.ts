/*
Copyright 2026 Rihaan Meher

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

//@ts-nocheck

import { showNotification } from "../helper/notification.js";
import {
	BILLING_PORTAL_URL,
	buildUpgradePlanCards,
	escapeSubscriptionHtml,
	installExternalUrlHandler,
	normalizeUpgradePlanKey,
} from "../helper/subscriptionUpgradeUi.js";
import {
	mergeLocalAndRemoteSessions,
	safeCallRemote,
	isOffline,
} from "../helper/sync.js";
import * as toolSettings from "../helper/toolSettings.js";
import {
	initMediaLibrary,
	openMediaPicker,
	mediaItemToAttachment,
	openMediaTrashOverlay,
} from "./mediaLibrary.js";

const dataDir = window.ollama.getPath();

const sessionFile = `${dataDir}/sessions.json`;
const LAST_ACCESS_KEY = "session-last-access";
type UserContentPart =
	| { type: "text"; text: string }
	| { type: "image_url"; image_url: { url: string } };

interface AttachedTextFile {
	type: "text";
	name: string;
	content: string;
	previewDataUrl?: string;
	previewMimeType?: string;
	mediaId?: string;
}

interface AttachedImageFile {
	type: "image";
	name: string;
	mimeType: string;
	base64: string;
	mediaId?: string;
}

type AttachedFile = AttachedTextFile | AttachedImageFile;

const RASTER_IMAGE_EXTENSIONS = new Set([
	"jpg",
	"jpeg",
	"png",
	"gif",
	"webp",
	"bmp",
	"ico",
	"tiff",
	"tif",
	"avif",
]);

function getFileExtension(filename: string): string {
	return filename.split(".").pop()?.toLowerCase() ?? "";
}

function isRasterImageFile(filename: string): boolean {
	return RASTER_IMAGE_EXTENSIONS.has(getFileExtension(filename));
}

function isSvgFilename(filename: string): boolean {
	return getFileExtension(filename) === "svg";
}

function isSvgFile(file: File): boolean {
	return isSvgFilename(file.name) || file.type === "image/svg+xml";
}

function isNonSvgImageFile(file: File): boolean {
	if (isSvgFile(file)) return false;
	return file.type.startsWith("image/") || isRasterImageFile(file.name);
}

function svgTextToPreviewDataUrl(svgText: string): string {
	const encoded = encodeURIComponent(svgText);
	return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

/**
 * Read a File as a base64 DataURL and return the raw base64 string plus MIME
 * type separately, so we can construct `data:<mime>;base64,<data>` ourselves.
 */
function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			const commaIdx = result.indexOf(",");
			const meta = result.slice(0, commaIdx);
			const base64 = result.slice(commaIdx + 1);
			const mimeType = meta.replace("data:", "").replace(";base64", "");
			resolve({ base64, mimeType });
		};
		reader.onerror = () =>
			reject(reader.error ?? new Error("Failed to read image file"));
		reader.readAsDataURL(file);
	});
}

function loadLastAccessMap(): Record<string, number> {
	try {
		return JSON.parse(localStorage.getItem(LAST_ACCESS_KEY) || "{}");
	} catch {
		return {};
	}
}

function saveLastAccessMap() {
	try {
		localStorage.setItem(LAST_ACCESS_KEY, JSON.stringify(lastAccessMap));
	} catch {}
}

let lastAccessMap = loadLastAccessMap();

/**
 * Extract the plain-text string from a message's content field, which may now
 * be either a legacy string or a UserContentPart[].
 */
function getMessageText(content: string | UserContentPart[]): string {
	if (typeof content === "string") return content;
	return content
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join("\n");
}

/**
 * Extract all image data-URLs from a message's content field.
 */
function getMessageImages(content: string | UserContentPart[]): string[] {
	if (typeof content === "string") return [];
	return content
		.filter(
			(p): p is { type: "image_url"; image_url: { url: string } } =>
				p.type === "image_url",
		)
			.map((p) => p.image_url.url);
}

function cloneJson<T>(value: T): T {
	return structuredClone(value) as T;
}

const LEGACY_ROOT_JSON_KEY = "__historyRootJson";

function normalizeMessageFromActiveVersion(message: any): any {
	if (!message || typeof message !== "object") return message;
	if (!Array.isArray(message.versions) || message.versions.length === 0) {
		return message;
	}
	const idx =
		typeof message.currentVersionIdx === "number" &&
		Number.isFinite(message.currentVersionIdx)
			? Math.max(0, Math.min(message.currentVersionIdx, message.versions.length - 1))
			: 0;
	message.currentVersionIdx = idx;
	const active = message.versions[idx] || {};
	if (!Array.isArray(active.tail)) active.tail = [];
	if (typeof active.content === "undefined" || active.content === null) {
		active.content = message.content ?? "";
	}
	message.versions[idx] = active;
	message.content = active.content;
	if (Array.isArray(active.tool_calls) && !Array.isArray(message.tool_calls)) {
		message.tool_calls = cloneJson(active.tool_calls);
	}
	if (Array.isArray(active.toolCalls) && !Array.isArray(message.tool_calls)) {
		message.tool_calls = cloneJson(active.toolCalls);
	}
	return message;
}

function extractFlatHistoryFromTree(rootMessage: any): any[] {
	if (!rootMessage || typeof rootMessage !== "object") return [];
	const history: any[] = [];
	const toFlatEntry = (node: any): any => {
		const cloned = cloneJson(node);
		normalizeMessageFromActiveVersion(cloned);
		if (Array.isArray(cloned.versions)) {
			cloned.versions = cloned.versions.map((version: any) => ({
				...version,
				tail: [],
			}));
		}
		return cloned;
	};
	const walk = (node: any): void => {
		if (!node || typeof node !== "object") return;
		normalizeMessageFromActiveVersion(node);
		history.push(toFlatEntry(node));
		const versions = Array.isArray(node.versions) ? node.versions : [];
		const idx =
			typeof node.currentVersionIdx === "number"
				? Math.max(0, Math.min(node.currentVersionIdx, versions.length - 1))
				: 0;
		const active = versions[idx] || null;
		const tail = active && Array.isArray(active.tail) ? active.tail : [];
		for (const child of tail) {
			walk(child);
			if (
				child?.role === "user" &&
				Array.isArray(child?.versions) &&
				child.versions.length > 1
			) {
				break;
			}
		}
	};
	walk(rootMessage);
	return history;
}

function normalizeSessionHistoryShape(session: any, sessionId?: string): void {
	if (!session || typeof session !== "object") return;
	const rawHistory = Array.isArray(session.history) ? session.history : [];
	const legacyRootRaw =
		typeof session[LEGACY_ROOT_JSON_KEY] === "string"
			? session[LEGACY_ROOT_JSON_KEY].trim()
			: "";

	if (!rawHistory.length && !legacyRootRaw) {
		session.history = [];
		delete session[LEGACY_ROOT_JSON_KEY];
		if (sessionId) sessionHistoryRoots.delete(sessionId);
		return;
	}

	let root: any | null = null;

	if (legacyRootRaw) {
		try {
			root = cloneAndRepairTree(JSON.parse(legacyRootRaw));
		} catch {
			root = null;
		}
	}

	if (!root) {
		const looksTree =
			rawHistory.length === 1 &&
			rawHistory[0] &&
			typeof rawHistory[0] === "object" &&
			Array.isArray(rawHistory[0].versions);

		if (looksTree) {
			root = cloneAndRepairTree(rawHistory[0]);
		} else {
			const nodes = rawHistory.map((entry: any) =>
				ensureMessageVersioningShape(cloneJson(entry)),
			);
			root = nodes[0] || null;
			for (let i = 1; i < nodes.length; i++) {
				appendEntriesToActiveLeaf(root, [nodes[i]]);
			}
		}
	}

	if (!root) {
		session.history = [];
		if (sessionId) sessionHistoryRoots.delete(sessionId);
		delete session[LEGACY_ROOT_JSON_KEY];
		return;
	}

	session.history = [root];
	if (sessionId) sessionHistoryRoots.set(sessionId, root);
	delete session[LEGACY_ROOT_JSON_KEY];
}

function normalizeAllSessionHistories(allSessions: Record<string, any>): void {
	for (const [sessionId, session] of Object.entries(allSessions || {})) {
		normalizeSessionHistoryShape(session, sessionId);
	}
}

function ensureMessageVersioningShape(message: any): any {
	ensureMessageMetadata(message);
	if (!Array.isArray(message.versions) || message.versions.length === 0) {
		message.versions = [createMessageVersion(message.content)];
		message.currentVersionIdx = 0;
	}
	const idx = Math.max(
		0,
		Math.min(Number(message.currentVersionIdx || 0), message.versions.length - 1),
	);
	message.currentVersionIdx = idx;
	if (!Array.isArray(message.versions[idx].tail)) message.versions[idx].tail = [];
	if (typeof message.versions[idx].content === "undefined") {
		message.versions[idx].content = cloneMessageContent(message.content);
	}
	message.content = cloneMessageContent(message.versions[idx].content);
	return message;
}

function getActiveVersionNode(message: any): any {
	if (!message || typeof message !== "object") return null;
	ensureMessageVersioningShape(message);
	return message.versions[message.currentVersionIdx];
}

function cloneAndRepairTree(rootMessage: any): any {
	const cloned = cloneJson(rootMessage);
	const walk = (node: any) => {
		if (!node || typeof node !== "object") return;
		ensureMessageVersioningShape(node);
		const active = getActiveVersionNode(node);
		for (const child of active?.tail || []) walk(child);
	};
	walk(cloned);
	return cloned;
}

function getActiveLeafMessage(rootMessage: any): any {
	let current = rootMessage;
	while (current) {
		const active = getActiveVersionNode(current);
		const tail = Array.isArray(active?.tail) ? active.tail : [];
		if (!tail.length) return current;
		current = tail[tail.length - 1];
	}
	return rootMessage;
}

function appendEntriesToActiveLeaf(rootMessage: any, entries: any[] = []): any {
	if (!rootMessage || !entries.length) return rootMessage;
	const leaf = getActiveLeafMessage(rootMessage);
	const active = getActiveVersionNode(leaf);
	active.tail = [...(active.tail || []), ...entries];
	return rootMessage;
}

function findMessageContext(rootMessage: any, targetId: string) {
	if (!rootMessage || !targetId) return null;
	if (rootMessage.id === targetId) {
		return { message: rootMessage, parent: null, parentTail: null, index: -1 };
	}
	const search = (message: any): any => {
		const active = getActiveVersionNode(message);
		const tail = Array.isArray(active?.tail) ? active.tail : [];
		for (let i = 0; i < tail.length; i++) {
			const child = tail[i];
			if (child?.id === targetId) {
				return { message: child, parent: message, parentTail: tail, index: i };
			}
			const nested = search(child);
			if (nested) return nested;
		}
		return null;
	};
	return search(rootMessage);
}

function findAndUpdateMessage(rootMessage: any, targetId: string, updateFn: (msg: any) => void): boolean {
	if (!rootMessage || !targetId) return false;
	if (rootMessage.id === targetId) {
		updateFn(rootMessage);
		return true;
	}
	const search = (message: any): boolean => {
		const active = getActiveVersionNode(message);
		const tail = Array.isArray(active?.tail) ? active.tail : [];
		for (const child of tail) {
			if (child?.id === targetId) {
				updateFn(child);
				return true;
			}
			if (search(child)) return true;
		}
		return false;
	};
	return search(rootMessage);
}

const sessionHistoryRoots = new Map<string, any>();

function ensureSessionHistoryRoot(session: any, sessionId?: string): any | null {
	if (!session) return null;
	if (sessionId && sessionHistoryRoots.has(sessionId)) {
		return sessionHistoryRoots.get(sessionId);
	}

	const legacyRootRaw =
		typeof session[LEGACY_ROOT_JSON_KEY] === "string"
			? session[LEGACY_ROOT_JSON_KEY].trim()
			: "";
	if (legacyRootRaw) {
		try {
			const parsed = cloneAndRepairTree(JSON.parse(legacyRootRaw));
			if (sessionId) sessionHistoryRoots.set(sessionId, parsed);
			session.history = parsed ? [parsed] : [];
			delete session[LEGACY_ROOT_JSON_KEY];
			return parsed;
		} catch {
			delete session[LEGACY_ROOT_JSON_KEY];
		}
	}
	const history = Array.isArray(session.history) ? session.history : [];
	if (!history.length) {
		if (sessionId) sessionHistoryRoots.delete(sessionId);
		return null;
	}
	// If first node looks like a tree root, use it directly.
	if (Array.isArray(history[0]?.versions) && history.length === 1) {
		const root = cloneAndRepairTree(history[0]);
		session.history = root ? [root] : [];
		if (sessionId) sessionHistoryRoots.set(sessionId, root);
		delete session[LEGACY_ROOT_JSON_KEY];
		return root;
	}
	const nodes = history.map((entry: any) => ensureMessageVersioningShape(cloneJson(entry)));
	const root = nodes[0];
	for (let i = 1; i < nodes.length; i++) {
		appendEntriesToActiveLeaf(root, [nodes[i]]);
	}
	session.history = root ? [root] : [];
	if (sessionId) sessionHistoryRoots.set(sessionId, root);
	delete session[LEGACY_ROOT_JSON_KEY];
	return root;
}

function setSessionHistoryRoot(session: any, root: any, sessionId?: string): void {
	const normalizedRoot = root ? cloneAndRepairTree(root) : null;
	if (normalizedRoot) {
		session.history = [normalizedRoot];
		if (sessionId) sessionHistoryRoots.set(sessionId, normalizedRoot);
	} else {
		session.history = [];
		if (sessionId) sessionHistoryRoots.delete(sessionId);
	}
	delete session[LEGACY_ROOT_JSON_KEY];
}

function getSessionFlatHistory(session: any, sessionId?: string): any[] {
	const root = ensureSessionHistoryRoot(session, sessionId);
	if (!root) return [];
	return extractFlatHistoryFromTree(root);
}

// ─────────────────────────────────────────────────────────────────────────────

function processTextForDisplay(text: string): string {
	text = text.replace(/<session_name>[\s\S]*?<\/session_name>/gi, "").trim();
	let result = '';
	let i = 0;
	while (i < text.length) {
		const svgStart = text.indexOf('```svg', i);
		if (svgStart === -1) {
			result += text.slice(i);
			break;
		}
		result += text.slice(i, svgStart) + '[SVG Image]';
		const svgEnd = text.indexOf('```', svgStart + 6);
		if (svgEnd === -1) {
			// open block, stop here
			break;
		}
		i = svgEnd + 3;
	}
	return result;
}

const chatBox = document.getElementById("chat-box") as HTMLDivElement;
const input = document.getElementById("chat-input") as HTMLInputElement;
const form = document.getElementById("chat-form") as HTMLFormElement;
const stopBtn = document.getElementById("stop-btn") as HTMLButtonElement;
const modelSelect = document.getElementById(
	"model-select",
) as HTMLSelectElement;
const hostSelect = document.getElementById(
	"host-select",
) as HTMLSelectElement | null;

const sessionList = document.getElementById("session-list") as HTMLDivElement;
const newSessionBtn = document.getElementById(
	"new-session-btn",
) as HTMLButtonElement;
const chatPanel = document.querySelector(".chat-panel") as HTMLElement | null;
const welcomeHero = document.getElementById(
	"welcome-hero",
) as HTMLDivElement | null;
const welcomeCards = document.getElementById(
	"welcome-cards",
) as HTMLDivElement | null;
const fileInput = document.getElementById("file-upload") as HTMLInputElement;
let imageInput = document.getElementById("image-upload") as HTMLInputElement | null;
if (!imageInput) {
	imageInput = document.createElement("input");
	imageInput.type = "file";
	imageInput.id = "image-upload";
	imageInput.multiple = true;
	imageInput.accept = "image/*";
	imageInput.style.display = "none";
	fileInput.insertAdjacentElement("afterend", imageInput);
}
const attachBtn = document.getElementById("attach-btn") as HTMLButtonElement;
const fileBar = document.getElementById("file-preview-bar") as HTMLDivElement;
const remoteHostAlias = document.getElementById(
	"remote-host-alias",
) as HTMLInputElement | null;
const searchBtn = document.getElementById("search-btn") as HTMLButtonElement | null;
const imgBtn = document.getElementById("img-btn") as HTMLButtonElement | null;
const videoBtn = document.getElementById("video-btn") as HTMLButtonElement | null;
const audioBtn = document.getElementById("audio-btn") as HTMLButtonElement | null;
const searchBtnMini = document.getElementById(
	"search-btn-mini",
) as HTMLButtonElement | null;
const imgBtnMini = document.getElementById("img-btn-mini") as HTMLButtonElement | null;
const videoBtnMini = document.getElementById(
	"video-btn-mini",
) as HTMLButtonElement | null;
const audioBtnMini = document.getElementById(
	"audio-btn-mini",
) as HTMLButtonElement | null;
const searchLabel = document.getElementById("search-text") as HTMLSpanElement | null;
const imageLabel = document.getElementById("img-text") as HTMLSpanElement | null;
const videoLabel = document.getElementById("video-text") as HTMLSpanElement | null;
const audioLabel = document.getElementById("audio-text") as HTMLSpanElement | null;
const textarea = document.getElementById("chat-input") as HTMLTextAreaElement;
const typingBar = textarea.closest(".typing-bar") as HTMLDivElement;
const TOOLS_UNSUPPORTED_HTML =
	'The selected model does not support tools (web search, image generation, video generation, or audio/SFX generation). Get a model that does from the <a href="../marketplace/ollama.html">marketplace</a>.';
const lightningToggleTop = document.getElementById(
	"lightning-toggle-top",
) as ToggleSwitchElement | null;
const lightningToggleSidebar = document.getElementById(
	"lightning-toggle-sidebar",
) as ToggleSwitchElement | null;
const lightningToggleStatus = document.getElementById(
	"lightning-toggle-status",
) as ToggleSwitchElement | null;
const sidebarControls = document.getElementById(
	"sidebar-controls",
) as HTMLDivElement | null;
const lightningStatus = document.getElementById(
	"lightning-status",
) as HTMLDivElement | null;
const sidebarChatPane = document.getElementById("sidebar-chat-pane") as HTMLDivElement | null;
const sidebarMediaPane = document.getElementById("sidebar-media-pane") as HTMLDivElement | null;
const sidebarTrashPane = document.getElementById("sidebar-trash-pane") as HTMLDivElement | null;
const sidebarSessionsHost = document.getElementById("sidebar-sessions") as HTMLDivElement | null;
const sidebarTrashBtn = document.getElementById("sidebar-trash-btn") as HTMLButtonElement | null;
const sidebarModeTabs = Array.from(
	document.querySelectorAll(".sidebar-mode-tab"),
) as HTMLButtonElement[];
const usagePlanNameEl = document.getElementById(
	"usage-plan-name",
) as HTMLParagraphElement | null;
const usagePlanMetaEl = document.getElementById(
	"usage-plan-meta",
) as HTMLParagraphElement | null;
const usageResetNoteEl = document.getElementById(
	"usage-reset-note",
) as HTMLParagraphElement | null;
const usageUpgradeBtn = document.getElementById(
	"usage-upgrade-btn",
) as HTMLButtonElement | null;
const usageRefreshBtn = document.getElementById(
	"usage-refresh-btn",
) as HTMLButtonElement | null;
const previewTier = document.getElementById(
	"usage-panel-tier"
) as HTMLSpanElement;
let modal: declarations["iInstance"]["iModal"];
let upgradeModal: declarations["iInstance"]["iModal"];
let editModal: declarations["iInstance"]["iModal"];
let activeSidebarMode: "chats" | "media" = "chats";

function isMediaLibraryAvailable(): boolean {
	return !!currentAuthSession?.isAuthenticated;
}

function updateMediaLibraryVisibility(): void {
	const mediaTab = sidebarModeTabs.find((tab) => tab.dataset.sidebarMode === "media") || null;
	const trashBtn = sidebarTrashBtn;
	const enabled = isMediaLibraryAvailable();
	if (mediaTab) {
		mediaTab.classList.toggle("hidden", !enabled);
		mediaTab.disabled = !enabled;
	}
	if (trashBtn) {
		trashBtn.classList.toggle("hidden", !enabled);
		trashBtn.disabled = !enabled;
	}
	if (!enabled && activeSidebarMode === "media") {
		if (sidebarChatPane) { sidebarChatPane.style.display = ""; sidebarChatPane.classList.remove("hidden"); }
		if (sidebarMediaPane) { sidebarMediaPane.style.display = "none"; sidebarMediaPane.classList.add("hidden"); }
		if (sidebarTrashPane) { sidebarTrashPane.style.display = "none"; sidebarTrashPane.classList.add("hidden"); }
		sidebarSessionsHost?.classList.remove("trash-open");
		activeSidebarMode = "chats";
		sidebarModeTabs.forEach((tab) => {
			tab.classList.toggle("active", tab.dataset.sidebarMode === "chats");
		});
	}
}

function setupSidebarModeTabs(): void {
    const showPane = (pane: HTMLDivElement | null, visible: boolean) => {
        if (!pane) return;
        pane.style.display = visible ? "" : "none";
        pane.classList.toggle("hidden", !visible);
    };

    const applyMode = (mode: "chats" | "media" | "trash") => {
        if (mode !== "chats" && !isMediaLibraryAvailable()) {
            showNotification({ type: "info", message: "Sign in to use the Media Library." });
            mode = "chats";
        }
        // Only update activeSidebarMode for non-trash modes so back button returns correctly
        if (mode !== "trash") activeSidebarMode = mode as "chats" | "media";
        sidebarModeTabs.forEach((tab) => {
            tab.classList.toggle("active", tab.dataset.sidebarMode === mode);
        });
        showPane(sidebarChatPane, mode === "chats");
        showPane(sidebarMediaPane, mode === "media");
        showPane(sidebarTrashPane, mode === "trash");
        if (mode === "media") void Promise.resolve().then(() => initMediaLibrary());
        if (mode === "trash") void openMediaTrashOverlay();
    };
    sidebarModeTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            applyMode(tab.dataset.sidebarMode === "media" ? "media" : "chats");
        });
    });
    sidebarTrashBtn?.addEventListener("click", () => {
        if (!isMediaLibraryAvailable()) return;
        applyMode("trash");
    });
    document.getElementById("sidebar-trash-back")?.addEventListener("click", () => {
        applyMode(activeSidebarMode);
    });
    updateMediaLibraryVisibility();
}

const urlParams = new URLSearchParams(window.location.search);
const isSnipMode = urlParams.get("snip") === "1";
const forceLightning = isSnipMode || urlParams.get("lightning") === "1";

if (isSnipMode) {
	document.documentElement.classList.add("snip-mode");
	document.body.classList.add("snip-mode");
}

toolSettings.initializeSettings();
let currentToolSettings = toolSettings.getSettings();
let searchEnabled = currentToolSettings.webSearch;
let searchEngine: Array<string> = currentToolSettings.searchEngines;
let imgEnabled = currentToolSettings.imageGen;
let videoEnabled = currentToolSettings.videoGen;
let audioEnabled = currentToolSettings.audioGen;
let sessions = {};
let sessionSortOrder: string[] | null = null;
let currentSessionId = null;
let activeToolSessionId: string | null = null;

function findSessionIdByRef(sessionRef: any): string | null {
	if (!sessionRef || typeof sessionRef !== "object") return null;
	for (const [sessionId, value] of Object.entries(sessions || {})) {
		if (value === sessionRef) return sessionId;
	}
	return null;
}

const LIGHTNING_MODEL_DISPLAY = "@InferencePort/Lightning-Text-v2";
const LIGHTNING_MODEL_VALUE = "lightning";
const LIGHTNING_CLIENT_URL = "lightning";
const LIGHTNING_ENABLED_KEY = "lightning_enabled";
let lightningEnabled = forceLightning ? true : readLightningSetting();
const assetObjectUrlCache = new Map<string, string>();
const IMAGE_MODE_OPTIONS = ["auto", "fantasy", "realistic"];
const VIDEO_RATIO_OPTIONS = ["3:2", "2:3", "1:1"];
const VIDEO_MODE_OPTIONS = ["normal", "fun"];
const DEFAULT_VIDEO_DURATION = 5;
const liveToolBubbles = new Map<string, HTMLDivElement>();
type PlanKey = "free" | "light" | "core" | "creator" | "professional";
const PLAN_ORDER: PlanKey[] = [
	"free",
	"light",
	"core",
	"creator",
	"professional",
];
export const PLAN_DISPLAY_NAMES: Record<PlanKey, string> = {
	free: "Free Tier",
	light: "InferencePort AI Light",
	core: "InferencePort AI Core",
	creator: "InferencePort AI Creator",
	professional: "InferencePort AI Professional",
};
const EMPTY_PLAN_LIMITS: AuthTierLimits = {
	cloudChatDaily: null,
	imagesDaily: null,
	videosDaily: null,
	audioWeekly: null,
};
export const PLAN_LIMITS: Record<PlanKey, AuthTierLimits> = {
	free: { ...EMPTY_PLAN_LIMITS },
	light: { ...EMPTY_PLAN_LIMITS },
	core: { ...EMPTY_PLAN_LIMITS },
	creator: { ...EMPTY_PLAN_LIMITS },
	professional: { ...EMPTY_PLAN_LIMITS },
};
const LIMIT_COPY = {
	cloudChatDaily: { label: "Cloud chat", period: "today" },
	imagesDaily: { label: "Image generation", period: "today" },
	videosDaily: { label: "Video generation", period: "today" },
	audioWeekly: { label: "Audio generation", period: "this week" },
} as const;
const USAGE_STORAGE_PREFIX = "inferenceport-usage-v1";
const UPGRADE_INTENT_STORAGE_KEY = "inferenceport:upgrade-intent-target";
const UPGRADE_SETTINGS_TARGET = "settings.html#upgrade";
const USAGE_UI_MAP = {
	cloudChatDaily: {
		valueId: "usage-cloud-value",
		fillId: "usage-cloud-fill",
	},
	imagesDaily: {
		valueId: "usage-image-value",
		fillId: "usage-image-fill",
	},
	videosDaily: {
		valueId: "usage-video-value",
		fillId: "usage-video-fill",
	},
	audioWeekly: {
		valueId: "usage-audio-value",
		fillId: "usage-audio-fill",
	},
} as const;
let usageStorageKey = `${USAGE_STORAGE_PREFIX}:guest`;
let currentPlanKey: PlanKey = "free";
let currentPlanName = PLAN_DISPLAY_NAMES.free;
let currentPlanPaid = false;
let currentAuthSession: AuthSessionView | null = null;
let lastTierLookupError: string | null = null;
let subscriptionTiers: AuthSubscriptionTier[] = [];
let currentTierConfig: AuthTierConfig | null = null;
let usageState = {
	dayKey: "",
	weekKey: "",
	cloudChatDaily: 0,
	imagesDaily: 0,
	videosDaily: 0,
	audioWeekly: 0,
};
let usageSyncSource: "local" | "server" = "local";
let usageSyncedAt: string | null = null;
let lastUsageLookupError: string | null = null;
let usageSyncTimer: ReturnType<typeof setTimeout> | null = null;

type ToggleSwitchElement = HTMLElement & {
	checked: boolean;
};

function readLightningSetting(): boolean {
	try {
		if (localStorage.getItem(LIGHTNING_ENABLED_KEY) === "false") {
			return false;
		} else return true;
	} catch (e) {
		showNotification({
			message: "Could not read Lightning setting. Defaulting to enabled.",
			type: "warning",
		});
		return true;
	}
}

function getLocalDayKey(date: Date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function getIsoWeekKey(date: Date = new Date()): string {
	const temp = new Date(date.getTime());
	temp.setHours(0, 0, 0, 0);
	temp.setDate(temp.getDate() + 3 - ((temp.getDay() + 6) % 7));
	const weekOne = new Date(temp.getFullYear(), 0, 4);
	const weekNumber =
		1 +
		Math.round(
			((temp.getTime() - weekOne.getTime()) / 86400000 -
				3 +
				((weekOne.getDay() + 6) % 7)) /
				7,
		);
	return `${temp.getFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function createDefaultUsageState() {
	return {
		dayKey: getLocalDayKey(),
		weekKey: getIsoWeekKey(),
		cloudChatDaily: 0,
		imagesDaily: 0,
		videosDaily: 0,
		audioWeekly: 0,
	};
}

function getUsageStorageKeyForUser(userId?: string | null): string {
	return `${USAGE_STORAGE_PREFIX}:${userId || "guest"}`;
}

function isKnownPlanKey(value: string): value is PlanKey {
	return (
		value === "free" ||
		value === "light" ||
		value === "core" ||
		value === "creator" ||
		value === "professional"
	);
}

function normalizePlanKey(planName: string): PlanKey {
	return normalizeUpgradePlanKey(planName) as PlanKey;
}

function applyTierConfig(tierConfig: AuthTierConfig | null | undefined): void {
	if (!tierConfig || !Array.isArray(tierConfig.plans)) return;
	currentTierConfig = tierConfig;
	const orderedKeys: PlanKey[] = [];
	tierConfig.plans
		.slice()
		.sort((a, b) => a.order - b.order)
		.forEach((plan) => {
			const key = (plan.key || "").toLowerCase();
			if (!isKnownPlanKey(key)) return;
			if (!orderedKeys.includes(key)) orderedKeys.push(key);
			if (typeof plan.name === "string" && plan.name.trim()) {
				PLAN_DISPLAY_NAMES[key] = plan.name.trim();
			}
			PLAN_LIMITS[key] = {
				cloudChatDaily:
					typeof plan.limits?.cloudChatDaily === "number"
						? plan.limits.cloudChatDaily
						: null,
				imagesDaily:
					typeof plan.limits?.imagesDaily === "number"
						? plan.limits.imagesDaily
						: null,
				videosDaily:
					typeof plan.limits?.videosDaily === "number"
						? plan.limits.videosDaily
						: null,
				audioWeekly:
					typeof plan.limits?.audioWeekly === "number"
						? plan.limits.audioWeekly
						: null,
			};
		});

	if (orderedKeys.length > 0) {
		const missing = (["free", "light", "core", "creator", "professional"] as PlanKey[]).filter(
			(key) => !orderedKeys.includes(key),
		);
		PLAN_ORDER.splice(0, PLAN_ORDER.length, ...orderedKeys, ...missing);
	}
}

function getPaidTiersFromConfig(
	tierConfig: AuthTierConfig | null | undefined,
): AuthSubscriptionTier[] {
	if (!tierConfig || !Array.isArray(tierConfig.plans)) return [];
	const defaultKey = normalizePlanKey(tierConfig.defaultPlanKey || "free");
	return tierConfig.plans
		.filter((plan) => normalizePlanKey(plan.key) !== defaultKey)
		.map((plan) => ({
			key: plan.key,
			name: plan.name,
			url: plan.url,
			price: plan.price,
			limits: plan.limits,
		}));
}

function getActivePlanLimits() {
	return PLAN_LIMITS[currentPlanKey];
}

function pruneUsageState() {
	if (usageSyncSource === "server") {
		return;
	}
	const dayKey = getLocalDayKey();
	const weekKey = getIsoWeekKey();
	if (usageState.dayKey !== dayKey) {
		usageState.dayKey = dayKey;
		usageState.cloudChatDaily = 0;
		usageState.imagesDaily = 0;
		usageState.videosDaily = 0;
	}
	if (usageState.weekKey !== weekKey) {
		usageState.weekKey = weekKey;
		usageState.audioWeekly = 0;
	}
}

function saveUsageState() {
	try {
		pruneUsageState();
		localStorage.setItem(usageStorageKey, JSON.stringify(usageState));
	} catch (e) {
		void 0;
	}
}

function loadUsageStateForUser(userId?: string | null) {
	usageStorageKey = getUsageStorageKeyForUser(userId);
	let nextState = createDefaultUsageState();

	try {
		const raw = localStorage.getItem(usageStorageKey);
		if (raw) {
			const parsed = JSON.parse(raw);
			nextState = {
				...nextState,
				...(parsed && typeof parsed === "object" ? parsed : {}),
			};
		}
	} catch (e) {
		void 0;
	}

	usageState = {
		dayKey:
			typeof nextState.dayKey === "string" && nextState.dayKey
				? nextState.dayKey
				: getLocalDayKey(),
		weekKey:
			typeof nextState.weekKey === "string" && nextState.weekKey
				? nextState.weekKey
				: getIsoWeekKey(),
		cloudChatDaily: Number.isFinite(Number(nextState.cloudChatDaily))
			? Math.max(0, Number(nextState.cloudChatDaily))
			: 0,
		imagesDaily: Number.isFinite(Number(nextState.imagesDaily))
			? Math.max(0, Number(nextState.imagesDaily))
			: 0,
		videosDaily: Number.isFinite(Number(nextState.videosDaily))
			? Math.max(0, Number(nextState.videosDaily))
			: 0,
		audioWeekly: Number.isFinite(Number(nextState.audioWeekly))
			? Math.max(0, Number(nextState.audioWeekly))
			: 0,
	};

	pruneUsageState();
	usageSyncSource = "local";
	usageSyncedAt = null;
	lastUsageLookupError = null;
	saveUsageState();
	renderUsagePanel();
}

function toFiniteRatio(used: number, limit: number): number {
	if (!Number.isFinite(limit) || limit <= 0) return 0;
	return Math.min(1, Math.max(0, used / limit));
}

function formatUsageMetric(
	kind: keyof typeof LIMIT_COPY,
	used: number,
	limit: number | null,
) {
	const copy = LIMIT_COPY[kind];
	if (limit == null) {
		return `${used} used ${copy.period} • Unlimited`;
	}
	return `${Math.min(used, limit)} / ${limit} ${copy.period}`;
}

function updateUsageRow(
	kind: keyof typeof LIMIT_COPY,
	used: number,
	limit: number | null,
) {
	const map = USAGE_UI_MAP[kind];
	const valueEl = document.getElementById(map.valueId);
	const fillEl = document.getElementById(map.fillId) as HTMLDivElement | null;
	if (valueEl) {
		valueEl.textContent = formatUsageMetric(kind, used, limit);
	}
	if (!fillEl) return;

	fillEl.classList.remove("is-warning", "is-danger", "is-unlimited");
	if (limit == null) {
		fillEl.classList.add("is-unlimited");
		fillEl.style.width = "100%";
		return;
	}

	const ratio = toFiniteRatio(used, limit);
	fillEl.style.width = `${Math.round(ratio * 100)}%`;
	if (ratio >= 1) {
		fillEl.classList.add("is-danger");
	} else if (ratio >= 0.75) {
		fillEl.classList.add("is-warning");
	}
}

function renderUsagePanel() {
	pruneUsageState();
	const limits = getActivePlanLimits();
	if (usagePlanNameEl) usagePlanNameEl.textContent = currentPlanName;
	if (usagePlanMetaEl) {
		const paidText = currentPlanPaid
			? "Paid subscription active."
			: "No paid subscription detected. Free plan limits apply.";
		const errorText = lastTierLookupError
			? ` ${lastTierLookupError}`
			: "";
		const usageErrorText = lastUsageLookupError
			? ` ${lastUsageLookupError}`
			: "";
		usagePlanMetaEl.textContent = `${paidText}${errorText}${usageErrorText}`;
	}
	if (usageResetNoteEl) {
		const syncTimeText = usageSyncedAt
			? new Date(usageSyncedAt).toLocaleTimeString()
			: "not synced yet";
		if (usageSyncSource === "server") {
			usageResetNoteEl.textContent =
				`Server usage windows: day ${usageState.dayKey || "unknown"}, week ${usageState.weekKey || "unknown"} (synced ${syncTimeText}).`;
		} else {
			usageResetNoteEl.textContent =
				`Local estimate windows: day ${usageState.dayKey}, week ${usageState.weekKey}.`;
		}
	}

	updateUsageRow(
		"cloudChatDaily",
		usageState.cloudChatDaily,
		limits.cloudChatDaily,
	);
	updateUsageRow("imagesDaily", usageState.imagesDaily, limits.imagesDaily);
	updateUsageRow("videosDaily", usageState.videosDaily, limits.videosDaily);
	updateUsageRow("audioWeekly", usageState.audioWeekly, limits.audioWeekly);
}

function canConsumeUsage(kind: keyof typeof LIMIT_COPY): boolean {
	pruneUsageState();
	const limit = getActivePlanLimits()[kind];
	if (limit == null) return true;
	return usageState[kind] < limit;
}

function bumpUsage(kind: keyof typeof LIMIT_COPY, amount = 1) {
	pruneUsageState();
	usageState[kind] += amount;
	usageSyncSource = "local";
	saveUsageState();
	renderUsagePanel();
	scheduleUsageSync();
}

function isCloudRequest(model: string, clientUrl?: string): boolean {
	return (
		lightningEnabled ||
		model === LIGHTNING_MODEL_VALUE ||
		clientUrl === LIGHTNING_CLIENT_URL
	);
}

function getTierPrice(name: string): string | null {
	const match = subscriptionTiers.find(
		(tier) => normalizePlanKey((tier.key as string) || tier.name) === normalizePlanKey(name),
	);
	if (!match?.price) return null;
	return `$${match.price}/mo`;
}

function getSortedTierCatalog(): AuthSubscriptionTier[] {
	if (!Array.isArray(subscriptionTiers)) return [];
	const weight = new Map(PLAN_ORDER.map((plan, index) => [plan, index]));
	return [...subscriptionTiers].sort((a, b) => {
		const aWeight =
			weight.get(normalizePlanKey((a.key as string) || a.name)) ?? 999;
		const bWeight =
			weight.get(normalizePlanKey((b.key as string) || b.name)) ?? 999;
		return aWeight - bWeight;
	});
}

function getRecommendedUpgradePlan(
	kind: keyof typeof LIMIT_COPY,
): PlanKey | null {
	const currentIndex = PLAN_ORDER.indexOf(currentPlanKey);
	for (let i = Math.max(currentIndex + 1, 0); i < PLAN_ORDER.length; i++) {
		const candidate = PLAN_ORDER[i];
		if (!candidate) continue;
		if (PLAN_LIMITS[candidate][kind] == null) return candidate;
		const currentLimit = PLAN_LIMITS[candidate][kind];
		if (typeof currentLimit === "number") return candidate;
	}
	return null;
}

function rememberUpgradeIntent(target: string = UPGRADE_SETTINGS_TARGET): void {
	try {
		localStorage.setItem(UPGRADE_INTENT_STORAGE_KEY, target);
	} catch (e) {
		void 0;
	}
}

function openBillingPortal(): void {
	void window.utils.web_open(BILLING_PORTAL_URL);
}

function openUpgradeRequiresAccountDialog(kind: keyof typeof LIMIT_COPY) {
	const copy = LIMIT_COPY[kind];
	upgradeModal.open({
		html: `
			<h3>${escapeHtml(copy.label)} upgrade requires an account</h3>
			<p style="opacity:.82;margin:8px 0 10px;">
				Sign in or create an account first, then choose a paid plan.
			</p>
		`,
		actions: [
			{
				id: "upgrade-account-signin",
				label: "Sign In",
				onClick: () => {
					upgradeModal.close();
					rememberUpgradeIntent(UPGRADE_SETTINGS_TARGET);
					const params = new URLSearchParams();
					params.set("upgrade", "1");
					params.set("mode", "signin");
					params.set("next", UPGRADE_SETTINGS_TARGET);
					window.location.href = `../auth.html?${params.toString()}`;
				},
			},
			{
				id: "upgrade-account-signup",
				label: "Create Account",
				onClick: () => {
					upgradeModal.close();
					rememberUpgradeIntent(UPGRADE_SETTINGS_TARGET);
					const params = new URLSearchParams();
					params.set("upgrade", "1");
					params.set("mode", "signup");
					params.set("next", UPGRADE_SETTINGS_TARGET);
					window.location.href = `../auth.html?${params.toString()}`;
				},
			},
			{
				id: "upgrade-account-close",
				label: "Close",
				onClick: () => upgradeModal.close(),
			},
		],
	});
}

async function openUpgradeDialog(kind: keyof typeof LIMIT_COPY) {
	await refreshSubscriptionData(true);
	if (!currentAuthSession?.isAuthenticated) {
		openUpgradeRequiresAccountDialog(kind);
		return;
	}
	const recommended = getRecommendedUpgradePlan(kind);
	const tiers = getSortedTierCatalog();
	const plansToShow =
		tiers.length > 0
			? tiers
			: PLAN_ORDER.filter((plan) => plan !== "free").map((plan) => ({
					key: plan,
					name: PLAN_DISPLAY_NAMES[plan],
					url: "",
					price: "",
				}));

	const planCards = buildUpgradePlanCards(plansToShow, {
		currentPlanKey,
		recommendedPlanKey: recommended,
		allowDirectCheckout: currentPlanKey === "free",
	});

	const copy = LIMIT_COPY[kind];
	upgradeModal.open({
		html: `
			<h3>${escapeHtml(copy.label)} limit reached</h3>
			<div class="subscription-upgrade-layout">
				<p class="subscription-current-plan">
					Current plan: <strong>${escapeHtml(currentPlanName)}</strong>${getTierPrice(currentPlanName) ? ` (${escapeHtml(getTierPrice(currentPlanName) || "")})` : ""}.
				</p>
				<p class="subscription-upgrade-copy">
					${currentPlanKey === "free"
						? `Upgrade to continue ${escapeHtml(copy.label.toLowerCase())} beyond your ${escapeHtml(copy.period)} quota.`
						: `Compare the available plan benefits below, then use the Billing Portal to change your subscription in Stripe and restore more ${escapeHtml(copy.label.toLowerCase())}.`}
				</p>
				<div class="subscription-plan-grid">
					${planCards}
				</div>
			</div>
		`,
		actions: [
			...(currentPlanKey === "free"
				? []
				: [
						{
							id: "open-upgrade-billing-portal",
							label: "Open Billing Portal",
							onClick: () => openBillingPortal(),
						},
					]),
			{
				id: "close-upgrade-dialog",
				label: "Close",
				onClick: () => upgradeModal.close(),
			},
		],
	});
}

function notifyLimitReached(kind: keyof typeof LIMIT_COPY) {
	const copy = LIMIT_COPY[kind];
	showNotification({
		message: `${copy.label} limit reached for ${currentPlanName}.`,
		type: "warning",
		actions: [
			{
				label: "Upgrade Plan",
				onClick: () => void openUpgradeDialog(kind),
			},
		],
	});
}

function enforceLimit(kind: keyof typeof LIMIT_COPY): boolean {
	if (canConsumeUsage(kind)) return true;
	notifyLimitReached(kind);
	renderUsagePanel();
	return false;
}

function getPlanNameFromSubscription(info: AuthSubscriptionInfo): string {
	applyTierConfig(info?.tierConfig);
	if (typeof info?.planKey === "string" && info.planKey.trim()) {
		const key = normalizePlanKey(info.planKey);
		return PLAN_DISPLAY_NAMES[key];
	}
	if (typeof info?.planName === "string" && info.planName.trim()) {
		const key = normalizePlanKey(info.planName);
		return PLAN_DISPLAY_NAMES[key];
	}
	return PLAN_DISPLAY_NAMES.free;
}

function applyUsageData(usage: AuthUsageInfo | null | undefined): boolean {
	if (!usage?.metrics) return false;
	if (typeof usage.planKey === "string" && usage.planKey.trim()) {
		currentPlanKey = normalizePlanKey(usage.planKey);
	}
	if (typeof usage.planName === "string" && usage.planName.trim()) {
		currentPlanName = usage.planName.trim();
	}
	const defaultPlanKey = normalizePlanKey(
		currentTierConfig?.defaultPlanKey || "free",
	);
	currentPlanPaid = currentPlanKey !== defaultPlanKey;

	const metrics = usage.metrics;
	const cloud = metrics.cloudChatDaily;
	const images = metrics.imagesDaily;
	const videos = metrics.videosDaily;
	const audio = metrics.audioWeekly;
	if (!cloud || !images || !videos || !audio) return false;

	usageState = {
		dayKey:
			typeof cloud.window === "string" && cloud.window.trim().length > 0
				? cloud.window.trim()
				: getLocalDayKey(),
		weekKey:
			typeof audio.window === "string" && audio.window.trim().length > 0
				? audio.window.trim()
				: getIsoWeekKey(),
		cloudChatDaily: Math.max(0, Number(cloud.used) || 0),
		imagesDaily: Math.max(0, Number(images.used) || 0),
		videosDaily: Math.max(0, Number(videos.used) || 0),
		audioWeekly: Math.max(0, Number(audio.used) || 0),
	};
	usageSyncSource = "server";
	usageSyncedAt =
		typeof usage.generatedAt === "string" && usage.generatedAt.trim()
			? usage.generatedAt
			: new Date().toISOString();
	lastUsageLookupError = usage.error ? `(${usage.error})` : null;
	saveUsageState();
	return true;
}

async function syncUsageFromServer(renderAfter = true): Promise<void> {
	try {
		const usage = await window.auth.getUsage();
		const applied = applyUsageData(usage);
		if (!applied) {
			usageSyncSource = "local";
			lastUsageLookupError = "(Usage sync unavailable)";
		}
	} catch (err) {
		usageSyncSource = "local";
		lastUsageLookupError = "(Usage sync unavailable)";
		console.warn("Usage fetch failed:", err);
	} finally {
		if (renderAfter) renderUsagePanel();
	}
}

function scheduleUsageSync(delayMs = 1500): void {
	if (usageSyncTimer) {
		clearTimeout(usageSyncTimer);
	}
	usageSyncTimer = setTimeout(() => {
		usageSyncTimer = null;
		void syncUsageFromServer();
	}, delayMs);
}

async function refreshSubscriptionData(force = false) {
	if (!force && !currentAuthSession?.isAuthenticated) {
		try {
			applyTierConfig(await window.auth.getTierConfig());
			subscriptionTiers = getPaidTiersFromConfig(currentTierConfig);
		} catch (_e) {
			void 0;
		}
		currentPlanKey = "free";
		currentPlanName = PLAN_DISPLAY_NAMES.free;
		currentPlanPaid = false;
		lastTierLookupError = null;
		await syncUsageFromServer(false);
		renderUsagePanel();
		return;
	}

	try {
		const info = await window.auth.getSubscriptionInfo();
		applyTierConfig(info?.tierConfig);
		const planName = getPlanNameFromSubscription(info);
		currentPlanKey =
			typeof info?.planKey === "string" && info.planKey.trim()
				? normalizePlanKey(info.planKey)
				: normalizePlanKey(planName);
		currentPlanName = planName;
		const defaultPlanKey = normalizePlanKey(
			info?.tierConfig?.defaultPlanKey || "free",
		);
		currentPlanPaid = currentPlanKey !== defaultPlanKey;
		if (typeof info?.isPaid === "boolean") {
			currentPlanPaid = Boolean(
				info.isPaid && currentPlanKey !== defaultPlanKey,
			);
		}
		subscriptionTiers = Array.isArray(info?.tiers)
			? info.tiers
			: getPaidTiersFromConfig(info?.tierConfig);
		lastTierLookupError = info?.error ? `(${info.error})` : null;
	} catch (err: any) {
		currentPlanKey = "free";
		currentPlanName = PLAN_DISPLAY_NAMES.free;
		currentPlanPaid = false;
		lastTierLookupError = "(Subscription lookup unavailable)";
		console.warn("Subscription fetch failed:", err);
	} finally {
		previewTier.textContent = currentPlanName;
	}

	await syncUsageFromServer(false);
	renderUsagePanel();
}

function collectUsedAssetIds(sessions: any): Set<string> {
	const used = new Set<string>();
	const isAssetId = (value: string): boolean => {
		const v = value.trim();
		return (
			v.length > 0 &&
			!v.startsWith("data:") &&
			!v.startsWith("blob:") &&
			!v.startsWith("http://") &&
			!v.startsWith("https://")
		);
	};

	for (const session of Object.values(sessions)) {
		const flatHistory = getSessionFlatHistory(session);
		for (const msg of flatHistory) {
			if (!msg?.content) continue;

			if (msg.role === "image" || msg.role === "video" || msg.role === "audio") {
				if (typeof msg.content === "string" && isAssetId(msg.content)) {
					used.add(msg.content);
					continue;
				}
				if (msg.content && typeof msg.content === "object") {
					const assetId =
						typeof msg.content.assetId === "string"
							? msg.content.assetId.trim()
							: typeof msg.content.id === "string"
								? msg.content.id.trim()
								: "";
					if (assetId && isAssetId(assetId)) used.add(assetId);
				}
			}
		}
	}

	return used;
}

function syncLightningToggles(enabled: boolean): void {
	if (lightningToggleTop && lightningToggleTop.checked !== enabled) {
		lightningToggleTop.checked = enabled;
	}
	if (lightningToggleSidebar && lightningToggleSidebar.checked !== enabled) {
		lightningToggleSidebar.checked = enabled;
	}
	if (lightningToggleStatus && lightningToggleStatus.checked !== enabled) {
		lightningToggleStatus.checked = enabled;
	}
}

function applyLightningState(): void {
	syncLightningToggles(lightningEnabled);
	sidebarControls?.classList.toggle("lightning-enabled", lightningEnabled);
	lightningStatus?.setAttribute("aria-hidden", String(!lightningEnabled));
	if (hostSelect) hostSelect.disabled = lightningEnabled;
	modelSelect.disabled = lightningEnabled;
	void setTitle();
}

function setLightningEnabled(enabled: boolean): void {
	if (forceLightning) {
		lightningEnabled = true;
		applyLightningState();
		return;
	}
	lightningEnabled = enabled;
	try {
		localStorage.setItem(LIGHTNING_ENABLED_KEY, String(enabled));
	} catch (e) {
		void 0;
	}
	applyLightningState();
	void setToolSupport();
	setVisionSupport();
}

function initLightningToggleEvents(): void {
	if (forceLightning) {
		syncLightningToggles(true);
		[lightningToggleTop, lightningToggleSidebar, lightningToggleStatus].forEach(
			(toggle) => {
				if (!toggle) return;
				toggle.checked = true;
				toggle.setAttribute("aria-disabled", "true");
				toggle.setAttribute("tabindex", "-1");
			},
		);
		applyLightningState();
		return;
	}
	[lightningToggleTop, lightningToggleSidebar, lightningToggleStatus].forEach(
		(toggle) => {
			toggle?.addEventListener("change", () => {
				setLightningEnabled(Boolean(toggle.checked));
			});
		},
	);
	applyLightningState();
}

function setWelcomeMode(enabled: boolean): void {
	if (!chatPanel) return;
	chatPanel.classList.toggle("welcome-mode", enabled);
	if (welcomeHero) {
		welcomeHero.setAttribute("aria-hidden", String(!enabled));
	}
	if (welcomeCards) {
		welcomeCards.setAttribute("aria-hidden", String(!enabled));
	}
}

function initWelcomeCards(): void {
	if (!welcomeCards) return;

	welcomeCards
		.querySelectorAll<HTMLButtonElement>(".welcome-card")
		.forEach((card) => {
			card.addEventListener("click", () => {
				const prompt =
					card.dataset.prompt || card.textContent?.trim() || "";

				textarea.value = prompt;
				typingBar.classList.remove("empty");
				updateTextareaState();
				textarea.focus();
			});
		});
}

document.addEventListener("DOMContentLoaded", () => {
	installExternalUrlHandler();
	modal = new window.ic.iModal(
		"global-modal",
		undefined,
		undefined,
		false,
		false,
	);
	editModal = new window.ic.iModal(
		"edit-modal",
		undefined,
		undefined,
		false,
		false,
	);
	upgradeModal = new window.ic.iModal(
		"upgrade-modal",
		700,
		undefined,
		false,
		false,
	);
	initWelcomeCards();
	initLightningToggleEvents();
	loadUsageStateForUser(null);
	renderUsagePanel();
	usageUpgradeBtn?.addEventListener("click", () => {
		void openUpgradeDialog("cloudChatDaily");
	});
	usageRefreshBtn?.addEventListener("click", () => {
		void refreshSubscriptionData(true);
	});
	// Create SVG side panel
	const svgSidePanel = document.createElement("div");
	svgSidePanel.id = "svg-side-panel";
	svgSidePanel.style.position = "fixed";
	svgSidePanel.style.right = "0";
	svgSidePanel.style.top = "0";
	svgSidePanel.style.width = "300px";
	svgSidePanel.style.height = "100%";
	svgSidePanel.style.background = "var(--bg-light)";
	svgSidePanel.style.borderLeft = "1px solid var(--light-blue)";
	svgSidePanel.style.display = "none";
	svgSidePanel.style.zIndex = "1000";
	svgSidePanel.style.padding = "10px";
	svgSidePanel.style.overflow = "auto";
	svgSidePanel.style.resize = "horizontal";
	document.body.appendChild(svgSidePanel);
});
modelSelect?.addEventListener("change", () => {
	void setTitle();
	void setToolSupport();
	setVisionSupport();
});
interface RemoteHost {
	url: string;
	alias: string;
}

function stripAnsi(str: string): string {
	return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function normalizeModelIdForCapabilities(modelValue: string): string {
	return modelValue
		.replace(/^(?:hf\.co|huggingface\.co)\/[^/]+\//, "")
		.split(":")[0]
		.replace(/-gguf72$/i, "")
		.toLowerCase();
}

function isSyncEnabled() {
	try {
		return localStorage.getItem("sync_enabled") === "true";
	} catch (e) {
		return false;
	}
}

let modelsSupportsTools: string[] = [];
let toolNotice: string | null = null;
let modelsSupportsVision: string[] = [];
let visionNotice: string | null = null;
let toolsSupportedInUi = true;

function showToolsUnsupportedModal(): void {
	modal.open({
		html: `
			<h3>Tools Not Supported</h3>
			<p style="margin-top:10px; line-height:1.5;">${TOOLS_UNSUPPORTED_HTML}</p>
			<div style="margin-top:16px; display:flex; justify-content:flex-end; gap:8px;">
				<button id="tools-unsupported-close">Close</button>
			</div>
		`,
	});

	document.getElementById("tools-unsupported-close")?.addEventListener("click", () => {
		modal.close();
	});
}

async function setToolSupport() {
	if (lightningEnabled) {
		toolsSupportedInUi = true;
		searchEnabled = currentToolSettings.webSearch;
		imgEnabled = currentToolSettings.imageGen;
		videoEnabled = currentToolSettings.videoGen;
		audioEnabled = currentToolSettings.audioGen;
		updateToolButtonActiveState();
		return;
	}

	if (
		modelsSupportsTools.includes(normalizeModelIdForCapabilities(modelSelect.value)) ||
		toolNotice
	) {
		toolsSupportedInUi = true;
		searchEnabled = currentToolSettings.webSearch;
		imgEnabled = currentToolSettings.imageGen;
		videoEnabled = currentToolSettings.videoGen;
		audioEnabled = currentToolSettings.audioGen;
		updateToolButtonActiveState();
	} else {
		toolsSupportedInUi = false;
		searchEnabled = false;
		imgEnabled = false;
		videoEnabled = false;
		audioEnabled = false;
		updateToolButtonActiveState();
	}
}

function modelSupportsToolsForRequest(modelName: string): boolean {
	if (modelName === LIGHTNING_MODEL_VALUE || lightningEnabled) return true;
	if (toolNotice) return true;
	return modelsSupportsTools.includes(normalizeModelIdForCapabilities(modelName));
}

function modelSupportsVisionForRequest(modelName: string): boolean {
	if (modelName === LIGHTNING_MODEL_VALUE || lightningEnabled) return true;
	return modelsSupportsVision.includes(normalizeModelIdForCapabilities(modelName));
}

function setVisionSupport(): void {
	enforceVisionAttachmentPolicy();
}

function enforceVisionAttachmentPolicy(): void {
	const modelValue = lightningEnabled ? LIGHTNING_MODEL_VALUE : modelSelect.value;
	const supportsVision = modelSupportsVisionForRequest(modelValue);
	if (supportsVision) return;

	const removedCount = attachedFiles.filter((f) => f.type === "image").length;
	if (!removedCount) return;

	attachedFiles = attachedFiles.filter((f) => f.type !== "image");
	renderFileIndicator();

	showNotification({
		message:
			`Removed ${removedCount} image attachment${removedCount === 1 ? "" : "s"} — the selected model does not support vision.`,
		type: "warning",
	});
}

let sessionProgress = 0;
let loaderVisible = false;

function showSessionProgress(): void {
	const loader = document.getElementById("session-loader") as HTMLDivElement;
	if (!loader) return;

	loader.classList.remove("hidden", "fading");
	loaderVisible = true;
}

function setSessionProgress(value: number): void {
	const bar = document.getElementById(
		"session-progress-bar",
	) as HTMLDivElement;
	if (!bar) return;

	const clamped = Math.min(100, Math.max(0, value));
	bar.style.width = `${clamped}%`;
}

async function hideSessionProgress(): void {
	if (!loaderVisible) return;

	const bar = document.getElementById(
		"session-progress-bar",
	) as HTMLDivElement;
	const loader = document.getElementById("session-loader") as HTMLDivElement;

	if (!loader) return;
	if (bar) bar.style.width = "100%";

	await new Promise((r) => setTimeout(r, 450));

	loader.classList.add("fading");

	setTimeout(() => {
		document.getElementById("app-root")?.classList.remove("hidden");
	}, 120);

	setTimeout(() => {
		loader.classList.add("hidden");
		loader.classList.remove("fading");
		loaderVisible = false;
	}, 300);
}

function openManageHostsDialog() {
	const remotes: RemoteHost[] = JSON.parse(
		localStorage.getItem("remote_hosts") || "[]",
	);

	let listHtml = "";

	if (remotes.length === 0) {
		listHtml = `<p style="opacity:.7">No remote hosts added.</p>`;
	} else {
		listHtml = remotes
			.map(
				(host, index) => `
            <div style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                gap:10px;
                margin-bottom:8px;
                padding:8px;
                border-radius:6px;
                background:rgba(255,255,255,0.04);
            ">
                <span style="font-weight:600" title="${host.url}">
                    ${host.alias || host.url}
                </span>
                <button data-remove="${index}" style="max-width:100px">
                    Remove
                </button>
            </div>
        `,
			)
			.join("");
	}

	modal.open({
		html: `
            <h3>Manage Remote Hosts</h3>
            <div style="margin-top:12px">${listHtml}</div>
            <div style="margin-top:16px; display:flex; gap:8px;">
                <button id="add-host-btn">Add Host</button>
                <button id="close-hosts-btn">Close</button>
            </div>
        `,
	});

	document.querySelectorAll("[data-remove]").forEach((btn) => {
		btn.addEventListener("click", (e) => {
			const index = Number((e.target as HTMLElement).dataset.remove);
			remotes.splice(index, 1);
			localStorage.setItem("remote_hosts", JSON.stringify(remotes));
			updateHostSelectOptions();
			openManageHostsDialog();
		});
	});

	document.getElementById("add-host-btn")?.addEventListener("click", () => {
		modal.close();
		openAddHostDialog();
	});

	document
		.getElementById("close-hosts-btn")
		?.addEventListener("click", () => {
			modal.close();
			hostSelect.value = "local";
			localStorage.setItem("host_select", "local");
		});
}

function updateHostSelectOptions() {
	if (!hostSelect) return;

	Array.from(hostSelect.options).forEach((opt) => {
		if (opt.value.startsWith("remote:")) opt.remove();
	});

	if (![...hostSelect.options].some((o) => o.value === "local")) {
		const localOpt = document.createElement("option");
		localOpt.value = "local";
		localOpt.textContent = "Local";
		hostSelect.appendChild(localOpt);
	}

	if (![...hostSelect.options].some((o) => o.value === "add_remote")) {
		const addOpt = document.createElement("option");
		addOpt.value = "add_remote";
		addOpt.textContent = "Add Remote Host";
		hostSelect.appendChild(addOpt);
	}

	if (![...hostSelect.options].some((o) => o.value === "manage_hosts")) {
		const manageOpt = document.createElement("option");
		manageOpt.value = "manage_hosts";
		manageOpt.textContent = "Manage Remote Hosts";
		hostSelect.appendChild(manageOpt);
	}

	const remotes: RemoteHost[] = JSON.parse(
		localStorage.getItem("remote_hosts") || "[]",
	);

	const addRemoteOpt = hostSelect.querySelector('option[value="add_remote"]');

	remotes.forEach((host) => {
		const opt = document.createElement("option");
		opt.value = `remote:${host.url}`;
		opt.textContent = host.alias || `Remote: ${host.url}`;

		if (addRemoteOpt) {
			hostSelect.insertBefore(opt, addRemoteOpt);
		} else {
			hostSelect.appendChild(opt);
		}
	});
}

function updateHostSelectState() {
	const v = hostSelect.value;

	if (v === "add_remote") {
		openAddHostDialog();
		return;
	}

	if (v === "manage_hosts") {
		openManageHostsDialog();
		return;
	}

	localStorage.setItem("host_select", v);
	reloadModelsForHost(v);
}

document.addEventListener("DOMContentLoaded", loadOptions);
document.addEventListener("DOMContentLoaded", updateTextareaState);
document.addEventListener("DOMContentLoaded", () => {
	setupSidebarModeTabs();
	const remotes: { url: string; alias?: string }[] = JSON.parse(
		localStorage.getItem("remote_hosts") || "[]",
	);

	if (hostSelect) {
		updateHostSelectOptions();

		hostSelect.addEventListener("change", updateHostSelectState);
	}

	window.auth.onAuthStateChange((session) => {
		currentAuthSession = session;
		updateMediaLibraryVisibility();
		loadUsageStateForUser(session?.user?.id);
		void refreshSubscriptionData(true);
	});

	remoteHostCancel?.addEventListener("click", () => {
		remoteHostDialog?.classList.add("hidden");
		if (hostSelect)
			hostSelect.value = localStorage.getItem("host_select") || "local";
	});

	remoteHostConfirm?.addEventListener("click", () => {
		let url = (remoteHostInput?.value || "").trim();
		const alias = (remoteHostAlias?.value || "").trim().substring(0, 20);

		if (!url) return;

		if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
		if (!/:\d+\/?$/.test(url) && !/:\d+\//.test(url)) {
			url = url.replace(/\/+$/, "") + ":52458";
		}
		url = url.replace(/\/+$/, "");

		const remotesStored: { url: string; alias?: string }[] = JSON.parse(
			localStorage.getItem("remote_hosts") || "[]",
		);
		if (!remotesStored.some((r) => r.url === url)) {
			remotesStored.push({ url, alias });
			localStorage.setItem("remote_hosts", JSON.stringify(remotesStored));

			const opt = document.createElement("option");
			opt.value = `remote:${url}`;
			opt.textContent = alias ? alias : `Remote: ${url}`;
			const addRemoteOpt = hostSelect?.querySelector(
				'option[value="add_remote"]',
			);
			if (addRemoteOpt && hostSelect)
				hostSelect.insertBefore(opt, addRemoteOpt);
		}

		const sel = `remote:${url}`;
		if (hostSelect) hostSelect.value = sel;
		localStorage.setItem("host_select", sel);
		remoteHostDialog?.classList.add("hidden");
		reloadModelsForHost(sel);
	});
});

async function loadOptions() {
	showSessionProgress();

	try {
		setSessionProgress(5);

		try {
			const local = await window.ollama.load();
			sessions = local && typeof local === "object" ? local : {};
			normalizeAllSessionHistories(sessions);
		} catch (e) {
			console.warn(
				"Failed to load local sessions, starting with empty:",
				e,
			);
			sessions = {};
		}
		setSessionProgress(20);

		try {
			const { supportsTools } =
				await window.ollama.getToolSupportingModels();
			modelsSupportsTools = (supportsTools || []).map((m) =>
				String(m).toLowerCase(),
			);
		} catch (e) {
			modelsSupportsTools = [];
			toolNotice =
				"Could not fetch model capabilities. Tool features may not work as expected.";
			showNotification({
				message: toolNotice,
				type: "warning",
				actions: [{ label: "Dismiss", onClick: () => void 0 }],
			});
		}

		try {
			const { supportsVision } =
				await window.ollama.getVisionSupportingModels();
			modelsSupportsVision = (supportsVision || []).map((m) =>
				String(m).toLowerCase(),
			);
		} catch (e) {
			modelsSupportsVision = [];
			visionNotice =
				"Could not fetch vision model capabilities. Image uploads are disabled.";
			showNotification({
				message: visionNotice,
				type: "warning",
				actions: [{ label: "Dismiss", onClick: () => void 0 }],
			});
		}

		try {
			const models = await window.ollama.listModels();
			const total = Math.max(models.length, 1);

			models.forEach((model, i) => {
				const option = document.createElement("option");
				option.value = model.name;
				option.textContent = model.name
					.replace(/^(?:hf\.co|huggingface\.co)\/[^/]+\//, "")
					.replace(/-gguf72/, "");
				modelSelect.appendChild(option);

				setSessionProgress(20 + (25 * (i + 1)) / total);
			});

			modelSelect.insertAdjacentHTML(
				"beforeend",
				`<option value="add-more-models">➕ Add more models...</option>
				 <option value="manage-models">✏️ Manage models...</option>`,
			);

			modelSelect.addEventListener("change", () => {
				if (modelSelect.value === "add-more-models")
					window.location.href = "../marketplace.html";
				else if (modelSelect.value === "manage-models")
					window.location.href = "../installed.html";
			});
		} catch (err) {
			console.warn("Could not list models:", err);
			modelSelect.innerHTML = `<option>error loading models</option>`;
		}
		setSessionProgress(45);

		const auth = await window.auth.getSession();
		currentAuthSession = auth?.session ?? null;
		updateMediaLibraryVisibility();
		loadUsageStateForUser(currentAuthSession?.user?.id);
		await refreshSubscriptionData();
		setSessionProgress(55);

		if (isSyncEnabled() && auth?.session?.isAuthenticated) {
			const remoteResponse = await safeCallRemote(
				() => window.sync.getRemoteSessions(),
				{ sessions: null },
			);
			setSessionProgress(65);

			if (!remoteResponse?.error && remoteResponse?.sessions) {
				const userId = auth.session.user?.id;
				const ids = Object.keys(sessions);
				const total = Math.max(ids.length, 1);

				ids.forEach((id, i) => {
					if (sessions[id].userId && sessions[id].userId !== userId) {
						delete sessions[id];
					}
					setSessionProgress(65 + (10 * (i + 1)) / total);
				});

				await window.ollama.save(sessions);
				setSessionProgress(80);

				sessions = mergeLocalAndRemoteSessions(
					sessions as SessionMap,
					remoteResponse.sessions,
				);
				normalizeAllSessionHistories(sessions);

				await window.ollama.save(sessions);
				setSessionProgress(90);

				const freshAuth = await window.auth.getSession();
				if (freshAuth?.session?.isAuthenticated) {
					await safeCallRemote(() =>
						window.sync.saveAllSessions(sessions),
					);
				}
			}
		}

		const assetsOnDisk = await window.utils.listAssets();
		const usedAssets = collectUsedAssetIds(sessions);

		for (const assetId of assetsOnDisk) {
			if (!usedAssets.has(assetId)) {
				await window.utils.rmAsset(assetId);
			}
		}

		currentSessionId = Object.keys(sessions)[0] || createNewSession();
		renderSessionList();
		await renderChat();
		initMediaLibrary();
		setSessionProgress(95);

		try {
			if (!lightningEnabled) {
				if (urlParams.model != null) {
					modelSelect.value = urlParams.model;
				} else {
					const savedModel = sessions[currentSessionId]?.model;
					if (savedModel && savedModel !== LIGHTNING_MODEL_VALUE) {
						modelSelect.value = savedModel;
					}
				}
			}
		} catch (e) {
			console.warn(e);
			void 0;
		}
		void setToolSupport();
		setVisionSupport();
	} catch (err) {
		console.error(err);
		modelSelect.innerHTML = `<option>Error loading models</option>`;
	} finally {
		hideSessionProgress();

		if (await isOffline()) {
			showNotification({
				message:
					"⚠️ No internet connection — Using offline sessions only. Tool requests will fail",
				type: "warning",
			});
		} else {
			try {
				const res = await fetch(
					"https://sharktide-lightning.hf.space/status/",
				);

				if (!res.ok) {
					showNotification({
						message: `⚠️ Lightning service unreachable (HTTP ${res.status})`,
						type: "error",
					});
					return;
				}

				const data = await res.json();

				Object.entries(data.services).forEach(([name, svc]) => {
					if (svc.state == "ok") {
						void 0;
					} else if (svc.state == "degraded") {
						showNotification({
							message: svc.message,
							type: "warning",
						});
					} else if (svc.state == "offline") {
						showNotification({
							message: svc.message,
							type: "error",
						});
					}
				});
			} catch (err) {
				showNotification({
					message: "⚠️ Could not reach Lightning status endpoint.",
					type: "error",
				});
			}
		}
	}
}

function generateSessionId() {
	return crypto.randomUUID();
}

async function reloadModelsForHost(hostValue: string) {
	modelSelect.innerHTML = `<option disabled>Loading models…</option>`;

	const clientUrl = hostValue.startsWith("remote:")
		? hostValue.replace("remote:", "")
		: undefined;

	try {
		const models = await window.ollama.listModels(clientUrl);

		modelSelect.innerHTML = "";

		for (const model of models) {
			const opt = document.createElement("option");
			opt.value = model.name;
			opt.textContent = model.name
				.replace(/^(?:hf\.co|huggingface\.co)\/[^/]+\//, "")
				.replace(/-gguf72/, "");
			modelSelect.appendChild(opt);
		}

		modelSelect.insertAdjacentHTML(
			"beforeend",
			`<option value="add-more-models">➕ Add more models...</option>
			 <option value="manage-models">✏️ Manage models...</option>`,
		);

		if (
			![...modelSelect.options].some((o) => o.value === modelSelect.value)
		) {
			modelSelect.selectedIndex = 0;
		}

		void setToolSupport();
		setVisionSupport();
	} catch (err: any) {
		console.error("Model reload failed:", err);

		modelSelect.innerHTML = "";

		if (err?.code === "UNAUTHORIZED") {
			modelSelect.innerHTML = `<option disabled>🔒 Unauthorized</option>`;

			showNotification({
				message:
					"You are not authorized to list models on this remote host.",
				type: "error",
				actions: [
					{
						label: "Manage Hosts",
						onClick: () => openManageHostsDialog(),
					},
				],
			});
		} else {
			modelSelect.innerHTML = `<option disabled>Error loading models</option>`;

			showNotification({
				message: "Failed to fetch models from the selected host.",
				type: "error",
			});
		}
	}
}

function showContextMenu(x, y, sessionId, sessionName) {
	const menu = document.getElementById("session-context-menu");
	menu.style.left = `${x}px`;
	menu.style.top = `${y}px`;
	menu.classList.remove("hidden");

	const handleClick = (e) => {
		const action = e.target.dataset.action;
		switch (action) {
			case "delete":
				deleteSession(sessionId);
				break;
			case "delete_all":
				modal.open({
					title: "Delete All Sessions",
					html: `<p><strong>This cannot be undone.</strong></p>`,
					actions: [
						{
							id: "cancel-delete-all",
							label: "Cancel",
							onClick: () => modal.close(),
						},
						{
							id: "confirm-delete-all",
							label: "Delete All",
							onClick: async () => {
								sessions = {};
								currentSessionId = null;
								modal.close();

								await window.ollama.save(sessions);

								const auth = await window.auth.getSession();
								if (isSyncEnabled() && auth?.session?.isAuthenticated) {
									await safeCallRemote(() =>
										window.sync.saveAllSessions(sessions),
									);
								}

								location.reload();
							},
						},
					],
				});

				break;
			case "rename":
				openRenameDialog(sessionId, sessionName);
				break;
			case "report":
				openReportDialog();
				break;
		}
		closeContextMenu();
	};

	menu.querySelectorAll(".context-item").forEach((item) => {
		item.onclick = handleClick;
	});

	document.addEventListener("click", closeContextMenu, { once: true });
}

function closeContextMenu() {
	const menu = document.getElementById("session-context-menu");
	menu.classList.add("hidden");
}

function deleteSession(sessionId) {
	modal.open({
		title: "Delete Session",
		html: `<p>This session will be permanently deleted.</p>`,
		actions: [
			{
				id: "cancel-delete-session",
				label: "Cancel",
				onClick: () => modal.close(),
			},
			{
				id: "confirm-delete-session",
				label: "Delete",
				onClick: async () => {
					delete sessions[sessionId];

					if (currentSessionId === sessionId) {
						currentSessionId = Object.keys(sessions)[0] || null;
					}

					await window.ollama.save(sessions);

					const auth = await window.auth.getSession();
					if (isSyncEnabled() && auth?.session?.isAuthenticated) {
						await safeCallRemote(() =>
							window.sync.saveAllSessions(sessions),
						);
					}

					renderSessionList();
					modal.close();
					location.reload();
				},
			},
		],
	});
}

function openRenameDialog(sessionId, currentName) {
	modal.open({
		title: "Rename Session",
		html: `
			<input id="rename-input"
				class="modal-input"
				value="${currentName}"
				placeholder="Session name" />
		`,
		actions: [
			{
				id: "cancel-rename-session",
				label: "Cancel",
				onClick: () => modal.close(),
			},
			{
				id: "save-rename-session",
				label: "Save",
				onClick: async () => {
					const input = document.getElementById(
						"rename-input",
					) as HTMLInputElement;

					const name = input.value.trim();
					if (!name) {
						return;
					}

					sessions[sessionId].name = name;
					await window.ollama.save(sessions);

					const auth = await window.auth.getSession();
					if (isSyncEnabled() && auth?.session?.isAuthenticated) {
						await safeCallRemote(() =>
							window.sync.saveAllSessions(sessions),
						);
					}

					renderSessionList();
					modal.close();
				},
			},
		],
	});
}

function openReportDialog(): void {
	modal.open({
		title: "Report Issue",
		html: `
			<p>If you encountered a problem, please report it.</p>
			<a href="https://github.com/sharktide/inferenceport/issues"
			   target="_blank">Open GitHub Issues</a>
		`,
		actions: [
			{
				id: "close-report-dialog",
				label: "Close",
				onClick: () => modal.close(),
			},
		],
	});
}

function createNewSession(): string {
	const id = generateSessionId();
	const name = new Date().toLocaleString();
	lastAccessMap[id] = Date.now();
	saveLastAccessMap();
	sessions[id] = {
		model: lightningEnabled ? LIGHTNING_MODEL_VALUE : modelSelect.value,
		name,
		history: [],
		favorite: false,
	};
	currentSessionId = id;
	window.ollama.save(sessions);

	window.auth.getSession().then(async (auth) => {
		if (isSyncEnabled() && auth?.session?.isAuthenticated) {
			await safeCallRemote(() => window.sync.saveAllSessions(sessions));
		}
		renderSessionList();
	});
	renderSessionList();
	renderChat();
	return id;
}

function handleSessionClick(sessionId): void {
	currentSessionId = sessionId;
	lastAccessMap[sessionId] = Date.now();
	saveLastAccessMap();
	renderSessionList();
	renderChat();
	return void 0;
}

function computeSessionSortOrder(): string[] {
	return Object.entries(sessions)
		.sort(([idA, a], [idB, b]) => {
			if (a.favorite !== b.favorite) return b.favorite - a.favorite;

			const at = lastAccessMap[idA] || 0;
			const bt = lastAccessMap[idB] || 0;
			if (at !== bt) return bt - at;

			return (a.name || "").localeCompare(b.name || "");
		})
		.map(([id]) => id);
}

function getSessionSortOrder(): string[] {
	if (!sessionSortOrder) {
		sessionSortOrder = computeSessionSortOrder();
		return sessionSortOrder;
	}

	const known = new Set(sessionSortOrder);
	Object.keys(sessions).forEach((id) => {
		if (!known.has(id)) sessionSortOrder.push(id);
	});

	sessionSortOrder = sessionSortOrder.filter((id) =>
		Object.prototype.hasOwnProperty.call(sessions, id),
	);

	return sessionSortOrder;
}

function renderSessionList(): void {
	sessionList.innerHTML = "";

	const searchTerm =
		document.getElementById("session-search")?.value?.toLowerCase() || "";

	const sortedSessions = getSessionSortOrder()
		.map((id) => [id, sessions[id]] as const)
		.filter(([, session]) =>
			session?.name?.toLowerCase().includes(searchTerm),
		);

	sortedSessions.forEach(([id, session]) => {
		const li = document.createElement("li");
		li.className = id === currentSessionId ? "active-session" : "";

		const name = session.name || `${new Date(+id).toLocaleTimeString()}`;

		const nameSpan = document.createElement("span");
		nameSpan.className = "session-name";
		nameSpan.textContent = name;

		nameSpan.onclick = () => handleSessionClick(id);

		nameSpan.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			showContextMenu(e.pageX, e.pageY, id, name);
		});

		const star = document.createElement("span");
		star.className = "favorite-icon";
		star.textContent = session.favorite ? "★" : "☆";

		star.onclick = (e) => {
			e.stopPropagation();
			session.favorite = !session.favorite;
			window.ollama.save(sessions);

			window.auth.getSession().then(async (auth) => {
				if (isSyncEnabled() && auth?.session?.isAuthenticated) {
					await safeCallRemote(() =>
						window.sync.saveAllSessions(sessions),
					);
				}
				renderSessionList();
			});
			renderSessionList();
		};

		const menuBtn = document.createElement("button");
		menuBtn.className = "menu-btn";
		menuBtn.setAttribute("aria-label", "Open session menu");
		menuBtn.title = "Open session menu";
		menuBtn.innerText = "⋯";
		menuBtn.onclick = (e) => {
			e.stopPropagation();
			const rect = menuBtn.getBoundingClientRect();
			const x = rect.right + window.scrollX - 8;
			const y = rect.bottom + window.scrollY + 4;
			showContextMenu(x, y, id, name);
		};
		menuBtn.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				e.stopPropagation();
				const rect = menuBtn.getBoundingClientRect();
				const x = rect.right + window.scrollX - 8;
				const y = rect.bottom + window.scrollY + 4;
				showContextMenu(x, y, id, name);
			}
		});

		const nameWrapper = document.createElement("div");
		nameWrapper.className = "session-name-wrapper";
		nameWrapper.appendChild(nameSpan);
		nameWrapper.appendChild(star);
		nameWrapper.appendChild(menuBtn);
		li.appendChild(nameWrapper);

		sessionList.appendChild(li);
		if (session.__merged) {
			li.classList.add("merged-session");
		}
	});
	return void 0;
}

function updateToolButtonVisibility(): void {
	const setVisible = (el: HTMLElement | null, visible: boolean) => {
		if (!el) return;
		el.style.display = visible ? "" : "none";
	};

	const searchContainer = (searchBtn?.closest(".tool-btn-wrap") ??
		searchBtn) as HTMLElement | null;
	const imgContainer = (imgBtn?.closest(".tool-btn-wrap") ??
		imgBtn) as HTMLElement | null;
	const videoContainer = (videoBtn?.closest(".tool-btn-wrap") ??
		videoBtn) as HTMLElement | null;
	const audioContainer = (audioBtn?.closest(".tool-btn-wrap") ??
		audioBtn) as HTMLElement | null;

	setVisible(searchContainer, currentToolSettings.webSearch);
	setVisible(imgContainer, currentToolSettings.imageGen);
	setVisible(videoContainer, currentToolSettings.videoGen);
	setVisible(audioContainer, currentToolSettings.audioGen);

	setVisible(searchBtnMini, currentToolSettings.webSearch);
	setVisible(imgBtnMini, currentToolSettings.imageGen);
	setVisible(videoBtnMini, currentToolSettings.videoGen);
	setVisible(audioBtnMini, currentToolSettings.audioGen);
}

function updateToolButtonActiveState(): void {
	const syncActive = (
		btn: HTMLButtonElement | null,
		enabled: boolean,
	) => {
		if (!btn) return;
		btn.classList.toggle("active", enabled);
		btn.setAttribute("aria-pressed", String(enabled));
	};

	if (searchLabel) searchLabel.style.color = searchEnabled ? "#4fc3f7" : "";
	syncActive(searchBtn, searchEnabled);
	syncActive(searchBtnMini, searchEnabled);

	if (imageLabel) imageLabel.style.color = imgEnabled ? "#4fc3f7" : "";
	syncActive(imgBtn, imgEnabled);
	syncActive(imgBtnMini, imgEnabled);

	if (videoLabel) videoLabel.style.color = videoEnabled ? "#4fc3f7" : "";
	syncActive(videoBtn, videoEnabled);
	syncActive(videoBtnMini, videoEnabled);

	if (audioLabel) audioLabel.style.color = audioEnabled ? "#4fc3f7" : "";
	syncActive(audioBtn, audioEnabled);
	syncActive(audioBtnMini, audioEnabled);
}

const unsubscribeToolSettings = toolSettings.onSettingsChange((settings) => {
    searchEnabled = settings.webSearch;
    imgEnabled = settings.imageGen;
    videoEnabled = settings.videoGen;
    audioEnabled = settings.audioGen;
    searchEngine = settings.searchEngines;
    currentToolSettings = settings;
    updateToolButtonVisibility();
    updateToolButtonActiveState();
});

const actionBtn = document.getElementById("send");

let isStreaming = false;
let autoScroll = true;

function isChatBoxAtBottom() {
	return chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 5;
}

chatBox.addEventListener("scroll", () => {
	if (isChatBoxAtBottom()) {
		autoScroll = true;
	} else {
		autoScroll = false;
	}
});

const toggleWebSearch = () => {
	if (!toolsSupportedInUi && !searchEnabled) {
		showToolsUnsupportedModal();
		return;
	}
	searchEnabled = !searchEnabled;
	updateToolButtonActiveState();
};

const toggleImageGen = () => {
	if (!toolsSupportedInUi && !imgEnabled) {
		showToolsUnsupportedModal();
		return;
	}
	if (!imgEnabled && !enforceLimit("imagesDaily")) return;
	imgEnabled = !imgEnabled;
	updateToolButtonActiveState();
};

const toggleVideoGen = () => {
	if (!toolsSupportedInUi && !videoEnabled) {
		showToolsUnsupportedModal();
		return;
	}
	if (!videoEnabled && !enforceLimit("videosDaily")) return;
	videoEnabled = !videoEnabled;
	updateToolButtonActiveState();
};

const toggleAudioGen = () => {
	if (!toolsSupportedInUi && !audioEnabled) {
		showToolsUnsupportedModal();
		return;
	}
	if (!audioEnabled && !enforceLimit("audioWeekly")) return;
	audioEnabled = !audioEnabled;
	updateToolButtonActiveState();
};

searchBtn?.addEventListener("click", toggleWebSearch);
searchBtnMini?.addEventListener("click", toggleWebSearch);
imgBtn?.addEventListener("click", toggleImageGen);
imgBtnMini?.addEventListener("click", toggleImageGen);
videoBtn?.addEventListener("click", toggleVideoGen);
videoBtnMini?.addEventListener("click", toggleVideoGen);
audioBtn?.addEventListener("click", toggleAudioGen);
audioBtnMini?.addEventListener("click", toggleAudioGen);

updateToolButtonVisibility();
updateToolButtonActiveState();

// ─── Attached-file state ──────────────────────────────────────────────────────

let attachedFiles: AttachedFile[] = [];

function parseImageDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
	const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
	if (!match) return null;
	return { mimeType: match[1], base64: match[2] };
}

function attachSnipImage(payload: { dataUrl: string; width?: number; height?: number }): void {
	const parsed = parseImageDataUrl(payload.dataUrl);
	if (!parsed) {
		showNotification({
			message: "Failed to attach snipped image.",
			type: "warning",
		});
		return;
	}

	attachedFiles.push({
		type: "image",
		name: `screen-snip-${Date.now()}.png`,
		mimeType: parsed.mimeType,
		base64: parsed.base64,
	});
	renderFileIndicator();
	textarea.focus();
	showNotification({
		message: "Screen snip attached.",
		type: "success",
	});
}

window.snip?.onImage?.((payload) => {
	if (!payload?.dataUrl) return;
	attachSnipImage(payload);
});

let attachMenuEl: HTMLDivElement | null = null;
let attachMenuDocHandler: ((event: MouseEvent) => void) | null = null;
let attachMenuKeyHandler: ((event: KeyboardEvent) => void) | null = null;

function canUploadImages(): boolean {
	const modelValue = lightningEnabled ? LIGHTNING_MODEL_VALUE : modelSelect.value;
	return modelSupportsVisionForRequest(modelValue);
}

function ensureAttachMenu(): HTMLDivElement {
	if (attachMenuEl) return attachMenuEl;
	const menu = document.createElement("div");
	menu.id = "attach-context-menu";
	menu.className = "context-menu hidden";
	menu.style.width = "190px";
	document.body.appendChild(menu);
	attachMenuEl = menu;
	return menu;
}

function closeAttachMenu(): void {
	if (!attachMenuEl) return;
	attachMenuEl.classList.add("hidden");
	if (attachMenuDocHandler) {
		document.removeEventListener("click", attachMenuDocHandler);
		attachMenuDocHandler = null;
	}
	if (attachMenuKeyHandler) {
		document.removeEventListener("keydown", attachMenuKeyHandler);
		attachMenuKeyHandler = null;
	}
}

async function startDirectImageToolCall(): Promise<void> {
	if (!currentToolSettings.imageGen) {
		showNotification({
			message: "Image generation is disabled in settings.",
			type: "warning",
		});
		return;
	}
	try {
		await window.ollama.startImageToolCall?.();
	} catch (err: any) {
		showNotification({
			message: `Failed to start image generation: ${String(err)}`,
			type: "error",
		});
	}
}

async function startDirectVideoToolCall(): Promise<void> {
	if (!currentToolSettings.videoGen) {
		showNotification({
			message: "Video generation is disabled in settings.",
			type: "warning",
		});
		return;
	}
	try {
		await window.ollama.startVideoToolCall?.();
	} catch (err: any) {
		showNotification({
			message: `Failed to start video generation: ${String(err)}`,
			type: "error",
		});
	}
}


function openAttachMenu(): void {
	const menu = ensureAttachMenu();
	menu.innerHTML = "";

	const addItem = (label: string, onClick: () => void) => {
		const item = document.createElement("div");
		item.className = "context-item";
		item.textContent = label;
		item.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			closeAttachMenu();
			onClick();
		});
		menu.appendChild(item);
	};

	addItem("📄 Upload file", () => fileInput.click());
	if (canUploadImages()) {
		addItem("🖼️ Upload image", () => imageInput?.click());
	}
	if (isMediaLibraryAvailable()) {
		addItem("🗂️ Add from media library", () => {
			void openMediaPicker({
				title: "Add from media library",
				onSelect: async (items) => {
					for (const item of items) {
						const attachment = await mediaItemToAttachment(item);
						if (attachment) attachedFiles.push(attachment as AttachedFile);
					}
					renderFileIndicator();
				},
			});
		});
	}
	if (currentToolSettings.imageGen) {
		addItem("✏️Edit/Generate Image", () => {
			void startDirectImageToolCall();
		});
	}
	if (currentToolSettings.videoGen) {
		addItem("🎬Image-Text To Video", () => {
			void startDirectVideoToolCall();
		});
	}


	menu.classList.remove("hidden");

	const btnRect = attachBtn.getBoundingClientRect();
	const menuRect = menu.getBoundingClientRect();

	let left = btnRect.left + window.scrollX;
	let top = btnRect.top + window.scrollY - menuRect.height - 8;

	if (top < 8) {
		top = btnRect.bottom + window.scrollY + 8;
	}

	if (left + menuRect.width > window.innerWidth - 8) {
		left = Math.max(8, window.innerWidth - menuRect.width - 8);
	}

	menu.style.left = `${left}px`;
	menu.style.top = `${top}px`;

	attachMenuDocHandler = (event: MouseEvent) => {
		const target = event.target as Node | null;
		if (!target) {
			closeAttachMenu();
			return;
		}
		if (menu.contains(target)) return;
		closeAttachMenu();
	};

	attachMenuKeyHandler = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			event.preventDefault();
			closeAttachMenu();
		}
	};

	// Register handlers after this click stack finishes so the menu doesn't close
	// immediately from the same click that opened it.
	queueMicrotask(() => {
		if (!attachMenuEl || attachMenuEl.classList.contains("hidden")) return;
		if (attachMenuDocHandler) document.addEventListener("click", attachMenuDocHandler);
		if (attachMenuKeyHandler)
			document.addEventListener("keydown", attachMenuKeyHandler);
	});
}

function toggleAttachMenu(): void {
	const menu = ensureAttachMenu();
	const isOpen = !menu.classList.contains("hidden");
	if (isOpen) closeAttachMenu();
	else openAttachMenu();
}

attachBtn.addEventListener("click", (event) => {
	event.preventDefault();
	event.stopPropagation();
	toggleAttachMenu();
});

// "Upload file": attach text files, plus SVG-as-XML (with an image preview).
fileInput.addEventListener("change", async (e) => {
	const files = Array.from((e.target as HTMLInputElement).files ?? []);
	for (const file of files) {
		if (isNonSvgImageFile(file)) {
			const visionAvailable = canUploadImages();
			showNotification({
				message: visionAvailable
					? `Image "${file.name}" must be uploaded via "Upload image".`
					: `Image "${file.name}" cannot be attached — the selected model does not support vision.`,
				type: "warning",
			});
			continue;
		}

		const text = await file.text();
		if (isSvgFile(file)) {
			attachedFiles.push({
				type: "text",
				name: file.name,
				content: text,
				previewMimeType: "image/svg+xml",
				previewDataUrl: svgTextToPreviewDataUrl(text),
			});
		} else {
			attachedFiles.push({ type: "text", name: file.name, content: text });
		}
	}
	// Reset the input so the same file can be re-selected if needed.
	fileInput.value = "";
	renderFileIndicator();
});

// "Upload image": only available for vision-capable models.
imageInput?.addEventListener("change", async (e) => {
	const modelValue = lightningEnabled ? LIGHTNING_MODEL_VALUE : modelSelect.value;
	if (!modelSupportsVisionForRequest(modelValue)) {
		showNotification({
			message: "The selected model does not support image input.",
			type: "warning",
		});
		(imageInput as HTMLInputElement).value = "";
		return;
	}

	const files = Array.from((e.target as HTMLInputElement).files ?? []);
	for (const file of files) {
		if (!file.type.startsWith("image/") && !isRasterImageFile(file.name) && !isSvgFile(file)) {
			showNotification({
				message: `Only image files are supported (got "${file.name}").`,
				type: "warning",
			});
			continue;
		}

		try {
			const { base64, mimeType } = await readFileAsBase64(file);
			attachedFiles.push({ type: "image", name: file.name, mimeType, base64 });
		} catch (err: any) {
			showNotification({
				message: `Failed to read image "${file.name}": ${String(err)}`,
				type: "error",
			});
		}
	}

	// Reset the input so the same file can be re-selected if needed.
	(imageInput as HTMLInputElement).value = "";
	renderFileIndicator();
});

// ─── Build the content array for a user message ───────────────────────────────

/**
 * Build a UserContentPart[] from the typed prompt text and any attached files.
 *
 * - Text files are folded into the text part as a markdown <details> block
 *   (preserving the existing behaviour).
 * - Image files become separate `image_url` parts.
 *
 * Returns a plain string when there are no images (backward-compatible with
 * older sessions that stored content as a string).
 */
function buildUserMessageContent(
	promptText: string,
	files: AttachedFile[],
): string | UserContentPart[] {
	const textFiles = files.filter((f): f is AttachedTextFile => f.type === "text");
	const imageFiles = files.filter((f): f is AttachedImageFile => f.type === "image");

	// Compose the text portion (prompt + attached text files).
	const fileBlock = formatAttachedTextFiles(textFiles);
	const fullText = promptText + (fileBlock ? "\n\n" + fileBlock : "");

	// If there are no images, keep the legacy flat-string format.
	if (imageFiles.length === 0) {
		return fullText;
	}

	// Otherwise return a content array.
	const parts: UserContentPart[] = [{ type: "text", text: fullText }];
	for (const img of imageFiles) {
		parts.push({
			type: "image_url",
			image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
		});
	}
	return parts;
}

function extractAttachedTextFiles(content: string): Array<{ name: string; content: string }> {
	if (typeof content !== "string") return [];
	const files = [];
	const re = /<details><summary>([^<]+?)<\/summary>\s*```(?:\w*)\n([\s\S]*?)\n```\s*<\/details>/g;
	let match;
	while ((match = re.exec(content)) !== null) {
		files.push({ name: match[1].trim(), content: match[2] });
	}
	return files;
}

function stripAttachedDetailsBlocks(text: string): string {
	if (typeof text !== "string") return "";
	return text
		.replace(/<details><summary>Attached Files<\/summary>[\s\S]*?<\/details>/g, "")
		.replace(/<details><summary>[^<]+?<\/summary>[\s\S]*?<\/details>/g, "")
		.trim();
}

function parseDataUrl(url: string): { mimeType: string; base64: string } {
	const matched = String(url || "").match(/^data:([^;,]+);base64,(.+)$/);
	if (!matched) return { mimeType: "image/png", base64: "" };
	return { mimeType: matched[1], base64: matched[2] };
}

// ─── Text-file formatting (unchanged logic, extracted to its own function) ────

function formatAttachedTextFiles(files: AttachedTextFile[]): string {
	if (files.length === 0) return "";

	let output = `<details><summary>Attached Files</summary>\n\n`;
	for (const file of files) {
		output += `\n<details><summary>${file.name}</summary>\n\n`;
		output += "```\n" + file.content + "\n```\n";
		output += `\n</details>\n`;
	}
	output += `\n</details>\n`;
	return output;
}

/**
 * Legacy wrapper kept so any remaining callers still compile.
 * @deprecated Use buildUserMessageContent instead.
 */
function formatAttachedFiles(files: AttachedFile[]): string {
	const textFiles = files.filter((f): f is AttachedTextFile => f.type === "text");
	return formatAttachedTextFiles(textFiles);
}

async function pullModel(name: string): Promise<void> {
	try {
		await window.ollama.pullModel(name);
		showNotification({
			message: `Model pulled: ${name}`,
			type: "success",
			actions: [{ label: "Ok", onClick: () => void 0 }],
		});
	} catch (err: any) {
		showNotification({
			message: `Error pulling model: ${err.message}`,
			type: "error",
		});
	}
}

window.ollama.onPullProgress(
	({ model, output }: { model: string; output: string }) => {
		const container = document.getElementById("notification-container");
		if (!container) return;

		let box = container.querySelector(
			`[data-model="${model}"]`,
		) as HTMLElement | null;

		if (!box) {
			box = document.createElement("div");
			box.className = "notification info";
			box.dataset.model = model;

			const close = document.createElement("button");
			close.className = "close-btn";
			close.textContent = "×";
			close.onclick = () => box?.remove();

			const msg = document.createElement("div");
			msg.className = "message";
			msg.innerHTML = `<strong>Pulling ${model}</strong><pre></pre>`;

			box.appendChild(close);
			box.appendChild(msg);
			container.appendChild(box);
		}

		const pre = box.querySelector("pre");
		const clean = stripAnsi(output);

		if (pre) {
			pre.textContent = clean.includes("\r")
				? (clean.split("\r").pop() ?? "")
				: clean;
		}

		if (/successfully pulled/i.test(clean)) {
			const actions = document.createElement("div");
			actions.className = "actions";
			const finishBtn = document.createElement("button");
			finishBtn.textContent = "Finish";
			finishBtn.onclick = () => {
				box?.remove();
				location.reload();
			};
			actions.appendChild(finishBtn);
			box.appendChild(actions);
		}
	},
);

async function autoNameSession(
	model: string, // still passed for logging/context
	prompt: string,
	sessionId: string,
	clientUrl?: string,
): Promise<string> {
	console.log("[autoNameSession] Called with:", { model, prompt, sessionId });

	let title: string;
	try {
		title = await window.ollama.autoNameSession(model, prompt, clientUrl);
	} catch (err) {
		console.error("[autoNameSession] IPC error:", err);
		title = new Date().toLocaleString();
	}

	if (
		(title.startsWith('"') && title.endsWith('"')) ||
		(title.startsWith("'") && title.endsWith("'"))
	) {
		title = title.slice(1, -1).trim();
	}

	console.log("[autoNameSession] Received title:", title);

	sessions[sessionId].name = title;
	window.ollama.save(sessions);

	window.auth.getSession().then(async (auth) => {
		if (isSyncEnabled() && auth?.session?.isAuthenticated) {
			await safeCallRemote(() => window.sync.saveAllSessions(sessions));
		}
		renderSessionList();
	});

	renderSessionList();
	console.log("[autoNameSession] Session name set and UI updated.");

	return title;
}

form.addEventListener("submit", async (e) => {
	e.preventDefault();
	const prompt = input.value.trim();
	input.value = "";

	typingBar.classList.add("empty");

	updateTextareaState();

	console.log("[form.submit] Submit event triggered");
	let clientUrl: string | undefined = undefined;
	let hostChoice =
		(hostSelect && hostSelect.value) ||
		localStorage.getItem("host_select") ||
		"local";
	let model = modelSelect.value;
	if (lightningEnabled) {
		hostChoice = LIGHTNING_CLIENT_URL;
		clientUrl = LIGHTNING_CLIENT_URL;
		model = LIGHTNING_MODEL_VALUE;
	} else {
		if (hostChoice && hostChoice.startsWith("remote:")) {
			clientUrl = hostChoice.slice("remote:".length);
		}
		if (!clientUrl) {
			const models = await window.ollama.listModels();
			if (models.length === 0) {
				const defaultModel = "llama3.2:3b";
				showNotification({
					message: `No models found. Downloading default model: ${defaultModel}`,
					type: "info",
				});
				await pullModel(defaultModel);
				let attempts = 0;
				while (attempts < 10) {
					const models = await window.ollama.listModels();
					if (models.some((m) => m.name === defaultModel)) break;
					await new Promise((r) => setTimeout(r, 1000));
					attempts++;
				}

				await loadOptions();

				modelSelect.value = defaultModel;
				model = defaultModel;
			}
		}
		if (clientUrl) {
			const remoteModels = await window.ollama.listModels(clientUrl);
			if (remoteModels.length === 0) {
				showNotification({
					message: "No models available on the selected remote host.",
					type: "warning",
				});
				return;
			}
		}
	}
	if (isStreaming) {
		window.ollama.stop?.();
		return;
	}

	console.log(
		"[form.submit] Prompt:",
		prompt,
		"CurrentSessionId:",
		currentSessionId,
	);
	if (!prompt || !currentSessionId) return;
	const isCloudChat = isCloudRequest(model, clientUrl);
	if (isCloudChat && !enforceLimit("cloudChatDaily")) {
		input.value = prompt;
		typingBar.classList.remove("empty");
		updateTextareaState();
		textarea.focus();
		return;
	}
	setWelcomeMode(false);
	if (getSessionFlatHistory(sessions[currentSessionId], currentSessionId).length === 0) {
		console.log(
			"[form.submit] First prompt for session, calling autoNameSession...",
		);
		autoNameSession(model, prompt, currentSessionId, clientUrl).catch(
			(err) => {
				console.error("[form.submit] autoNameSession error:", err);
			},
		);
	}
	const session = sessions[currentSessionId];
	activeToolSessionId = currentSessionId;
	session.model = model;

	// Build the content (string for text-only, array when images are attached).
	const supportsVisionForRequest = modelSupportsVisionForRequest(model);
	const droppedImages = supportsVisionForRequest
		? 0
		: attachedFiles.filter((f) => f.type === "image").length;
	const effectiveAttachedFiles = supportsVisionForRequest
		? attachedFiles
		: attachedFiles.filter((f) => f.type !== "image");

	if (droppedImages > 0) {
		showNotification({
			message:
				`Removed ${droppedImages} image attachment${droppedImages === 1 ? "" : "s"} — the selected model does not support vision.`,
			type: "warning",
		});
	}

	const messageContent = buildUserMessageContent(prompt, effectiveAttachedFiles);
	const linkedMediaIds = [
		...new Set(
			effectiveAttachedFiles
				.map((file: any) => file?.mediaId)
				.filter((id: unknown) => typeof id === "string" && !!String(id)),
		),
	];
	// The text sent to the model for streaming is always the plain-text form.
	const fullPromptText = typeof messageContent === "string"
		? messageContent
		: getMessageText(messageContent);

	attachedFiles = [];
	renderFileIndicator();

	const userEntry = ensureMessageVersioningShape({
		role: "user",
		content: cloneMessageContent(messageContent),
		...(linkedMediaIds.length ? { linkedMediaIds } : {}),
	});
	const root = ensureSessionHistoryRoot(session, currentSessionId || undefined);
	if (!root) {
		setSessionHistoryRoot(session, userEntry, currentSessionId || undefined);
	} else {
		const nextRoot = cloneAndRepairTree(root);
		appendEntriesToActiveLeaf(nextRoot, [userEntry]);
		setSessionHistoryRoot(session, nextRoot, currentSessionId || undefined);
	}
	await renderChat();

	const botBubble = document.createElement("div");
	botBubble.className = "chat-bubble bot-bubble thinking";
	botBubble.textContent = "Thinking";
	botBubble.setAttribute("data-text", botBubble.textContent);
	let isThinking = true;
	let isGenerating = false;
	chatBox.appendChild(botBubble);
	chatBox.scrollTop = chatBox.scrollHeight;

	window.ollama.removeAllListeners?.();

	// Host selection persistence is handled by explicit host picker changes.
	// Avoid mutating persisted host during message submit, which can cause
	// unexpected host switches in the picker UI.
	const supportsToolsForRequest = modelSupportsToolsForRequest(model);
	window.ollama.streamPrompt(
		model,
		messageContent,
		{
			search: supportsToolsForRequest && searchEnabled,
			searchEngine: searchEngine,
			imageGen: supportsToolsForRequest && imgEnabled,
			videoGen: supportsToolsForRequest && videoEnabled,
			audioGen: supportsToolsForRequest && audioEnabled,
		},
		clientUrl,
		currentSessionId,
	);
	if (isCloudChat) {
		bumpUsage("cloudChatDaily");
	}

	let fullResponse = "";
	isStreaming = true;
	updateActionButton();

	window.ollama.onResponse(async (chunk) => {
		if (isThinking) {
			botBubble.classList.remove("thinking");
			botBubble.removeAttribute("data-text");
			isThinking = false;
			isGenerating = true;
			botBubble.classList.add("generating");
		}
		fullResponse += chunk;
		const displayText = processTextForDisplay(fullResponse);
		// nosemgrep: javascript.browser.security.insecure-innerhtml
		botBubble.innerHTML =
			await window.utils.markdown_parse_and_purify(displayText);
		if (autoScroll) {
			chatBox.scrollTop = chatBox.scrollHeight;
		}
	});

	window.ollama.onError(async (err) => {
		botBubble.classList.remove("thinking");
		botBubble.removeAttribute("data-text");
		botBubble.classList.remove("generating");
		if (
			err.toString().toLowerCase().includes("token verification failed")
		) {
			botBubble.textContent += `\nInferencePort AI Transport Security has rejected the request. Reason: You are not authorized to use this remote host.`;

			showNotification({
				message:
					"InferencePort AI Transport Security has rejected your request. Reason: You are not authorized to use this remote host.",
				type: "error",
			});
		} else if (err.toString().toLowerCase().includes("connection error")) {
			botBubble.textContent += `\nInferencePort AI could not connect to the host. Please check the host URL and your network connection.`;

			showNotification({
				message:
					"InferencePort AI could not connect to the remote host. Please check the host URL and your network connection.",
				type: "error",
			});
		} else {
			botBubble.textContent += `\n⚠️ Error: ${err}`;

			showNotification({
				message: `Error during streaming: ${err}`,
				type: "error",
			});
		}

		window.ollama.save(sessions);
		window.auth.getSession().then(async (auth) => {
			if (isSyncEnabled() && auth?.session?.isAuthenticated) {
				await safeCallRemote(() =>
					window.sync.saveAllSessions(sessions),
				);
			}
			renderSessionList();
		});
		endStreaming();
	});

	window.ollama.onDone(async () => {
		botBubble.classList.remove("thinking");
		botBubble.removeAttribute("data-text");
		botBubble.classList.remove("generating");
		const activeSession = sessions[currentSessionId];
		if (activeSession) {
			const currentRoot = ensureSessionHistoryRoot(activeSession, currentSessionId || undefined);
			const assistantEntry = ensureMessageVersioningShape({
				role: "assistant",
				content: fullResponse,
			});
			if (!currentRoot) {
				setSessionHistoryRoot(activeSession, assistantEntry, currentSessionId || undefined);
			} else {
				const nextRoot = cloneAndRepairTree(currentRoot);
				appendEntriesToActiveLeaf(nextRoot, [assistantEntry]);
				setSessionHistoryRoot(activeSession, nextRoot, currentSessionId || undefined);
			}
		}
		await renderChat();
		const status = document.createElement("div");
		status.textContent = "✅ Done";
		status.style.marginTop = "8px";
		status.style.fontSize = "14px";
		status.style.color = "#3ca374";
		botBubble.appendChild(status);
		window.ollama.save(sessions);
		window.auth.getSession().then(async (auth) => {
			if (isSyncEnabled() && auth?.session?.isAuthenticated) {
				await safeCallRemote(() =>
					window.sync.saveAllSessions(sessions),
				);
			}
			renderSessionList();
		});
		endStreaming();
	});

	window.ollama.onAbort(async () => {
		botBubble.classList.remove("thinking");
		botBubble.removeAttribute("data-text");
		botBubble.classList.remove("generating");
		const activeSession = sessions[currentSessionId];
		if (activeSession) {
			const currentRoot = ensureSessionHistoryRoot(activeSession, currentSessionId || undefined);
			const assistantEntry = ensureMessageVersioningShape({
				role: "assistant",
				content: fullResponse,
			});
			if (!currentRoot) {
				setSessionHistoryRoot(activeSession, assistantEntry, currentSessionId || undefined);
			} else {
				const nextRoot = cloneAndRepairTree(currentRoot);
				appendEntriesToActiveLeaf(nextRoot, [assistantEntry]);
				setSessionHistoryRoot(activeSession, nextRoot, currentSessionId || undefined);
			}
		}
		await renderChat();
		const status = document.createElement("div");
		status.textContent = "⚠︎ Interrupted";
		status.style.marginTop = "8px";
		status.style.fontSize = "14px";
		status.style.color = "#d9534f";
		botBubble.appendChild(status);
		window.ollama.save(sessions);
		window.auth.getSession().then(async (auth) => {
			if (isSyncEnabled() && auth?.session?.isAuthenticated) {
				await safeCallRemote(() =>
					window.sync.saveAllSessions(sessions),
				);
			}
			renderSessionList();
		});
		endStreaming();
	});
});

function renderFileIndicator() {
	fileBar.innerHTML = "";

	if (attachedFiles.length === 0) {
		fileBar.style.display = "none";
		return;
	}

	fileBar.style.display = "flex";

	attachedFiles.forEach((file, index) => {
		const icon = document.createElement("div");
		icon.className = "file-icon";
		// Show a thumbnail for images, document emoji for text files.
		if (file.type === "image") {
			const thumb = document.createElement("img");
			thumb.src = `data:${file.mimeType};base64,${file.base64}`;
			thumb.alt = file.name;
			thumb.style.width = "32px";
			thumb.style.height = "32px";
			thumb.style.objectFit = "cover";
			thumb.style.borderRadius = "4px";
			thumb.style.pointerEvents = "none";
			icon.appendChild(thumb);
		} else if (file.previewDataUrl) {
			const thumb = document.createElement("img");
			thumb.src = file.previewDataUrl;
			thumb.alt = file.name;
			thumb.style.width = "32px";
			thumb.style.height = "32px";
			thumb.style.objectFit = "cover";
			thumb.style.borderRadius = "4px";
			thumb.style.pointerEvents = "none";
			icon.appendChild(thumb);
		} else {
			icon.textContent = "📄";
		}
		icon.setAttribute("data-index", String(index));

		icon.addEventListener("click", (e) => {
			if ((e.target as HTMLElement).classList.contains("file-remove"))
				return;
			openFilePreview(file);
		});

		const removeBtn = document.createElement("button");
		removeBtn.className = "file-remove";
		removeBtn.setAttribute("aria-label", "Remove file");
		removeBtn.title = "Remove file";
		removeBtn.innerHTML = "×";
		removeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			attachedFiles.splice(index, 1);
			renderFileIndicator();
		});

		icon.appendChild(removeBtn);
		fileBar.appendChild(icon);
	});
}

function updateActionButton() {
	if (isStreaming) {
		actionBtn.textContent = "⏹";
		actionBtn.classList.add("streaming");
		actionBtn.setAttribute("aria-label", "Stop streaming");
	} else {
		actionBtn.innerHTML =
			"<img src='../assets/img/up-arrow.svg' alt='send' width='40' height='40' />";
		actionBtn.classList.remove("streaming");
		actionBtn.setAttribute("aria-label", "Send");
	}
}

function endStreaming() {
	isStreaming = false;
	activeToolSessionId = null;
	updateActionButton();
}

try {
	textarea.autocomplete = "off";
} catch (err) {
	void 1;
}

function updateTextareaState() {
    const MAX_LINES = 6;
    const EXTRA_PADDING = 10;

    const styles = window.getComputedStyle(textarea);
    const fontSize = parseFloat(styles.fontSize);
    const lineHeight = parseFloat(styles.lineHeight);
    const paddingTop = parseFloat(styles.paddingTop);
    const paddingBottom = parseFloat(styles.paddingBottom);

    const collapsedHeight = lineHeight + paddingTop + paddingBottom;
    const maxHeight =
        lineHeight * MAX_LINES +
        paddingTop +
        paddingBottom +
        EXTRA_PADDING;

    const value = textarea.value;
    const hasValue = value.length > 0;
    typingBar.classList.toggle("empty", !hasValue);

    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;

    const targetHeight = Math.max(
        collapsedHeight,
        Math.min(scrollHeight, maxHeight)
    );

    const isExpanded = targetHeight > collapsedHeight + 1;
    const isScrollable = scrollHeight > maxHeight + 1;

    textarea.style.height = `${targetHeight}px`;
    textarea.style.overflowY = isScrollable ? "auto" : "hidden";

    typingBar.classList.toggle("is-expanded", isExpanded);
    typingBar.classList.toggle("is-scrollable", isScrollable);
}


textarea.addEventListener("keydown", (e) => {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		if (!isStreaming) {
			(document.getElementById("send") as HTMLButtonElement).click();
		}
	}
});

newSessionBtn.addEventListener("click", createNewSession);

(
	document.getElementById("session-search") as HTMLInputElement
).addEventListener("input", renderSessionList);

function openFilePreview(file: AttachedFile) {
	if (file.type === "image") {
		modal.open({
			title: file.name,
			html: `<img
				src="data:${file.mimeType};base64,${file.base64}"
				alt="${escapeHtml(file.name)}"
				style="max-width:100%;max-height:70vh;border-radius:6px;"
			/>`,
			actions: [
				{
					id: "close-file-preview",
					label: "Close",
					onClick: () => modal.close(),
				},
			],
		});
	} else if (file.previewDataUrl) {
		modal.open({
			title: file.name,
			html: `<img
				src="${escapeHtml(file.previewDataUrl)}"
				alt="${escapeHtml(file.name)}"
				style="max-width:100%;max-height:45vh;border-radius:6px;margin-bottom:10px;"
			/>
			<pre class="file-preview">${escapeHtml(file.content)}</pre>`,
			actions: [
				{
					id: "close-file-preview",
					label: "Close",
					onClick: () => modal.close(),
				},
			],
		});
	} else {
		modal.open({
			title: file.name,
			html: `<pre class="file-preview">${escapeHtml(file.content)}</pre>`,
			actions: [
				{
					id: "close-file-preview",
					label: "Close",
					onClick: () => modal.close(),
				},
			],
		});
	}
}

async function setTitle() {
	const titleModel = lightningEnabled
		? LIGHTNING_MODEL_DISPLAY
		: modelSelect.value;
	document.title = titleModel + " - Chat - InferencePortAI";
}

function escapeHtml(value: string): string {
	return escapeSubscriptionHtml(value);
}

function cloneMessageContent(content: any): any {
	if (typeof content === "string") return content;
	try {
		return structuredClone(content);
	} catch {
		return content;
	}
}

function createMessageVersion(content: any): {
	content: any;
	timestamp: number;
	tail: any[];
} {
	return {
		content: cloneMessageContent(content),
		timestamp: Date.now(),
		tail: [],
	};
}

function ensureMessageMetadata(message: any): void {
	if (!message || typeof message !== "object") return;
	if (!message.id) {
		try {
			message.id = crypto.randomUUID();
		} catch {
			message.id = `msg_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
		}
	}
	if (
		typeof message.timestamp !== "number" ||
		!Number.isFinite(message.timestamp) ||
		message.timestamp <= 0
	) {
		message.timestamp = Date.now();
	}

	const supportsVersioning = ["user", "assistant"].includes(String(message.role || ""));
	if (!supportsVersioning && !Array.isArray(message.versions)) return;

	if (!Array.isArray(message.versions) || message.versions.length === 0) {
		message.versions = [createMessageVersion(message.content)];
		message.currentVersionIdx = 0;
	}

	const currentVersionIdx =
		typeof message.currentVersionIdx === "number" &&
		Number.isFinite(message.currentVersionIdx)
			? Math.max(0, Math.min(message.currentVersionIdx, message.versions.length - 1))
			: message.versions.length - 1;
	message.currentVersionIdx = currentVersionIdx;
	const current = message.versions[currentVersionIdx];
	if (!current || typeof current !== "object") {
		message.versions[currentVersionIdx] = createMessageVersion(message.content);
	}
	if (!Array.isArray(message.versions[currentVersionIdx].tail)) {
		message.versions[currentVersionIdx].tail = [];
	}
	if (typeof message.versions[currentVersionIdx].timestamp !== "number") {
		message.versions[currentVersionIdx].timestamp = Date.now();
	}
	if (typeof message.versions[currentVersionIdx].content !== "undefined") {
		message.content = cloneMessageContent(message.versions[currentVersionIdx].content);
	}
}

function appendMessageVersion(message: any, nextContent: any): void {
	ensureMessageMetadata(message);
	if (!Array.isArray(message.versions)) {
		message.versions = [createMessageVersion(message.content)];
	}
	message.versions.push(createMessageVersion(nextContent));
	message.currentVersionIdx = message.versions.length - 1;
	message.timestamp = Date.now();
}

function normalizeSessionsForSync(allSessions: Record<string, any>): void {
	for (const [sessionId, session] of Object.entries(allSessions || {})) {
		if (!session || typeof session !== "object") continue;
		const root = ensureSessionHistoryRoot(session, sessionId);
		if (!root) {
			session.history = [];
			continue;
		}
		const normalizedRoot = cloneAndRepairTree(root);
		const walk = (node: any) => {
			if (!node || typeof node !== "object") return;
			ensureMessageMetadata(node);
			ensureMessageVersioningShape(node);
			const active = getActiveVersionNode(node);
			for (const child of active?.tail || []) walk(child);
		};
		walk(normalizedRoot);
		setSessionHistoryRoot(session, normalizedRoot, sessionId);
	}
}

async function persistSessionsAndSync(): Promise<void> {
	normalizeAllSessionHistories(sessions);
	normalizeSessionsForSync(sessions);
	await window.ollama.save(sessions);
	const auth = await window.auth.getSession();
	if (isSyncEnabled() && auth?.session?.isAuthenticated) {
		const syncResult = await safeCallRemote(
			() => window.sync.saveAllSessions(sessions),
			null,
		);
		const remoteIdMap =
			syncResult && typeof syncResult === "object"
				? (syncResult as any).remoteIdMap
				: null;
		let hasRemoteIdUpdates = false;
		if (remoteIdMap && typeof remoteIdMap === "object") {
			for (const [localId, remoteId] of Object.entries(remoteIdMap)) {
				if (!sessions[localId] || typeof remoteId !== "string" || !remoteId.trim()) {
					continue;
				}
				if (sessions[localId].remoteId === remoteId) continue;
				sessions[localId].remoteId = remoteId;
				hasRemoteIdUpdates = true;
			}
		}
		if (hasRemoteIdUpdates) {
			await window.ollama.save(sessions);
		}
	}
}

function getCurrentSessionMessages(): any[] | null {
	if (!currentSessionId || !sessions[currentSessionId]) {
		return null;
	}

	return getSessionFlatHistory(sessions[currentSessionId], currentSessionId || undefined);
}

function createMessageActionButton(
	label: string,
	title: string,
	onClick: () => void | Promise<void>,
): HTMLButtonElement {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "chat-message-action-btn";
	button.setAttribute("aria-label", title);
	button.title = title;
	button.textContent = label;
	button.addEventListener("click", (event) => {
		event.stopPropagation();
		void onClick();
	});
	return button;
}

async function selectMessageVersion(
	messageIndex: number,
	versionIdx: number,
): Promise<void> {
	const session = currentSessionId ? sessions[currentSessionId] : null;
	if (!session) return;
	const root = ensureSessionHistoryRoot(session, currentSessionId || undefined);
	const history = getSessionFlatHistory(session, currentSessionId || undefined);
	const message = history?.[messageIndex];
	if (!message || !Array.isArray(message.versions) || !message.versions.length) {
		return;
	}
	const clamped = Math.max(0, Math.min(versionIdx, message.versions.length - 1));
	const nextRoot = cloneAndRepairTree(root);
	const updated = findAndUpdateMessage(nextRoot, message.id, (node) => {
		node.currentVersionIdx = clamped;
		const selected = node.versions?.[clamped];
		if (selected && typeof selected.content !== "undefined") {
			node.content = cloneMessageContent(selected.content);
		}
		node.timestamp = Date.now();
	});
	if (!updated) return;
	setSessionHistoryRoot(session, nextRoot, currentSessionId || undefined);
	await persistSessionsAndSync();
	await renderChat();
}

function buildMessageVersionNav(
	msg: any,
	messageIndex: number,
): HTMLDivElement | null {
	if (!Array.isArray(msg?.versions) || msg.versions.length <= 1) return null;

	const total = msg.versions.length;
	const current =
		typeof msg.currentVersionIdx === "number" &&
		Number.isFinite(msg.currentVersionIdx)
			? Math.max(0, Math.min(msg.currentVersionIdx, total - 1))
			: total - 1;

	const nav = document.createElement("div");
	nav.className = "chat-message-version-nav";

	const prev = document.createElement("button");
	prev.type = "button";
	prev.className = "chat-message-version-btn";
	prev.innerHTML = "&#8249;";
	prev.disabled = current <= 0;
	prev.addEventListener("click", (event) => {
		event.stopPropagation();
		void selectMessageVersion(messageIndex, current - 1);
	});

	const label = document.createElement("span");
	label.className = "chat-message-version-label";
	label.textContent = `${current + 1} / ${total}`;

	const next = document.createElement("button");
	next.type = "button";
	next.className = "chat-message-version-btn";
	next.innerHTML = "&#8250;";
	next.disabled = current >= total - 1;
	next.addEventListener("click", (event) => {
		event.stopPropagation();
		void selectMessageVersion(messageIndex, current + 1);
	});

	nav.appendChild(prev);
	nav.appendChild(label);
	nav.appendChild(next);
	return nav;
}

function openEditMessageDialog(messageIndex: number): void {
	const session = currentSessionId ? sessions[currentSessionId] : null;
	const history = getCurrentSessionMessages();
	const message = history?.[messageIndex];
	if (!message) return;
	normalizeMessageFromActiveVersion(message);

	const sourceText = getMessageText(message.content);
	const initialText = stripAttachedDetailsBlocks(sourceText);
	const initialTextAttachments = extractAttachedTextFiles(sourceText).map((file) => ({
		type: "text",
		name: file.name,
		content: file.content,
	}));
	const initialImageAttachments = getMessageImages(message.content).map((url, index) => {
		const parsed = parseDataUrl(url);
		return {
			type: "image",
			name: `image-${index + 1}.png`,
			mimeType: parsed.mimeType,
			base64: parsed.base64,
		};
	});
	const editAttachments: AttachedFile[] = [
		...initialTextAttachments,
		...initialImageAttachments,
	];

	editModal.open({
		title: "Edit Message",
		html: `
			<textarea
				id="edit-message-input"
				class="modal-input"
				rows="8"
				style="width:100%; resize:vertical;"
			>${escapeHtml(initialText)}</textarea>
			<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
				${
					isMediaLibraryAvailable()
						? `<button id="edit-attach-media" class="btn-ghost" type="button">Add from media library</button>`
						: ""
				}
				<button id="edit-clear-media" class="btn-ghost" type="button">Clear attachments</button>
			</div>
			<div id="edit-attachment-count" style="margin-top:8px;font-size:12px;opacity:0.8;"></div>
		`,
		actions: [
			{
				id: "cancel-edit-message",
				label: "Cancel",
				onClick: () => editModal.close(),
			},
			{
				id: "save-edit-message",
				label: "Save",
				onClick: async () => {
					const input = document.getElementById(
						"edit-message-input",
					) as HTMLTextAreaElement;
					if (!input) return;

					const updated = input.value;
					if (!updated.trim()) {
						showNotification({
							message: "Message cannot be empty.",
							type: "warning",
						});
						return;
					}

						const latestHistory = getCurrentSessionMessages();
						if (!latestHistory?.[messageIndex]) {
							editModal.close();
							return;
						}

						const existing = latestHistory[messageIndex];
						const nextContent = buildUserMessageContent(updated, editAttachments);
						const linkedMediaIds = [
							...new Set(
								editAttachments
									.map((file: any) => file?.mediaId)
									.filter((id: unknown) => typeof id === "string" && !!String(id)),
							),
						];
						const root = ensureSessionHistoryRoot(session, currentSessionId || undefined);
						const nextRoot = cloneAndRepairTree(root);
						const context = findMessageContext(nextRoot, existing.id);
						if (!context?.message) return;
						findAndUpdateMessage(nextRoot, existing.id, (messageNode) => {
							if (
								messageNode.role === "user" &&
								Array.isArray(context.parentTail) &&
								context.index >= 0
							) {
								const trailing = context.parentTail.splice(context.index + 1);
								if (trailing.length) {
									const currentVersion = getActiveVersionNode(messageNode);
									currentVersion.tail = [...(currentVersion.tail || []), ...trailing];
								}
							}
							messageNode.versions.push({
								content: cloneMessageContent(nextContent),
								tail: [],
								timestamp: Date.now(),
							});
							messageNode.currentVersionIdx = messageNode.versions.length - 1;
							messageNode.content = cloneMessageContent(nextContent);
							if (linkedMediaIds.length) messageNode.linkedMediaIds = linkedMediaIds;
							else delete messageNode.linkedMediaIds;
							messageNode.timestamp = Date.now();
						});
						setSessionHistoryRoot(session, nextRoot, currentSessionId || undefined);

						await persistSessionsAndSync();
						await renderChat();
						editModal.close();
					},
			},
		],
	});
	setTimeout(() => {
		const attachBtn = document.getElementById("edit-attach-media");
		const clearBtn = document.getElementById("edit-clear-media");
		const countEl = document.getElementById("edit-attachment-count");
		const renderCount = () => {
			if (!countEl) return;
			countEl.textContent = `${editAttachments.length} attachment${editAttachments.length === 1 ? "" : "s"} selected`;
		};
		renderCount();
		attachBtn?.addEventListener("click", () => {
			void openMediaPicker({
				title: "Attach media to edited message",
				onSelect: async (items) => {
					for (const item of items) {
						const attachment = await mediaItemToAttachment(item);
						if (attachment) editAttachments.push(attachment as AttachedFile);
					}
					renderCount();
				},
			});
		});
		clearBtn?.addEventListener("click", () => {
			editAttachments.splice(0, editAttachments.length);
			renderCount();
		});
	}, 0);
}

function openDeleteMessageDialog(messageIndex: number): void {
	editModal.open({
		title: "Delete Message",
		html: `<p>This message will be permanently deleted.</p>`,
		actions: [
			{
				id: "cancel-delete-message",
				label: "Cancel",
				onClick: () => editModal.close(),
			},
			{
				id: "confirm-delete-message",
				label: "Delete",
				onClick: async () => {
					const session = currentSessionId ? sessions[currentSessionId] : null;
					if (!session) {
						editModal.close();
						return;
					}
					const history = getSessionFlatHistory(
						session,
						currentSessionId || undefined,
					);
					const target = history?.[messageIndex];
					if (!target?.id) {
						editModal.close();
						return;
					}
					const root = ensureSessionHistoryRoot(session, currentSessionId || undefined);
					if (!root) {
						editModal.close();
						return;
					}
					const nextRoot = cloneAndRepairTree(root);
					const context = findMessageContext(nextRoot, target.id);
					if (!context) {
						editModal.close();
						return;
					}
					if (context.parentTail && context.index >= 0) {
						context.parentTail.splice(context.index, 1);
					} else if (context.message?.id === nextRoot.id) {
						// Deleting root clears the session history entirely.
						setSessionHistoryRoot(session, null, currentSessionId || undefined);
						await persistSessionsAndSync();
						await renderChat();
						editModal.close();
						return;
					}
					setSessionHistoryRoot(session, nextRoot, currentSessionId || undefined);
					await persistSessionsAndSync();
					await renderChat();
					editModal.close();
				},
			},
		],
	});
}

function buildMessageActions(
	msg: any,
	messageIndex: number,
): HTMLDivElement | null {
	if (!["user", "assistant"].includes(msg?.role)) {
		return null;
	}

	const actions = document.createElement("div");
	actions.className = "chat-message-actions";

	const contentText = getMessageText(msg.content);
	const canEdit = contentText.length > 0;
	if (canEdit) {
		actions.appendChild(
			createMessageActionButton("Edit", "Edit message", () =>
				openEditMessageDialog(messageIndex),
			),
		);
	}

	actions.appendChild(
		createMessageActionButton("Delete", "Delete message", () =>
			openDeleteMessageDialog(messageIndex),
		),
	);

	actions.appendChild(
		createMessageActionButton("Copy", "Copy message", async () => {
			const content = getMessageText(msg.content);
			try {
				await navigator.clipboard.writeText(content);
				showNotification({
					message: "Message copied.",
					type: "success",
				});
			} catch (err) {
				showNotification({
					message: "Failed to copy message.",
					type: "error",
				});
			}
		}),
	);

	return actions;
}

function isSafeHttpImageUrl(url: string): boolean {
    return /^https?:\/\//i.test(url);
}

function isDataImageUrl(url: string): boolean {
    return /^data:image\//i.test(url);
}

async function sanitizeSvgDataUrl(url: string): Promise<string | null> {
    const match = url.match(/^data:image\/svg\+xml(;base64)?,(.*)$/i);
    if (!match) return null;

    const isBase64 = !!match[1];
    const payload = match[2] || "";

    let svg: string;
    try {
        if (isBase64) {
            const decoded = atob(payload);
            svg = decoded;
        } else {
            svg = decodeURIComponent(payload);
        }
    } catch {
        return null;
    }

    const sanitizedSvg = await window.utils.sanitizeSVG(svg);

    let encoded: string;
    if (isBase64) {
        encoded = btoa(sanitizedSvg);
        return `data:image/svg+xml;base64,${encoded}`;
    } else {
        encoded = encodeURIComponent(sanitizedSvg);
        return `data:image/svg+xml,${encoded}`;
    }
}

async function makeSafeImageUrl(url: string): Promise<string | null> {
    if (/^https?:\/\//i.test(url)) {
        return url;
    }

    if (!/^data:image\//i.test(url)) {
        return null;
    }

    if (/^data:image\/svg\+xml/i.test(url)) {
        const match = url.match(/^data:image\/svg\+xml(;base64)?,(.*)$/i);
        if (!match) return null;

        const isBase64 = !!match[1];
        const payload = match[2] || "";

        let svgXml: string;
        try {
            if (isBase64) {
                svgXml = atob(payload);
            } else {
                svgXml = decodeURIComponent(payload);
            }
        } catch {
            return null;
        }

        const sanitized = await window.utils.sanitizeSVG(svgXml);

        if (isBase64) {
            const encoded = btoa(sanitized);
            return `data:image/svg+xml;base64,${encoded}`;
        } else {
            const encoded = encodeURIComponent(sanitized);
            return `data:image/svg+xml,${encoded}`;
        }
    }

    return url;
}


async function renderChat() {
	for (const url of assetObjectUrlCache.values()) {
		try {
			URL.revokeObjectURL(url);
		} catch (err: any) {
			console.warn(err.toString());
		}
	}
	assetObjectUrlCache.clear();
	const chatBox = document.getElementById("chat-box");
	if (!chatBox) {
		console.warn("renderChat aborted: chatBox not found");
		return;
	}

	if (!currentSessionId) {
		currentSessionId = Object.keys(sessions)[0] || null;
	}

	const session = sessions[currentSessionId];
	chatBox.innerHTML = "";
	liveToolBubbles.clear();
	const flatHistory = session
		? getSessionFlatHistory(session, currentSessionId || undefined)
		: [];
	if (!session || flatHistory.length === 0) {
		setWelcomeMode(true);
		return;
	}

	setWelcomeMode(false);

	for (const [messageIndex, msg] of flatHistory.entries()) {
		normalizeMessageFromActiveVersion(msg);
		if (msg.role === "user") {
			const bubble = document.createElement("div");
			bubble.className = "chat-bubble user-bubble has-message-actions";

			const textContent = getMessageText(msg.content);
			const fileAttachments = extractAttachedTextFiles(textContent);
			const displayText = stripAttachedDetailsBlocks(textContent)
			// nosemgrep: javascript.browser.security.insecure-innerhtml
			bubble.innerHTML = await window.utils.markdown_parse_and_purify(
				displayText || "",
			);

			const imageUrls = getMessageImages(msg.content);
			for (const url of imageUrls) {
				const imgWrapper = document.createElement("div");
				imgWrapper.className = "user-attached-image-wrapper";

				const img = document.createElement("img");
				img.src = url;
				img.alt = "Attached image";
				img.className = "user-attached-image";
				img.style.maxWidth = "100%";
				img.style.maxHeight = "320px";
				img.style.borderRadius = "8px";
				img.style.marginTop = "8px";
				img.style.display = "block";
				img.style.cursor = "pointer";
				img.addEventListener("click", async () => {
					const safeUrl = await makeSafeImageUrl(url);
					if (!safeUrl) {
						return;
					}

					const escaped = safeUrl
						.replace(/"/g, "&quot;")
						.replace(/'/g, "&#39;");

					modal.open({
						title: "Attached image",
						html: `<img src="${escaped}" alt="Attached image" style="max-width:100%;max-height:75vh;border-radius:6px;" />`,
						actions: [
							{
								id: "close-img-modal",
								label: "Close",
								onClick: () => modal.close(),
							},
						],
					});
				});
				imgWrapper.appendChild(img);
				bubble.appendChild(imgWrapper);
			}

			if (fileAttachments.length > 0) {
				const row = document.createElement("div");
				row.className = "msg-file-attachments";
				for (const file of fileAttachments) {
					const chip = document.createElement("button");
					chip.type = "button";
					chip.className = "file-attachment-chip";
					chip.textContent = file.name;
					chip.addEventListener("click", () => {
						openFilePreview({
							type: "text",
							name: file.name,
							content: file.content,
						});
					});
					row.appendChild(chip);
				}
				bubble.appendChild(row);
			}

				const actions = buildMessageActions(msg, messageIndex);
				const versionNav = buildMessageVersionNav(msg, messageIndex);
				if (versionNav) {
					bubble.appendChild(versionNav);
				}
				if (actions) {
					bubble.appendChild(actions);
				}
			chatBox.appendChild(bubble);
			continue;
		}

		/* ---------------- ASSISTANT ---------------- */
		if (msg.role === "assistant") {
			// nosemgrep: javascript.browser.security.insecure-innerhtml
			const html = (await window.utils.markdown_parse_and_purify(
				msg.content || "",
			)).replace(/&lt;session_name&gt;[\s\S]*?&lt;\/session_name&gt;/gi, "");
			const temp = document.createElement("div");
			temp.innerHTML = html;

			const botContainer = document.createElement("div");
			botContainer.className =
				"chat-bubble bot-bubble has-message-actions";

			Array.from(temp.childNodes).forEach((node) => {
				const el = node as HTMLElement;
				if (
					el.nodeType === Node.ELEMENT_NODE &&
					el.tagName.toLowerCase() === "pre"
				) {
					const preEl = el as HTMLPreElement;
					const codeEl = preEl.querySelector("code");

					let lang = "code";

					if (codeEl.className) {
						const match =
							codeEl.className.match(/language-([\w-]+)/);
						if (match) lang = match[1];
					}

					if (lang === "svg") {
						const svgCode = codeEl?.textContent || "";
						const img = document.createElement("img") as HTMLImageElement;
						img.src = "data:image/svg+xml," + encodeURIComponent(svgCode);
						img.style.maxWidth = "100%";
						img.style.cursor = "pointer";
						img.onclick = () => {
							const panel = document.getElementById("svg-side-panel") as HTMLDivElement;
							if (panel) {
								panel.innerHTML = "";
								const header = document.createElement("div") as HTMLDivElement;
								header.style.position = "relative";
								header.style.height = "40px";
								const closeBtn = document.createElement("span") as HTMLSpanElement;
								closeBtn.textContent = "✕";
								closeBtn.style.position = "absolute";
								closeBtn.style.top = "10px";
								closeBtn.style.right = "10px";
								closeBtn.style.cursor = "pointer";
								closeBtn.style.fontSize = "20px";
								closeBtn.onclick = () => (panel.style.display = "none");
								header.appendChild(closeBtn);
								const toggle = document.createElement("div") as HTMLDivElement;
								toggle.style.position = "absolute";
								toggle.style.top = "10px";
								toggle.style.left = "10px";
								toggle.style.width = "30px";
								toggle.style.height = "30px";
								toggle.style.borderRadius = "5px";
								toggle.style.color = "#000000"
								toggle.style.background = "#f0f0f0";
								toggle.style.display = "flex";
								toggle.style.alignItems = "center";
								toggle.style.justifyContent = "center";
								toggle.style.cursor = "pointer";
								toggle.textContent = "👁️";
								let showImage = true;
								const imgDiv = document.createElement("div") as HTMLDivElement;
								const imgCopy = document.createElement("img") as HTMLImageElement;
								imgCopy.src = img.src;
								imgCopy.style.width = "100%";
								imgDiv.appendChild(imgCopy);
								const xmlDiv = document.createElement("div") as HTMLDivElement;
								const xmlLabel = document.createElement("h3") as HTMLHeadingElement;
								xmlLabel.textContent = "SVG XML";
								xmlDiv.appendChild(xmlLabel);
								const xmlPre = document.createElement("pre") as HTMLPreElement;
								xmlPre.textContent = svgCode;
								xmlPre.style.whiteSpace = "pre-wrap";
								xmlDiv.appendChild(xmlPre);
								const content = document.createElement("div") as HTMLDivElement;
								content.appendChild(imgDiv);
								toggle.onclick = () => {
									showImage = !showImage;
									toggle.textContent = showImage ? "👁️" : "</>";
									content.innerHTML = "";
									content.appendChild(showImage ? imgDiv : xmlDiv);
								};
								header.appendChild(toggle);
								panel.appendChild(header);
								panel.appendChild(content);
								panel.style.display = "block";
							}
						};
						botContainer.appendChild(img);
					} else {
						const codeBubble = document.createElement(
							"div",
						) as HTMLDivElement;
						codeBubble.className = "ai-code-bubble";

						const header = document.createElement(
							"div",
						) as HTMLDivElement;
						header.className = "ai-code-header";

						const langLabel = document.createElement(
							"span",
						) as HTMLSpanElement;
						langLabel.className = "ai-code-lang";
						langLabel.textContent = lang;

						const copyBtn = document.createElement(
							"button",
						) as HTMLButtonElement;
						copyBtn.className = "ai-copy-btn";
						copyBtn.textContent = "Copy";
						copyBtn.onclick = () => {
							navigator.clipboard.writeText(
								codeEl?.textContent || "",
							);
							copyBtn.textContent = "Copied!";
							setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
						};

						header.appendChild(langLabel);
						header.appendChild(copyBtn);
						codeBubble.appendChild(header);
						codeBubble.appendChild(preEl.cloneNode(true));
						botContainer.appendChild(codeBubble);
					}
				} else {
					botContainer.appendChild(node.cloneNode(true));
				}
			});

				const actions = buildMessageActions(msg, messageIndex);
				const versionNav = buildMessageVersionNav(msg, messageIndex);
				if (versionNav) {
					botContainer.appendChild(versionNav);
				}
				if (actions) {
					botContainer.appendChild(actions);
				}

				chatBox.appendChild(botContainer);
				continue;
			}

			if (msg.role === "image") {
				renderImageAssetFromContent(
					msg.content,
					chatBox,
					typeof msg.mimeType === "string" && msg.mimeType.trim()
						? msg.mimeType
						: "image/png",
				);
				continue;
			}

			if (msg.role === "video") {
				renderMediaAssetFromContent(
					"video",
					msg.content,
					chatBox,
					typeof msg.mimeType === "string" && msg.mimeType.trim()
						? msg.mimeType
						: "video/mp4",
				);
				continue;
			}

			if (msg.role === "audio") {
				renderMediaAssetFromContent(
					"audio",
					msg.content,
					chatBox,
					typeof msg.mimeType === "string" && msg.mimeType.trim()
						? msg.mimeType
						: "audio/mpeg",
				);
				continue;
			}

		if (msg.role === "tool") {
			const toolBubble = document.createElement("div");
			toolBubble.className = "chat-bubble tool-bubble";

			const header = document.createElement("div");
			header.className = "tool-header";
			const payload = safeParseJSON(msg.content);
			const status =
				payload && typeof payload === "object"
					? payload.status
					: "resolved";
			if (msg.name === "generate_image") {
				if (status === "awaiting_input") {
					header.textContent = "Image generation requested";
				} else if (status === "pending") {
					header.textContent = "Image generation in progress";
				} else if (status === "canceled") {
					header.textContent = "Image generation canceled";
				} else {
					header.textContent = "Generated image";
				}
			} else if (msg.name === "generate_video") {
				if (status === "awaiting_input") {
					header.textContent = "Video generation requested";
				} else if (status === "pending") {
					header.textContent = "Video generation in progress";
				} else if (status === "canceled") {
					header.textContent = "Video generation canceled";
				} else {
					header.textContent = "Generated video";
				}
			} else if (msg.name === "generate_audio") {
				if (status === "awaiting_input") {
					header.textContent = "Music/SFX generation requested";
				} else if (status === "pending") {
					header.textContent = "Music/SFX generation in progress";
				} else if (status === "canceled") {
					header.textContent = "Music/SFX generation canceled";
				} else {
					header.textContent = "Generated Music/SFX";
				}
			} else {
				header.textContent = `🔧 Tool: ${msg.name ?? "unknown"}`;
			}

			toolBubble.appendChild(header);

			if (msg.name === "generate_image") {
				const options = getImageOptionsFromToolMessage(msg);
				if (options) {
					const summary = createToolSummaryElement([
						["Prompt", options.prompt || "(none)"],
						["Mode", options.mode || IMAGE_MODE_OPTIONS[0]],
					]);

					if (options.image_urls?.length) {
						options.image_urls.forEach((item, i) => {
							summary.appendChild(
								createToolSummaryRow(
									`Image ${i + 1}`,
									createCopyableToolValueElement(item, 100),
								),
							);
						});
					} else {
						summary.appendChild(createToolSummaryRow("Images", "None"));
					}

					toolBubble.appendChild(summary);
				}
			}

			if (msg.name === "generate_video") {
				const options = getVideoOptionsFromToolMessage(msg);
				if (options) {
					const summary = createToolSummaryElement([
						["Prompt", options.prompt || "(none)"],
						["Ratio", options.ratio || VIDEO_RATIO_OPTIONS[0]],
						["Mode", options.mode || VIDEO_MODE_OPTIONS[0]],
						[
							"Duration",
							`${options.duration ?? DEFAULT_VIDEO_DURATION}s`,
						],
					]);

					if (options.image_urls?.length) {
						options.image_urls.forEach((item, i) => {
							summary.appendChild(
								createToolSummaryRow(
									`Image ${i + 1}`,
									createCopyableToolValueElement(item, 100),
								),
							);
						});
					} else {
						summary.appendChild(createToolSummaryRow("Images", "None"));
					}

					toolBubble.appendChild(summary);
				}
			}

			if (msg.name === "generate_audio") {
				const options = getAudioOptionsFromToolMessage(msg);
				if (options) {
					toolBubble.appendChild(
						createToolSummaryElement([
							["Prompt", options.prompt || "(none)"],
						]),
					);
				}
			}

			chatBox.appendChild(toolBubble);
			continue;
		}

		console.warn("Unknown message role:", msg.role, msg);
	};

	renderMathInElement(document.body, {
		delimiters: [
			{ left: "$$", right: "$$", display: true },
			{ left: "$", right: "$", display: false },
			{ left: "\\(", right: "\\)", display: false },
			{ left: "\\[", right: "\\]", display: true },
		],
		throwOnError: false,
	});

	document.querySelectorAll("pre code").forEach(() => void 0);

	if (autoScroll) {
		chatBox.scrollTop = chatBox.scrollHeight;
	}
}

function createImageAssetBubble(dataUrl: string): HTMLDivElement {
	const botContainer = document.createElement("div");
	botContainer.className = "chat-bubble image-bubble";

	const imageWrapper = document.createElement("div");
	imageWrapper.className = "image-wrapper";

	const img = document.createElement("img");
	img.src = dataUrl;
	img.alt = "Generated image";

	const downloadBtn = document.createElement("button");
	downloadBtn.className = "image-download-btn";
	downloadBtn.textContent = "Download";
	downloadBtn.onclick = () => {
		const a = document.createElement("a");
		a.href = dataUrl;
		a.download = `image-${Date.now()}.png`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	};

	imageWrapper.appendChild(img);
	imageWrapper.appendChild(downloadBtn);
	botContainer.appendChild(imageWrapper);
	return botContainer;
}

function createVideoAssetBubble(dataUrl: string): HTMLDivElement {
	const botContainer = document.createElement("div");
	botContainer.className = "chat-bubble image-bubble";

	const video = document.createElement("video");
	video.controls = true;
	video.src = dataUrl;
	video.preload = "metadata";
	video.style.width = "100%";
	video.style.borderRadius = "8px";

	const downloadBtn = document.createElement("button");
	downloadBtn.className = "image-download-btn";
	downloadBtn.textContent = "Download";
	downloadBtn.onclick = () => {
		const a = document.createElement("a");
		a.href = dataUrl;
		a.download = `video-${Date.now()}.mp4`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	};

	botContainer.appendChild(video);
	botContainer.appendChild(downloadBtn);
	return botContainer;
}

function createAudioAssetBubble(dataUrl: string): HTMLDivElement {
	const botContainer = document.createElement("div");
	botContainer.className = "chat-bubble image-bubble";

	const audio = document.createElement("audio");
	audio.controls = true;
	audio.src = dataUrl;
	audio.preload = "metadata";
	audio.style.width = "100%";

	const downloadBtn = document.createElement("button");
	downloadBtn.className = "image-download-btn";
	downloadBtn.textContent = "Download";
	downloadBtn.onclick = () => {
		const a = document.createElement("a");
		a.href = dataUrl;
		a.download = `audio-${Date.now()}.mp3`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	};

	botContainer.appendChild(audio);
	botContainer.appendChild(downloadBtn);
	return botContainer;
}

function isInlineMediaUrl(content: string): boolean {
	return (
		content.startsWith("data:") ||
		content.startsWith("blob:") ||
		content.startsWith("http://") ||
		content.startsWith("https://")
	);
}

function resolveMediaContentRef(content: unknown): {
	inlineUrl: string | null;
	assetId: string | null;
	mimeType?: string;
	name?: string;
} {
	if (typeof content === "string") {
		const value = content.trim();
		if (!value) return { inlineUrl: null, assetId: null };
		if (isInlineMediaUrl(value)) return { inlineUrl: value, assetId: null };
		return { inlineUrl: null, assetId: value };
	}
	if (content && typeof content === "object") {
		const record = content as Record<string, unknown>;
		const src = typeof record.src === "string" ? record.src.trim() : "";
		if (src && isInlineMediaUrl(src)) {
			return {
				inlineUrl: src,
				assetId: null,
				mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
				name: typeof record.name === "string" ? record.name : undefined,
			};
		}
		const assetId =
			typeof record.assetId === "string"
				? record.assetId.trim()
				: typeof record.id === "string"
					? record.id.trim()
					: "";
		return {
			inlineUrl: null,
			assetId: assetId || null,
			mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
			name: typeof record.name === "string" ? record.name : undefined,
		};
	}
	return { inlineUrl: null, assetId: null };
}

function createCrossClientMediaNoticeBubble(
	role: "image" | "video" | "audio",
): HTMLDivElement {
	const bubble = document.createElement("div");
	bubble.className = "chat-bubble tool-bubble";
	if (role === "video") {
		bubble.innerHTML =
			"Video generation is not synced between desktop and web yet. View this video in the original app or website where it was generated.";
	} else if (role === "audio") {
		bubble.innerHTML =
			"Audio generation is not synced between desktop and web yet. View this audio in the original app or website where it was generated.";
	} else {
		bubble.innerHTML =
			"This image could not be loaded here. It may have been generated while signed out or saved only in another client. Open it where it was originally generated.";
	}
	return bubble;
}

async function getAssetObjectUrl(
	assetId: string,
	mimeType: string,
): Promise<string> {
	const cacheKey = `${mimeType}:${assetId}`;
	if (assetObjectUrlCache.has(cacheKey)) {
		return assetObjectUrlCache.get(cacheKey)!;
	}

	const rawBuffer = await window.utils.getAsset(assetId);

	const uint8 =
		rawBuffer instanceof Uint8Array ? rawBuffer : new Uint8Array(rawBuffer);

	const typedBlob = new Blob([uint8], { type: mimeType });

	const objectUrl = URL.createObjectURL(typedBlob);
	assetObjectUrlCache.set(cacheKey, objectUrl);
	return objectUrl;
}

function renderImageAssetFromContent(
	content: unknown,
	chatBox: HTMLDivElement,
	mimeType = "image/png",
): void {
	const ref = resolveMediaContentRef(content);
	if (ref.inlineUrl) {
		chatBox.appendChild(createImageAssetBubble(ref.inlineUrl));
		return;
	}
	if (!ref.assetId) {
		chatBox.appendChild(createCrossClientMediaNoticeBubble("image"));
		return;
	}

	const loadingBubble = document.createElement("div");
	loadingBubble.className = "chat-bubble tool-bubble";
	loadingBubble.textContent = "Loading image asset...";
	chatBox.appendChild(loadingBubble);

	void getAssetObjectUrl(ref.assetId, ref.mimeType || mimeType)
		.then((objectUrl) => {
			const imageBubble = createImageAssetBubble(objectUrl);
			loadingBubble.replaceWith(imageBubble);
			if (autoScroll) chatBox.scrollTop = chatBox.scrollHeight;
		})
		.catch((err) => {
			loadingBubble.replaceWith(createCrossClientMediaNoticeBubble("image"));
		});
}

function renderMediaAssetFromContent(
	role: "video" | "audio",
	content: unknown,
	chatBox: HTMLDivElement,
	mimeType?: string,
): void {
	const ref = resolveMediaContentRef(content);
	if (ref.inlineUrl) {
		chatBox.appendChild(
			role === "video"
				? createVideoAssetBubble(ref.inlineUrl)
				: createAudioAssetBubble(ref.inlineUrl),
		);
		return;
	}
	if (!ref.assetId) {
		chatBox.appendChild(createCrossClientMediaNoticeBubble(role));
		return;
	}

	const loadingBubble = document.createElement("div");
	loadingBubble.className = "chat-bubble tool-bubble";
	loadingBubble.textContent = `Loading ${role} asset...`;
	chatBox.appendChild(loadingBubble);

	const fallbackMimeType = role === "video" ? "video/mp4" : "audio/mpeg";
	void getAssetObjectUrl(ref.assetId, ref.mimeType || mimeType || fallbackMimeType)
		.then((objectUrl) => {
			const mediaBubble =
				role === "video"
					? createVideoAssetBubble(objectUrl)
					: createAudioAssetBubble(objectUrl);
			loadingBubble.replaceWith(mediaBubble);
			if (autoScroll) chatBox.scrollTop = chatBox.scrollHeight;
		})
		.catch((err) => {
			loadingBubble.replaceWith(createCrossClientMediaNoticeBubble(role));
		});
}

function renderAsset(
	role: "image" | "video" | "audio",
	content: string,
	mimeType?: string,
) {
	const chatBox = document.getElementById("chat-box");
	if (!chatBox) return;

	if (role === "image") {
		renderImageAssetFromContent(content, chatBox, mimeType || "image/png");
	} else {
		renderMediaAssetFromContent(role, content, chatBox, mimeType);
	}

	if (autoScroll) {
		chatBox.scrollTop = chatBox.scrollHeight;
	}
}

function safeParseJSON(value: unknown): any | null {
	if (typeof value !== "string") return null;
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function fileToDataUri(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ""));
		reader.onerror = () =>
			reject(reader.error || new Error("Failed to read image file"));
		reader.readAsDataURL(file);
	});
}

function attachAutoImageUpload(
	fieldWrapper: HTMLLabelElement,
	targetInput: HTMLInputElement,
): void {
	const hiddenFileInput = document.createElement("input");
	hiddenFileInput.type = "file";
	hiddenFileInput.accept = "image/*";
	hiddenFileInput.className = "tool-hidden-file-input";

	const hint = document.createElement("div");
	hint.className = "video-tool-upload-hint";
	const renderDefaultHint = () => {
		hint.textContent = "Paste URL/data URI or ";
		const link = document.createElement("a");
		link.href = "#";
		link.className = "video-tool-upload-link";
		link.textContent = "click here to upload";
		link.addEventListener("click", (event) => {
			event.preventDefault();
			if (targetInput.disabled || hiddenFileInput.disabled) return;
			hiddenFileInput.click();
		});
		hint.appendChild(link);
	};
	renderDefaultHint();

	const setFromFile = async (file: File): Promise<void> => {
		if (!file.type.startsWith("image/")) {
			hint.textContent = "Only image files are supported.";
			return;
		}

		hint.textContent = "Converting image...";
		try {
			targetInput.value = await fileToDataUri(file);
			hint.textContent = `Uploaded: ${file.name}`;
		} catch (err: any) {
			hint.textContent = `Upload failed: ${String(err)}`;
		}
	};

	fieldWrapper.appendChild(hiddenFileInput);
	fieldWrapper.appendChild(hint);

	hiddenFileInput.addEventListener("change", async () => {
		const file = hiddenFileInput.files?.[0];
		if (!file) return;
		await setFromFile(file);
		hiddenFileInput.value = "";
	});

	targetInput.addEventListener("input", () => {
		if (targetInput.value.trim().length) {
			hint.textContent = "Using provided URL/data URI.";
			return;
		}
		renderDefaultHint();
	});

	targetInput.addEventListener("paste", async (event: ClipboardEvent) => {
		const items = Array.from(event.clipboardData?.items ?? []);
		const imageItem = items.find(
			(item) => item.kind === "file" && item.type.startsWith("image/"),
		);
		const file = imageItem?.getAsFile();
		if (!file) return;
		event.preventDefault();
		await setFromFile(file);
	});

	targetInput.addEventListener("dragover", (event) => {
		event.preventDefault();
	});

	targetInput.addEventListener("drop", async (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files?.[0];
		if (!file) return;
		await setFromFile(file);
	});
}

function isAcceptableImageUrl(url: string): boolean {
	return (
		url.startsWith("http://") ||
		url.startsWith("https://") ||
		url.startsWith("data:image/") ||
		url.startsWith("blob:")
	);
}

function normalizeImageOptions(raw: unknown, source: "model" | "user") {
	const obj = raw && typeof raw === "object" ? raw : {};
	const prompt = typeof obj.prompt === "string" ? obj.prompt.trim() : "";
	const mode = IMAGE_MODE_OPTIONS.includes(obj.mode)
		? obj.mode
		: IMAGE_MODE_OPTIONS[0];
	const image_urls =
		source === "user" && Array.isArray(obj.image_urls)
			? obj.image_urls
					.filter((url) => typeof url === "string")
					.map((url) => url.trim())
					.filter((url) => url.length > 0 && isAcceptableImageUrl(url))
					.slice(0, 4)
			: [];
	return { prompt, mode, image_urls };
}

function normalizeAudioOptions(raw: unknown) {
	const obj = raw && typeof raw === "object" ? raw : {};
	const prompt = typeof obj.prompt === "string" ? obj.prompt.trim() : "";
	console.log("PROMPT:", prompt);
	return { prompt };
}

function normalizeVideoOptions(raw: unknown, source: "model" | "user") {
	const obj = raw && typeof raw === "object" ? raw : {};
	const prompt = typeof obj.prompt === "string" ? obj.prompt.trim() : "";
	const ratio = VIDEO_RATIO_OPTIONS.includes(obj.ratio)
		? obj.ratio
		: VIDEO_RATIO_OPTIONS[0];
	const mode = VIDEO_MODE_OPTIONS.includes(obj.mode)
		? obj.mode
		: VIDEO_MODE_OPTIONS[0];

	let duration = DEFAULT_VIDEO_DURATION;
	if (typeof obj.duration === "number" && Number.isFinite(obj.duration)) {
		duration = Math.round(obj.duration);
	} else if (
		typeof obj.duration === "string" &&
		obj.duration.trim().length > 0 &&
		!Number.isNaN(Number(obj.duration))
	) {
		duration = Math.round(Number(obj.duration));
	}
	duration = Math.min(30, Math.max(1, duration));

	const image_urls =
		source === "user" && Array.isArray(obj.image_urls)
			? obj.image_urls
					.filter((url) => typeof url === "string")
					.map((url) => url.trim())
					.filter((url) => url.length > 0 && isAcceptableImageUrl(url))
					.slice(0, 2)
			: [];

	return {
		prompt,
		ratio,
		mode,
		duration,
		image_urls,
	};
}

function getVideoOptionsFromToolCall(call: any) {
	const source = call?.state === "awaiting_input" ? "model" : "user";
	const toolOptions = normalizeVideoOptions(call?.tool_options, source);
	if (toolOptions.prompt) return toolOptions;
	return normalizeVideoOptions(safeParseJSON(call?.arguments), source);
}

function getImageOptionsFromToolCall(call: any) {
	const source = call?.state === "awaiting_input" ? "model" : "user";
	const toolOptions = normalizeImageOptions(call?.tool_options, source);
	if (toolOptions.prompt) return toolOptions;
	return normalizeImageOptions(safeParseJSON(call?.arguments), source);
}

function getAudioOptionsFromToolCall(call: any) {
	const toolOptions = normalizeAudioOptions(call?.tool_options);
	if (toolOptions.prompt) return toolOptions;
	return normalizeAudioOptions(safeParseJSON(call?.arguments));
}

function getAudioOptionsFromToolMessage(call: any) {
	const payload = safeParseJSON(call?.content);
	if (payload && typeof payload === "object" && payload.options) {
		return normalizeAudioOptions(payload.options);
	}
	return null;
}

function getVideoOptionsFromToolMessage(msg: any) {
	const payload = safeParseJSON(msg?.content);
	if (payload && typeof payload === "object" && payload.options) {
		const source = payload.status === "awaiting_input" ? "model" : "user";
		return normalizeVideoOptions(payload.options, source);
	}
	return null;
}

function getImageOptionsFromToolMessage(msg: any) {
	const payload = safeParseJSON(msg?.content);
	if (payload && typeof payload === "object" && payload.options) {
		const source = payload.status === "awaiting_input" ? "model" : "user";
		return normalizeImageOptions(payload.options, source);
	}
	return null;
}

function upsertToolHistoryEntry(
	session: any,
	call: any,
	content: string,
): void {
	const existing = getSessionFlatHistory(session, findSessionIdByRef(session) || undefined).find(
		(msg: any) => msg.role === "tool" && msg.tool_call_id === call.id,
	);
	if (existing) {
		existing.content = content;
		existing.name = call.name;
		return;
	}
	const root = ensureSessionHistoryRoot(session);
	const sessionId = findSessionIdByRef(session);
	const toolEntry = {
		id: `tool-${call.id}`,
		timestamp: Date.now(),
		role: "tool",
		tool_call_id: call.id,
		name: call.name,
		content,
	};
	if (!root) {
		setSessionHistoryRoot(session, ensureMessageVersioningShape(toolEntry), sessionId || undefined);
		return;
	}
	const nextRoot = cloneAndRepairTree(root);
	appendEntriesToActiveLeaf(nextRoot, [toolEntry]);
	setSessionHistoryRoot(session, nextRoot, sessionId || undefined);
}

function setVideoBubbleControlsDisabled(
	bubble: HTMLDivElement,
	disabled: boolean,
): void {
	bubble.querySelectorAll("textarea,select,input,button").forEach((el) => {
		(
			el as
				| HTMLButtonElement
				| HTMLInputElement
				| HTMLTextAreaElement
				| HTMLSelectElement
		).disabled = disabled;
	});
}

function applyVideoOptionsToBubble(bubble: HTMLDivElement, options: any): void {
	const promptEl = bubble.querySelector(
		'[data-video-field="prompt"]',
	) as HTMLTextAreaElement | null;
	const ratioEl = bubble.querySelector(
		'[data-video-field="ratio"]',
	) as HTMLSelectElement | null;
	const modeEl = bubble.querySelector(
		'[data-video-field="mode"]',
	) as HTMLSelectElement | null;
	const durationEl = bubble.querySelector(
		'[data-video-field="duration"]',
	) as HTMLInputElement | null;
	const image1El = bubble.querySelector(
		'[data-video-field="image-1"]',
	) as HTMLInputElement | null;
	const image2El = bubble.querySelector(
		'[data-video-field="image-2"]',
	) as HTMLInputElement | null;

	if (promptEl) promptEl.value = options.prompt || "";
	if (ratioEl) ratioEl.value = options.ratio || VIDEO_RATIO_OPTIONS[0];
	if (modeEl) modeEl.value = options.mode || VIDEO_MODE_OPTIONS[0];
	if (durationEl)
		durationEl.value = String(options.duration ?? DEFAULT_VIDEO_DURATION);
	if (image1El) image1El.value = options.image_urls?.[0] || "";
	if (image2El) image2El.value = options.image_urls?.[1] || "";
}

function collectVideoOptionsFromBubble(bubble: HTMLDivElement) {
	const promptEl = bubble.querySelector(
		'[data-video-field="prompt"]',
	) as HTMLTextAreaElement | null;
	const ratioEl = bubble.querySelector(
		'[data-video-field="ratio"]',
	) as HTMLSelectElement | null;
	const modeEl = bubble.querySelector(
		'[data-video-field="mode"]',
	) as HTMLSelectElement | null;
	const durationEl = bubble.querySelector(
		'[data-video-field="duration"]',
	) as HTMLInputElement | null;
	const image1El = bubble.querySelector(
		'[data-video-field="image-1"]',
	) as HTMLInputElement | null;
	const image2El = bubble.querySelector(
		'[data-video-field="image-2"]',
	) as HTMLInputElement | null;

	const options = normalizeVideoOptions(
		{
			prompt: promptEl?.value ?? "",
			ratio: ratioEl?.value ?? VIDEO_RATIO_OPTIONS[0],
			mode: modeEl?.value ?? VIDEO_MODE_OPTIONS[0],
			duration: durationEl?.value ?? DEFAULT_VIDEO_DURATION,
			image_urls: [image1El?.value ?? "", image2El?.value ?? ""],
		},
		"user",
	);

	return options;
}

function applyImageOptionsToBubble(bubble: HTMLDivElement, options: any): void {
	const promptEl = bubble.querySelector(
		'[data-image-field="prompt"]',
	) as HTMLTextAreaElement | null;
	const modeEl = bubble.querySelector(
		'[data-image-field="mode"]',
	) as HTMLSelectElement | null;
	const image1El = bubble.querySelector(
		'[data-image-field="image-1"]',
	) as HTMLInputElement | null;
	const image2El = bubble.querySelector(
		'[data-image-field="image-2"]',
	) as HTMLInputElement | null;
	const image3El = bubble.querySelector(
		'[data-image-field="image-3"]',
	) as HTMLInputElement | null;
	const image4El = bubble.querySelector(
		'[data-image-field="image-4"]',
	) as HTMLInputElement | null;
	if (promptEl) promptEl.value = options.prompt || "";
	if (modeEl) modeEl.value = options.mode || IMAGE_MODE_OPTIONS[0];
	if (image1El) image1El.value = options.image_urls?.[0] || "";
	if (image2El) image2El.value = options.image_urls?.[1] || "";
	if (image3El) image3El.value = options.image_urls?.[2] || "";
	if (image4El) image4El.value = options.image_urls?.[3] || "";
}

function collectImageOptionsFromBubble(bubble: HTMLDivElement) {
	const promptEl = bubble.querySelector(
		'[data-image-field="prompt"]',
	) as HTMLTextAreaElement | null;
	const modeEl = bubble.querySelector(
		'[data-image-field="mode"]',
	) as HTMLSelectElement | null;
	const image1El = bubble.querySelector(
		'[data-image-field="image-1"]',
	) as HTMLInputElement | null;
	const image2El = bubble.querySelector(
		'[data-image-field="image-2"]',
	) as HTMLInputElement | null;
	const image3El = bubble.querySelector(
		'[data-image-field="image-3"]',
	) as HTMLInputElement | null;
	const image4El = bubble.querySelector(
		'[data-image-field="image-4"]',
	) as HTMLInputElement | null;
	return normalizeImageOptions(
		{
			prompt: promptEl?.value ?? "",
			mode: modeEl?.value ?? IMAGE_MODE_OPTIONS[0],
			image_urls: [
				image1El?.value ?? "",
				image2El?.value ?? "",
				image3El?.value ?? "",
				image4El?.value ?? "",
			],
		},
		"user",
	);
}

function applyAudioOptionsToBubble(bubble: HTMLDivElement, options: any): void {
	const promptEl = bubble.querySelector(
		'[data-audio-field="prompt"]',
	) as HTMLTextAreaElement | null;
	if (promptEl) promptEl.value = options.prompt || "";
}

function collectAudioOptionsFromBubble(bubble: HTMLDivElement) {
	const promptEl = bubble.querySelector(
		'[data-audio-field="prompt"]',
	) as HTMLTextAreaElement | null;
	return normalizeAudioOptions({
		prompt: promptEl?.value ?? "",
	});
}

function setVideoBubbleStatus(
	bubble: HTMLDivElement,
	statusText: string,
	isError = false,
): void {
	const statusEl = bubble.querySelector(
		".video-tool-status",
	) as HTMLDivElement | null;
	if (!statusEl) return;
	statusEl.textContent = statusText;
	statusEl.classList.toggle("error", isError);
}

function setLiveToolBubbleState(
	toolCallId: string,
	toolName: string,
	state: string,
	result?: string,
): void {
	const bubble = liveToolBubbles.get(toolCallId);
	if (!bubble) return;

	const label =
		toolName === "generate_image"
			? "Image"
			: toolName === "generate_audio"
				? "Music/SFX"
				: "Video";

	if (state === "awaiting_input") {
		setVideoBubbleControlsDisabled(bubble, false);
		if (toolName === "generate_image") {
			setVideoBubbleStatus(bubble, "Review options, optionally upload images, then generate.");
			return;
		}
		if (toolName === "generate_audio") {
			setVideoBubbleStatus(bubble, "Review prompt, then generate.");
			return;
		}
		setVideoBubbleStatus(
			bubble,
			"Review options, optionally upload images, then generate.",
		);
		return;
	}

	if (state === "pending") {
		setVideoBubbleControlsDisabled(bubble, true);
		setVideoBubbleStatus(bubble, `Generating ${label.toLowerCase()}...`);
		return;
	}

	if (state === "resolved") {
		setVideoBubbleControlsDisabled(bubble, true);
		setVideoBubbleStatus(bubble, result || `${label} generated.`);
		return;
	}

	if (state === "canceled") {
		setVideoBubbleControlsDisabled(bubble, true);
		setVideoBubbleStatus(bubble, result || `${label} generation canceled.`);
		return;
	}

	setVideoBubbleControlsDisabled(bubble, true);
	setVideoBubbleStatus(bubble, result || `${label} tool request finished.`);
}

function createOptionSummaryElement(options: any): HTMLDivElement {
	const summary = document.createElement("div");
	summary.className = "video-tool-summary";

	const rows: Array<[string, string]> = [
		["Prompt", options.prompt || "(none)"],
		["Ratio", options.ratio || VIDEO_RATIO_OPTIONS[0]],
		["Mode", options.mode || VIDEO_MODE_OPTIONS[0]],
		["Duration", `${options.duration ?? DEFAULT_VIDEO_DURATION}s`],
		[
			"Image URLs",
			options.image_urls?.length ? options.image_urls.join("\n") : "None",
		],
	];

	for (const [label, value] of rows) {
		const row = document.createElement("div");
		row.className = "video-tool-summary-row";

		const labelEl = document.createElement("span");
		labelEl.className = "video-tool-label";
		labelEl.textContent = label;

		const valueEl = document.createElement("span");
		valueEl.className = "video-tool-value";
		valueEl.textContent = value;

		row.appendChild(labelEl);
		row.appendChild(valueEl);
		summary.appendChild(row);
	}

	return summary;
}

function createToolSummaryElement(
	rows: Array<[string, string | HTMLElement]>,
): HTMLDivElement {
	const summary = document.createElement("div");
	summary.className = "video-tool-summary";

	for (const [label, value] of rows) {
		summary.appendChild(createToolSummaryRow(label, value));
	}

	return summary;
}

function createToolSummaryRow(
	label: string,
	value: string | HTMLElement,
): HTMLDivElement {
	const row = document.createElement("div");
	row.className = "video-tool-summary-row";

	const labelEl = document.createElement("span");
	labelEl.className = "video-tool-label";
	labelEl.textContent = label;

	const valueEl = document.createElement("span");
	valueEl.className = "video-tool-value";
	if (typeof value === "string") {
		valueEl.textContent = value;
	} else {
		valueEl.appendChild(value);
	}

	row.appendChild(labelEl);
	row.appendChild(valueEl);
	return row;
}

function truncateToolValue(value: string, maxChars = 100): string {
	if (value.length <= maxChars) return value;
	return `${value.slice(0, maxChars)}...`;
}

function createCopyableToolValueElement(
	value: string,
	maxChars = 100,
): HTMLDivElement {
	const wrapper = document.createElement("div");
	wrapper.className = "video-tool-copyable";

	const text = document.createElement("span");
	text.className = "video-tool-copyable-text";
	text.textContent = truncateToolValue(value, maxChars);
	// Avoid huge titles (e.g., data URIs) that can bog down the DOM/tooltip.
	text.title = value.length <= 2048 ? value : `${value.slice(0, 2048)}...`;

	const copyBtn = document.createElement("button");
	copyBtn.type = "button";
	copyBtn.className = "video-tool-copy-btn";
	copyBtn.textContent = "Copy";

	copyBtn.addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(value);
			copyBtn.textContent = "Copied";
			setTimeout(() => {
				copyBtn.textContent = "Copy";
			}, 1200);
		} catch {
			copyBtn.textContent = "Error";
			setTimeout(() => {
				copyBtn.textContent = "Copy";
			}, 1200);
		}
	});

	wrapper.appendChild(text);
	wrapper.appendChild(copyBtn);
	return wrapper;
}

function createLiveVideoToolBubble(
	toolCallId: string,
	options: any,
): HTMLDivElement {
	const bubble = document.createElement("div");
	bubble.className = "chat-bubble tool-bubble video-tool-bubble";
	bubble.setAttribute("data-tool-call-id", toolCallId);

	const header = document.createElement("div");
	header.className = "tool-header";
	header.textContent = "Video Generation Request";

	const status = document.createElement("div");
	status.className = "video-tool-status";
	status.textContent =
		"Review options, add image URLs if needed, then generate.";

	const promptLabel = document.createElement("label");
	promptLabel.className = "video-tool-field";
	promptLabel.textContent = "Prompt";

	const promptInput = document.createElement("textarea");
	promptInput.className = "video-tool-input";
	promptInput.setAttribute("data-video-field", "prompt");
	promptInput.rows = 2;

	const optionRow = document.createElement("div");
	optionRow.className = "video-tool-grid";

	const ratioWrap = document.createElement("label");
	ratioWrap.className = "video-tool-field";
	ratioWrap.textContent = "Ratio";
	const ratioSelect = document.createElement("select");
	ratioSelect.className = "video-tool-input";
	ratioSelect.setAttribute("data-video-field", "ratio");
	for (const ratio of VIDEO_RATIO_OPTIONS) {
		const opt = document.createElement("option");
		opt.value = ratio;
		opt.textContent = ratio;
		ratioSelect.appendChild(opt);
	}
	ratioWrap.appendChild(ratioSelect);

	const modeWrap = document.createElement("label");
	modeWrap.className = "video-tool-field";
	modeWrap.textContent = "Mode";
	const modeSelect = document.createElement("select");
	modeSelect.className = "video-tool-input";
	modeSelect.setAttribute("data-video-field", "mode");
	for (const mode of VIDEO_MODE_OPTIONS) {
		const opt = document.createElement("option");
		opt.value = mode;
		opt.textContent = mode;
		modeSelect.appendChild(opt);
	}
	modeWrap.appendChild(modeSelect);

	const durationWrap = document.createElement("label");
	durationWrap.className = "video-tool-field";
	durationWrap.textContent = "Duration (s)";
	const durationInput = document.createElement("input");
	durationInput.className = "video-tool-input";
	durationInput.type = "number";
	durationInput.min = "1";
	durationInput.max = "30";
	durationInput.step = "1";
	durationInput.setAttribute("data-video-field", "duration");
	durationWrap.appendChild(durationInput);

	optionRow.appendChild(ratioWrap);
	optionRow.appendChild(modeWrap);
	optionRow.appendChild(durationWrap);

	const imageGrid = document.createElement("div");
	imageGrid.className = "video-tool-grid video-tool-images";

	const image1Wrap = document.createElement("label");
	image1Wrap.className = "video-tool-field";
	image1Wrap.textContent = "Image 1";
	const image1Input = document.createElement("input");
	image1Input.className = "video-tool-input";
	image1Input.type = "text";
	image1Input.placeholder = "https://... or data URI";
	image1Input.setAttribute("data-video-field", "image-1");
	image1Wrap.appendChild(image1Input);
	attachAutoImageUpload(image1Wrap, image1Input);

	const image2Wrap = document.createElement("label");
	image2Wrap.className = "video-tool-field";
	image2Wrap.textContent = "Image 2";
	const image2Input = document.createElement("input");
	image2Input.className = "video-tool-input";
	image2Input.type = "text";
	image2Input.placeholder = "https://... or data URI";
	image2Input.setAttribute("data-video-field", "image-2");
	image2Wrap.appendChild(image2Input);
	attachAutoImageUpload(image2Wrap, image2Input);

	imageGrid.appendChild(image1Wrap);
	imageGrid.appendChild(image2Wrap);

	const actions = document.createElement("div");
	actions.className = "video-tool-actions";

	const generateBtn = document.createElement("button");
	generateBtn.type = "button";
	generateBtn.className = "video-tool-btn primary";
	generateBtn.textContent = "Generate";

	const cancelBtn = document.createElement("button");
	cancelBtn.type = "button";
	cancelBtn.className = "video-tool-btn";
	cancelBtn.textContent = "Cancel";

	generateBtn.addEventListener("click", async () => {
		const selectedOptions = collectVideoOptionsFromBubble(bubble);
		if (!selectedOptions.prompt) {
			setVideoBubbleStatus(bubble, "Prompt is required.", true);
			return;
		}
		if (!enforceLimit("videosDaily")) {
			setVideoBubbleStatus(
				bubble,
				"Video limit reached for your current plan.",
				true,
			);
			return;
		}

		setVideoBubbleControlsDisabled(bubble, true);
		setVideoBubbleStatus(bubble, "Submitting video options...");
		try {
			const accepted = await window.ollama.resolveVideoToolCall(
				toolCallId,
				selectedOptions,
			);
			if (!accepted) {
				setVideoBubbleControlsDisabled(bubble, false);
				setVideoBubbleStatus(
					bubble,
					"Request expired. Try again with a new prompt.",
					true,
				);
				return;
			}
			setVideoBubbleStatus(bubble, "Generating video...");
		} catch (err: any) {
			setVideoBubbleControlsDisabled(bubble, false);
			setVideoBubbleStatus(
				bubble,
				`Failed to submit options: ${String(err)}`,
				true,
			);
		}
	});

	cancelBtn.addEventListener("click", async () => {
		setVideoBubbleControlsDisabled(bubble, true);
		setVideoBubbleStatus(bubble, "Canceling video request...");
		try {
			const accepted = await window.ollama.resolveVideoToolCall(
				toolCallId,
				null,
			);
			if (!accepted) {
				setVideoBubbleStatus(
					bubble,
					"Request expired. Try again with a new prompt.",
					true,
				);
				return;
			}
			setVideoBubbleStatus(bubble, "Video generation canceled.");
		} catch (err: any) {
			setVideoBubbleControlsDisabled(bubble, false);
			setVideoBubbleStatus(
				bubble,
				`Failed to cancel request: ${String(err)}`,
				true,
			);
		}
	});

	actions.appendChild(generateBtn);
	actions.appendChild(cancelBtn);

	promptLabel.appendChild(promptInput);

	bubble.appendChild(header);
	bubble.appendChild(status);
	bubble.appendChild(promptLabel);
	bubble.appendChild(optionRow);
	bubble.appendChild(imageGrid);
	bubble.appendChild(actions);

	applyVideoOptionsToBubble(bubble, options);
	return bubble;
}

function createLiveImageToolBubble(
	toolCallId: string,
	options: any,
): HTMLDivElement {
	const bubble = document.createElement("div");
	bubble.className = "chat-bubble tool-bubble video-tool-bubble";
	bubble.setAttribute("data-tool-call-id", toolCallId);

	const header = document.createElement("div");
	header.className = "tool-header";
	header.textContent = "Image Generation Request";

	const status = document.createElement("div");
	status.className = "video-tool-status";
	status.textContent = "Review options, optionally upload images, then generate.";

	const promptLabel = document.createElement("label");
	promptLabel.className = "video-tool-field";
	promptLabel.textContent = "Prompt";
	const promptInput = document.createElement("textarea");
	promptInput.className = "video-tool-input";
	promptInput.setAttribute("data-image-field", "prompt");
	promptInput.rows = 2;
	promptLabel.appendChild(promptInput);

	const modeLabel = document.createElement("label");
	modeLabel.className = "video-tool-field";
	modeLabel.textContent = "Mode";
	const modeSelect = document.createElement("select");
	modeSelect.className = "video-tool-input";
	modeSelect.setAttribute("data-image-field", "mode");
	for (const mode of IMAGE_MODE_OPTIONS) {
		const opt = document.createElement("option");
		opt.value = mode;
		opt.textContent = mode;
		modeSelect.appendChild(opt);
	}
	modeLabel.appendChild(modeSelect);

	const imageGrid = document.createElement("div");
	imageGrid.className = "video-tool-grid video-tool-images";

	const image1Wrap = document.createElement("label");
	image1Wrap.className = "video-tool-field";
	image1Wrap.textContent = "Image 1";
	const image1Input = document.createElement("input");
	image1Input.className = "video-tool-input";
	image1Input.type = "text";
	image1Input.placeholder = "https://... or data URI";
	image1Input.setAttribute("data-image-field", "image-1");
	image1Wrap.appendChild(image1Input);
	attachAutoImageUpload(image1Wrap, image1Input);

	const image2Wrap = document.createElement("label");
	image2Wrap.className = "video-tool-field";
	image2Wrap.textContent = "Image 2";
	const image2Input = document.createElement("input");
	image2Input.className = "video-tool-input";
	image2Input.type = "text";
	image2Input.placeholder = "https://... or data URI";
	image2Input.setAttribute("data-image-field", "image-2");
	image2Wrap.appendChild(image2Input);
	attachAutoImageUpload(image2Wrap, image2Input);

	const image3Wrap = document.createElement("label");
	image3Wrap.className = "video-tool-field";
	image3Wrap.textContent = "Image 3";
	const image3Input = document.createElement("input");
	image3Input.className = "video-tool-input";
	image3Input.type = "text";
	image3Input.placeholder = "https://... or data URI";
	image3Input.setAttribute("data-image-field", "image-3");
	image3Wrap.appendChild(image3Input);
	attachAutoImageUpload(image3Wrap, image3Input);

	const image4Wrap = document.createElement("label");
	image4Wrap.className = "video-tool-field";
	image4Wrap.textContent = "Image 4";
	const image4Input = document.createElement("input");
	image4Input.className = "video-tool-input";
	image4Input.type = "text";
	image4Input.placeholder = "https://... or data URI";
	image4Input.setAttribute("data-image-field", "image-4");
	image4Wrap.appendChild(image4Input);
	attachAutoImageUpload(image4Wrap, image4Input);

	imageGrid.appendChild(image1Wrap);
	imageGrid.appendChild(image2Wrap);
	imageGrid.appendChild(image3Wrap);
	imageGrid.appendChild(image4Wrap);

	const actions = document.createElement("div");
	actions.className = "video-tool-actions";

	const generateBtn = document.createElement("button");
	generateBtn.type = "button";
	generateBtn.className = "video-tool-btn primary";
	generateBtn.textContent = "Generate";
	generateBtn.addEventListener("click", async () => {
		const selectedOptions = collectImageOptionsFromBubble(bubble);
		if (!selectedOptions.prompt) {
			setVideoBubbleStatus(bubble, "Prompt is required.", true);
			return;
		}
		if (!enforceLimit("imagesDaily")) {
			setVideoBubbleStatus(
				bubble,
				"Image limit reached for your current plan.",
				true,
			);
			return;
		}

		setVideoBubbleControlsDisabled(bubble, true);
		setVideoBubbleStatus(bubble, "Submitting image options...");
		try {
			const accepted = await window.ollama.resolveImageToolCall(
				toolCallId,
				selectedOptions,
			);
			if (!accepted) {
				setVideoBubbleControlsDisabled(bubble, false);
				setVideoBubbleStatus(
					bubble,
					"Request expired. Try again with a new prompt.",
					true,
				);
				return;
			}
			setVideoBubbleStatus(bubble, "Generating image...");
		} catch (err: any) {
			setVideoBubbleControlsDisabled(bubble, false);
			setVideoBubbleStatus(
				bubble,
				`Failed to submit options: ${String(err)}`,
				true,
			);
		}
	});

	const cancelBtn = document.createElement("button");
	cancelBtn.type = "button";
	cancelBtn.className = "video-tool-btn";
	cancelBtn.textContent = "Cancel";
	cancelBtn.addEventListener("click", async () => {
		setVideoBubbleControlsDisabled(bubble, true);
		setVideoBubbleStatus(bubble, "Canceling image request...");
		try {
			const accepted = await window.ollama.resolveImageToolCall(
				toolCallId,
				null,
			);
			if (!accepted) {
				setVideoBubbleStatus(
					bubble,
					"Request expired. Try again with a new prompt.",
					true,
				);
				return;
			}
			setVideoBubbleStatus(bubble, "Image generation canceled.");
		} catch (err: any) {
			setVideoBubbleControlsDisabled(bubble, false);
			setVideoBubbleStatus(
				bubble,
				`Failed to cancel request: ${String(err)}`,
				true,
			);
		}
	});

	actions.appendChild(generateBtn);
	actions.appendChild(cancelBtn);

	bubble.appendChild(header);
	bubble.appendChild(status);
	bubble.appendChild(promptLabel);
	bubble.appendChild(modeLabel);
	bubble.appendChild(imageGrid);
	bubble.appendChild(actions);
	applyImageOptionsToBubble(bubble, options);
	return bubble;
}

function createLiveAudioToolBubble(
	toolCallId: string,
	options: any,
): HTMLDivElement {
	const bubble = document.createElement("div");
	bubble.className = "chat-bubble tool-bubble video-tool-bubble";
	bubble.setAttribute("data-tool-call-id", toolCallId);

	const header = document.createElement("div");
	header.className = "tool-header";
	header.textContent = "Music/SFX Generation Request";

	const status = document.createElement("div");
	status.className = "video-tool-status";
	status.textContent = "Review prompt, then generate.";

	const promptLabel = document.createElement("label");
	promptLabel.className = "video-tool-field";
	promptLabel.textContent = "Prompt";
	const promptInput = document.createElement("textarea");
	promptInput.className = "video-tool-input";
	promptInput.setAttribute("data-audio-field", "prompt");
	promptInput.rows = 2;
	promptLabel.appendChild(promptInput);

	const actions = document.createElement("div");
	actions.className = "video-tool-actions";

	const generateBtn = document.createElement("button");
	generateBtn.type = "button";
	generateBtn.className = "video-tool-btn primary";
	generateBtn.textContent = "Generate";
	generateBtn.addEventListener("click", async () => {
		const selectedOptions = collectAudioOptionsFromBubble(bubble);
		if (!selectedOptions.prompt) {
			setVideoBubbleStatus(bubble, "Prompt is required.", true);
			return;
		}
		if (!enforceLimit("audioWeekly")) {
			setVideoBubbleStatus(
				bubble,
				"Audio limit reached for your current plan.",
				true,
			);
			return;
		}

		setVideoBubbleControlsDisabled(bubble, true);
		setVideoBubbleStatus(bubble, "Submitting audio prompt...");
		try {
			const accepted = await window.ollama.resolveAudioToolCall(
				toolCallId,
				selectedOptions,
			);
			if (!accepted) {
				setVideoBubbleControlsDisabled(bubble, false);
				setVideoBubbleStatus(
					bubble,
					"Request expired. Try again with a new prompt.",
					true,
				);
				return;
			}
			setVideoBubbleStatus(bubble, "Generating music/SFX...");
		} catch (err: any) {
			setVideoBubbleControlsDisabled(bubble, false);
			setVideoBubbleStatus(
				bubble,
				`Failed to submit prompt: ${String(err)}`,
				true,
			);
		}
	});

	const cancelBtn = document.createElement("button");
	cancelBtn.type = "button";
	cancelBtn.className = "video-tool-btn";
	cancelBtn.textContent = "Cancel";
	cancelBtn.addEventListener("click", async () => {
		setVideoBubbleControlsDisabled(bubble, true);
		setVideoBubbleStatus(bubble, "Canceling audio request...");
		try {
			const accepted = await window.ollama.resolveAudioToolCall(
				toolCallId,
				null,
			);
			if (!accepted) {
				setVideoBubbleStatus(
					bubble,
					"Request expired. Try again with a new prompt.",
					true,
				);
				return;
			}
			setVideoBubbleStatus(bubble, "Audio generation canceled.");
		} catch (err: any) {
			setVideoBubbleControlsDisabled(bubble, false);
			setVideoBubbleStatus(
				bubble,
				`Failed to cancel request: ${String(err)}`,
				true,
			);
		}
	});

	actions.appendChild(generateBtn);
	actions.appendChild(cancelBtn);

	bubble.appendChild(header);
	bubble.appendChild(status);
	bubble.appendChild(promptLabel);
	bubble.appendChild(actions);
	applyAudioOptionsToBubble(bubble, options);
	return bubble;
}

window.ollama.onNewAsset((msg) => {
	console.log("Received new asset:", msg);

	const targetSessionId = activeToolSessionId || currentSessionId;
	if (!targetSessionId || !sessions[targetSessionId]) return;
	const shouldRender = targetSessionId === currentSessionId;
	console.log("Current session ID:", targetSessionId);

	const session = sessions[targetSessionId];
	const flatHistory = getSessionFlatHistory(session, targetSessionId);
	const last = flatHistory.at(-1);
	const content = String(msg.content || "");
	const mimeType =
		typeof msg.mimeType === "string" && msg.mimeType.trim()
			? msg.mimeType.trim()
			: msg.role === "image"
				? "image/png"
				: msg.role === "video"
					? "video/mp4"
					: msg.role === "audio"
						? "audio/mpeg"
						: "";

	if (last?.role === msg.role && last?.content === content) return;

	if (
		["image", "video", "audio"].includes(last?.role) &&
		last.content === content
	) {
		return;
	}

	const root = ensureSessionHistoryRoot(session, targetSessionId);
	const mediaEntry = {
		id: `${msg.role}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
		timestamp: Date.now(),
		role: msg.role,
		content,
		...(mimeType ? { mimeType } : {}),
	};
	if (!root) {
		setSessionHistoryRoot(session, ensureMessageVersioningShape(mediaEntry), targetSessionId);
	} else {
		const nextRoot = cloneAndRepairTree(root);
		appendEntriesToActiveLeaf(nextRoot, [mediaEntry]);
		setSessionHistoryRoot(session, nextRoot, targetSessionId);
	}
	if (msg.role === "image") {
		bumpUsage("imagesDaily");
	}
	if (msg.role === "video") {
		bumpUsage("videosDaily");
	}
	if (msg.role === "audio") {
		bumpUsage("audioWeekly");
	}

	void window.ollama.save(sessions);
	if (shouldRender) {
		renderAsset(msg.role, content, mimeType || undefined);
	}
});

window.ollama.onToolCall((call) => {
	const targetSessionId = activeToolSessionId || currentSessionId;
	if (!targetSessionId || !sessions[targetSessionId]) return;
	const shouldRender = targetSessionId === currentSessionId;
	const session = sessions[targetSessionId];

	if (call.name === "generate_video") {
		const options = getVideoOptionsFromToolCall(call);
		const payload: Record<string, unknown> = {
			status: call.state,
			options,
		};
		if (typeof call.result === "string" && call.result.length > 0) {
			payload.message = call.result;
		}

		upsertToolHistoryEntry(session, call, JSON.stringify(payload));
		if (shouldRender) {
			let bubble = liveToolBubbles.get(call.id);
			if (!bubble) {
				bubble = createLiveVideoToolBubble(call.id, options);
				liveToolBubbles.set(call.id, bubble);
				chatBox.appendChild(bubble);
			}
			applyVideoOptionsToBubble(bubble, options);
			setLiveToolBubbleState(
				call.id,
				call.name,
				call.state,
				typeof call.result === "string" ? call.result : undefined,
			);
			if (autoScroll) chatBox.scrollTop = chatBox.scrollHeight;
		}

		void window.ollama.save(sessions);
		return;
	}

	if (call.name === "generate_image") {
		console.log("Processing generate_image tool call:", call);
		const options = getImageOptionsFromToolCall(call);
		const payload = {
			status: call.state,
			options,
		};
		if (typeof call.result === "string" && call.result.length > 0) {
			payload.message = call.result;
		}

		upsertToolHistoryEntry(session, call, JSON.stringify(payload));
		if (shouldRender) {
			let bubble = liveToolBubbles.get(call.id);
			if (!bubble) {
				bubble = createLiveImageToolBubble(call.id, options);
				liveToolBubbles.set(call.id, bubble);
				chatBox.appendChild(bubble);
			}
			applyImageOptionsToBubble(bubble, options);
			setLiveToolBubbleState(
				call.id,
				call.name,
				call.state,
				typeof call.result === "string" ? call.result : undefined,
			);
			if (autoScroll) chatBox.scrollTop = chatBox.scrollHeight;
		}

		void window.ollama.save(sessions);
		return;
	}

	if (call.name === "generate_audio") {
		console.log("Processing generate_audio tool call:", call);
		const options = getAudioOptionsFromToolCall(call);
		console.log(options)
		const payload = {
			status: call.state,
			options,
		};
		if (typeof call.result === "string" && call.result.length > 0) {
			payload.message = call.result;
		}
		upsertToolHistoryEntry(session, call, JSON.stringify(payload));

		if (shouldRender) {
			let bubble = liveToolBubbles.get(call.id);
			if (!bubble) {
				bubble = createLiveAudioToolBubble(call.id, options);
				liveToolBubbles.set(call.id, bubble);
				chatBox.appendChild(bubble);
			}
			applyAudioOptionsToBubble(bubble, options);
			setLiveToolBubbleState(
				call.id,
				call.name,
				call.state,
				typeof call.result === "string" ? call.result : undefined,
			);
			if (autoScroll) chatBox.scrollTop = chatBox.scrollHeight;
		}

		void window.ollama.save(sessions);
		return;
	}

	if (call.state === "pending") {
		upsertToolHistoryEntry(session, call, "⏳ Running…");
		void window.ollama.save(sessions);
		return;
	}

	if (call.state === "resolved") {
		upsertToolHistoryEntry(
			session,
			call,
			typeof call.result === "string" ? call.result : "✅ Done",
		);
		void window.ollama.save(sessions);
		return;
	}

	if (call.state === "canceled") {
		upsertToolHistoryEntry(
			session,
			call,
			typeof call.result === "string"
				? call.result
				: "Tool request canceled.",
		);
		void window.ollama.save(sessions);
	}
});

function openAddHostDialog() {
	modal.open({
		html: `
			<h3>Add Remote Host</h3>
			<p style="opacity:.7">
				Enter the remote host IP or URL
			</p>

			<input id="new-host-url"
				   placeholder="http://1.2.3.4:52458"
				   style="width:100%;margin-bottom:8px" />

			<input id="new-host-alias"
				   placeholder="Alias (optional, max 20 chars)"
				   maxlength="20"
				   style="width:100%;margin-bottom:12px" />

			<div style="display:flex; gap:8px;">
				<button id="confirm-add-host">Add</button>
				<button id="cancel-add-host">Cancel</button>
			</div>
		`,
	});

	document
		.getElementById("cancel-add-host")
		?.addEventListener("click", () => {
			modal.close();
			if (hostSelect) {
				hostSelect.value = "local";
				localStorage.setItem("host_select", "local");
				reloadModelsForHost("local");
			}
		});

	document
		.getElementById("confirm-add-host")
		?.addEventListener("click", () => {
			let url = (
				document.getElementById("new-host-url") as HTMLInputElement
			).value.trim();
			const alias = (
				document.getElementById("new-host-alias") as HTMLInputElement
			).value
				.trim()
				.substring(0, 20);

			if (!url) return;

			if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
			if (!/:\d+\/?$/.test(url)) url = url.replace(/\/+$/, "") + ":52458";
			url = url.replace(/\/+$/, "");

			const remotesStored: RemoteHost[] = JSON.parse(
				localStorage.getItem("remote_hosts") || "[]",
			);

			if (!remotesStored.some((r) => r.url === url)) {
				remotesStored.push({ url, alias });
				localStorage.setItem(
					"remote_hosts",
					JSON.stringify(remotesStored),
				);
			}

			updateHostSelectOptions();

			const sel = `remote:${url}`;
			hostSelect!.value = sel;
			localStorage.setItem("host_select", sel);

			modal.close();
			reloadModelsForHost(sel);
		});
}

modelSelect.addEventListener("change", setToolSupport);

textarea.addEventListener("input", updateTextareaState);
