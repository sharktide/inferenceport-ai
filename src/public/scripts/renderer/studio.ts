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

import { MediaDB } from './db.js';

const mediaDB = new MediaDB();

type AssetRole = "image" | "video" | "audio";

type ImageMode = "auto" | "fantasy" | "realistic";

type VideoMode = "normal" | "fun";

type VideoRatio = "3:2" | "2:3" | "1:1";
const HISTORY_LIMIT = 50;
interface HistoryItem {
    id: string;
    role: AssetRole;
    content: string;
    mimeType: string;
    timestamp: number;
    title: string;
}

type ContentMode = "data" | "blob" | "asset";
interface PersistentHistoryItem {
    id: string;
    role: AssetRole;
    content: string;
    mode: ContentMode;
    mimeType: string;
    timestamp: number;
    title: string;
}

let isGenerating = false;
let activeToolCallId: string | null = null;
let activeRole: AssetRole | null = null;
const pendingResolutions = new Map<string, { name: string; payload: Record<string, unknown> }>();

function generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

async function loadHistoryFromStorage(): Promise<PersistentHistoryItem[]> {
    try {
        await mediaDB.open();
        const records = (await mediaDB.getAll()) as PersistentHistoryItem[];
        return records
            .filter(h => h.id && h.role && h.content && h.mimeType && h.timestamp && h.title)
            .sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) {
        console.warn("Failed to load history from IndexedDB", e);
        return [];
    }
}

const historyStore: PersistentHistoryItem[] = [];
const studioUrlParams = new URLSearchParams(window.location.search);
const openHistoryOnLoad =
	studioUrlParams.get("open") === "history" ||
	window.location.hash === "#history";

void loadHistoryFromStorage().then(items => {
    historyStore.push(...items);
    renderHistoryList();
	if (openHistoryOnLoad && historyModal && !historyModal.open) {
		historyModal.showModal();
	}
});

const historyModal = document.getElementById("history-modal") as HTMLDialogElement | null;
const historyListEl = document.getElementById("history-list") as HTMLUListElement | null;
const historyCloseBtn = document.getElementById("history-close") as HTMLButtonElement | null;
const historyClearAllBtn = document.getElementById("history-clear-all") as HTMLButtonElement | null;

const statusEl = document.getElementById("studio-status") as HTMLDivElement | null;
const previewTitle = document.getElementById("studio-preview-title") as HTMLHeadingElement | null;
const previewCanvas = document.getElementById("studio-preview-canvas") as HTMLDivElement | null;
const previewClearBtn = document.getElementById("studio-preview-clear") as HTMLButtonElement | null;

const imageGenerateBtn = document.getElementById("studio-image-generate") as HTMLButtonElement | null;
const editGenerateBtn = document.getElementById("studio-edit-generate") as HTMLButtonElement | null;
const videoGenerateBtn = document.getElementById("studio-video-generate") as HTMLButtonElement | null;
const audioGenerateBtn = document.getElementById("studio-audio-generate") as HTMLButtonElement | null;

const imageModeSelect = document.getElementById("studio-image-mode") as HTMLSelectElement | null;
const imagePromptInput = document.getElementById("studio-image-prompt") as HTMLTextAreaElement | null;

const editModeSelect = document.getElementById("studio-edit-mode") as HTMLSelectElement | null;
const editPromptInput = document.getElementById("studio-edit-prompt") as HTMLTextAreaElement | null;
const editUploadInput = document.getElementById("studio-edit-upload") as HTMLInputElement | null;

const videoRatioSelect = document.getElementById("studio-video-ratio") as HTMLSelectElement | null;
const videoModeSelect = document.getElementById("studio-video-mode") as HTMLSelectElement | null;
const videoDurationInput = document.getElementById("studio-video-duration") as HTMLInputElement | null;
const videoPromptInput = document.getElementById("studio-video-prompt") as HTMLTextAreaElement | null;
const videoUploadInput = document.getElementById("studio-video-upload") as HTMLInputElement | null;
const previewHistoryBtn = document.getElementById("studio-preview-history") as HTMLButtonElement | null;
const previewCopyBtn    = document.getElementById("studio-preview-copy")    as HTMLButtonElement | null;
const previewDownloadBtn= document.getElementById("studio-preview-download") as HTMLButtonElement | null;

const audioPromptInput = document.getElementById("studio-audio-prompt") as HTMLTextAreaElement | null;

const initialCanvasMarkup = previewCanvas?.innerHTML ?? "";
const assetObjectUrlCache = new Map<string, string>();

