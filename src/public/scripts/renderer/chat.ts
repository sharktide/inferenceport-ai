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
const hostSelect = document.getElementById("host-select") as HTMLSelectElement | null;
const remoteHostDialog = document.getElementById("remote-host-dialog") as HTMLDivElement | null;
const remoteHostInput = document.getElementById("remote-host-input") as HTMLInputElement | null;
const remoteHostConfirm = document.getElementById("remote-host-confirm") as HTMLButtonElement | null;
const remoteHostCancel = document.getElementById("remote-host-cancel") as HTMLButtonElement | null;
const sessionList = document.getElementById("session-list") as HTMLDivElement;
const newSessionBtn = document.getElementById(
	"new-session-btn",
) as HTMLButtonElement;
const fileInput = document.getElementById("file-upload") as HTMLInputElement;
const attachBtn = document.getElementById("attach-btn") as HTMLButtonElement;
const fileBar = document.getElementById("file-preview-bar") as HTMLDivElement;
const modal = document.getElementById("file-preview-modal") as HTMLDivElement;
const modalTitle = document.getElementById(
	"file-preview-title",
) as HTMLTitleElement;
const modalContent = document.getElementById(
	"file-preview-content",
) as HTMLPreElement;
const modalClose = document.getElementById(
	"file-preview-close",
) as HTMLButtonElement;
const searchBtn = document.getElementById("search-btn") as HTMLButtonElement;
const imgBtn = document.getElementById("img-btn") as HTMLButtonElement;
const searchLabel = document.getElementById("search-text") as HTMLSpanElement;
const imageLabel = document.getElementById("img-text") as HTMLSpanElement;
const textarea = document.getElementById("chat-input") as HTMLTextAreaElement;
const typingBar = textarea.closest(".typing-bar") as HTMLDivElement;
const featureWarning = document.getElementById(
	"feature-warning",
) as HTMLParagraphElement;

let searchEnabled = false;
let imgEnabled = false;
let sessions = {};
let currentSessionId = null;
modelSelect?.addEventListener("change", setTitle);
const urlParams = new URLSearchParams(window.location.search);

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

document.addEventListener("DOMContentLoaded", loadOptions);
document.addEventListener("DOMContentLoaded", updateTextareaState);

