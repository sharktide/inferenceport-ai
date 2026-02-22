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

//@ts-nocheck

import { showNotification } from "../helper/notification.js";
import {
	mergeLocalAndRemoteSessions,
	safeCallRemote,
	isOffline,
} from "../helper/sync.js";

const dataDir = window.ollama.getPath();

const sessionFile = `${dataDir}/sessions.json`;
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
const attachBtn = document.getElementById("attach-btn") as HTMLButtonElement;
const fileBar = document.getElementById("file-preview-bar") as HTMLDivElement;
const remoteHostAlias = document.getElementById(
	"remote-host-alias",
) as HTMLInputElement | null;
const searchBtn = document.getElementById("search-btn") as HTMLButtonElement;
const imgBtn = document.getElementById("img-btn") as HTMLButtonElement;
const videoBtn = document.getElementById("video-btn") as HTMLButtonElement;
const audioBtn = document.getElementById("audio-btn") as HTMLButtonElement;
const searchLabel = document.getElementById("search-text") as HTMLSpanElement;
const imageLabel = document.getElementById("img-text") as HTMLSpanElement;
const videoLabel = document.getElementById("video-text") as HTMLSpanElement;
const audioLabel = document.getElementById("audio-text") as HTMLSpanElement;
const textarea = document.getElementById("chat-input") as HTMLTextAreaElement;
const typingBar = textarea.closest(".typing-bar") as HTMLDivElement;
const featureWarning = document.getElementById(
	"feature-warning",
) as HTMLParagraphElement;
const experimentalFeatureNotice = document.getElementById(
	"experimental-feature-notice",
) as HTMLParagraphElement | null;
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
let modal: declarations["iInstance"]["iModal"];
let editModal: declarations["iInstance"]["iModal"];

let searchEnabled = false;
let imgEnabled = false;
let videoEnabled = false;
let audioEnabled = false;
let sessions = {};
let currentSessionId = null;
const LIGHTNING_MODEL_DISPLAY = "@InferencePort/Lightning-Text-v2";
const LIGHTNING_MODEL_VALUE = "lightning";
const LIGHTNING_CLIENT_URL = "lightning";
const LIGHTNING_ENABLED_KEY = "lightning_enabled";
let lightningEnabled = readLightningSetting();
const assetObjectUrlCache = new Map<string, string>();

type ToggleSwitchElement = HTMLElement & {
	checked: boolean;
};

function readLightningSetting(): boolean {
	try {
		return localStorage.getItem(LIGHTNING_ENABLED_KEY) === "true";
	} catch (e) {
		return false;
	}
}

