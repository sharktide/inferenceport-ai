type SnipImagePayload = {
	dataUrl: string;
	width?: number;
	height?: number;
};

type MessageContent =
	| string
	| Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

const statusEl = document.getElementById("snip-status") as HTMLDivElement;
const previewEl = document.getElementById("snip-preview") as HTMLDivElement;

const messagesEl = document.getElementById(
	"snip-messages",
) as HTMLDivElement;
const formEl = document.getElementById("snip-form") as HTMLFormElement;
const inputEl = document.getElementById("snip-input") as HTMLTextAreaElement;
const sendBtn = document.getElementById("snip-send") as HTMLButtonElement;

const sessionId = `snip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const DEFAULT_PROMPT =
	"Analyze the image, extract any text, and determine whether the user expects a description, an answer, or a solution. If the image contains a question or problem, solve it. If it contains objects or scenes, describe only what is visually evident. Do not infer identity, emotions, or private details.";
const MODEL = "lightning";
const CLIENT_URL = "lightning";

let lastImage: string | null = null;
let autoSent = false;
let streaming = false;

setInputEnabled(false);

function setStatus(text: string): void {
	statusEl.textContent = text;
}

function scrollToBottom(): void {
	messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addBubble(role: "user" | "bot", html: string): HTMLDivElement {
	const bubble = document.createElement("div");
	bubble.className = `snip-bubble ${role}`;
	// nosemgrep: javascript.browser.security.insecure-innerhtml
	bubble.innerHTML = html;
	messagesEl.appendChild(bubble);
	scrollToBottom();
	return bubble;
}

function setInputEnabled(enabled: boolean): void {
	inputEl.disabled = !enabled;
	sendBtn.disabled = !enabled;
}

function buildContent(text: string, includeImage: boolean): MessageContent {
	if (!includeImage || !lastImage) return text;
	return [
		{ type: "text", text },
		{ type: "image_url", image_url: { url: lastImage } },
	];
}

async function renderMarkdown(markdown: string): Promise<string> {
	try {
		return await window.utils.markdown_parse_and_purify(markdown);
	} catch {
		return markdown;
	}
}

async function sendPrompt(prompt: string, includeImage: boolean): Promise<void> {
	if (streaming) return;
	const trimmed = prompt.trim();
	if (!trimmed) return;

	setInputEnabled(false);
	streaming = true;
	setStatus("Thinking…");

	const userHtml = await renderMarkdown(trimmed);
	addBubble("user", userHtml);

	const botBubble = addBubble("bot", "Thinking…");
	let fullResponse = "";

	window.snipChat.removeAllListeners();

	window.snipChat.onResponse(async (chunk: string) => {
		fullResponse += chunk;
		const html = await renderMarkdown(fullResponse);
		// nosemgrep: javascript.browser.security.insecure-innerhtml
		botBubble.innerHTML = html;
		scrollToBottom();	});

	window.snipChat.onError((err: string) => {
		setStatus("Error");
		botBubble.textContent = `Error: ${err}`;
		streaming = false;
		setInputEnabled(true);
		//@ts-expect-error
		window.renderMathInElement(botBubble, {
			delimiters: [
				{ left: "$$", right: "$$", display: true },
				{ left: "$", right: "$", display: false },
				{ left: "\\(", right: "\\)", display: false },
				{ left: "\\[", right: "\\]", display: true },
			],
			throwOnError: false,
			strict: false,
		});
	});

	window.snipChat.onDone(() => {
		setStatus("Ready");
		streaming = false;
		setInputEnabled(true);
		//@ts-expect-error
		window.renderMathInElement(document.body, {
			delimiters: [
				{ left: "$$", right: "$$", display: true },
				{ left: "$", right: "$", display: false },
				{ left: "\\(", right: "\\)", display: false },
				{ left: "\\[", right: "\\]", display: true },
			],
			throwOnError: false,
		});
	});

	const content = buildContent(trimmed, includeImage);
	window.snipChat.streamPrompt(MODEL, content, CLIENT_URL, sessionId);
}

function handleSnipImage(payload: SnipImagePayload): void {
	if (!payload?.dataUrl) return;
	lastImage = payload.dataUrl;
	setStatus("Analyzing…");
	if (!autoSent) {
		autoSent = true;
		void sendPrompt(DEFAULT_PROMPT, true);
	}
}

window.snip?.onImage?.(handleSnipImage);

formEl.addEventListener("submit", (event) => {
	event.preventDefault();
	const prompt = inputEl.value.trim();
	inputEl.value = "";
	inputEl.style.height = "auto";

	if (!prompt) return;
	void sendPrompt(prompt, false);
});

inputEl.addEventListener("input", () => {
	inputEl.style.height = "0px";

	const lineHeight = 18;
	const maxHeight = lineHeight * 2;

	inputEl.style.height = `${Math.min(inputEl.scrollHeight, maxHeight)}px`;
});
inputEl.addEventListener("keydown", (e) => {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		formEl.requestSubmit();
	}
});