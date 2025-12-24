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

import { urlToHttpOptions } from "url";
import { showNotification } from "../helper/notification.js";
import { mergeLocalAndRemoteSessions, LocalSessionMap, RemoteSessionMap, safeCallRemote, isOffline } from "../helper/sync.js";

const dataDir = window.ollama.getPath();

const sessionFile = `${dataDir}/sessions.json`;
const chatBox = document.getElementById("chat-box") as HTMLDivElement;
const input = document.getElementById("chat-input") as HTMLInputElement;
const form = document.getElementById("chat-form") as HTMLFormElement;
const stopBtn = document.getElementById("stop-btn") as HTMLButtonElement;
const modelSelect = document.getElementById("model-select") as HTMLOptionElement;
const sessionList = document.getElementById("session-list") as HTMLDivElement;
const newSessionBtn = document.getElementById("new-session-btn") as HTMLButtonElement;
const fileInput = document.getElementById("file-upload") as HTMLInputElement;
const attachBtn = document.getElementById("attach-btn") as HTMLButtonElement;
const fileBar = document.getElementById("file-preview-bar") as HTMLDivElement;
const modal = document.getElementById("file-preview-modal") as HTMLDivElement;
const modalTitle = document.getElementById("file-preview-title") as HTMLTitleElement;
const modalContent = document.getElementById("file-preview-content") as HTMLPreElement;
const modalClose = document.getElementById("file-preview-close") as HTMLButtonElement;
const searchBtn = document.getElementById("search-btn") as HTMLButtonElement;
const imgBtn = document.getElementById("img-btn") as HTMLButtonElement;
let searchEnabled = false;
let imgEnabled = false;
let sessions = {};
let currentSessionId = null;
modelSelect?.addEventListener('change', setTitle)

const urlParams = new URLSearchParams(window.location.search);