document.addEventListener("DOMContentLoaded", () => {
	const saved = localStorage.getItem('host_select') || 'local';
	const remotes: string[] = JSON.parse(localStorage.getItem('remote_hosts') || '[]');

	if (hostSelect) {
		// Remove any stale remote options
		Array.from(hostSelect.options).forEach((opt) => {
			if (opt.value && opt.value.startsWith('remote:')) opt.remove();
		});

		// Insert saved remote hosts before the 'add_remote' option
		const addRemoteOpt = hostSelect.querySelector('option[value="add_remote"]');
		remotes.forEach((url) => {
			const opt = document.createElement('option');
			opt.value = `remote:${url}`;
			opt.textContent = `Remote: ${url}`;
			if (addRemoteOpt) hostSelect.insertBefore(opt, addRemoteOpt);
			else hostSelect.appendChild(opt);
		});

		hostSelect.value = saved;

		hostSelect.addEventListener('change', () => {
			const v = hostSelect.value;
			if (v === 'add_remote') {
				remoteHostDialog?.classList.remove('hidden');
				if (remoteHostInput) remoteHostInput.value = '';
				remoteHostInput?.focus();
				return;
			}
			localStorage.setItem('host_select', v);
		});
	}

	// Modal handlers
	remoteHostCancel?.addEventListener('click', () => {
		remoteHostDialog?.classList.add('hidden');
		// restore previous selection
		if (hostSelect) hostSelect.value = localStorage.getItem('host_select') || 'local';
	});

	remoteHostConfirm?.addEventListener('click', () => {
		const raw = (remoteHostInput?.value || '').trim();
		if (!raw) return;
		let url = raw;
		if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
		if (!/:\d+\/?$/.test(url) && !/:\d+\//.test(url)) {
			// if no explicit port, default to 52458
			url = url.replace(/\/+$/, '') + ':52458';
		}
		// strip trailing slash
		url = url.replace(/\/+$/, '');

		// add to stored remotes
		const remotesStored: string[] = JSON.parse(localStorage.getItem('remote_hosts') || '[]');
		if (!remotesStored.includes(url)) {
			remotesStored.push(url);
			localStorage.setItem('remote_hosts', JSON.stringify(remotesStored));
			const opt = document.createElement('option');
			opt.value = `remote:${url}`;
			opt.textContent = `Remote: ${url}`;
			const addRemoteOpt = hostSelect?.querySelector('option[value="add_remote"]');
			if (addRemoteOpt && hostSelect) hostSelect.insertBefore(opt, addRemoteOpt);
		}

		const sel = `remote:${url}`;
		if (hostSelect) hostSelect.value = sel;
		localStorage.setItem('host_select', sel);
		remoteHostDialog?.classList.add('hidden');
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
				"Could not fetch model capabilities. Web search and image generation may not work as expected.";
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
				option.textContent = model.name;
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

		currentSessionId = Object.keys(sessions)[0] || createNewSession();
		renderSessionList();
		renderChat();
		setSessionProgress(95);

		try {
			if (urlParams.model != null) {
				modelSelect.value = urlParams.model;
			} else {
				modelSelect.value =
					sessions[currentSessionId]?.model ?? modelSelect.value;
			}
		} catch (e) {
			console.warn(e);
			void 0;
		}
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
				if (
					confirm(
						"Are you sure you want to delete all sessions? This cannot be undone.",
					)
				) {
					sessions = {};
					currentSessionId = null;
					window.ollama.save(sessions);
					window.auth.getSession().then(async (auth) => {
						if (isSyncEnabled() && auth?.session?.user) {
							await safeCallRemote(() =>
								window.sync.saveAllSessions(sessions),
							);
						}
						location.reload();
					});
				}
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
	if (confirm("Are you sure you want to delete this session?")) {
		delete sessions[sessionId];
		if (currentSessionId === sessionId) {
			currentSessionId = Object.keys(sessions)[0] || null;
		}
		window.ollama.save(sessions);

		window.auth.getSession().then(async (auth) => {
			if (isSyncEnabled() && auth?.session?.user) {
				await safeCallRemote(() =>
					window.sync.saveAllSessions(sessions),
				);
			}
			renderSessionList();
			location.reload();
		});
	}
}

function openReportDialog(): void {
	const dialog = document.getElementById("report-dialog") as HTMLDivElement;
	const cancelBtn = document.getElementById(
		"report-close",
	) as HTMLButtonElement;
	dialog.classList.remove("hidden");
	const closeDialog = () => dialog.classList.add("hidden");
	cancelBtn.removeEventListener("click", closeDialog);
	cancelBtn.addEventListener("click", closeDialog);
	return void 0;
}

function openRenameDialog(sessionId, currentName): void {
	const dialog = document.getElementById("rename-dialog") as HTMLDivElement;
	const input = document.getElementById("rename-input") as HTMLInputElement;
	const cancelBtn = document.getElementById(
		"rename-cancel",
	) as HTMLButtonElement;
	const confirmBtn = document.getElementById(
		"rename-confirm",
	) as HTMLButtonElement;

	input.value = currentName;
	dialog.classList.remove("hidden");

	const closeDialog = () => dialog.classList.add("hidden");
	cancelBtn.removeEventListener("click", closeDialog);
	cancelBtn.addEventListener("click", closeDialog);
	function rename() {
		const newName = input.value.trim();
		if (newName) {
			sessions[sessionId].name = newName;
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
		}
		closeDialog();
	}
	confirmBtn.removeEventListener("click", rename);
	confirmBtn.addEventListener("click", rename);
	return void 0;
}

function createNewSession(): void {
	const id = generateSessionId();
	const name = new Date().toLocaleString();
	sessions[id] = {
		model: modelSelect.value,
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
): Promise<string> {
	console.log("[autoNameSession] Called with:", { model, prompt, sessionId });

	let title: string;
	try {
		// call main process IPC instead of fetch
		title = await window.ollama.autoNameSession(model, prompt);
	} catch (err) {
		console.error("[autoNameSession] IPC error:", err);
		title = new Date().toLocaleString();
	}

	// Fallback cleaning if the model wrapped it in quotes
	if (
		(title.startsWith('"') && title.endsWith('"')) ||
		(title.startsWith("'") && title.endsWith("'"))
	) {
		title = title.slice(1, -1).trim();
	}

	console.log("[autoNameSession] Received title:", title);

	// Save session locally
	sessions[sessionId].name = title;
	window.ollama.save(sessions);

	// Optional sync
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
	}

	if (isStreaming) {
		window.ollama.stop?.();
		return;
	}

	const model = modelSelect.value;
	console.log(
		"[form.submit] Prompt:",
		prompt,
		"CurrentSessionId:",
		currentSessionId,
	);
	if (!prompt || !currentSessionId) return;
	if (sessions[currentSessionId].history.length === 0) {
		console.log(
			"[form.submit] First prompt for session, calling autoNameSession...",
		);
		autoNameSession(model, prompt, currentSessionId).catch((err) => {
			console.error("[form.submit] autoNameSession error:", err);
		});
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
	botBubble.className = "chat-bubble bot-bubble";
	botBubble.textContent = "🤖 Thinking";
	chatBox.appendChild(botBubble);
	chatBox.scrollTop = chatBox.scrollHeight;

	window.ollama.removeAllListeners?.();
	let clientUrl: string | undefined = undefined;
	const hostChoice = (hostSelect && hostSelect.value) || localStorage.getItem('host_select') || 'local';
	if (hostChoice && hostChoice.startsWith('remote:')) {
		const remoteBase = hostChoice.slice('remote:'.length);
		clientUrl = remoteBase.endsWith('/v1') ? remoteBase : remoteBase.replace(/\/+$/, '') + '/v1';
	}
	localStorage.setItem('host_select', hostChoice);
	window.ollama.streamPrompt(model, fullPrompt, searchEnabled, imgEnabled, clientUrl);

	let fullResponse = "";
	isStreaming = true;
	updateActionButton();

	window.ollama.onResponse((chunk) => {
		fullResponse += chunk;
		// nosemgrep: javascript.browser.security.insecure-innerhtml
		botBubble.innerHTML =
			window.utils.markdown_parse_and_purify(fullResponse);
		if (autoScroll) {
			chatBox.scrollTop = chatBox.scrollHeight;
		}
	});

	window.ollama.onError((err) => {
		renderChat();
		botBubble.textContent += `\n⚠️ Error: ${err}`;
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

document.addEventListener("click", (e) => {
	if (e.target.classList.contains("file-preview-btn")) {
		const index = e.target.dataset.index;
		const file = attachedFiles[index];
		(
			document.getElementById("file-preview-title") as HTMLTitleElement
		).textContent = file.name;
		(
			document.getElementById("file-preview-content") as HTMLPreElement
		).textContent = file.content;
		(
			document.getElementById("file-preview-modal") as HTMLDivElement
		).classList.remove("hidden");
	}
});

document.getElementById("file-preview-close").addEventListener("click", () => {
	document.getElementById("file-preview-modal").classList.add("hidden");
});

function openFilePreview(file) {
	modalTitle.textContent = file.name;
	modalContent.textContent = file.content;
	modal.classList.remove("hidden");
}

modalClose.addEventListener("click", () => {
	modal.classList.add("hidden");
});

async function setTitle() {
	document.title = modelSelect.value + " - Chat - InferencePortAI";
}

function renderChat() {
	// Always re-resolve chatBox to avoid stale DOM references
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
		const emptyMsg = document.createElement("div");
		emptyMsg.className = "empty-chat";
		emptyMsg.textContent = "Start chatting to see messages here.";
		chatBox.appendChild(emptyMsg);
		return;
	}

	session.history.forEach((msg) => {
		/* ---------------- USER ---------------- */
		if (msg.role === "user") {
			const bubble = document.createElement("div");
			bubble.className = "chat-bubble user-bubble";
			// nosemgrep: javascript.browser.security.insecure-innerhtml
			bubble.innerHTML = window.utils.markdown_parse_and_purify(
				msg.content || "",
			);
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
			botContainer.className = "chat-bubble bot-bubble";

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

			chatBox.appendChild(botContainer);
			return;
		}

		if (msg.role === "image") {
			const botContainer = document.createElement(
				"div",
			) as HTMLDivElement;
			botContainer.className = "chat-bubble image-bubble";

			const imageWrapper = document.createElement(
				"div",
			) as HTMLDivElement;
			imageWrapper.className = "image-wrapper";

			const img = document.createElement("img") as HTMLImageElement;
			img.src = msg.content;
			img.alt = "Generated image";

			const downloadBtn = document.createElement("button");
			downloadBtn.className = "image-download-btn";
			downloadBtn.title = "Download image";
			downloadBtn.innerText = "Download";

			downloadBtn.onclick = (e) => {
				e.stopPropagation();
				const a = document.createElement("a") as HTMLLinkElement;
				a.href = msg.content;
				a.download = `image-${Date.now()}.png`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
			};

			imageWrapper.appendChild(img);
			imageWrapper.appendChild(downloadBtn);
			botContainer.appendChild(imageWrapper);
			chatBox.appendChild(botContainer);
			return;
		}

		/* ---------------- TOOL ---------------- */
		if (msg.role === "tool") {
			const toolBubble = document.createElement("div");
			toolBubble.className = "chat-bubble tool-bubble";

			const header = document.createElement("div");
			header.className = "tool-header";
			header.textContent = `🔧 Tool: ${msg.name ?? "unknown"}`;

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

function renderImageAsset(dataUrl: string) {
	const chatBox = document.getElementById("chat-box");
	if (!chatBox) return;

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

	chatBox.appendChild(botContainer);

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

	const dataUrl = msg.content.startsWith("data:")
		? msg.content
		: `data:image/png;base64,${msg.content}`;

	if (last?.role === "image" && last.content === dataUrl) {
		return;
	}

	session.history.push({
		role: "image",
		content: dataUrl,
	});

	renderImageAsset(dataUrl);
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

modelSelect.addEventListener("change", setToolSupport);

textarea.addEventListener("input", updateTextareaState);