previewHistoryBtn?.addEventListener("click", () => {
    if (!historyModal) {
        setStatus("History feature not available.", true);
        return;
    }
    if (!historyModal.open) {
        historyModal.showModal();
    }
});

historyCloseBtn?.addEventListener("click", () => {
    historyModal?.close();
});

historyClearAllBtn?.addEventListener("click", () => {
    void clearHistory();
    setStatus("History cleared.");
});

function setStatus(message: string, isError = false): void {
	if (!statusEl) return;
	statusEl.textContent = message;
	statusEl.classList.toggle("is-error", isError);
}

function getCurrentMediaElement(): HTMLElement | null {
    if (!previewCanvas) return null;
    return previewCanvas.querySelector(".studio-preview-media") as HTMLElement | null;
}

function truncateString(str: string, n: number): string {
    return str.length > n ? str.slice(0, n) + "..." : str;
}

function setPreviewTitle(text: string): void {
	if (previewTitle) previewTitle.textContent = text;
}

function setPreviewContent(node: HTMLElement): void {
	if (!previewCanvas) return;
	previewCanvas.innerHTML = "";
	previewCanvas.appendChild(node);
}

async function copyCurrentMedia(): Promise<void> {
    const el = getCurrentMediaElement();
    if (!el) {
        setStatus("Nothing to copy.", true);
        return;
    }

    let src = "";
    if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) {
        src = el.src;
    }

    try {
        await navigator.clipboard.writeText(src);
        setStatus("Media URL copied to clipboard.");
    } catch (e) {
        setStatus("Copy failed.", true);
    }
}

previewCopyBtn?.addEventListener("click", () => {
    void copyCurrentMedia();
});

previewDownloadBtn?.addEventListener("click", () => {
    downloadCurrentMedia();
});

function downloadCurrentMedia(): void {
    const el = getCurrentMediaElement();
    if (!el) {
        setStatus("Nothing to download.", true);
        return;
    }

    let src = "";
    let filename = "download";
    if (el instanceof HTMLImageElement) {
        src = el.src;
        filename = "image.png";
    } else if (el instanceof HTMLVideoElement) {
        src = el.src;
        filename = "video.mp4";
    } else if (el instanceof HTMLAudioElement) {
        src = el.src;
        filename = "audio.mp3";
    }

    const a = document.createElement("a");
    a.href = src;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setStatus(`${filename} download started.`);
}

function renderHistoryList(): void {
    if (!historyListEl) return;

    if (historyStore.length === 0) {
        historyListEl.innerHTML = `<li class="empty">No items in history yet.</li>`;
        return;
    }

    historyListEl.innerHTML = "";

    for (const item of historyStore) {
        const li = document.createElement("li");
        li.dataset.id = item.id;

        let iconEl: HTMLElement;

        if (item.role === "image" && item.mode !== "asset") {
            const img = document.createElement("img");
            img.className = "studio-history-image";
            img.alt = "";
            img.src = item.content;
            iconEl = img;
        } else {
            const span = document.createElement("span");
            span.className = "studio-history-icon";
            span.textContent =
                item.role === "image" ? "🖼️" :
                item.role === "video" ? "▶️" :
                "🔊";
            iconEl = span;
        }

        li.appendChild(iconEl);

        const info = document.createElement("div");
        info.className = "studio-history-info";

        const titleEl = document.createElement("strong");
        titleEl.textContent = item.title; // safe

        const timeEl = document.createElement("span");
        timeEl.textContent = new Date(item.timestamp).toLocaleTimeString(); // safe

        info.appendChild(titleEl);
        info.appendChild(timeEl);
        li.appendChild(info);

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "studio-history-delete";
        deleteBtn.type = "button";
        deleteBtn.setAttribute("aria-label", "Delete item");
        deleteBtn.textContent = "Delete";
		deleteBtn.style.fontSize = "1rem";
        deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            void deleteHistoryItem(item.id);
        });

        li.appendChild(deleteBtn);

        li.addEventListener("click", async () => {
            let src = item.content;

            if (item.mode === "asset") {
                try {
                    showPreviewMessage(`Restoring from asset ${src}...`);
                    src = await getAssetObjectUrl(item.content, item.mimeType);
                } catch (err) {
                    showPreviewMessage(`Failed to restore asset: ${err}`);
                    return;
                }
            }

            setPreviewTitle(`History: ${item.title}`);

            const el =
                item.role === "image" ? createImageElement(src) :
                item.role === "video" ? createVideoElement(src) :
                createAudioElement(src);

            setPreviewContent(el);
            historyModal?.close();
            setStatus("Restored from history.");
        });

        historyListEl.appendChild(li);
    }
}