function stripAnsi(str: string): string {
	return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function isSyncEnabled() {
	try {
		return localStorage.getItem('sync_enabled') === 'true';
	} catch (e) {
		return false;
	}
}

document.addEventListener("DOMContentLoaded", loadOptions);

async function loadOptions() {
	try {
		try {
			const local = await window.ollama.load();
			sessions = (local && typeof local === "object") ? local : {};
		} catch (e) {
		console.warn("Failed to load local sessions, starting with empty:", e);
		sessions = {};
		}

		try {
			const models = await window.ollama.listModels();
			models.forEach((model) => {
				const option = document.createElement("option");
				option.value = model.name;
				option.textContent = model.name;
				modelSelect.appendChild(option);
			});
			const addmore = document.createElement("option");
			addmore.value = "add-more-models";
			addmore.textContent = "➕ Add more models...";
			modelSelect.appendChild(addmore);

			const manage = document.createElement("option");
			manage.value = "manage-models";
			manage.textContent = "✏️ Manage models...";
			modelSelect.appendChild(manage);

			modelSelect.addEventListener("change", async () => {
				if (modelSelect.value === "add-more-models") {
					window.location.href = "../marketplace.html";
				} else if (modelSelect.value === "manage-models") {
					window.location.href = "../installed.html";
				}
			});

		} catch (err) {
			console.warn("Could not list models:", err);
			modelSelect.innerHTML = `<option>error loading models</option>`;
		}

		const auth = await window.auth.getSession?.();
		if (isSyncEnabled() && auth?.session?.user) {
			const remoteResponse = await safeCallRemote(
				() => window.sync.getRemoteSessions(),
				{ sessions: null }
			);

			if (!remoteResponse?.error && remoteResponse?.sessions) {
				const userId = auth?.session?.user?.id ?? null;
				const remoteSessions = remoteResponse.sessions as SessionMap;
				for (const id in sessions) {
					if (sessions[id].userId && sessions[id].userId !== userId) {
						delete sessions[id];
					}
				}

				// Save the filtered sessions back to storage
				await window.ollama.save(sessions);

				sessions = mergeLocalAndRemoteSessions(
					sessions as SessionMap,
					remoteSessions ?? {}
				);

				await window.ollama.save(sessions);

				const freshAuth = await window.auth.getSession();
				if (freshAuth?.session?.user) {
					await safeCallRemote(() => window.sync.saveAllSessions(sessions));
				}
			}
		}

		currentSessionId = Object.keys(sessions)[0] || createNewSession();
		renderSessionList();
		renderChat();

		try {
			if (urlParams.model != null) {
				modelSelect.value = urlParams.model;
			} else {
				modelSelect.value = sessions[currentSessionId]?.model ?? modelSelect.value;
			}
		} catch (e) {
			console.warn(e);
			void 0
		}

	} catch (err) {
		modelSelect.innerHTML = `<option>Error loading models</option>`;
		console.error(err);
	} finally {
		if (await isOffline()) {
			showNotification({
				message: "⚠️ No internet connection — Using offline sessions only.",
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
		if (action === "rename") {
			openRenameDialog(sessionId, sessionName);
		} else if (action === "delete") {
			deleteSession(sessionId);
		} else if (action === "report") {
			openReportDialog()
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
				await safeCallRemote(() => window.sync.saveAllSessions(sessions));
			}
			renderSessionList();
			location.reload();
		})
	}
}

function openReportDialog(): void {
	const dialog = document.getElementById('report-dialog') as HTMLDivElement;
	const cancelBtn = document.getElementById('report-close') as HTMLButtonElement;
	dialog.classList.remove("hidden");
	const closeDialog = () => dialog.classList.add("hidden");
	cancelBtn.removeEventListener('click', closeDialog);
	cancelBtn.addEventListener('click', closeDialog);
	return void 0
}

function openRenameDialog(sessionId, currentName): void {
	const dialog = document.getElementById("rename-dialog") as HTMLDivElement;
	const input = document.getElementById("rename-input") as HTMLInputElement;
	const cancelBtn = document.getElementById("rename-cancel") as HTMLButtonElement;
	const confirmBtn = document.getElementById("rename-confirm") as HTMLButtonElement;

	input.value = currentName;
	dialog.classList.remove("hidden");

	const closeDialog = () => dialog.classList.add("hidden");
	cancelBtn.removeEventListener('click', closeDialog);
	cancelBtn.addEventListener('click', closeDialog);
	function rename() {
		const newName = input.value.trim();
		if (newName) {
			sessions[sessionId].name = newName;
			window.ollama.save(sessions);
			window.auth.getSession().then(async (auth) => {
				if (isSyncEnabled() && auth?.session?.user) {
					await safeCallRemote(() => window.sync.saveAllSessions(sessions));
				}
				renderSessionList();
			})
			renderSessionList();
		}
		closeDialog();
	}
	confirmBtn.removeEventListener('click', rename);
	confirmBtn.addEventListener('click', rename);
	return void 0
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
	})
	renderSessionList();
	renderChat();
	return void 0;
}

function handleSessionClick(sessionId): void {
	currentSessionId = sessionId;
	renderSessionList();
	renderChat();
	return void 0
}

function renderSessionList(): void {
	sessionList.innerHTML = "";

	const searchTerm =
		document.getElementById("session-search")?.value?.toLowerCase() || "";

	const sortedSessions = Object.entries(sessions)
		.filter(([, session]) => session.name?.toLowerCase().includes(searchTerm))
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
					await safeCallRemote(() => window.sync.saveAllSessions(sessions));
				}
				renderSessionList();
			})
			renderSessionList();
		};

		// Visible menu button (three dots) to open the session context menu without using right-click
		const menuBtn = document.createElement("button");
		menuBtn.className = "menu-btn";
		menuBtn.setAttribute('aria-label', 'Open session menu');
		menuBtn.title = 'Open session menu';
		menuBtn.innerText = '⋯';
		menuBtn.onclick = (e) => {
			e.stopPropagation(); // Prevent the click from bubbling and immediately closing the menu
			const rect = menuBtn.getBoundingClientRect();
			// pageX/pageY expected by showContextMenu
			const x = rect.right + window.scrollX - 8;
			const y = rect.bottom + window.scrollY + 4;
			showContextMenu(x, y, id, name);
		};
		menuBtn.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
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
	return void 0
}

