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

    try {
        const installed = await window.ollama.listModels();
        installed.forEach((model) => {
            const card = document.createElement("div");
            card.className = "marketplace-card";
            card.innerHTML = `
        <h2>${model.name}</h2>
        <p><strong>Size:</strong> ${model.size}</p>
        <p><strong>Modified:</strong> ${model.modified}</p>
        <button onclick="deleteModel('${model.name}')">Delete</button>
      `;
            installedContainer.appendChild(card);
        });

        const available = await fetchAvailableModels();

        const installedNames = installed.map((m) => m.name);
        available
            .filter((name) => !installedNames.includes(name))
            .forEach((name) => {
                const card = document.createElement("div");
                card.className = "marketplace-card";
                card.innerHTML = `
          <h2>${name}</h2>
          <p>Not installed</p>
          <button onclick="pullModel('${name}')">Pull</button>
        `;
                availableContainer.appendChild(card);
            });
    } catch (err) {
        installedContainer.innerHTML = `<p>Error: ${err.message}</p>`;
    }
});

async function fetchAvailableModels() {
    const response = await fetch("https://ollama.com/library");
    const html = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const modelLinks = Array.from(doc.querySelectorAll('a[href^="/library/"]'));
    const modelNames = modelLinks
        .map((link) => link.getAttribute("href"))
        .filter((href) => /^\/library\/[^:/]+$/.test(href))
        .map((href) => href.replace("/library/", ""));

    return [...new Set(modelNames)].sort();
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