function collectUsedAssetIds(sessions: any): Set<string> {
	const used = new Set<string>();

	for (const session of Object.values(sessions)) {
		if (!session?.history) continue;

		for (const msg of session.history) {
			if (!msg?.content) continue;

			if (
				(msg.role === "video" || msg.role === "audio") &&
				typeof msg.content === "string" &&
				!msg.content.startsWith("data:")
			) {
				used.add(msg.content);
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
	lightningEnabled = enabled;
	try {
		localStorage.setItem(LIGHTNING_ENABLED_KEY, String(enabled));
	} catch (e) {
		void 0;
	}
	applyLightningState();
	void setToolSupport();
}

function initLightningToggleEvents(): void {
	[lightningToggleTop, lightningToggleSidebar, lightningToggleStatus].forEach(
		(toggle) => {
			toggle?.addEventListener("change", () => {
				setLightningEnabled(Boolean(toggle.checked));
			});
		},
	);
	applyLightningState();
}

function updateExperimentalFeatureNotice(): void {
	if (!experimentalFeatureNotice) return;
	experimentalFeatureNotice.style.display =
		videoEnabled || audioEnabled ? "block" : "none";
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
	modal = new window.ic.iModal("global-modal", undefined, undefined, false, false);
	editModal = new window.ic.iModal("edit-modal", undefined, undefined, false, false );
	initWelcomeCards();
	initLightningToggleEvents();
	updateExperimentalFeatureNotice();
});
modelSelect?.addEventListener("change", setTitle);
const urlParams = new URLSearchParams(window.location.search);
interface RemoteHost {
	url: string;
	alias: string;
}

function stripAnsi(str: string): string {
	return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
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

async function setToolSupport() {
	if (lightningEnabled) {
		typingBar.classList.remove("no-tools");
		featureWarning.style.display = "none";
		return;
	}

	if (
		modelsSupportsTools.includes(modelSelect.value.split(":")[0]) ||
		toolNotice
	) {
		typingBar.classList.remove("no-tools");
		featureWarning.style.display = "none";
	} else {
		typingBar.classList.add("no-tools");
		featureWarning.style.display = "block";
	}
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
	const remotes: { url: string; alias?: string }[] = JSON.parse(
		localStorage.getItem("remote_hosts") || "[]",
	);

	if (hostSelect) {
		updateHostSelectOptions();

		hostSelect.addEventListener("change", updateHostSelectState);
	}

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
			modelsSupportsTools = supportsTools || [];
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
		setSessionProgress(55);

		if (isSyncEnabled() && auth?.session?.user) {
			const remoteResponse = await safeCallRemote(
				() => window.sync.getRemoteSessions(),
				{ sessions: null },
			);
			setSessionProgress(65);

			if (!remoteResponse?.error && remoteResponse?.sessions) {
				const userId = auth.session.user.id;
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

				await window.ollama.save(sessions);
				setSessionProgress(90);

				const freshAuth = await window.auth.getSession();
				if (freshAuth?.session?.user) {
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
		renderChat();
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
	} catch (err) {
		console.error(err);
		modelSelect.innerHTML = `<option>Error loading models</option>`;
	} finally {
		hideSessionProgress();

		if (await isOffline()) {
			showNotification({
				message:
					"⚠️ No internet connection — Using offline sessions only.",
				type: "warning",
			});
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
								if (isSyncEnabled() && auth?.session?.user) {
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
					if (isSyncEnabled() && auth?.session?.user) {
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
					if (isSyncEnabled() && auth?.session?.user) {
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

function createNewSession(): void {
	const id = generateSessionId();
	const name = new Date().toLocaleString();
	sessions[id] = {
		model: lightningEnabled ? LIGHTNING_MODEL_VALUE : modelSelect.value,
		name,
		history: [],
		favorite: false,
	};
	currentSessionId = id;
	window.ollama.save(sessions);

	window.auth.getSession().then(async (auth) => {
		if (isSyncEnabled() && auth?.session?.user) {
			await safeCallRemote(() => window.sync.saveAllSessions(sessions));
		}
		renderSessionList();
	});
	renderSessionList();
	renderChat();
	return void 0;
}

function handleSessionClick(sessionId): void {
	currentSessionId = sessionId;
	renderSessionList();
	renderChat();
	return void 0;
}

function renderSessionList(): void {
	sessionList.innerHTML = "";

	const searchTerm =
		document.getElementById("session-search")?.value?.toLowerCase() || "";

	const sortedSessions = Object.entries(sessions)
		.filter(([, session]) =>
			session.name?.toLowerCase().includes(searchTerm),
		)
		.sort(([, a], [, b]) => {
			if (a.favorite !== b.favorite) return b.favorite - a.favorite;
			return (a.name || "").localeCompare(b.name || "");
		});

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
				if (isSyncEnabled() && auth?.session?.user) {
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

searchBtn.addEventListener("click", () => {
	if (searchEnabled) {
		searchEnabled = false;
		searchLabel.style.color = "";
	} else {
		searchEnabled = true;
		Object.assign(searchLabel.style, { color: "#f9d400ff" });
	}
	console.log("searchEnabled", searchEnabled);
});

imgBtn.addEventListener("click", () => {
	if (imgEnabled) {
		imgEnabled = false;
		imageLabel.style.color = "";
	} else {
		imgEnabled = true;
		Object.assign(imageLabel.style, { color: "#f9d400ff" });
	}
	console.log("imgEnabled", imgEnabled);
});

videoBtn.addEventListener("click", () => {
	if (videoEnabled) {
		videoEnabled = false;
		videoLabel.style.color = "";
	} else {
		videoEnabled = true;
		Object.assign(videoLabel.style, { color: "#f9d400ff" });
	}
	console.log("videoEnabled", videoEnabled);
	updateExperimentalFeatureNotice();
});

audioBtn.addEventListener("click", () => {
	if (audioEnabled) {
		audioEnabled = false;
		audioLabel.style.color = "";
	} else {
		audioEnabled = true;
		Object.assign(audioLabel.style, { color: "#f9d400ff" });
	}
	console.log("audioEnabled", audioEnabled);
	updateExperimentalFeatureNotice();
});

let attachedFiles = [];

attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async (e) => {
	const files = Array.from(e.target.files);
	for (const file of files) {
		const text = await file.text();
		attachedFiles.push({ name: file.name, content: text });
	}
	renderFileIndicator();
});

function formatAttachedFiles(files): string {
	if (files.length === 0) return "";

	let output: string = `<details><summary>Attached Files</summary>\n\n`;
	for (const file of files) {
		output += `\n<details><summary>${file.name}</summary>\n\n`;
		output += "```\n" + file.content + "\n```\n";
		output += `\n</details>\n`;
	}
	output += `\n</details>\n`;
	return output;
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
		if (isSyncEnabled() && auth?.session?.user) {
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
	setWelcomeMode(false);
	if (sessions[currentSessionId].history.length === 0) {
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
	session.model = model;
	const fileBlock = formatAttachedFiles(attachedFiles);
	const fullPrompt = prompt + "\n\n" + fileBlock;
	attachedFiles = [];
	renderFileIndicator();
	session.history.push({ role: "user", content: fullPrompt });
	renderChat();

	const botBubble = document.createElement("div");
	botBubble.className = "chat-bubble bot-bubble thinking";
	botBubble.textContent = "Thinking";
	botBubble.setAttribute("data-text", botBubble.textContent);
	let isThinking = true;
	let isGenerating = false;
	chatBox.appendChild(botBubble);
	chatBox.scrollTop = chatBox.scrollHeight;

	window.ollama.removeAllListeners?.();

	if (!lightningEnabled) {
		localStorage.setItem("host_select", hostChoice);
	}
	window.ollama.streamPrompt(
		model,
		fullPrompt,
		{
			search: searchEnabled,
			imageGen: imgEnabled,
			videoGen: videoEnabled,
			audioGen: audioEnabled,
		},
		clientUrl,
	);

	let fullResponse = "";
	isStreaming = true;
	updateActionButton();

	window.ollama.onResponse((chunk) => {
		if (isThinking) {
			botBubble.classList.remove("thinking");
			botBubble.removeAttribute("data-text");
			isThinking = false;
			isGenerating = true;
			botBubble.classList.add("generating");
		}
		fullResponse += chunk;
		// nosemgrep: javascript.browser.security.insecure-innerhtml
		botBubble.innerHTML =
			window.utils.markdown_parse_and_purify(fullResponse);
		if (autoScroll) {
			chatBox.scrollTop = chatBox.scrollHeight;
		}
	});

	window.ollama.onError((err) => {
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
			if (isSyncEnabled() && auth?.session?.user) {
				await safeCallRemote(() =>
					window.sync.saveAllSessions(sessions),
				);
			}
			renderSessionList();
		});
		endStreaming();
	});

	window.ollama.onDone(() => {
		botBubble.classList.remove("thinking");
		botBubble.removeAttribute("data-text");
		botBubble.classList.remove("generating");
		session.history.push({ role: "assistant", content: fullResponse });
		renderChat();
		const status = document.createElement("div");
		status.textContent = "✅ Done";
		status.style.marginTop = "8px";
		status.style.fontSize = "14px";
		status.style.color = "#3ca374";
		botBubble.appendChild(status);
		window.ollama.save(sessions);
		window.auth.getSession().then(async (auth) => {
			if (isSyncEnabled() && auth?.session?.user) {
				await safeCallRemote(() =>
					window.sync.saveAllSessions(sessions),
				);
			}
			renderSessionList();
		});
		endStreaming();
	});

	window.ollama.onAbort(() => {
		botBubble.classList.remove("thinking");
		botBubble.removeAttribute("data-text");
		botBubble.classList.remove("generating");
		session.history.push({ role: "assistant", content: fullResponse });
		renderChat();
		const status = document.createElement("div");
		status.textContent = "⚠︎ Interrupted";
		status.style.marginTop = "8px";
		status.style.fontSize = "14px";
		status.style.color = "#d9534f";
		botBubble.appendChild(status);
		window.ollama.save(sessions);
		window.auth.getSession().then(async (auth) => {
			if (isSyncEnabled() && auth?.session?.user) {
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
		icon.textContent = "📄";
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
	updateActionButton();
}

try {
	textarea.autocomplete = "off";
} catch (err) {
	void 1;
}

const LINE_HEIGHT = 1.6 * 16;
const BASE_PADDING = 32;
const MAX_LINES = 3;

function updateTextareaState() {
	const value = textarea.value;

	if (value.length === 0) {
		typingBar.classList.add("empty");

		textarea.style.overflowY = "hidden";
		textarea.style.height = `${LINE_HEIGHT + BASE_PADDING}px`;
		return;
	}

	typingBar.classList.remove("empty");

	textarea.style.height = "auto";

	const scrollHeight = textarea.scrollHeight;
	const maxHeight = LINE_HEIGHT * MAX_LINES + BASE_PADDING;

	if (scrollHeight > maxHeight) {
		textarea.style.height = `${maxHeight}px`;
		textarea.style.overflowY = "auto";
	} else {
		textarea.style.height = `${scrollHeight}px`;
		textarea.style.overflowY = "hidden";
	}
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

function openFilePreview(file) {
	modal.open({
		title: file.name,
		html: `<pre class="file-preview">${file.content}</pre>`,
		actions: [
			{
				id: "close-file-preview",
				label: "Close",
				onClick: () => modal.close(),
			},
		],
	});
}

async function setTitle() {
	const titleModel = lightningEnabled
		? LIGHTNING_MODEL_DISPLAY
		: modelSelect.value;
	document.title = titleModel + " - Chat - InferencePortAI";
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

async function persistSessionsAndSync(): Promise<void> {
	await window.ollama.save(sessions);
	const auth = await window.auth.getSession();
	if (isSyncEnabled() && auth?.session?.user) {
		await safeCallRemote(() => window.sync.saveAllSessions(sessions));
	}
}

function getCurrentSessionMessages(): any[] | null {
	if (!currentSessionId || !sessions[currentSessionId]) {
		return null;
	}

	const history = sessions[currentSessionId].history;
	return Array.isArray(history) ? history : null;
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

function openEditMessageDialog(messageIndex: number): void {
	const history = getCurrentSessionMessages();
	const message = history?.[messageIndex];
	if (!message || typeof message.content !== "string") {
		return;
	}

	editModal.open({
		title: "Edit Message",
		html: `
			<textarea
				id="edit-message-input"
				class="modal-input"
				rows="8"
				style="width:100%; resize:vertical;"
			>${escapeHtml(message.content)}</textarea>
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
					if (!input) {
						return;
					}

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

					latestHistory[messageIndex].content = updated;
					await persistSessionsAndSync();
					renderChat();
					editModal.close();
				},
			},
		],
	});
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
					const history = getCurrentSessionMessages();
					if (!history?.[messageIndex]) {
						editModal.close();
						return;
					}

					history.splice(messageIndex, 1);
					await persistSessionsAndSync();
					renderChat();
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

	const canEdit = typeof msg.content === "string" && msg.content.length > 0;
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
			const content = typeof msg.content === "string" ? msg.content : "";
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

function renderChat() {
	for (const url of assetObjectUrlCache.values()) {
		try {
			URL.revokeObjectURL(url);
		} catch (err: any) {
			console.warn(err.toString())
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
	if (!session || !session.history || session.history.length === 0) {
		setWelcomeMode(true);
		return;
	}

	setWelcomeMode(false);

	session.history.forEach((msg, messageIndex) => {
		/* ---------------- USER ---------------- */
		if (msg.role === "user") {
			const bubble = document.createElement("div");
			bubble.className = "chat-bubble user-bubble has-message-actions";
			// nosemgrep: javascript.browser.security.insecure-innerhtml
			bubble.innerHTML = window.utils.markdown_parse_and_purify(
				msg.content || "",
			);
			const actions = buildMessageActions(msg, messageIndex);
			if (actions) {
				bubble.appendChild(actions);
			}
			chatBox.appendChild(bubble);
			return;
		}

		/* ---------------- ASSISTANT ---------------- */
		if (msg.role === "assistant") {
			// nosemgrep: javascript.browser.security.insecure-innerhtml
			const html = window.utils.markdown_parse_and_purify(
				msg.content || "",
			);
			const temp = document.createElement("div");
			temp.innerHTML = html;

			const botContainer = document.createElement("div");
			botContainer.className = "chat-bubble bot-bubble has-message-actions";

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
				} else {
					botContainer.appendChild(node.cloneNode(true));
				}
			});

			const actions = buildMessageActions(msg, messageIndex);
			if (actions) {
				botContainer.appendChild(actions);
			}

			chatBox.appendChild(botContainer);
			return;
		}

		if (msg.role === "image") {
			chatBox.appendChild(createImageAssetBubble(msg.content));
			return;
		}

		if (msg.role === "video") {
			renderMediaAssetFromContent("video", msg.content, chatBox);
			return;
		}

		if (msg.role === "audio") {
			renderMediaAssetFromContent("audio", msg.content, chatBox);
			return;
		}

		if (msg.role === "tool") {
			const toolBubble = document.createElement("div");
			toolBubble.className = "chat-bubble tool-bubble";

			const header = document.createElement("div");
			header.className = "tool-header";
			if (msg.name == "generate_image") {
				header.textContent =
					"⚡Generated an Image with Lightning-Image Turbo";
			} else if (msg.name == "generate_video") {
				header.textContent = "Generated video";
			} else if (msg.name == "generate_audio") {
				header.textContent = "Generated Audio";
			} else header.textContent = `🔧 Tool: ${msg.name ?? "unknown"}`;

			toolBubble.appendChild(header);
			chatBox.appendChild(toolBubble);
			return;
		}

		console.warn("Unknown message role:", msg.role, msg);
	});

	renderMathInElement(document.body, {
		delimiters: [
			{ left: "$$", right: "$$", display: true },
			{ left: "$", right: "$", display: true },
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

function renderMediaAssetFromContent(
	role: "video" | "audio",
	content: string,
	chatBox: HTMLDivElement,
): void {
	if (content.startsWith("data:") || content.startsWith("blob:")) {
		chatBox.appendChild(
			role === "video"
				? createVideoAssetBubble(content)
				: createAudioAssetBubble(content),
		);
		return;
	}

	const loadingBubble = document.createElement("div");
	loadingBubble.className = "chat-bubble tool-bubble";
	loadingBubble.textContent = `Loading ${role} asset...`;
	chatBox.appendChild(loadingBubble);

	const mimeType = role === "video" ? "video/mp4" : "audio/mpeg";
	void getAssetObjectUrl(content, mimeType)
		.then((objectUrl) => {
			const mediaBubble =
				role === "video"
					? createVideoAssetBubble(objectUrl)
					: createAudioAssetBubble(objectUrl);
			loadingBubble.replaceWith(mediaBubble);
			if (autoScroll) chatBox.scrollTop = chatBox.scrollHeight;
		})
		.catch((err) => {
			loadingBubble.textContent = `Failed to load ${role} asset: ${String(err)}`;
		});
}

function renderAsset(role: "image" | "video" | "audio", content: string) {
	const chatBox = document.getElementById("chat-box");
	if (!chatBox) return;

	if (role === "image") {
		chatBox.appendChild(createImageAssetBubble(content));
	} else {
		renderMediaAssetFromContent(role, content, chatBox);
	}

	if (autoScroll) {
		chatBox.scrollTop = chatBox.scrollHeight;
	}
}

window.ollama.onNewAsset((msg) => {
	console.log("Received new asset:", msg);

	if (!currentSessionId || !sessions[currentSessionId]) return;
	console.log("Current session ID:", currentSessionId);

	const session = sessions[currentSessionId];
	const last = session.history.at(-1);

	if (last?.role === msg.role && last?.content === msg.content) return;
	window.ollama.save(sessions);

	const content =
		msg.role === "image" && !msg.content.startsWith("data:")
			? `data:image/png;base64,${msg.content}`
			: msg.content;

	if (
		["image", "video", "audio"].includes(last?.role) &&
		last.content === content
	) {
		return;
	}

	session.history.push({
		role: msg.role,
		content,
	});

	renderAsset(msg.role, content);
});

window.ollama.onToolCall((call) => {
	if (!currentSessionId || !sessions[currentSessionId]) return;

	const session = sessions[currentSessionId];

	if (call.state === "pending") {
		session.history.push({
			role: "tool",
			tool_call_id: call.id,
			name: call.name,
			content: "⏳ Running…",
		});
	}

	if (call.state === "resolved") {
		void 0;
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
