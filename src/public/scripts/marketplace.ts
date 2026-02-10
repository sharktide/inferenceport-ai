import { getReadableColor, getEmoji } from "./helper/random.js";
import { showNotification } from "./helper/notification.js";

const modal = new window.ic.iModal("marketImportModal", 520);
const fileModal = new window.ic.iModal("fileImportModal", 520,
    {
        title: "Import .import File",
        html: `
            <div style="max-width: 500px;">
            <div id="drop-zone">
                <div class="drop-icon">📂</div>
                <p id="drop-text">
                Drag & drop your <strong>.import</strong> file here<br>
                or <span class="click-to-upload">click to upload</span>
                </p>
                <small>Only valid .import files are supported</small>
                <input id="import-file" type="file" accept=".import" hidden />
            </div>

            <div id="file-indicator" class="file-indicator hidden">
                <div class="file-name"></div>
                <div class="file-size"></div>
            </div>
            </div>
        `,

        actions: [
            {
                id: "file-import",
                label: "Import",
                onClick: async () => {
                    const input = document.getElementById("import-file") as HTMLInputElement;
                    const file = input.files?.[0];

                    if (!file) {
                        notify("No file selected", "error");
                        return;
                    }

                    try {
                        const text = await file.text();
                        const config = JSON.parse(text);

                        await window.ifc.saveImport(config);
                        fileModal.close();
                        notifySuccess();
                    } catch (e: any) {
                        notify("Invalid .import file", "error");
                    }
                }
            }
        ]
    }, false, true);

type ImportType = "space" | "website";

function notify(message: string, type: "success" | "error") {
    showNotification({
        message,
        type,
        actions: [{ label: "OK", onClick: () => void 0 }]
    });
}

function notifySuccess() {
    showNotification({
        message: "Import Successful",
        type: "success",
        actions: [{
            label: "Launch",
            onClick: () => window.location.href = "installed.html"
        }]
    });
}

function setupDropZone() {
    const dropZone = document.getElementById("drop-zone")!;
    const fileInput = document.getElementById("import-file") as HTMLInputElement;
    const indicator = document.getElementById("file-indicator")!;
    const fileNameEl = indicator.querySelector(".file-name")!;
    const fileSizeEl = indicator.querySelector(".file-size")!;
    const importBtn = document.getElementById("file-import") as HTMLButtonElement;

    importBtn.disabled = true;

    function showFile(file: File) {
        if (!file.name.endsWith(".import")) {
            indicator.classList.remove("hidden");
            indicator.classList.add("error");
            fileNameEl.textContent = "Invalid file type";
            fileSizeEl.textContent = "Only .import files allowed";
            importBtn.disabled = true;
            return;
        }

        indicator.classList.remove("hidden", "error");
        fileNameEl.textContent = file.name;
        fileSizeEl.textContent = `${(file.size / 1024).toFixed(1)} KB`;
        importBtn.disabled = false;
    }

    dropZone.addEventListener("click", () => fileInput.click());

    dropZone.addEventListener("dragover", e => {
        e.preventDefault();
        dropZone.classList.add("drag-active");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("drag-active");
    });

    dropZone.addEventListener("drop", e => {
        e.preventDefault();
        dropZone.classList.remove("drag-active");

        const file = e.dataTransfer?.files?.[0];
        if (file) {
            fileInput.files = e.dataTransfer!.files;
            showFile(file);
        }
    });

    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (file) showFile(file);
    });
}

/* ---------------------------
   SPACE IMPORT
---------------------------- */

function openSpaceModal() {
    modal.open({
        title: "Import Hugging Face Space",
        text: "Format: username/repo (example: huggingface-projects/llama-chat)",
        inputs: [
            { id: "space-path", type: "text", placeholder: "username/repo" }
        ],
        actions: [
            {
                id: "space-import",
                label: "Import",
                onClick: async () => {
                    const btn = document.getElementById("space-import") as HTMLButtonElement;
                    btn.disabled = true;
                    btn.innerText = "Fetching...";

                    const input = (document.getElementById("space-path") as HTMLInputElement).value.trim();

                    if (!input.includes("/")) {
                        notify("Invalid format. Use username/repo", "error");
                        btn.disabled = false;
                        btn.innerText = "Import";
                        return;
                    }

                    const [username, repo] = input.split("/");

                    try {
                        const res = await fetch(`https://huggingface.co/api/spaces/${username}/${repo}`);
                        if (!res.ok) throw new Error();

                        const apiData = await res.json();

                        const config = {
                            type: "space",
                            title: repo!.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
                            author: username,
                            emoji: apiData.cardData?.emoji ?? "🧠",
                            background: `linear-gradient(to right, ${apiData.cardData?.colorFrom ?? "#3178c6"
                                }, ${apiData.cardData?.colorTo ?? "#90caf9"
                                })`,
                            sdk: apiData.sdk ?? "unknown",
                            short_description: apiData.cardData?.short_description ?? ""
                        };

                        await window.ifc.saveImport(config);
                        modal.close();
                        notifySuccess();

                    } catch {
                        notify("Failed to fetch space metadata", "error");
                        btn.disabled = false;
                        btn.innerText = "Import";
                    }
                }
            }
        ]
    });
}

