interface Model {
  name: string;
}

declare global {
  interface Window {
    ollama: {
      listModels: () => Promise<Model[]>;
    };
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("installed-models");
  if (!container) {
    console.error("Container element not found.");
    return;
  }

  try {
    const models = await window.ollama.listModels();
    models.forEach((model) => {
      const card = document.createElement("div");
      card.className = "marketplace-card";

      const title = document.createElement("h2");
      title.textContent = model.name;

      const description = document.createElement("p");
      description.textContent = "Local LLM";

      const button = document.createElement("button");
      button.textContent = "Open Chat";
      button.onclick = () => runModel(model.name);

      card.appendChild(title);
      card.appendChild(description);
      card.appendChild(button);
      container.appendChild(card);
    });
  } catch (err: any) {
    container.innerHTML = `<p>Error loading models: ${err.message}</p>`;
  }
});

function runModel(name: string): void {
  window.location.href = `chat.html?model=${encodeURIComponent(name)}`;
}
