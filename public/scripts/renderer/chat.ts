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

function openRenameDialog(sessionId, currentName) {
	const dialog = document.getElementById("rename-dialog");
	const input = document.getElementById("rename-input");
	const cancelBtn = document.getElementById("rename-cancel");
	const confirmBtn = document.getElementById("rename-confirm");

	input.value = currentName;
	dialog.classList.remove("hidden");

	const closeDialog = () => dialog.classList.add("hidden");

	cancelBtn.onclick = closeDialog;

	confirmBtn.onclick = () => {
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
	};
}

function createNewSession() {
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
}

function handleSessionClick(sessionId) {
	currentSessionId = sessionId;
	renderSessionList();
	renderChat();
}

function renderSessionList() {
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

		const nameWrapper = document.createElement("div");
		nameWrapper.className = "session-name-wrapper";
		nameWrapper.appendChild(nameSpan);
		nameWrapper.appendChild(star);
		li.appendChild(nameWrapper);

		sessionList.appendChild(li);
		if (session.__merged) {
			li.classList.add("merged-session");
		}
	});
}

function renderChat() {
	if (!currentSessionId) {
		currentSessionId = Object.keys(sessions)[0] || null;
	}


	const session = sessions[currentSessionId];
	chatBox.innerHTML = "";

	if (!session.history || session.history.length === 0) {
		const emptyMsg = document.createElement("div");
		emptyMsg.className = "empty-chat";
		emptyMsg.textContent = "Start chatting to see messages here.";
		chatBox.appendChild(emptyMsg);
		return;
	}

	session.history.forEach((msg) => {
		const bubble = document.createElement("div");
		bubble.className = `chat-bubble ${
			msg.role === "user" ? "user-bubble" : "bot-bubble"
		}`;
		bubble.innerHTML = window.utils.markdown_parse(msg.content);
		chatBox.appendChild(bubble);
	});

	renderMathInElement(document.body, {
		delimiters: [
			{ left: '$$', right: '$$', display: true },
			{ left: '$', right: '$', display: true },
			{ left: '\\(', right: '\\)', display: false },
			{ left: '\\[', right: '\\]', display: true }
		],
		throwOnError: false
	});

	document.querySelectorAll("pre code").forEach((block) => {
		// hljs?.highlightElement?.(block); TODO
		void 0
	});

	chatBox.scrollTop = chatBox.scrollHeight;
}

const actionBtn = document.getElementById("send");
let isStreaming = false;

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


function formatAttachedFiles(files) {
  if (files.length === 0) return "";

  let output = `<details><summary>Attached Files</summary>\n\n`;
  for (const file of files) {
    output += `<details><summary>${file.name}</summary>\n\n`;
    output += "```\n" + file.content + "\n```\n";
    output += `</details>\n\n`;
  }
  output += `</details>\n\n`;
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
form.addEventListener("submit", async (e) => {
    e.preventDefault();

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
    if (!prompt || !currentSessionId) return;

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
    window.ollama.streamPrompt(model, fullPrompt);

    let fullResponse = "";
    isStreaming = true;
    updateActionButton();

    window.ollama.onResponse((chunk) => {
        fullResponse += chunk;
        botBubble.innerHTML = window.utils.markdown_parse(fullResponse);
        chatBox.scrollTop = chatBox.scrollHeight;
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

function syncPreviewBarWidth() {
  const typingBar = document.querySelector(".typing-bar");
  const previewBar = document.querySelector(".file-preview-bar");
  if (typingBar && previewBar) {
    previewBar.style.maxWidth = `${typingBar.offsetWidth}px`;
  }
}

window.addEventListener("resize", syncPreviewBarWidth);
syncPreviewBarWidth();

window.onload = renderFileIndicator
