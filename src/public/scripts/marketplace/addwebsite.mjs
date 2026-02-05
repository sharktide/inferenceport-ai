import { showNotification } from "../helper/notification.js";
import { getReadableColor, getEmoji } from "../helper/random.js";
function sanitizeFilename(str) {
    return str.replace(/[^a-zA-Z0-9]/g, '_');
}
function switchTab(tab) {
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(c => c.style.display = 'none');
    const active = document.getElementById(`tab-${tab}`);
    if (active)
        active.style.display = 'block';
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(b => {
        const btn = b;
        btn.style.backgroundColor = btn.dataset.tab === tab ? 'var(--blue)' : 'var(--secondary-color)';
        btn.style.color = btn.dataset.tab === tab ? 'white' : 'var(--text-dark)';
    });
}
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab)
            switchTab(tab);
    });
});
document.getElementById('add-website-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('website-input');
    const titleInput = document.getElementById('title-input');
    const path = input.value.trim();
    const emoji = getEmoji();
    const colorFrom = getReadableColor();
    const colorTo = getReadableColor();
    const sdk = "unknown";
    const short_description = "";
    const url = input.value;
    const config = {
        type: "website",
        title: titleInput.value,
        author: "",
        emoji,
        background: `linear-gradient(to right, ${colorFrom}, ${colorTo})`,
        sdk,
        short_description,
        url
    };
    const fileName = `${crypto.randomUUID()}.import`;
    const filePath = `${await window.utils.getPath()}/websites/${fileName}`;
    try {
        await window.utils.saveFile(filePath, JSON.stringify(config, null, 2));
        showNotification({
            message: "Import Successful",
            type: "success",
            actions: [{ label: "Launch", onClick: () => window.location.href = '../installed.html' }],
        });
    }
    catch (err) {
        console.error("Save failed:", err);
        showNotification({
            message: `Import Failed: ${err}`,
            type: "error",
            actions: [{ label: "OK", onClick: () => void 0 }],
        });
    }
});
document.getElementById('import-upload')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file)
        return;
    try {
        const text = await file.text();
        const json = JSON.parse(text);
        if (!json.url || !json.title) {
            showNotification({ message: "Invalid .import file", type: "error", actions: [{ label: "OK", onClick: () => void (0) },], });
            return;
        }
        json.type = "website";
        const fileName = `${crypto.randomUUID()}.import`;
        const filePath = `${await window.utils.getPath()}/websites/${fileName}`;
        await window.utils.saveFile(filePath, JSON.stringify(json, null, 2));
        showNotification({ message: "Import Successful", type: "success", actions: [{ label: "Launch", onClick: () => window.location.href = "../installed.html" },], });
    }
    catch (err) {
        console.error("Upload failed:", err);
        showNotification({ message: "Error Processing .import file", type: "error", actions: [{ label: "OK", onClick: () => void (0) },], });
    }
});
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('import-upload');
const clickToUpload = dropZone.querySelector('.click-to-upload');
clickToUpload.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
});
dropZone.addEventListener('click', () => {
    fileInput.click();
});
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragging');
});
dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragging');
});
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragging');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        fileInput.files = files;
        const event = new Event('change');
        fileInput.dispatchEvent(event);
    }
});
//# sourceMappingURL=addwebsite.mjs.map