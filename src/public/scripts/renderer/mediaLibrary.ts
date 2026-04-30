import { showNotification } from "../helper/notification.js";

type MediaItem = {
	id: string;
	type: "file" | "folder";
	name: string;
	parentId?: string | null;
	kind?: string | null;
	mimeType?: string | null;
	size?: number;
	trashedAt?: string | null;
};

type Attachment =
	| { type: "image"; name: string; mimeType: string; base64: string; mediaId?: string }
	| { type: "text"; name: string; content: string; mediaId?: string };

const state = {
	parentId: null as string | null,
	items: [] as MediaItem[],
	breadcrumbs: [] as Array<{ id: string; name: string }>,
	usage: null as any,
	initialized: false,
	trash: {
		items: [] as MediaItem[],
		selected: new Set<string>(),
		usage: null as any,
	},
};

let mediaModal: declarations["iInstance"]["iModal"] | null = null;

function ensureMediaModal(): declarations["iInstance"]["iModal"] {
	if (!mediaModal) {
		mediaModal = new window.ic.iModal(
			"media-library-modal",
			520,
			undefined,
			false,
			false,
		);
	}
	return mediaModal;
}

function closeMediaModal(): void {
	mediaModal?.close();
}

function openConfirmModal(opts: {
	title: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
}): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = ensureMediaModal();
		modal.open({
			title: opts.title,
			html: `<p style="margin:0;line-height:1.45;">${escHtml(opts.message)}</p>`,
			actions: [
				{
					id: "media-confirm-cancel",
					label: opts.cancelLabel || "Cancel",
					onClick: () => {
						closeMediaModal();
						resolve(false);
					},
				},
				{
					id: "media-confirm-ok",
					label: opts.confirmLabel || "Confirm",
					onClick: () => {
						closeMediaModal();
						resolve(true);
					},
				},
			],
		});
	});
}

function openTextInputModal(opts: {
	title: string;
	label: string;
	initialValue?: string;
	confirmLabel?: string;
	placeholder?: string;
}): Promise<string | null> {
	return new Promise((resolve) => {
		const modal = ensureMediaModal();
		modal.open({
			title: opts.title,
			html: `
				<label for="media-modal-input" style="display:block;font-size:12px;opacity:.8;margin-bottom:8px;">${escHtml(opts.label)}</label>
				<input id="media-modal-input" class="modal-input" value="${escHtml(opts.initialValue || "")}" placeholder="${escHtml(opts.placeholder || "")}" />
			`,
			actions: [
				{
					id: "media-input-cancel",
					label: "Cancel",
					onClick: () => {
						closeMediaModal();
						resolve(null);
					},
				},
				{
					id: "media-input-save",
					label: opts.confirmLabel || "Save",
					onClick: () => {
						const input = document.getElementById("media-modal-input") as HTMLInputElement | null;
						const value = input?.value?.trim() || "";
						closeMediaModal();
						resolve(value || null);
					},
				},
			],
		});
	});
}

