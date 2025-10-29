import { showNotification } from "../helper/notification.js";
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
document.getElementById('add-space-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('hf-space-input');
    const path = input.value.trim();
    if (!path.includes('/')) {
        showNotification({
            message: "Invalid format. Use username/repo.",
            type: "error",
            actions: [{ label: "OK", onClick: () => void 0 }],
        });
        return;
    }
    const [username, repo] = path.split('/');
    let apiData = {};
    try {
        const res = await fetch(`https://huggingface.co/api/spaces/${username}/${repo}`);
        if (!res.ok)
            throw new Error("Space not found");
        apiData = await res.json();
    }
    catch (err) {
        console.warn("Failed to fetch space metadata:", err);
        showNotification({
            message: "Failed to fetch space metadata from Hugging Face.",
            type: "error",
            actions: [{ label: "OK", onClick: () => void 0 }],
        });
        return;
    }
    // Fallbacks if API data is missing
    const emoji = apiData.cardData?.emoji ?? "🧠";
    const colorFrom = apiData.cardData?.colorFrom ?? "#3178c6";
    const colorTo = apiData.cardData?.colorTo ?? "#90caf9";
    const sdk = apiData.sdk ?? "unknown";
    const short_description = apiData.cardData?.short_description ?? "";
    const config = {
        type: "space",
        title: repo.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        author: username,
        emoji,
        background: `linear-gradient(to right, ${colorFrom}, ${colorTo})`,
        sdk,
        short_description
    };
    const fileName = `${sanitizeFilename(username)}____${sanitizeFilename(repo)}.import`;
    const filePath = `${await window.utils.getPath()}/spaces/${fileName}`;
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
        if (!json.author || !json.title) {
            showNotification({ message: "Invalid .import file", type: "error", actions: [{ label: "OK", onClick: () => void (0) },], });
            return;
        }
        json.type = "space";
        const fileName = `${sanitizeFilename(json.author)}____${sanitizeFilename(json.title)}.import`;
        const filePath = `${await window.utils.getPath()}/spaces/${fileName}`;
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
//# sourceMappingURL=addspace.mjs.map