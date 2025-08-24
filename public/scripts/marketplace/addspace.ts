//@ts-nocheck
const gradients = [
  "linear-gradient(to right, #3178c6, #90caf9)",
  "linear-gradient(to right, #3ca374, #a5d6a7)",
  "linear-gradient(to right, #ff8a65, #ffccbc)",
  "linear-gradient(to right, #f06292, #f8bbd0)",
  "linear-gradient(to right, #ba68c8, #e1bee7)"
];

const emojis = ["🤖", "🧠", "🖼️", "📊", "🎨", "🔍", "📝", "🗣️"];

function sanitizeFilename(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, '_');
}

function switchTab(tab: string) {
  const contents = document.querySelectorAll('.tab-content');
  contents.forEach(c => (c as HTMLElement).style.display = 'none');
  const active = document.getElementById(`tab-${tab}`);
  if (active) active.style.display = 'block';

  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(b => {
    const btn = b as HTMLButtonElement;
    btn.style.backgroundColor = btn.dataset.tab === tab ? 'var(--blue)' : 'var(--secondary-color)';
    btn.style.color = btn.dataset.tab === tab ? 'white' : 'var(--text-dark)';
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = (btn as HTMLElement).dataset.tab;
    if (tab) switchTab(tab);
  });
});

document.getElementById('add-space-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('hf-space-input') as HTMLInputElement;
  const path = input.value.trim();
  if (!path.includes('/')) return alert("Invalid format. Use username/repo.");

  const [username, repo] = path.split('/');
  const config = {
    type: "space",
    title: repo ?? "UNKNOWN".replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    author: username,
    emoji: emojis[Math.floor(Math.random() * emojis.length)],
    background: gradients[Math.floor(Math.random() * gradients.length)]
  };

  const fileName = `${sanitizeFilename(username?? "UNKNOWN")}____${sanitizeFilename(repo?? "UNKNOWN")}.import`;
  const filePath = `${await window.utils.getPath()}/spaces/${fileName}`;

  try {
    await window.utils.saveFile(filePath, JSON.stringify(config, null, 2));
    alert(`✅ Saved to ${filePath}`);
  } catch (err) {
    console.error("Save failed:", err);
    alert("❌ Failed to save file.");
  }
});

document.getElementById('import-upload')?.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const json = JSON.parse(text);

    if (!json.author || !json.title) {
      return alert("❌ Invalid .import file: missing 'author' or 'title'.");
    }

    json.type = "space";

    const fileName = `${sanitizeFilename(json.author)}____${sanitizeFilename(json.title)}.import`;
    const filePath = `${await window.utils.getPath()}/spaces/${fileName}`;

    await window.utils.saveFile(filePath, JSON.stringify(json, null, 2));
    alert(`✅ Uploaded and saved as ${filePath}`);
  } catch (err) {
    console.error("Upload failed:", err);
    alert("❌ Failed to process .import file.");
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

        // Optional: trigger change event manually
        const event = new Event('change');
        fileInput.dispatchEvent(event);
    }
});

