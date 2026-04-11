type SnipTarget = {
	displayId: number;
	bounds: { x: number; y: number; width: number; height: number };
	scaleFactor: number;
};

type SnipCapture = {
	dataUrl: string;
	width: number;
	height: number;
	displayId?: number;
	scaleFactor?: number;
};

const root = document.getElementById("snip-root") as HTMLDivElement;
const canvas = document.getElementById("snip-canvas") as HTMLCanvasElement;
const selectionBox = document.getElementById("selection-box") as HTMLDivElement;
const hint = document.getElementById("snip-hint") as HTMLDivElement;
const errorEl = document.getElementById("snip-error") as HTMLDivElement;

let target: SnipTarget | null = null;
let capture: SnipCapture | null = null;
let image: HTMLImageElement | null = null;
let isDragging = false;
let startX = 0;
let startY = 0;
let selection: { x: number; y: number; width: number; height: number } | null = null;

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function updateSelectionBox(rect: { x: number; y: number; width: number; height: number } | null): void {
	if (!rect || rect.width < 1 || rect.height < 1) {
		selectionBox.style.display = "none";
		return;
	}

	selectionBox.style.display = "block";
	selectionBox.style.left = `${rect.x}px`;
	selectionBox.style.top = `${rect.y}px`;
	selectionBox.style.width = `${rect.width}px`;
	selectionBox.style.height = `${rect.height}px`;
}

function getCanvasScale(): number {
	if (!target || !capture) return 1;
	return capture.width / target.bounds.width;
}

async function finalizeCapture(): Promise<void> {
	if (!selection || !capture || !image || !target) return;

	const minSize = 6;
	if (selection.width < minSize || selection.height < minSize) {
		selection = null;
		updateSelectionBox(null);
		return;
	}

	const scale = getCanvasScale();
	const sx = Math.round(selection.x * scale);
	const sy = Math.round(selection.y * scale);
	const sw = Math.round(selection.width * scale);
	const sh = Math.round(selection.height * scale);

	const cropCanvas = document.createElement("canvas");
	cropCanvas.width = Math.max(1, sw);
	cropCanvas.height = Math.max(1, sh);
	const ctx = cropCanvas.getContext("2d");
	if (!ctx) return;

	ctx.drawImage(image, sx, sy, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height);
	const dataUrl = cropCanvas.toDataURL("image/png");

	await window.snip.complete({ dataUrl, width: cropCanvas.width, height: cropCanvas.height });
}

function handlePointerDown(event: PointerEvent): void {
	if (!target) return;
	isDragging = true;
	const rect = root.getBoundingClientRect();
	startX = clamp(event.clientX - rect.left, 0, rect.width);
	startY = clamp(event.clientY - rect.top, 0, rect.height);
	selection = { x: startX, y: startY, width: 0, height: 0 };
	updateSelectionBox(selection);
}

function handlePointerMove(event: PointerEvent): void {
	if (!isDragging || !selection) return;
	const rect = root.getBoundingClientRect();
	const currentX = clamp(event.clientX - rect.left, 0, rect.width);
	const currentY = clamp(event.clientY - rect.top, 0, rect.height);
	const x = Math.min(startX, currentX);
	const y = Math.min(startY, currentY);
	const width = Math.abs(currentX - startX);
	const height = Math.abs(currentY - startY);
	selection = { x, y, width, height };
	updateSelectionBox(selection);
}

function handlePointerUp(): void {
	if (!isDragging) return;
	isDragging = false;
	void finalizeCapture();
}

function showError(message: string): void {
	errorEl.textContent = message;
	errorEl.style.display = "flex";
	hint.style.display = "none";
	window.snip.readyToShow();
}

async function loadCapture(): Promise<void> {
	try {
		target = await window.snip.getTarget();
		if (!target) {
			showError("No display target available.");
			return;
		}

		capture = await window.snip.captureScreen({
			displayId: target.displayId,
			width: target.bounds.width,
			height: target.bounds.height,
			scaleFactor: target.scaleFactor,
		});

		image = new Image();
		image.src = capture.dataUrl;
		await image.decode();

		canvas.width = capture.width;
		canvas.height = capture.height;
		canvas.style.width = `${target.bounds.width}px`;
		canvas.style.height = `${target.bounds.height}px`;

		const ctx = canvas.getContext("2d");
		if (!ctx) {
			showError("Unable to render the screen capture.");
			return;
		}
		ctx.drawImage(image, 0, 0);

		window.snip.readyToShow();
	} catch (err: any) {
		console.error("Snip capture failed", err);
		const message =
			typeof err?.message === "string" && err.message.trim().length > 0
				? err.message
				: "Unable to capture the screen.";
		showError(message);
	}
}

root.addEventListener("pointerdown", handlePointerDown);
root.addEventListener("pointermove", handlePointerMove);
root.addEventListener("pointerup", handlePointerUp);
root.addEventListener("pointerleave", () => {
	if (!isDragging) return;
	isDragging = false;
});

window.addEventListener("keydown", (event) => {
	if (event.key === "Escape") {
		event.preventDefault();
		window.snip.cancel();
		return;
	}
	if (event.key === "Enter") {
		event.preventDefault();
		void finalizeCapture();
	}
});

window.addEventListener("contextmenu", (event) => {
	event.preventDefault();
});

void loadCapture();