function showPreviewMessage(text: string): void {
	const wrapper = document.createElement("div");
	wrapper.className = "studio-placeholder";
	const message = document.createElement("p");
	message.textContent = text;
	wrapper.appendChild(message);
	setPreviewContent(wrapper);
}

async function saveToHistory(item: PersistentHistoryItem): Promise<void> {
    historyStore.unshift(item);
    
    if (historyStore.length > HISTORY_LIMIT) {
        const removed = historyStore.splice(HISTORY_LIMIT);
        for (const oldItem of removed) {
            await mediaDB.delete(oldItem.id);
        }
    }

    try {
        await mediaDB.add(item);
    } catch (e) {
        console.error("Failed to save item to IndexedDB", e);
    }

    if (historyListEl) renderHistoryList();
}

function resetPreview(): void {
	// nosemgrep
	if (previewCanvas) previewCanvas.innerHTML = initialCanvasMarkup;
	setPreviewTitle("Ready to create.");
}

function setGeneratingState(state: boolean): void {
	isGenerating = state;
	const disabled = state;
	if (imageGenerateBtn) imageGenerateBtn.disabled = disabled;
	if (editGenerateBtn) editGenerateBtn.disabled = disabled;
	if (videoGenerateBtn) videoGenerateBtn.disabled = disabled;
	if (audioGenerateBtn) audioGenerateBtn.disabled = disabled;
}

function fileToDataUri(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ""));
		reader.onerror = () => reject(reader.error || new Error("Failed to read image file"));
		reader.readAsDataURL(file);
	});
}

function attachUploadHandler(input: HTMLInputElement | null): void {
	if (!input) return;
	const label = input.closest("label");
	const infoSpan = label?.querySelector("span");
	input.addEventListener("change", async () => {
		const file = input.files?.[0];
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			if (infoSpan) infoSpan.textContent = "Only image files are supported.";
			return;
		}
		if (infoSpan) infoSpan.textContent = "Uploading image...";
		try {
			const dataUrl = await fileToDataUri(file);
			input.dataset.imageUrl = dataUrl;
			input.dataset.fileName = file.name;
			if (infoSpan) infoSpan.textContent = `Uploaded: ${file.name}`;
		} catch (err) {
			if (infoSpan) infoSpan.textContent = "Upload failed. Try again.";
		}
	});
}

async function getAssetObjectUrl(assetId: string, mimeType: string): Promise<string> {
	const cacheKey = `${mimeType}:${assetId}`;
	if (assetObjectUrlCache.has(cacheKey)) return assetObjectUrlCache.get(cacheKey)!;
	const rawBuffer = await window.utils.getAsset(assetId) as Uint8Array<ArrayBuffer>;
	const uint8 = rawBuffer instanceof Uint8Array ? rawBuffer : new Uint8Array(rawBuffer);
	const typedBlob = new Blob([uint8], { type: mimeType });
	const objectUrl = URL.createObjectURL(typedBlob);
	assetObjectUrlCache.set(cacheKey, objectUrl);
	return objectUrl;
}

function createImageElement(src: string): HTMLElement {
	const img = document.createElement("img");
	img.src = src;
	img.alt = "Generated image";
	img.className = "studio-preview-media";
	return img;
}

function createVideoElement(src: string): HTMLElement {
	const video = document.createElement("video");
	video.src = src;
	video.controls = true;
	video.preload = "metadata";
	video.className = "studio-preview-media";
	return video;
}

function createAudioElement(src: string): HTMLElement {
	const audio = document.createElement("audio");
	audio.src = src;
	audio.controls = true;
	audio.preload = "metadata";
	audio.className = "studio-preview-media studio-preview-audio";
	return audio;
}