// Side-panel editor: used for both creating new docs and editing existing files
// Returns { name, content } for new-file creation, or null if cancelled
function openEditorPanel(opts: {
	title: string;
	fileName: string;
	fileType: string; // 'rich_text' | 'text' | extension like 'js', 'py', etc.
	initialContent: string;
	isNew: boolean;
	confirmLabel?: string;
	onSave?: (name: string, content: string) => Promise<void>;
	onClose?: () => void;
}): void {
	const panel = document.getElementById("media-editor-panel");
	const contentWrap = document.getElementById("media-editor-content");
	const titleEl = document.getElementById("media-editor-title");
	const metaEl = document.getElementById("media-editor-meta");
	const toolbar = document.getElementById("media-editor-toolbar");
	const nameRow = document.getElementById("media-editor-name-row");
	const nameInput = document.getElementById("media-editor-filename") as HTMLInputElement | null;
	if (!panel || !contentWrap || !titleEl || !metaEl || !toolbar) return;

	const isRich = opts.fileType === "rich_text";
	const metaLabel = isRich ? "Rich text" : opts.fileType === "text" ? "Plain text" : opts.fileType.toUpperCase();

	titleEl.textContent = opts.isNew ? opts.title : opts.fileName;
	metaEl.textContent = metaLabel;

	// Show/hide the filename input row for new file creation
	if (nameRow) nameRow.classList.toggle("hidden", !opts.isNew);
	if (nameInput) nameInput.value = opts.fileName;

	// Reset content area and toolbar
	contentWrap.innerHTML = "";
	toolbar.innerHTML = "";
	toolbar.classList.toggle("hidden", !isRich);

	// Show panel (.hidden class only — no inline style conflict)
	panel.classList.remove("hidden");
	panel.removeAttribute("aria-hidden");

	let getValue = () => "";

	if (isRich) {
		const editor = document.createElement("div");
		editor.className = "media-rich-editor";
		editor.contentEditable = "true";
		editor.innerHTML = opts.initialContent || "<p></p>";
		contentWrap.appendChild(editor);
		for (const [label, cmd, ttl] of [
			["Bold", "bold", "Bold"],
			["Italic", "italic", "Italic"],
			["Underline", "underline", "Underline"]
		] as Array<[string, string, string]>) {
			const btn = document.createElement("button");
			btn.className = "media-editor-tool";
			btn.type = "button";
			btn.textContent = label;
			btn.title = ttl;
			btn.addEventListener("click", () => {
				if (cmd === "createLink") {
					const url = prompt("Enter URL:");
					if (url) document.execCommand(cmd, false, url);
				} else if (cmd === "formatBlock") {
					document.execCommand(cmd, false, "<blockquote>");
				} else {
					document.execCommand(cmd);
				}
			});
			toolbar.appendChild(btn);
		}
		getValue = () => editor.innerHTML;
	} else {
		const textarea = document.createElement("textarea");
		textarea.className = "media-text-editor";
		textarea.value = opts.initialContent;
		contentWrap.appendChild(textarea);
		getValue = () => textarea.value;
	}

	const closeEditor = () => {
		panel.classList.add("hidden");
		panel.setAttribute("aria-hidden", "true");
		contentWrap.innerHTML = "";
		toolbar.innerHTML = "";
		opts.onClose?.();
	};

	// Replace buttons with fresh clones to clear any old listeners,
	// then look up fresh nodes by ID since replaceChild swaps them in the DOM.
	const oldClose = document.getElementById("media-editor-close");
	const oldCancel = document.getElementById("media-editor-cancel");
	const oldSave = document.getElementById("media-editor-save") as HTMLButtonElement | null;

	if (oldClose?.parentNode) {
		const fresh = oldClose.cloneNode(true) as HTMLElement;
		oldClose.parentNode.replaceChild(fresh, oldClose);
		fresh.addEventListener("click", closeEditor);
	}
	if (oldCancel?.parentNode) {
		const fresh = oldCancel.cloneNode(true) as HTMLElement;
		oldCancel.parentNode.replaceChild(fresh, oldCancel);
		fresh.addEventListener("click", closeEditor);
	}
	if (oldSave?.parentNode) {
		const fresh = oldSave.cloneNode(true) as HTMLButtonElement;
		oldSave.parentNode.replaceChild(fresh, oldSave);
		fresh.textContent = opts.confirmLabel || "Save";
		fresh.onclick = async () => {
			const content = getValue();
			const name = opts.isNew && nameInput ? (nameInput.value.trim() || opts.fileName) : opts.fileName;
			if (!name) {
				showNotification({ type: "warning", message: "A file name is required." });
				return;
			}
			if (opts.onSave) {
				await opts.onSave(name, content);
			}
			// Always close panel after save
			closeEditor();
		};
	}
}

function openDocumentModal(opts: {
	title: string;
	defaultName: string;
	defaultContent: string;
	confirmLabel?: string;
}): Promise<{ name: string; content: string } | null> {
	return new Promise((resolve) => {
		let resolved = false;
		openEditorPanel({
			title: opts.title,
			fileName: opts.defaultName,
			fileType: opts.defaultName.endsWith(".html") ? "rich_text" : "text",
			initialContent: opts.defaultContent,
			isNew: true,
			confirmLabel: opts.confirmLabel || "Create",
			onSave: async (name, content) => {
				if (!resolved) { resolved = true; resolve({ name, content }); }
			},
			onClose: () => {
				if (!resolved) { resolved = true; resolve(null); }
			},
		});
	});
}

