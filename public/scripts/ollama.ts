//@ts-nocheck
let installedModels = [];
let availableModels = [];

function showNotification({ message, type = "info", actions = [] }) {
    const container = document.getElementById("notification-container");

    const box = document.createElement("div");
    box.className = `notification ${type}`;

    const msg = document.createElement("div");
    msg.className = "message";
    msg.textContent = message;

    const close = document.createElement("button");
    close.className = "close-btn";
    close.textContent = "×";
    close.onclick = () => box.remove();

    const actionContainer = document.createElement("div");
    actionContainer.className = "actions";
    actions.forEach(({ label, onClick }) => {
        const btn = document.createElement("button");
        btn.textContent = label;
        btn.onclick = () => {
            onClick?.();
            box.remove();
        };
        actionContainer.appendChild(btn);
    });

    box.appendChild(close);
    box.appendChild(msg);
    if (actions.length) box.appendChild(actionContainer);
    container.appendChild(box);
}
function stripAnsi(str) {
    return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

document.addEventListener("DOMContentLoaded", async () => {
    const installedContainer = document.getElementById("installed-models");
    const availableContainer = document.getElementById("available-models");

    installedModels = await window.ollama.listModels();
    availableModels = await fetchAvailableModels();

    renderInstalledModels();
    renderAvailableModels();
});

async function fetchAvailableModels() {
    const response = await fetch("https://ollama.com/library");
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const modelItems = Array.from(doc.querySelectorAll('li[x-test-model]'));

    return modelItems.map(item => {
        const name = item.querySelector('[x-test-model-title] span')?.textContent?.trim();
        const description = item.querySelector('p.max-w-lg')?.textContent?.trim();
        const sizes = Array.from(item.querySelectorAll('[x-test-size]')).map(el => el.textContent.trim());
        const pulls = item.querySelector('[x-test-pull-count]')?.textContent?.trim() || "Unknown";
        const tagElements = item.querySelectorAll('span[class*="text-blue-600"]');
        const tags = Array.from(tagElements).map(el => el.textContent.trim());
        const updated = item.querySelector('[x-test-updated]')?.textContent?.trim() || "Unknown";
        const link = item.querySelector('a')?.getAttribute('href');

        return { name, description, sizes, pulls, tags, updated, link };
    });
}


async function pullModel(name) {
    try {
        const result = await window.ollama.pullModel(name);
        showNotification({
            message: `Model pulled: ${name}`,
            type: "success",
            actions: [{ label: "Finish", onClick: () => location.reload() }],
        });
    } catch (err) {
        showNotification({
            message: `Error pulling model: ${err.message}`,
            type: "error",
        });
    }
}

async function deleteModel(name) {
    try {
        const result = await window.ollama.deleteModel(name);
        showNotification({
            message: `Model deleted: ${name}`,
            type: "success",
            actions: [{ label: "OK", onClick: () => location.reload() }],
        });
    } catch (err) {
        showNotification({
            message: `Error deleting model: ${err.message}`,
            type: "error",
        });
    }
}

window.ollama.onPullProgress(({ model, output }) => {
    const container = document.getElementById("notification-container");
    let box = container.querySelector(`[data-model="${model}"]`);

    if (!box) {
        box = document.createElement("div");
        box.className = "notification info";
        box.dataset.model = model;

        const close = document.createElement("button");
        close.className = "close-btn";
        close.textContent = "×";
        close.onclick = () => box.remove();

        const msg = document.createElement("div");
        msg.className = "message";
        msg.innerHTML = `<strong>Pulling ${model}</strong><pre></pre>`;

        box.appendChild(close);
        box.appendChild(msg);
        container.appendChild(box);
    }

    const pre = box.querySelector("pre");
    const clean = stripAnsi(output);

    if (clean.includes("\r")) {
        const latest = clean.split("\r").pop();
        pre.textContent = latest;
    } else {
        pre.textContent = clean;
    }

    if (/successfully pulled/i.test(clean)) {
        const actions = document.createElement("div");
        actions.className = "actions";
        const finishBtn = document.createElement("button");
        finishBtn.textContent = "Finish";
        finishBtn.onclick = () => {
            box.remove();
            location.reload();
        };
        actions.appendChild(finishBtn);
        box.appendChild(actions);
    }
});

let currentModelName = "";
let currentModelSizes = [];

function openPullModal(modelName, sizes) {
    currentModelName = modelName;
    currentModelSizes = sizes;

    document.getElementById("modal-model-name").textContent = `Pull ${modelName}`;
    const select = document.getElementById("modal-revision-select");
    select.innerHTML = `<option value="latest">latest</option>` +
        sizes.map(size => `<option value="${size}">${size}</option>`).join("");

    document.getElementById("pull-modal").classList.remove("hidden");
}

function closePullModal() {
    document.getElementById("pull-modal").classList.add("hidden");
}

document.getElementById("modal-pull-btn").onclick = () => {
    const revision = document.getElementById("modal-revision-select").value;
    const fullName = revision === "latest" ? currentModelName : `${currentModelName}:${revision}`;
    pullModel(fullName);
    closePullModal();
};

function renderInstalledModels(filter = "") {
  const container = document.getElementById("installed-models");
  container.innerHTML = "";

  installedModels
    .filter(model => model.name.toLowerCase().includes(filter.toLowerCase()))
    .forEach(model => {
      const card = document.createElement("div");
      card.className = "marketplace-card";
      card.innerHTML = `
        <h2>${model.name}</h2>
        <p><strong>Size:</strong> ${model.size}</p>
        <p><strong>Modified:</strong> ${model.modified}</p>
        <button onclick="deleteModel('${model.name}')">Delete</button>
      `;
      container.appendChild(card);
    });
}

function renderAvailableModels(filter = "") {
  const container = document.getElementById("available-models");
  container.innerHTML = "";

  const installedNames = installedModels.map(m => m.name);

  availableModels
    .filter(model => !installedNames.includes(model.name))
    .filter(model => model.name.toLowerCase().includes(filter.toLowerCase()))
    .forEach(model => {
      const card = document.createElement("div");
      card.className = "marketplace-card";

      const sizeOptions = model.sizes.map(size => `<option value="${size}">${size}</option>`).join("");
      const tagBadges = model.tags.map(tag => `<span class="model-tag">${tag}</span>`).join(" ");

      card.innerHTML = `
        <h2>${model.name}</h2>
        <p class="model-description">${model.description || "No description available."}</p>
        <div class="model-tags">${tagBadges}</div>
        <div class="model-meta">
          <p><strong>Pulls:</strong> ${model.pulls}</p>
          <p><strong>Updated:</strong> ${model.updated}</p>
          <a href="https://ollama.com${model.link}" target="_blank" class="model-link">More details</a>
        </div>
        <button class="marketplace-btn">Open Pull Dialog</button>
      `;

      const button = card.querySelector("button");
      button.onclick = () => openPullModal(model.name, model.sizes);

      container.appendChild(card);
    });
}

document.getElementById("search-installed").addEventListener("input", (e) => {
  renderInstalledModels(e.target.value);
});

document.getElementById("search-available").addEventListener("input", (e) => {
  renderAvailableModels(e.target.value);
});