function renderAsset(role: AssetRole, source: string): void {
    if (role === "image") {
        setPreviewTitle("Image ready.");
        const img = createImageElement(source);
        setPreviewContent(img);

        const title = truncateString(imagePromptInput?.value.trim() || "Unnamed image", 30);
        let mode: ContentMode = "data";
        let content = source;

        if (source.startsWith("blob:")) {
            mode = "blob";
            // Try to capture asset ID from cache if possible (advanced)
        } else if (/^asset:[a-z]+:[\w-]+$/.test(source)) {
            mode = "asset";
            content = source; // keep pure asset ID
        }

        saveToHistory({
            id: generateId(),
            role,
            content,
            mode,
            mimeType: "image/png",
            timestamp: Date.now(),
            title,
        });

        setGeneratingState(false);
        return;
    }

    const mimeType = role === "video" ? "video/mp4" : "audio/mpeg";
    const title = role === "video"
        ? truncateString(videoPromptInput?.value.trim() || "Unnamed video", 30)
        : truncateString(audioPromptInput?.value.trim() || "Unnamed audio", 30);

    if (source.startsWith("data:") || source.startsWith("blob:")) {
        setPreviewTitle(role === "video" ? "Video ready." : "Audio ready.");
        const el = role === "video" ? createVideoElement(source) : createAudioElement(source);
        setPreviewContent(el);
        setGeneratingState(false);

        saveToHistory({
            id: generateId(),
            role,
            content: source,
            mode: source.startsWith("blob:") ? "blob" : "data",
            mimeType,
            timestamp: Date.now(),
            title,
        });
        return;
    }

    showPreviewMessage(`Loading ${role} asset...`);

    void getAssetObjectUrl(source, mimeType)
        .then((objectUrl) => {
            setPreviewTitle(role === "video" ? "Video ready." : "Audio ready.");
            const el = role === "video" ? createVideoElement(objectUrl) : createAudioElement(objectUrl);
            setPreviewContent(el);

            saveToHistory({
                id: generateId(),
                role,
                content: source,
                mode: "asset",
                mimeType,
                timestamp: Date.now(),
                title,
            });
            setGeneratingState(false);
        })
        .catch((err) => {
            showPreviewMessage(`Failed to load ${role}: ${String(err)}`);
            setGeneratingState(false);
        });
}

async function runImageGeneration(options: { prompt: string; mode: ImageMode; image_urls?: string[] }): Promise<void> {
	if (!options.prompt.trim()) {
		setStatus("Prompt is required.", true);
		return;
	}

	if (isGenerating) {
		setStatus("Generation already in progress.", true);
		return;
	}

	setGeneratingState(true);
	setStatus("Starting image generation...");
	setPreviewTitle("Generating image...");
	showPreviewMessage("Preparing image generation...");

	try {
		const payload: Record<string, unknown> = {
			prompt: options.prompt,
			mode: options.mode,
		};
		if (options.image_urls?.length) payload.image_urls = options.image_urls;
		const toolCallId = await window.ollama.startImageToolCall(payload);
		activeToolCallId = toolCallId;
		activeRole = "image";
		pendingResolutions.set(toolCallId, { name: "generate_image", payload });
		const accepted = await window.ollama.resolveImageToolCall(toolCallId, payload);
		if (accepted) {
			pendingResolutions.delete(toolCallId);
		}
		setStatus(accepted ? "Submitting generation request..." : "Awaiting generation queue...");
	} catch (err: any) {
		setStatus(`Image generation failed: ${String(err)}`, true);
		setGeneratingState(false);
	}
}

async function runVideoGeneration(options: {
	prompt: string;
	ratio?: VideoRatio;
	mode: VideoMode;
	duration?: number;
	image_urls?: string[];
}): Promise<void> {
	if (!options.prompt.trim()) {
		setStatus("Prompt is required.", true);
		return;
	}

	if (isGenerating) {
		setStatus("Generation already in progress.", true);
		return;
	}

	setGeneratingState(true);
	setStatus("Starting video generation...");
	setPreviewTitle("Generating video...");
	showPreviewMessage("Preparing video generation...");

	try {
		const payload: Record<string, unknown> = {
			prompt: options.prompt,
			mode: options.mode,
		};
		if (options.ratio) payload.ratio = options.ratio;
		if (typeof options.duration === "number") payload.duration = options.duration;
		if (options.image_urls?.length) payload.image_urls = options.image_urls;
		const toolCallId = await window.ollama.startVideoToolCall(payload);
		activeToolCallId = toolCallId;
		activeRole = "video";
		pendingResolutions.set(toolCallId, { name: "generate_video", payload });
		const accepted = await window.ollama.resolveVideoToolCall(toolCallId, payload);
		if (accepted) {
			pendingResolutions.delete(toolCallId);
		}
		setStatus(accepted ? "Submitting generation request..." : "Awaiting generation queue...");
	} catch (err: any) {
		setStatus(`Video generation failed: ${String(err)}`, true);
		setGeneratingState(false);
	}
}