// function renderChat(): void {
// 	if (!currentSessionId) {
// 		currentSessionId = Object.keys(sessions)[0] || null;
// 	}


// 	const session = sessions[currentSessionId];
// 	chatBox.innerHTML = "";

// 	if (!session.history || session.history.length === 0) {
// 		const emptyMsg = document.createElement("div");
// 		emptyMsg.className = "empty-chat";
// 		emptyMsg.textContent = "Start chatting to see messages here.";
// 		chatBox.appendChild(emptyMsg);
// 		return;
// 	}

// 	session.history.forEach((msg) => {
// 		const bubble = document.createElement("div");
// 		bubble.className = `chat-bubble ${
// 			msg.role === "user" ? "user-bubble" : "bot-bubble"
// 		}`;
// 		bubble.innerHTML = window.utils.markdown_parse(msg.content);
// 		chatBox.appendChild(bubble);
// 	});

// 	renderMathInElement(document.body, {
// 		delimiters: [
// 			{ left: '$$', right: '$$', display: true },
// 			{ left: '$', right: '$', display: true },
// 			{ left: '\\(', right: '\\)', display: false },
// 			{ left: '\\[', right: '\\]', display: true }
// 		],
// 		throwOnError: false
// 	});

// 	document.querySelectorAll("pre code").forEach((block) => {
// 		// hljs?.highlightElement?.(block); TODO
// 		void 0
// 	});

// 	chatBox.scrollTop = chatBox.scrollHeight;
// 	return void 0
// }

const actionBtn = document.getElementById("send");

let isStreaming = false;
let autoScroll = true;

// Helper to check if chatBox is scrolled to bottom
function isChatBoxAtBottom() {
	return chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 5;
}

// Listen for user scrolls to toggle autoScroll
chatBox.addEventListener('scroll', () => {
	// If user scrolls to bottom, enable autoScroll
	if (isChatBoxAtBottom()) {
		autoScroll = true;
	} else {
		autoScroll = false;
	}
});

searchBtn.addEventListener("click", () => {
	if (searchEnabled) {
		searchEnabled = false;
		searchBtn.textContent = "Don't search";
	} else {
		searchEnabled = true;
		searchBtn.textContent = "Search";
	}
	console.log("searchEnabled", searchEnabled);
});

