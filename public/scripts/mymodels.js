document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("installed-models");
    try {
        const models = await window.ollama.listModels();
        models.forEach((model) => {
            const card = document.createElement("div");
            card.className = "marketplace-card";
            card.innerHTML = `
                <h2>${model.name}</h2>
                <p>Local LLM</p>
                <button onclick="runModel('${model.name}')">Open Chat</button>
            `;
            container.appendChild(card);
        });
    } catch (err) {
        container.innerHTML = `<p>Error loading models: ${err.message}</p>`;
    }
});

function runModel(name) {
    window.location.href = `chat.html?model=${encodeURIComponent(name)}`;
}