function openActionChoiceModal(opts: {
	title: string;
	message?: string;
	choices: Array<{ id: string; label: string; description?: string }>;
}): Promise<string | null> {
	return new Promise((resolve) => {
		const modal = ensureMediaModal();
		const choicesHtml = opts.choices
			.map(
				(choice) => `
					<a class="media-choice-btn" href="#" data-choice-id="${escHtml(choice.id)}">
						<span class="media-choice-label">${escHtml(choice.label)}</span>
						${choice.description ? `<span class="media-choice-description">${escHtml(choice.description)}</span>` : ""}
					</a>
				`,
			)
			.join("");
		modal.open({
			title: opts.title,
			html: `
				${opts.message ? `<p style="margin:0 0 10px;opacity:.85;">${escHtml(opts.message)}</p>` : ""}
				<div class="media-choice-list">${choicesHtml}</div>
			`,
			actions: [
				{
					id: "media-choice-cancel",
					label: "Cancel",
					onClick: () => {
						closeMediaModal();
						resolve(null);
					},
				},
			],
		});
		setTimeout(() => {
			document.querySelectorAll(".media-choice-btn").forEach((a) => {
				a.addEventListener("click", (e) => {
					e.preventDefault();
					const id = (a as HTMLElement).dataset.choiceId || null;
					closeMediaModal();
					resolve(id);
				});
			});
		}, 0);
	});
}