imgBtn.addEventListener("click", () => {
	if (imgEnabled) {
		imgEnabled = false;
		imgBtn.textContent = "No Image";
	} else {
		imgEnabled = true;
		imgBtn.textContent = "Image";
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
			`[data-model="${model}"]`
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
				? clean.split("\r").pop() ?? ""
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
	}
);

async function autoNameSession(model: string, prompt: string, sessionId: string): Promise<string> {
	console.log("[autoNameSession] Called with:", { model, prompt, sessionId });
	const response = await fetch("http://localhost:11434/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model,
			messages: [
				{ role: "system", content: "Name this session based on the user prompt that the user submits. Only respond with the title." },
				{ role: "user", content: `Generate a short title for the following prompt:\n\n${prompt}` }
			],
			stream: false,
		}),
	});
	let data;
	try {
		data = await response.json();
	} catch (err) {
		console.error("[autoNameSession] Failed to parse JSON response:", err);
		showNotification({ message: "Failed to auto-name session: invalid response from model API.", type: "error" });
		return "";
	}
	if (!data || !data.message || typeof data.message.content !== "string") {
		console.error("[autoNameSession] Unexpected API response:", data);
		showNotification({ message: "Failed to auto-name session: unexpected response from model API.", type: "error" });
		return "";
	}
	let title = data.message.content.trim();
	// Remove surrounding quotes if present
	if ((title.startsWith('"') && title.endsWith('"')) || (title.startsWith("'") && title.endsWith("'"))) {
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
			if (models.some(m => m.name === defaultModel)) break;
			await new Promise(r => setTimeout(r, 1000));
			attempts++;
		}

		await loadOptions();

		modelSelect.value = defaultModel;
	}

	if (isStreaming) {
		window.ollama.stop?.();
		return;
	}

	const prompt = input.value.trim();
	const model = modelSelect.value;
	console.log("[form.submit] Prompt:", prompt, "CurrentSessionId:", currentSessionId);
	if (!prompt || !currentSessionId) return;
	if (sessions[currentSessionId].history.length === 0) {
		console.log("[form.submit] First prompt for session, calling autoNameSession...");
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

    input.value = "";
    input.style.height = "";
    window.ollama.removeAllListeners?.();
    window.ollama.streamPrompt(model, fullPrompt, searchEnabled, imgEnabled);

    let fullResponse = "";
    isStreaming = true;
    updateActionButton();


	window.ollama.onResponse((chunk) => {
		fullResponse += chunk;
		botBubble.innerHTML = window.utils.markdown_parse(fullResponse);
		if (autoScroll) {
			chatBox.scrollTop = chatBox.scrollHeight;
		}
	});

    window.ollama.onError((err) => {
        botBubble.textContent += `\n⚠️ Error: ${err}`;
        window.ollama.save(sessions);
		window.auth.getSession().then(async (auth) => {
			if (isSyncEnabled() && auth?.session?.user) {
				await safeCallRemote(() => window.sync.saveAllSessions(sessions));
			}
			renderSessionList();
		})
        endStreaming();
    });

    window.ollama.onDone(() => {
        session.history.push({ role: "assistant", content: fullResponse });
        const status = document.createElement("div");
        status.textContent = "✅ Done";
        status.style.marginTop = "8px";
        status.style.fontSize = "14px";
        status.style.color = "#3ca374";
        botBubble.appendChild(status);
		window.ollama.save(sessions);
		window.auth.getSession().then(async (auth) => {
			if (isSyncEnabled() && auth?.session?.user) {
				await safeCallRemote(() => window.sync.saveAllSessions(sessions));
			}
			renderSessionList();
		})
        endStreaming();
    });

    window.ollama.onAbort(() => {
        session.history.push({ role: "assistant", content: fullResponse });
        const status = document.createElement("div");
        status.textContent = "⚠︎ Interrupted";
        status.style.marginTop = "8px";
        status.style.fontSize = "14px";
        status.style.color = "#d9534f";
        botBubble.appendChild(status);
		window.ollama.save(sessions);
		window.auth.getSession().then(async (auth) => {
			if (isSyncEnabled() && auth?.session?.user) {
				await safeCallRemote(() => window.sync.saveAllSessions(sessions));
			}
			renderSessionList();
		})
        endStreaming();
    });

	window.ollama.onNewImage((asset) => {
	const dataUrl = asset.base64.startsWith("data:")
		? asset.base64
		: `data:image/png;base64,${asset.base64}`;

	// De-duplication: do not add same image twice
	const last = session.history.at(-1);
	if (last?.role === "image" && last.content === dataUrl) {
		return;
	}

	session.history.push({
		role: "image",
		content: dataUrl
	});

	// Re-render from canonical state
	renderChat();
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
			if ((e.target as HTMLElement).classList.contains("file-remove")) return;
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
        actionBtn.textContent = "⬆️";
        actionBtn.classList.remove("streaming");
        actionBtn.setAttribute("aria-label", "Send");
    }
}

function endStreaming() {
    isStreaming = false;
    updateActionButton();
}

const textarea = document.getElementById('chat-input') as HTMLInputElement;
textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
});
textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        (document.getElementById('send') as HTMLButtonElement).click();
    }
});

