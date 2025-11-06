import { showNotification } from "../helper/notification.js";
import "../helper/checkers/ollama-checker.js";
let installedModels = [];
let availableModels = [];
let currentModelName = "";
let currentModelSizes = [];
function stripAnsi(str) {
    return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}
document.addEventListener("DOMContentLoaded", async () => {
    const installedContainer = document.getElementById("installed-models");
    const availableContainer = document.getElementById("available-models");
    if (!installedContainer || !availableContainer)
        return;
    //@ts-ignore
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
    const modelItems = Array.from(doc.querySelectorAll("li[x-test-model]"));
    //@ts-ignore
    return modelItems.map((item) => {
        const name = item.querySelector("[x-test-model-title] span")?.textContent?.trim() ??
            "";
        const description = item.querySelector("p.max-w-lg")?.textContent?.trim();
        const sizes = Array.from(item.querySelectorAll("[x-test-size]")).map((el) => el.textContent.trim());
        const pulls = item.querySelector("[x-test-pull-count]")?.textContent?.trim() ??
            "Unknown";
        const tagElements = item.querySelectorAll('span[class*="text-blue-600"]');
        const tags = Array.from(tagElements).map((el) => el.textContent.trim());
        const updated = item.querySelector("[x-test-updated]")?.textContent?.trim() ?? "Unknown";
        const link = item.querySelector("a")?.getAttribute("href") ?? undefined;
        return { name, description, sizes, pulls, tags, updated, link };
    });
}
async function pullModel(name) {
    try {
        await window.ollama.pullModel(name);
        showNotification({
            message: `Model pulled: ${name}`,
            type: "success",
            actions: [{ label: "Finish", onClick: () => location.reload() }],
        });
    }
    catch (err) {
        showNotification({
            message: `Error pulling model: ${err.message}`,
            type: "error",
        });
    }
}
async function deleteModel(name) {
    try {
        await window.ollama.deleteModel(name);
        showNotification({
            message: `Model deleted: ${name}`,
            type: "success",
            actions: [{ label: "OK", onClick: () => location.reload() }],
        });
    }
    catch (err) {
        showNotification({
            message: `Error deleting model: ${err.message}`,
            type: "error",
        });
    }
}
window.ollama.onPullProgress(({ model, output }) => {
    const container = document.getElementById("notification-container");
    if (!container)
        return;
    let box = container.querySelector(`[data-model="${model}"]`);
    if (!box) {
        box = document.createElement("div");
        box.className = "notification info";
        box.dataset.model = model;
        const close = document.createElement("button");
        close.className = "close-btn";
        close.textContent = "×";
        close.onclick = () => box?.remove();
        const msg = document.createElement("div");
        msg.className = "message";
        msg.innerHTML = `<strong>Pulling ${model}</strong><pre></pre>`;
        box.appendChild(close);
        box.appendChild(msg);
        container.appendChild(box);
    }
    const pre = box.querySelector("pre");
    const clean = stripAnsi(output);
    if (pre) {
        pre.textContent = clean.includes("\r")
            ? clean.split("\r").pop() ?? ""
            : clean;
    }
    if (/successfully pulled/i.test(clean)) {
        const actions = document.createElement("div");
        actions.className = "actions";
        const finishBtn = document.createElement("button");
        finishBtn.textContent = "Finish";
        finishBtn.onclick = () => {
            box?.remove();
            location.reload();
        };
        actions.appendChild(finishBtn);
        box.appendChild(actions);
    }
});
function openPullModal(modelName, sizes) {
    currentModelName = modelName;
    currentModelSizes = sizes;
    const nameEl = document.getElementById("modal-model-name");
    const select = document.getElementById("modal-revision-select");
    const modal = document.getElementById("pull-modal");
    const warningEl = document.getElementById("modal-performance-warning");
    if (nameEl)
        nameEl.textContent = `Pull ${modelName}`;
    if (select) {
        select.innerHTML =
            `<option value="latest">latest</option>` +
                sizes.map((size) => `<option value="${size}">${size}</option>`).join("");
        // Initial warning for first size
        const initialSize = sizes[0];
        if (warningEl && initialSize) {
            window.utils.getWarning(initialSize).then((result) => {
                warningEl.textContent = result.warning;
                warningEl.className = "modal-warning";
            });
        }
        // Dynamic update on change
        select.onchange = () => {
            const selectedSize = select.value;
            if (selectedSize === "latest") {
                warningEl.textContent = "";
                return;
            }
            window.utils.getWarning(selectedSize).then((result) => {
                warningEl.textContent = result.warning;
                warningEl.className = "modal-warning";
            });
        };
    }
    modal?.classList.remove("hidden");
}
document
    .getElementById("pull-modal-close")
    ?.addEventListener("click", closePullModal);
function closePullModal() {
    document.getElementById("pull-modal")?.classList.add("hidden");
}
document.getElementById("modal-pull-btn")?.addEventListener("click", () => {
    const select = document.getElementById("modal-revision-select");
    const revision = select?.value ?? "latest";
    const fullName = revision === "latest"
        ? currentModelName
        : `${currentModelName}:${revision}`;
    pullModel(fullName);
    closePullModal();
});
function renderInstalledModels(filter = "") {
    const spinner = document.getElementById("installed-spinner");
    spinner.style.display = "flex";
    const container = document.getElementById("installed-models");
    if (!container)
        return;
    container.innerHTML = "";
    installedModels
        .filter((model) => model.name.toLowerCase().includes(filter.toLowerCase()))
        .forEach((model) => {
        const card = document.createElement("div");
        card.className = "marketplace-card";
        card.innerHTML = `
				<h2>${model.name}</h2>
				<p><strong>Size:</strong> ${model.size}</p>
				<p><strong>Modified:</strong> ${model.modified}</p>
				<button>Delete</button>
			`;
        const button = card.querySelector("button");
        button?.addEventListener("click", () => deleteModel(model.name));
        container.appendChild(card);
    });
    spinner.style.display = "none";
}
function renderAvailableModels(filter = "") {
    const spinner = document.getElementById("spinner-av");
    spinner.style.display = "flex";
    const container = document.getElementById("available-models");
    if (!container)
        return;
    container.innerHTML = "";
    const installedNames = installedModels.map((m) => m.name);
    availableModels
        .filter((model) => !installedNames.includes(model.name))
        .filter((model) => model.name.toLowerCase().includes(filter.toLowerCase()))
        .forEach((model) => {
        const card = document.createElement("div");
        card.className = "marketplace-card";
        card.id = encodeURIComponent(model.name);
        const sizeOptions = model.sizes
            .map((size) => `<option value="${size}">${size}</option>`)
            .join("");
        const tagBadges = model.tags
            .map((tag) => `<span class="model-tag">${tag}</span>`)
            .join(" ");
        card.innerHTML = `
        <h2>${model.name}</h2>
        <p class="model-description">${model.description ?? "No description available."}</p>
        <div class="model-tags">${tagBadges}</div>
        <div class="model-meta">
          <p><strong>Pulls:</strong> ${model.pulls}</p>
          <p><strong>Updated:</strong> ${model.updated}</p>
          <a href="https://ollama.com${model.link ?? ""}" target="_blank" class="model-link">More details</a>
        </div>
        <button class="marketplace-btn">Open Download Dialog</button>
      `;
        const button = card.querySelector("button");
        button?.addEventListener("click", () => openPullModal(model.name, model.sizes));
        container.appendChild(card);
    });
    spinner.style.display = "none";
    const targetId = decodeURIComponent(location.hash.slice(1));
    if (targetId) {
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
            const yOffset = -100;
            const y = targetEl.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: y, behavior: "smooth" });
            targetEl.classList.add("highlight");
        }
    }
}
document
    .getElementById("search-installed")
    ?.addEventListener("input", (e) => {
    const target = e.target;
    renderInstalledModels(target.value);
});
document
    .getElementById("search-available")
    ?.addEventListener("input", (e) => {
    const target = e.target;
    renderAvailableModels(target.value);
});
//# sourceMappingURL=ollama.mjs.map