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

type AssetRole = "image" | "video" | "audio";

type ImageMode = "auto" | "fantasy" | "realistic";

type VideoMode = "normal" | "fun";

type VideoRatio = "3:2" | "2:3" | "1:1";

const statusEl = document.getElementById("studio-status") as HTMLDivElement | null;
const previewTitle = document.getElementById("studio-preview-title") as HTMLHeadingElement | null;
const previewCanvas = document.getElementById("studio-preview-canvas") as HTMLDivElement | null;
const previewClearBtn = document.getElementById("studio-preview-clear") as HTMLButtonElement | null;

const imageGenerateBtn = document.getElementById("studio-image-generate") as HTMLButtonElement | null;
const editGenerateBtn = document.getElementById("studio-edit-generate") as HTMLButtonElement | null;
const editResetBtn = document.getElementById("studio-edit-reset") as HTMLButtonElement | null;
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

const audioPromptInput = document.getElementById("studio-audio-prompt") as HTMLTextAreaElement | null;

const initialCanvasMarkup = previewCanvas?.innerHTML ?? "";
const assetObjectUrlCache = new Map<string, string>();

let activeToolCallId: string | null = null;
let activeRole: AssetRole | null = null;
let isGenerating = false;
const pendingResolutions = new Map<
	string,
	{ name: "generate_image" | "generate_video" | "generate_audio"; payload: Record<string, unknown> },
>();

function setStatus(message: string, isError = false): void {
	if (!statusEl) return;
	statusEl.textContent = message;
	statusEl.classList.toggle("is-error", isError);
}

function setPreviewTitle(text: string): void {
	if (previewTitle) previewTitle.textContent = text;
}

function setPreviewContent(node: HTMLElement): void {
	if (!previewCanvas) return;
	previewCanvas.innerHTML = "";
	previewCanvas.appendChild(node);
}

function showPreviewMessage(text: string): void {
	const wrapper = document.createElement("div");
	wrapper.className = "studio-placeholder";
	const message = document.createElement("p");
	message.textContent = text;
	wrapper.appendChild(message);
	setPreviewContent(wrapper);
}

function resetPreview(): void {
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
	const rawBuffer = await window.utils.getAsset(assetId);
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

function renderAsset(role: AssetRole, content: string): void {
	if (role === "image") {
		setPreviewTitle("Image ready.");
		setPreviewContent(createImageElement(content));
		setGeneratingState(false);
		return;
	}

	if (content.startsWith("data:") || content.startsWith("blob:")) {
		setPreviewTitle(role === "video" ? "Video ready." : "Audio ready.");
		setPreviewContent(role === "video" ? createVideoElement(content) : createAudioElement(content));
		setGeneratingState(false);
		return;
	}

	showPreviewMessage(`Loading ${role} asset...`);
	const mimeType = role === "video" ? "video/mp4" : "audio/mpeg";
	void getAssetObjectUrl(content, mimeType)
		.then((objectUrl) => {
			setPreviewTitle(role === "video" ? "Video ready." : "Audio ready.");
			setPreviewContent(role === "video" ? createVideoElement(objectUrl) : createAudioElement(objectUrl));
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

editResetBtn?.addEventListener("click", () => {
	if (editPromptInput) editPromptInput.value = "";
	if (editModeSelect) editModeSelect.value = "auto";
	if (editUploadInput) {
		editUploadInput.value = "";
		delete editUploadInput.dataset.imageUrl;
		delete editUploadInput.dataset.fileName;
		const label = editUploadInput.closest("label");
		const infoSpan = label?.querySelector("span");
		if (infoSpan) infoSpan.textContent = "PNG or JPG · up to 10 MB";
	}
	setStatus("Edit inputs cleared.");
});

videoGenerateBtn?.addEventListener("click", () => {
	const prompt = videoPromptInput?.value.trim() ?? "";
	const ratioValue = videoRatioSelect?.value.trim() ?? "";
	const mode = (videoModeSelect?.value ?? "normal") as VideoMode;
	const durationValue = videoDurationInput?.value.trim() ?? "";
	const duration = durationValue ? Number(durationValue) : undefined;
	const imageUrl = videoUploadInput?.dataset.imageUrl;
	const image_urls = imageUrl ? [imageUrl] : [];

	void runVideoGeneration({
		prompt,
		ratio: ratioValue ? (ratioValue as VideoRatio) : undefined,
		mode,
		duration: Number.isFinite(duration as number) ? duration : undefined,
		image_urls,
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
