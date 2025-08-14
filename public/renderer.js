window.addEventListener("DOMContentLoaded", () => {
    const modelList = document.getElementById("model-list");
    const installedModels = document.getElementById("installed-models");

    const models = [
        { name: "LLaMA 2", source: "Ollama", installed: true },
        { name: "Stable Diffusion", source: "Gradio", installed: false },
        { name: "BERT Sentiment", source: "API", installed: true },
    ];

    if (modelList) {
        models.forEach((model) => {
            const card = document.createElement("div");
            card.className = "auth-card";
            card.innerHTML = `
        <h1>${model.name}</h1>
        <p>Source: ${model.source}</p>
        <button>${model.installed ? "Open" : "Install"}</button>
      `;
            modelList.appendChild(card);
        });
    }

    if (installedModels) {
        models
            .filter((m) => m.installed)
            .forEach((model) => {
                const card = document.createElement("div");
                card.className = "auth-card";
                card.innerHTML = `
                    <h1>${model.name}</h1>
                    <p>Source: ${model.source}</p>
                    <button>Launch</button>
                `;
                installedModels.appendChild(card);
            });
    }
});