function escHtml(value: string): string {
	return String(value || "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function bytesLabel(size = 0): string {
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
	if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
	return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function plainTextFromHtml(html: string): string {
	const doc = new DOMParser().parseFromString(html || "", "text/html");
	return doc.body?.textContent?.trim() || "";
}

function isAttachable(item: MediaItem): boolean {
	return item.type === "file" && ["image", "text", "rich_text"].includes(String(item.kind || ""));
}

function listEl(): HTMLElement | null {
	return document.getElementById("media-list");
}

function crumbsEl(): HTMLElement | null {
	return document.getElementById("media-breadcrumbs");
}

function usageEl(): HTMLElement | null {
	return document.getElementById("media-usage-panel");
}

function trashListEl(): HTMLElement | null {
	return document.getElementById("sidebar-trash-list");
}

function trashBarEl(): HTMLElement | null {
	return document.getElementById("sidebar-trash-selection-bar");
}

function trashTitleEl(): HTMLElement | null {
	return document.getElementById("sidebar-trash-title");
}

function trashSubtitleEl(): HTMLElement | null {
	return document.getElementById("sidebar-trash-subtitle");
}

async function refreshMediaList(): Promise<void> {
	const res = await window.sync.mediaList({ view: "active", parentId: state.parentId });
	if (res?.error) throw new Error(String(res.error));
	state.items = Array.isArray(res?.items) ? res.items : [];
	state.breadcrumbs = Array.isArray(res?.breadcrumbs) ? res.breadcrumbs : [];
	state.usage = res?.usage || null;
	renderMediaList();
}

async function refreshTrashList(): Promise<void> {
	const res = await window.sync.mediaList({ view: "trash", parentId: null });
	if (res?.error) throw new Error(String(res.error));
	state.trash.items = Array.isArray(res?.items) ? res.items : [];
	state.trash.usage = res?.usage || null;
	const visible = new Set(state.trash.items.map((it) => it.id));
	state.trash.selected = new Set([...state.trash.selected].filter((id) => visible.has(id)));
	renderTrashOverlay();
}

function renderUsagePanel(): void {
	const panel = usageEl();
	if (!panel) return;
	if (!state.usage) {
		panel.innerHTML = "";
		return;
	}
	const quota = Number(state.usage.quotaBytes || 0);
	const total = Number(state.usage.totalBytes || 0);
	const percent = quota > 0 ? Math.max(0, Math.min(100, (total / quota) * 100)) : 0;
	panel.innerHTML = `
		<div class="media-usage-copy">
			<span class="media-usage-label">Storage</span>
			<span class="media-usage-values">${bytesLabel(total)} / ${bytesLabel(quota)}</span>
		</div>
		<div class="media-usage-meter"><div class="media-usage-fill" style="width:${percent.toFixed(2)}%"></div></div>
	`;
}

function renderTrashOverlay(): void {
	const list = trashListEl();
	const bar = trashBarEl();
	if (!list || !bar) return;
	const title = trashTitleEl();
	const subtitle = trashSubtitleEl();
	if (title) title.textContent = "Trash";
	if (subtitle) subtitle.textContent = `Media • ${state.trash.items.length} item${state.trash.items.length === 1 ? "" : "s"}`;

	const selectedCount = state.trash.selected.size;
	bar.classList.toggle("hidden", selectedCount === 0);
	bar.innerHTML =
		selectedCount === 0
			? ""
			: `<span>${selectedCount} selected</span>
			   <div class="sidebar-selection-actions">
			     <button class="sidebar-action-btn" data-trash-action="restore">Restore</button>
			     <button class="sidebar-action-btn danger" data-trash-action="delete">Delete forever</button>
			   </div>`;

	bar.querySelector('[data-trash-action="restore"]')?.addEventListener("click", async () => {
		const ids = [...state.trash.selected];
		if (!ids.length) return;
		const res = await window.sync.mediaRestore({ ids });
		if (res?.error) throw new Error(String(res.error));
		state.trash.selected.clear();
		await refreshTrashList();
		await refreshMediaList();
	});
	bar.querySelector('[data-trash-action="delete"]')?.addEventListener("click", async () => {
		const ids = [...state.trash.selected];
		if (!ids.length) return;
		const ok = await openConfirmModal({
			title: "Delete Forever",
			message: `Delete ${ids.length} item(s) forever? This cannot be undone.`,
			confirmLabel: "Delete",
		});
		if (!ok) return;
		const res = await window.sync.mediaDelete({ ids });
		if (res?.error) throw new Error(String(res.error));
		state.trash.selected.clear();
		await refreshTrashList();
	});

	if (!state.trash.items.length) {
		list.innerHTML = `<div class="sidebar-empty-state">Trash is empty.</div>`;
		return;
	}

	list.innerHTML = state.trash.items
		.map((item) => {
			const checked = state.trash.selected.has(item.id) ? "checked" : "";
			const meta =
				item.type === "folder"
					? "Folder"
					: `${escHtml(String(item.kind || "file"))} • ${bytesLabel(Number(item.size || 0))}`;
			return `<div class="media-list-item">
        <label class="media-item-check">
          <input type="checkbox" data-trash-select="${escHtml(item.id)}" ${checked}/>
        </label>
				<button class="media-item-main" data-trash-open="${escHtml(item.id)}">
					<span class="media-item-icon">${item.type === "folder" ? "📁" : "📄"}</span>
					<span class="media-item-copy">
						<span class="media-item-name">${escHtml(item.name)}</span>
						<span class="media-item-meta">${meta}</span>
					</span>
				</button>
			</div>`;
		})
		.join("");

	list.querySelectorAll("[data-trash-select]").forEach((input) => {
		input.addEventListener("change", () => {
			const id = (input as HTMLInputElement).dataset.trashSelect || "";
			if (!id) return;
			if ((input as HTMLInputElement).checked) state.trash.selected.add(id);
			else state.trash.selected.delete(id);
			renderTrashOverlay();
		});
	});
}

function renderMediaList(): void {
	const list = listEl();
	const crumbs = crumbsEl();
	if (!list || !crumbs) return;

	const crumbParts = [
		`<a class="media-breadcrumb${!state.parentId ? " active" : ""}" href="#" data-root="1">Library</a>`,
		...state.breadcrumbs.map(
			(c, i) =>
				`<span class="media-breadcrumb-sep">/</span><a class="media-breadcrumb${
					i === state.breadcrumbs.length - 1 ? " active" : ""
				}" href="#" data-crumb="${escHtml(c.id)}">${escHtml(c.name)}</a>`,
		),
	];
	crumbs.innerHTML = crumbParts.join("");
	crumbs.querySelector('[data-root="1"]')?.addEventListener("click", (e) => {
		e.preventDefault();
		state.parentId = null;
		void refreshMediaList().catch(handleError);
	});
	crumbs.querySelectorAll("[data-crumb]").forEach((a) => {
		a.addEventListener("click", (e) => {
			e.preventDefault();
			state.parentId = (a as HTMLElement).dataset.crumb || null;
			void refreshMediaList().catch(handleError);
		});
	});

	if (!state.items.length) {
		list.innerHTML = `<div class="sidebar-empty-state">No media in this folder.</div>`;
		renderUsagePanel();
		return;
	}

	list.innerHTML = state.items
		.map((item) => {
			const meta =
				item.type === "folder"
					? "Folder"
					: `${escHtml(String(item.kind || "file"))} • ${bytesLabel(Number(item.size || 0))}`;
			const mainTag = item.type === "folder" ? "a" : "button";
			const mainAttrs = item.type === "folder"
				? `class="media-item-main" href="#" data-open="${escHtml(item.id)}"`
				: `class="media-item-main" type="button" data-open="${escHtml(item.id)}"`;
			return `<div class="media-list-item">
				<${mainTag} ${mainAttrs}>
					<span class="media-item-icon">${item.type === "folder" ? "📁" : "📄"}</span>
					<span class="media-item-copy">
						<span class="media-item-name">${escHtml(item.name)}</span>
						<span class="media-item-meta">${meta}</span>
					</span>
				</${mainTag}>
				<button class="media-item-menu" data-menu="${escHtml(item.id)}">•••</button>
			</div>`;
		})
		.join("");

	list.querySelectorAll("[data-open]").forEach((el) => {
		el.addEventListener("click", async (e) => {
			e.preventDefault();
			const id = (el as HTMLElement).dataset.open;
			const item = state.items.find((it) => it.id === id);
			if (!item) return;
			if (item.type === "folder") {
				state.parentId = item.id;
				await refreshMediaList().catch(handleError);
				return;
			}
			await openEditor(item).catch(handleError);
		});
	});

	list.querySelectorAll("[data-menu]").forEach((btn) => {
		btn.addEventListener("click", async () => {
			const id = (btn as HTMLElement).dataset.menu;
			const item = state.items.find((it) => it.id === id);
			if (!item) return;
			const action = await openActionChoiceModal({
				title: item.name,
				message: "Choose an action",
				choices: [
					{ id: "rename", label: "Rename" },
					{ id: "move", label: "Move to folder" },
					{ id: "trash", label: "Move to trash" },
				],
			});
			if (action === "rename") {
				const nextName = await openTextInputModal({
					title: "Rename item",
					label: "Name",
					initialValue: item.name,
					confirmLabel: "Save",
				});
				if (!nextName) return;
				const res = await window.sync.mediaUpdate(item.id, { name: nextName });
				if (res?.error) throw new Error(String(res.error));
				await refreshMediaList();
			} else if (action === "move") {
				const folder = await openFolderPicker({
					title: "Move to folder",
					confirmLabel: "Move here",
				});
				const parentId = folder?.id ?? null;
				const res = await window.sync.mediaMove({ ids: [item.id], parentId });
				if (res?.error) throw new Error(String(res.error));
				await refreshMediaList();
			} else if (action === "trash") {
				const res = await window.sync.mediaTrash({ ids: [item.id] });
				if (res?.error) throw new Error(String(res.error));
				await refreshMediaList();
			}
		});
	});

	renderUsagePanel();
}

const EDITABLE_EXTENSIONS = new Set([
	"txt", "md", "html", "htm", "css", "js", "ts", "jsx", "tsx",
	"json", "yaml", "yml", "xml", "csv", "py", "rb", "sh", "bash",
	"java", "c", "cpp", "h", "rs", "go", "php", "sql", "env",
	"ini", "toml", "conf", "log", "rtf",
]);

function getFileExtension(name: string): string {
	return name.includes(".") ? name.split(".").pop()?.toLowerCase() || "" : "";
}

function isEditable(item: MediaItem): boolean {
	if (["text", "rich_text"].includes(String(item.kind || ""))) return true;
	const ext = getFileExtension(item.name || "");
	return EDITABLE_EXTENSIONS.has(ext);
}

async function openEditor(item: MediaItem): Promise<void> {
	if (!isEditable(item)) {
		showNotification({ message: "This file type cannot be edited.", type: "info" });
		return;
	}
	const payload = await window.sync.mediaGetContent(item.id, { format: "text" });
	if (payload?.error) throw new Error(String(payload.error));
	const currentContent = String(payload?.content || "");
	const rich = String(item.kind || "") === "rich_text";
	const ext = getFileExtension(item.name || "");
	const fileType = rich ? "rich_text" : (String(item.kind || "") === "text" ? "text" : ext);

	openEditorPanel({
		title: item.name || "Untitled",
		fileName: item.name || "Untitled",
		fileType,
		initialContent: currentContent,
		isNew: false,
		confirmLabel: "Save",
		onSave: async (_name, content) => {
			const res = await window.sync.mediaUpdateContent(item.id, {
				text: content,
				kind: rich ? "rich_text" : "text",
				mimeType: rich ? "text/html" : "text/plain",
			});
			if (res?.error) throw new Error(String(res.error));
			showNotification({ message: "Saved.", type: "success" });
			// Panel close is handled by openEditorPanel after onSave returns
			await refreshMediaList().catch(handleError);
		},
	});
}

function handleError(err: unknown): void {
	showNotification({
		type: "error",
		message: err instanceof Error ? err.message : String(err),
	});
}

export async function mediaItemToAttachment(item: MediaItem): Promise<Attachment | null> {
	if (!item || !isAttachable(item)) return null;
	if (item.kind === "image") {
		const payload = await window.sync.mediaGetContent(item.id, { format: "base64" });
		if (payload?.error) throw new Error(String(payload.error));
		const mimeType = String(item.mimeType || payload?.item?.mimeType || "image/png");
		return {
			type: "image",
			name: item.name,
			base64: String(payload?.content || ""),
			mimeType,
			mediaId: item.id,
		};
	}
	const payload = await window.sync.mediaGetContent(item.id, { format: "text" });
	if (payload?.error) throw new Error(String(payload.error));
	const raw = String(payload?.content || "");
	return {
		type: "text",
		name: item.name,
		content: item.kind === "rich_text" ? plainTextFromHtml(raw) : raw,
		mediaId: item.id,
	};
}

export async function openMediaPicker(opts: {
	title?: string;
	onSelect?: (items: MediaItem[]) => Promise<void> | void;
} = {}): Promise<void> {
	await openPickerModal({
		title: opts.title || "Add From Media Library",
		confirmLabel: "Attach Selected",
		filter: (item) => isAttachable(item),
		onConfirm: async (selected) => {
			await opts.onSelect?.(selected);
		},
	});
}

export async function openMediaTrashOverlay(): Promise<void> {
	await refreshTrashList().catch(handleError);
}

type PickerModalOpts = {
	title: string;
	confirmLabel: string;
	filter?: (item: MediaItem) => boolean;
	onConfirm: (selected: MediaItem[]) => Promise<void> | void;
};

function createModalShell(): { overlay: HTMLDivElement; box: HTMLDivElement } {
	const overlay = document.createElement("div");
	overlay.style.cssText =
		"position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;";
	const box = document.createElement("div");
	box.style.cssText =
		"width:min(720px,96vw);max-height:min(80vh,720px);background:var(--bg-light);border-radius:14px;border:1px solid color-mix(in srgb, var(--text-dark) 18%, transparent);display:flex;flex-direction:column;overflow:hidden;";
	overlay.appendChild(box);
	return { overlay, box };
}

async function openPickerModal(opts: PickerModalOpts): Promise<void> {
	const modalState = {
		parentId: null as string | null,
		items: [] as MediaItem[],
		breadcrumbs: [] as Array<{ id: string; name: string }>,
		selected: new Set<string>(),
	};

	const { overlay, box } = createModalShell();
	box.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid color-mix(in srgb, var(--text-dark) 12%, transparent);">
      <div style="font-weight:700;font-size:14px;">${escHtml(opts.title)}</div>
      <button id="ml-close" class="btn-ghost" type="button">Close</button>
    </div>
    <div style="padding:10px 14px;display:flex;flex-direction:column;gap:8px;overflow:auto;">
      <div id="ml-crumbs" class="media-breadcrumbs"></div>
      <div id="ml-list" class="media-picker-list"></div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;padding:12px 14px;border-top:1px solid color-mix(in srgb, var(--text-dark) 12%, transparent);">
      <button id="ml-cancel" class="btn-ghost" type="button">Cancel</button>
      <button id="ml-confirm" class="btn-primary" type="button" disabled>${escHtml(opts.confirmLabel)}</button>
    </div>
  `;
	document.body.appendChild(overlay);

	const close = () => overlay.remove();
	(box.querySelector("#ml-close") as HTMLButtonElement | null)?.addEventListener("click", close);
	(box.querySelector("#ml-cancel") as HTMLButtonElement | null)?.addEventListener("click", close);
	overlay.addEventListener("click", (e) => {
		if (e.target === overlay) close();
	});

	const crumbs = box.querySelector("#ml-crumbs") as HTMLDivElement | null;
	const list = box.querySelector("#ml-list") as HTMLDivElement | null;
	const confirm = box.querySelector("#ml-confirm") as HTMLButtonElement | null;
	if (!crumbs || !list || !confirm) return;

	const load = async () => {
		const res = await window.sync.mediaList({ view: "active", parentId: modalState.parentId });
		if (res?.error) throw new Error(String(res.error));
		modalState.items = Array.isArray(res?.items) ? res.items : [];
		modalState.breadcrumbs = Array.isArray(res?.breadcrumbs) ? res.breadcrumbs : [];
		const visible = new Set(modalState.items.map((it) => it.id));
		modalState.selected = new Set([...modalState.selected].filter((id) => visible.has(id)));
		render();
	};

	const render = () => {
		crumbs.innerHTML = [
			`<a class="media-breadcrumb${!modalState.parentId ? " active" : ""}" href="#" data-root="1">Library</a>`,
			...modalState.breadcrumbs.map(
				(c, i) =>
					`<span class="media-breadcrumb-sep">/</span><a class="media-breadcrumb${
						i === modalState.breadcrumbs.length - 1 ? " active" : ""
					}" href="#" data-crumb="${escHtml(c.id)}">${escHtml(c.name)}</a>`,
			),
		].join("");
		crumbs.querySelector('[data-root="1"]')?.addEventListener("click", (e) => {
			e.preventDefault();
			modalState.parentId = null;
			void load().catch(handleError);
		});
		crumbs.querySelectorAll("[data-crumb]").forEach((a) => {
			a.addEventListener("click", (e) => {
				e.preventDefault();
				modalState.parentId = (a as HTMLElement).dataset.crumb || null;
				void load().catch(handleError);
			});
		});

		const filtered = opts.filter
			? modalState.items.filter((it) => it.type === "folder" || opts.filter?.(it))
			: modalState.items;
		if (!filtered.length) {
			list.innerHTML = `<div class="sidebar-empty-state">Nothing to show here</div>`;
		} else {
			list.innerHTML = filtered
				.map((item) => {
					const selectable = item.type === "file" && (opts.filter ? opts.filter(item) : true);
					const checked = selectable && modalState.selected.has(item.id) ? "checked" : "";
					const meta =
						item.type === "folder"
							? "Folder"
							: `${escHtml(String(item.kind || "file"))} • ${bytesLabel(Number(item.size || 0))}`;
					const mainTag = item.type === "folder" ? "a" : "button";
					const mainAttrs = item.type === "folder"
						? `class="media-item-main" href="#" data-open="${escHtml(item.id)}"`
						: `class="media-item-main" type="button" data-open="${escHtml(item.id)}"`;
					return `<div class="media-list-item">
            <${mainTag} ${mainAttrs}>
              <span class="media-item-icon">${item.type === "folder" ? "📁" : "📄"}</span>
              <span class="media-item-copy">
                <span class="media-item-name">${escHtml(item.name)}</span>
                <span class="media-item-meta">${meta}</span>
              </span>
            </${mainTag}>
            ${selectable ? `<label class="media-item-check"><input type="checkbox" data-select="${escHtml(item.id)}" ${checked}/></label>` : ""}
          </div>`;
				})
				.join("");
		}

		list.querySelectorAll("[data-open]").forEach((el) => {
			el.addEventListener("click", (e) => {
				e.preventDefault();
				const id = (el as HTMLElement).dataset.open || "";
				const item = modalState.items.find((it) => it.id === id);
				if (!item) return;
				if (item.type === "folder") {
					modalState.parentId = item.id;
					void load().catch(handleError);
				}
			});
		});

		list.querySelectorAll("[data-select]").forEach((input) => {
			input.addEventListener("change", () => {
				const id = (input as HTMLInputElement).dataset.select || "";
				if (!id) return;
				if ((input as HTMLInputElement).checked) modalState.selected.add(id);
				else modalState.selected.delete(id);
				confirm.disabled = modalState.selected.size === 0;
			});
		});

		confirm.disabled = modalState.selected.size === 0;
	};

	confirm.addEventListener("click", async () => {
		const selected = modalState.items.filter((it) => modalState.selected.has(it.id));
		if (!selected.length) return;
		await opts.onConfirm(selected);
		close();
	});

	await load().catch((err) => {
		handleError(err);
		close();
	});
}