newSessionBtn.addEventListener("click", createNewSession);

(document.getElementById("session-search") as HTMLInputElement)
	.addEventListener("input", renderSessionList);

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("file-preview-btn")) {
    const index = e.target.dataset.index;
    const file = attachedFiles[index];
    (document.getElementById("file-preview-title") as HTMLTitleElement).textContent = file.name;
    (document.getElementById("file-preview-content") as HTMLPreElement).textContent = file.content;
    (document.getElementById("file-preview-modal") as HTMLDivElement).classList.remove("hidden");
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
	document.title = modelSelect.value + " - Chat - InferencePortAI"
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
      bubble.innerHTML = window.utils.markdown_parse(msg.content || "");
      chatBox.appendChild(bubble);
      return;
    }

    /* ---------------- ASSISTANT ---------------- */
    if (msg.role === "assistant") {
      const html = window.utils.markdown_parse(msg.content || "");
      const temp = document.createElement("div");
      temp.innerHTML = html;

      const botContainer = document.createElement("div");
      botContainer.className = "chat-bubble bot-bubble";

      Array.from(temp.childNodes).forEach((node) => {
        // Code blocks
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          node.tagName.toLowerCase() === "pre"
        ) {
          const preEl = node;
          const codeEl = preEl.querySelector("code");

          let lang = "code";
          if (codeEl?.className) {
            const match = codeEl.className.match(/language-([\w-]+)/);
            if (match) lang = match[1];
          }

          const codeBubble = document.createElement("div");
          codeBubble.className = "ai-code-bubble";

          const header = document.createElement("div");
          header.className = "ai-code-header";

          const langLabel = document.createElement("span");
          langLabel.className = "ai-code-lang";
          langLabel.textContent = lang;

          const copyBtn = document.createElement("button");
          copyBtn.className = "ai-copy-btn";
          copyBtn.textContent = "Copy";
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(codeEl?.textContent || "");
            copyBtn.textContent = "Copied!";
            setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
          };

          header.appendChild(langLabel);
          header.appendChild(copyBtn);
          codeBubble.appendChild(header);
          codeBubble.appendChild(preEl.cloneNode(true));
          botContainer.appendChild(codeBubble);
        } else {
          // Normal markup (paragraphs, lists, etc.)
          botContainer.appendChild(node.cloneNode(true));
        }
      });

      // IMPORTANT: never gate on textContent
      chatBox.appendChild(botContainer);
      return;
    }

    /* ---------------- IMAGE ---------------- */
	if (msg.role === "image") {
	const botContainer = document.createElement("div");
	botContainer.className = "chat-bubble bot-bubble";

	const img = document.createElement("img");
	img.src = msg.content;
	img.style.maxWidth = "100%";
	img.style.borderRadius = "8px";
	img.style.display = "block";

	// Download button
	const downloadBtn = document.createElement("button");
	downloadBtn.className = "ai-copy-btn"; // reuse styling
	downloadBtn.textContent = "Download";
	downloadBtn.style.marginTop = "6px";

	downloadBtn.onclick = () => {
		const a = document.createElement("a");
		a.href = msg.content;
		a.download = `image-${Date.now()}.png`; // filename
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	};

	botContainer.appendChild(img);
	botContainer.appendChild(downloadBtn);
	chatBox.appendChild(botContainer);
	return;
	}

    /* ---------------- FALLBACK ---------------- */
    console.warn("Unknown message role:", msg.role, msg);
  });

  // Math rendering
  renderMathInElement(document.body, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: true },
      { left: "\\(", right: "\\)", display: false },
      { left: "\\[", right: "\\]", display: true }
    ],
    throwOnError: false
  });

  // Syntax highlighting placeholder
  document.querySelectorAll("pre code").forEach(() => void 0);

  if (autoScroll) {
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}
