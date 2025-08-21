//@ts-nocheck
const dataDir = window.ollama.getPath();
const sessionFile = `${dataDir}/sessions.json`;
const chatBox = document.getElementById("chat-box");
const input = document.getElementById("chat-input");
const form = document.getElementById("chat-form");
const stopBtn = document.getElementById("stop-btn");
const modelSelect = document.getElementById("model-select");
const sessionList = document.getElementById("session-list");
const newSessionBtn = document.getElementById("new-session-btn");

let sessions = {};
let currentSessionId = null;

document.addEventListener("DOMContentLoaded", async () => {
	try {
		const models = await window.ollama.listModels();
		models.forEach((model) => {
			const option = document.createElement("option");
			option.value = model.name;
			option.textContent = model.name;
			modelSelect.appendChild(option);
		});

		const loaded = await window.ollama.load();
		sessions = loaded;
		currentSessionId = Object.keys(sessions)[0] || createNewSession();
		renderSessionList();
		renderChat();
	} catch (err) {
		modelSelect.innerHTML = `<option>Error loading models</option>`;
		console.error(err);
	}
});

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
		location.reload();
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
			renderSessionList();
		};

		const nameWrapper = document.createElement("div");
		nameWrapper.className = "session-name-wrapper";
		nameWrapper.appendChild(nameSpan);
		nameWrapper.appendChild(star);
		li.appendChild(nameWrapper);

		sessionList.appendChild(li);
	});
}

function renderChat() {
	if (!currentSessionId || !sessions[currentSessionId]) {
		const newId = Date.now().toString();
		sessions[newId] = {
			id: newId,
			name: `Session ${Object.keys(sessions).length + 1}`,
			history: [],
			favorite: false,
		};
		currentSessionId = newId;
		window.ollama.save(sessions);
		renderSessionList();
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

	document.querySelectorAll("pre code").forEach((block) => {
		hljs?.highlightElement?.(block);
	});

	chatBox.scrollTop = chatBox.scrollHeight;
}

form.addEventListener("submit", (e) => {
	e.preventDefault();
	const prompt = input.value.trim();
	const model = modelSelect.value;
	if (!prompt || !currentSessionId) return;

	const session = sessions[currentSessionId];
	session.model = model;

	session.history.push({ role: "user", content: prompt });
	renderChat();

	const botBubble = document.createElement("div");
	botBubble.className = "chat-bubble bot-bubble";
	botBubble.textContent = "🤖 ";
	chatBox.appendChild(botBubble);
	chatBox.scrollTop = chatBox.scrollHeight;

	input.value = "";
	window.ollama.removeAllListeners?.();
	window.ollama.streamPrompt(model, prompt);

	let fullResponse = "";

	window.ollama.onResponse((chunk) => {
		fullResponse += chunk;
		botBubble.innerHTML = window.utils.markdown_parse(fullResponse);
		chatBox.scrollTop = chatBox.scrollHeight;
	});

	window.ollama.onError((err) => {
		botBubble.textContent += `\n⚠️ Error: ${err}`;
		window.ollama.save(sessions);
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
	});
});

stopBtn.addEventListener("click", () => {
	window.ollama.stop?.();
});

newSessionBtn.addEventListener("click", createNewSession);

document
	.getElementById("session-search")
	.addEventListener("input", renderSessionList);