/* ---------------------------
   WEBSITE IMPORT
---------------------------- */

function openWebsiteModal() {
    modal.open({
        title: "Add Website",
        text: "Enter a title and full URL (must include https://)",
        inputs: [
            { id: "website-title", type: "text", placeholder: "Title" },
            { id: "website-url", type: "text", placeholder: "https://example.com" }
        ],
        actions: [
            {
                id: "website-import",
                label: "Add",
                onClick: async () => {
                    const title = (document.getElementById("website-title") as HTMLInputElement).value.trim();
                    const url = (document.getElementById("website-url") as HTMLInputElement).value.trim();

                    if (!title || !url) {
                        notify("Missing title or URL", "error");
                        return;
                    }

                    if (!url.startsWith("http")) {
                        notify("URL must include http:// or https://", "error");
                        return;
                    }

                    const config = {
                        type: "website",
                        title,
                        author: "",
                        emoji: getEmoji(),
                        background: `linear-gradient(to right, ${getReadableColor()}, ${getReadableColor()})`,
                        sdk: "unknown",
                        short_description: "",
                        url
                    };

                    await window.ifc.saveImport(config);
                    modal.close();
                    notifySuccess();
                }
            }
        ]
    });
}

function openFileImport() {
    fileModal.open();
    requestAnimationFrame(() => {
        setupDropZone();
    });
}

/* ---------------------------
   DRAG & DROP SUPPORT
---------------------------- */

function setupDragDrop() {
    document.addEventListener("dragover", e => {
        e.preventDefault();
    });

    document.addEventListener("drop", async e => {
        e.preventDefault();

        const file = e.dataTransfer?.files?.[0];
        if (!file || !file.name.endsWith(".import")) return;

        try {
            const text = await file.text();
            const config = JSON.parse(text);
        } catch {
            notify("Invalid .import file", "error");
        }
    });
}

/* ---------------------------
   CARD SETUP
---------------------------- */

function setupImportCards() {
    const cards = document.querySelectorAll("[data-import]");

    cards.forEach(card => {
        const el = card as HTMLElement;
        const type = el.dataset.import as ImportType;

        el.addEventListener("click", () => {
            if (type === "space") openSpaceModal();
            else openWebsiteModal();
        });
    });
}

/* ---------------------------
   INIT
---------------------------- */

document.addEventListener('DOMContentLoaded', () => {

    const fileBtn = document.getElementById("import-file-btn");
    fileBtn?.addEventListener("click", openFileImport);

    const chips = Array.from(document.querySelectorAll('.chip')) as Array<HTMLDivElement>;
    const search = document.getElementById('market-search') as HTMLInputElement;
    const cards = Array.from(document.querySelectorAll('.marketplace-card')) as Array<HTMLDivElement>;

    function applyFilter() {
        const active = chips.find(c => c.classList.contains('active'))?.dataset.filter || 'all';
        const q = search.value.trim().toLowerCase();

        cards.forEach(card => {
            const name = (card.dataset.name || '').toLowerCase();
            const cat = card.dataset.category || '';
            const matchQuery = q === '' || name.includes(q) || card.innerText.toLowerCase().includes(q);
            const matchCategory = active === 'all' || active === cat;
            card.style.display = (matchQuery && matchCategory) ? '' : 'none';
        });
    }

    chips.forEach(chip => chip.addEventListener('click', e => {
        chips.forEach(c => c.classList.remove('active'));
        (e.currentTarget as HTMLDivElement).classList.add('active');
        applyFilter();
    }));

    search.addEventListener('input', applyFilter);

    setupImportCards();
    setupDragDrop();
});
