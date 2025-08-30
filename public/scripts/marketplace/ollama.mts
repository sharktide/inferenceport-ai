import { showNotification } from "../helper/notification.mjs"

interface AvailableModel {
	name: string;
	description?: string;
	sizes: string[];
	pulls: string;
	tags: string[];
	updated: string;
	link?: string;
}

interface InstalledModel {
	name: string;
	size: string;
	modified: string;
}

let installedModels: InstalledModel[] = [];
let availableModels: AvailableModel[] = [];

let currentModelName = "";
let currentModelSizes: string[] = [];

function stripAnsi(str: string): string {
	return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

document.addEventListener("DOMContentLoaded", async () => {
	const installedContainer = document.getElementById("installed-models");
	const availableContainer = document.getElementById("available-models");
	if (!installedContainer || !availableContainer) return;

	//@ts-ignore
	installedModels = await window.ollama.listModels();
	availableModels = await fetchAvailableModels();

	renderInstalledModels();
	renderAvailableModels();
});

async function fetchAvailableModels(): Promise<AvailableModel[]> {
	const response = await fetch("https://ollama.com/library");
	const html = await response.text();
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, "text/html");

	const modelItems = Array.from(doc.querySelectorAll("li[x-test-model]"));
	//@ts-ignore
	return modelItems.map((item) => {
		const name =
			item.querySelector("[x-test-model-title] span")?.textContent?.trim() ??
			"";
		const description = item.querySelector("p.max-w-lg")?.textContent?.trim();
		const sizes = Array.from(item.querySelectorAll("[x-test-size]")).map((el) =>
			el.textContent!.trim()
		);
		const pulls =
			item.querySelector("[x-test-pull-count]")?.textContent?.trim() ??
			"Unknown";
		const tagElements = item.querySelectorAll('span[class*="text-blue-600"]');
		const tags = Array.from(tagElements).map((el) => el.textContent!.trim());
		const updated =
			item.querySelector("[x-test-updated]")?.textContent?.trim() ?? "Unknown";
		const link = item.querySelector("a")?.getAttribute("href") ?? undefined;

		return { name, description, sizes, pulls, tags, updated, link };
	});
}

async function pullModel(name: string): Promise<void> {
	try {
		//@ts-ignore
		await window.ollama.pullModel(name);
		showNotification({
			message: `Model pulled: ${name}`,
			type: "success",
			actions: [{ label: "Finish", onClick: () => location.reload() }],
		});
	} catch (err: any) {
		showNotification({
			message: `Error pulling model: ${err.message}`,
			type: "error",
		});
	}
}

async function deleteModel(name: string): Promise<void> {
	try {
		//@ts-ignore
		await window.ollama.deleteModel(name);
		showNotification({
			message: `Model deleted: ${name}`,
			type: "success",
			actions: [{ label: "OK", onClick: () => location.reload() }],
		});
	} catch (err: any) {
		showNotification({
			message: `Error deleting model: ${err.message}`,
			type: "error",
		});
	}
}

//@ts-ignore
window.ollama.onPullProgress(
	({ model, output }: { model: string; output: string }) => {
		const container = document.getElementById("notification-container");
		if (!container) return;

		let box = container.querySelector(
			`[data-model="${model}"]`
		) as HTMLElement | null;

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
	}
);

function openPullModal(modelName: string, sizes: string[]): void {
	currentModelName = modelName;
	currentModelSizes = sizes;

	const nameEl = document.getElementById("modal-model-name");
	const select = document.getElementById(
		"modal-revision-select"
	) as HTMLSelectElement;
	const modal = document.getElementById("pull-modal");

	if (nameEl) nameEl.textContent = `Pull ${modelName}`;
	if (select) {
		select.innerHTML =
			`<option value="latest">latest</option>` +
			sizes.map((size) => `<option value="${size}">${size}</option>`).join("");
	}
	modal?.classList.remove("hidden");
}

document
	.getElementById("pull-modal-close")
	?.addEventListener("click", closePullModal);

function closePullModal(): void {
	document.getElementById("pull-modal")?.classList.add("hidden");
}

document.getElementById("modal-pull-btn")?.addEventListener("click", () => {
	const select = document.getElementById(
		"modal-revision-select"
	) as HTMLSelectElement;
	const revision = select?.value ?? "latest";
	const fullName =
		revision === "latest"
			? currentModelName
			: `${currentModelName}:${revision}`;
	pullModel(fullName);
	closePullModal();
});

function renderInstalledModels(filter: string = ""): void {
	const container = document.getElementById("installed-models");
	if (!container) return;

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
}

function renderAvailableModels(filter: string = ""): void {
	const container = document.getElementById("available-models");
	if (!container) return;

	container.innerHTML = "";

	const installedNames = installedModels.map((m) => m.name);

	availableModels
		.filter((model) => !installedNames.includes(model.name))
		.filter((model) => model.name.toLowerCase().includes(filter.toLowerCase()))
		.forEach((model) => {
			const card = document.createElement("div");
			card.className = "marketplace-card";

			const sizeOptions = model.sizes
				.map((size) => `<option value="${size}">${size}</option>`)
				.join("");
			const tagBadges = model.tags
				.map((tag) => `<span class="model-tag">${tag}</span>`)
				.join(" ");

			card.innerHTML = `
        <h2>${model.name}</h2>
        <p class="model-description">${
					model.description ?? "No description available."
				}</p>
        <div class="model-tags">${tagBadges}</div>
        <div class="model-meta">
          <p><strong>Pulls:</strong> ${model.pulls}</p>
          <p><strong>Updated:</strong> ${model.updated}</p>
          <a href="https://ollama.com${
						model.link ?? ""
					}" target="_blank" class="model-link">More details</a>
        </div>
        <button class="marketplace-btn">Open Pull Dialog</button>
      `;

			const button = card.querySelector("button");
			button?.addEventListener("click", () =>
				openPullModal(model.name, model.sizes)
			);

			container.appendChild(card);
		});
}

document
	.getElementById("search-installed")
	?.addEventListener("input", (e: Event) => {
		const target = e.target as HTMLInputElement;
		renderInstalledModels(target.value);
	});

document
	.getElementById("search-available")
	?.addEventListener("input", (e: Event) => {
		const target = e.target as HTMLInputElement;
		renderAvailableModels(target.value);
	});