async function runAudioGeneration(prompt: string): Promise<void> {
	if (!prompt.trim()) {
		setStatus("Prompt is required.", true);
		return;
	}

	if (isGenerating) {
		setStatus("Generation already in progress.", true);
		return;
	}

	setGeneratingState(true);
	setStatus("Starting audio generation...");
	setPreviewTitle("Generating audio...");
	showPreviewMessage("Preparing audio generation...");

	try {
		const payload: Record<string, unknown> = { prompt };
		const toolCallId = await window.ollama.startAudioToolCall(payload);
		activeToolCallId = toolCallId;
		activeRole = "audio";
		pendingResolutions.set(toolCallId, { name: "generate_audio", payload });
		const accepted = await window.ollama.resolveAudioToolCall(toolCallId, payload);
		if (accepted) {
			pendingResolutions.delete(toolCallId);
		}
		setStatus(accepted ? "Submitting generation request..." : "Awaiting generation queue...");
	} catch (err: any) {
		setStatus(`Audio generation failed: ${String(err)}`, true);
		setGeneratingState(false);
	}
}

async function deleteHistoryItem(id: string): Promise<void> {
    const idx = historyStore.findIndex(item => item.id === id);
    if (idx !== -1) historyStore.splice(idx, 1);
    await mediaDB.delete(id);
    renderHistoryList();
    setStatus("Item removed from history.");
}

async function clearHistory(): Promise<void> {
    historyStore.length = 0;
    await mediaDB.clear();
    renderHistoryList();
}

attachUploadHandler(editUploadInput);
attachUploadHandler(videoUploadInput);

imageGenerateBtn?.addEventListener("click", () => {
	const prompt = imagePromptInput?.value.trim() ?? "";
	const mode = (imageModeSelect?.value ?? "auto") as ImageMode;
	void runImageGeneration({ prompt, mode });
});

editGenerateBtn?.addEventListener("click", () => {
	const prompt = editPromptInput?.value.trim() ?? "";
	const mode = (editModeSelect?.value ?? "auto") as ImageMode;
	const imageUrl = editUploadInput?.dataset.imageUrl;
	const image_urls = imageUrl ? [imageUrl] : [];
	void runImageGeneration({ prompt, mode, image_urls });
});

videoGenerateBtn?.addEventListener("click", () => {
	const prompt = videoPromptInput?.value.trim() ?? "";
	const ratioValue = videoRatioSelect?.value.trim() ?? "";
	const mode = (videoModeSelect?.value ?? "normal") as VideoMode;
	const durationValue = videoDurationInput?.value.trim() ?? "";
	const durationNum = durationValue ? Number(durationValue) : NaN;
	const imageUrl = videoUploadInput?.dataset.imageUrl;
	const image_urls = imageUrl ? [imageUrl] : [];

	void runVideoGeneration({
		prompt,
		mode,
		image_urls,
		...(ratioValue ? { ratio: ratioValue as VideoRatio } : {}),
		...(Number.isFinite(durationNum) ? { duration: durationNum } : {}),
	});
});

audioGenerateBtn?.addEventListener("click", () => {
	const prompt = audioPromptInput?.value.trim() ?? "";
	void runAudioGeneration(prompt);
});

previewClearBtn?.addEventListener("click", () => {
	resetPreview();
	setStatus("Preview cleared.");
});

window.ollama.onToolCall((call) => {
	if (!call || call.id !== activeToolCallId) return;
	if (call.state === "awaiting_input") {
		const pending = pendingResolutions.get(call.id);
		if (pending && call.name === pending.name) {
			const resolver =
				pending.name === "generate_image"
					? window.ollama.resolveImageToolCall
					: pending.name === "generate_video"
						? window.ollama.resolveVideoToolCall
						: window.ollama.resolveAudioToolCall;
			void resolver(call.id, pending.payload).then((accepted: boolean) => {
				if (!accepted) {
					setStatus("Request expired. Try again.", true);
					setGeneratingState(false);
				}
			});
			pendingResolutions.delete(call.id);
		}
		setStatus("Submitting generation request...");
		return;
	}
	if (call.state === "pending") {
		const label = call.name === "generate_video" ? "video" : call.name === "generate_audio" ? "audio" : "image";
		setStatus(`Generating ${label}...`);
		return;
	}
	if (call.state === "resolved") {
		setStatus(call.result || "Generation complete.");
		setGeneratingState(false);
		return;
	}
	if (call.state === "canceled") {
		setStatus(call.result || "Generation canceled.", true);
		setGeneratingState(false);
	}
});

window.ollama.onNewAsset((msg) => {
	if (!msg || !msg.role || !msg.content) return;
	if (!(["image", "video", "audio"] as AssetRole[]).includes(msg.role)) return;
	renderAsset(msg.role as AssetRole, msg.content as string);
});

window.addEventListener("beforeunload", () => {
    for (const [key, url] of assetObjectUrlCache) {
        URL.revokeObjectURL(url);
    }
    assetObjectUrlCache.clear();
});