async function openFolderPicker(opts: { title: string; confirmLabel: string }): Promise<{ id: string; name: string } | null> {
	let chosen: { id: string; name: string } | null = null;
	await openPickerModal({
		title: opts.title,
		confirmLabel: opts.confirmLabel,
		filter: (item) => item.type === "folder",
		onConfirm: async (selected) => {
			const firstFolder = selected.find((it) => it.type === "folder") || null;
			chosen = firstFolder ? { id: firstFolder.id, name: firstFolder.name } : null;
		},
	});
	return chosen;
}

export function initMediaLibrary(): void {
	if (state.initialized) return;
	state.initialized = true;

	const createBtn = document.getElementById("media-create-btn");
	const uploadInput = document.getElementById("media-upload-input") as HTMLInputElement | null;
	createBtn?.addEventListener("click", async () => {
		const action = await openActionChoiceModal({
			title: "Create or upload",
			choices: [
				{ id: "upload", label: "Upload file", description: "Upload files from your device" },
				{ id: "folder", label: "New folder", description: "Organize library items" },
				{ id: "text", label: "Plain text document", description: "Create plain text notes and files" },
				{ id: "rich", label: "Rich text document", description: "Create formatted documents, notes, and more" },
			],
		});
		if (action === "folder") {
			const name = await openTextInputModal({
				title: "Create folder",
				label: "Folder name",
				initialValue: "New Folder",
				confirmLabel: "Create",
			});
			if (!name) return;
			const res = await window.sync.mediaCreateFolder({ name, parentId: state.parentId });
			if (res?.error) throw new Error(String(res.error));
			await refreshMediaList();
			return;
		}
		if (action === "text" || action === "rich") {
			const doc = await openDocumentModal({
				title: action === "rich" ? "Create rich text document" : "Create text document",
				defaultName: action === "rich" ? "Untitled Document.html" : "Untitled Document.txt",
				defaultContent: action === "rich" ? "<p></p>" : "",
				confirmLabel: "Create",
			});
			if (!doc) return;
			const res = await window.sync.mediaCreateFile({
				name: doc.name,
				text: doc.content,
				kind: action === "rich" ? "rich_text" : "text",
				mimeType: action === "rich" ? "text/html" : "text/plain",
				parentId: state.parentId,
			});
			if (res?.error) throw new Error(String(res.error));
			await refreshMediaList();
			return;
		}
		uploadInput?.click();
	});

	uploadInput?.addEventListener("change", async (event) => {
		const files = Array.from((event.target as HTMLInputElement).files || []);
		for (const file of files) {
			const buffer = await file.arrayBuffer();
			let payload: any = {
				name: file.name,
				mimeType: file.type || "application/octet-stream",
				parentId: state.parentId,
				base64: btoa(String.fromCharCode(...new Uint8Array(buffer))),
			};
			if ((file.type || "").startsWith("text/")) {
				payload = {
					name: file.name,
					mimeType: file.type || "text/plain",
					parentId: state.parentId,
					text: await file.text(),
					kind: "text",
				};
			}
			const res = await window.sync.mediaCreateFile(payload);
			if (res?.error) throw new Error(String(res.error));
		}
		(event.target as HTMLInputElement).value = "";
		await refreshMediaList().catch(handleError);
	});

	void refreshMediaList().catch(handleError);
}