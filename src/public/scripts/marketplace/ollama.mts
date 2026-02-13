import { showNotification } from "../helper/notification.js";
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

interface RemoteHost {
	url: string;
	alias: string;
}

let installedModels: InstalledModel[] = [];
let availableModels: AvailableModel[] = [];

let currentModelName = "";
let currentModelSizes: string[] = [];
let toolSupportingModels: Set<string> = new Set();
let currentHost: string = "local";

function getClientUrl(): string | undefined {
	return currentHost.startsWith("remote:")
		? currentHost.replace("remote:", "")
		: undefined;
}

const TOOL_FEATURES = [
	{ key: "web", label: "Web search", icon: "🌐" },
	{ key: "image", label: "Image generation", icon: "🖼️" },
];

function stripAnsi(str: string): string {
	return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function modelSupportsTools(modelName: string): boolean {
	return toolSupportingModels.has(modelName.toLowerCase());
}

async function fetchAvailableModels(): Promise<AvailableModel[]> {
	const response = await fetch("https://ollama.com/library");
	const html = await response.text();
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, "text/html");

	const modelItems = Array.from(doc.querySelectorAll("li[x-test-model]"));
	//@ts-ignore
	return modelItems.map((item) => {
		const name =
			item
				.querySelector("[x-test-model-title] span")
				?.textContent?.trim() ?? "";
		const description = item
			.querySelector("p.max-w-lg")
			?.textContent?.trim();
		const sizes = Array.from(item.querySelectorAll("[x-test-size]")).map(
			(el) => el.textContent!.trim(),
		);
		const pulls =
			item.querySelector("[x-test-pull-count]")?.textContent?.trim() ??
			"Unknown";
		const tagElements = item.querySelectorAll(
			'span[class*="text-blue-600"]',
		);
		const tags = Array.from(tagElements).map((el) =>
			el.textContent!.trim(),
		);
		const updated =
			item.querySelector("[x-test-updated]")?.textContent?.trim() ??
			"Unknown";
		const link = item.querySelector("a")?.getAttribute("href") ?? undefined;

		return { name, description, sizes, pulls, tags, updated, link };
	});
}

async function pullModel(name: string): Promise<void> {
	try {
		const clientUrl = getClientUrl();
		await window.ollama.pullModel(name, clientUrl);
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
		const clientUrl = getClientUrl();
		await window.ollama.deleteModel(name, clientUrl);
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

window.ollama.onPullProgress(
	({ model, output }: { model: string; output: string }) => {
		const container = document.getElementById("notification-container");
		if (!container) return;
		model = model.replace(/^hf\.co\/[^/]+\//, "");
		let box = container.querySelector(
			`[data-model="${model}"]`,
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
				? (clean.split("\r").pop() ?? "")
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
	},
);

function openPullModal(modelName: string, sizes: string[]): void {
	currentModelName = modelName;
	currentModelSizes = sizes;

	const nameEl = document.getElementById(
		"modal-model-name",
	) as HTMLTitleElement;
	const select = document.getElementById(
		"modal-revision-select",
	) as HTMLSelectElement;
	const modal = document.getElementById("pull-modal") as HTMLDivElement;
	const warningEl = document.getElementById(
		"modal-performance-warning",
	) as HTMLParagraphElement;

	if (nameEl) nameEl.textContent = `Pull ${modelName}`;
	if (select) {
		select.innerHTML =
			`<option value="latest">latest</option>` +
			sizes
				.map((size) => `<option value="${size}">${size}</option>`)
				.join("");

		// Initial warning for first size
		const initialSize = sizes[0];
		if (warningEl && initialSize) {
			window.utils
				.getWarning(initialSize, getClientUrl())
				.then((result) => {
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
			window.utils
				.getWarning(selectedSize, getClientUrl())
				.then((result) => {
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

function closePullModal(): void {
	document.getElementById("pull-modal")?.classList.add("hidden");
}

document.getElementById("modal-pull-btn")?.addEventListener("click", () => {
	const select = document.getElementById(
		"modal-revision-select",
	) as HTMLSelectElement;
	const revision = select?.value ?? "latest";
	const fullName =
		revision === "latest"
			? currentModelName
			: `${currentModelName}:${revision}`;
	pullModel(fullName);
	closePullModal();
});

function renderInstalledModels(filter: string = "", fail?: boolean): void {
	const spinner = document.getElementById(
		"installed-spinner",
	) as HTMLDivElement;
	const container = document.getElementById("installed-models");
	if (!spinner || !container) return;

	spinner.style.display = "flex";

	try {
		if (fail)
			throw new Error("Could not load models from the selected host.");
		container.innerHTML = "";
		const theme = localStorage.getItem("theme");

		if (installedModels.length === 0) {
			const modelsNotFound = document.createElement("p");
			modelsNotFound.innerHTML =
				"No models installed. Scroll down to choose from over 100 different chatbots";
			if (theme === "light") {
				modelsNotFound.style.setProperty(
					"color",
					"rgb(0, 0, 0)",
					"important",
				);
			}
			container.appendChild(modelsNotFound);
			return;
		}

		installedModels
			.filter((model) =>
				model.name.toLowerCase().includes(filter.toLowerCase()),
			)
            .forEach((model) => {
                const card = document.createElement("div");
                card.className = "marketplace-card";

                const h2 = document.createElement("h2");
                h2.textContent = model.name.replace(/^hf\.co\/[^/]+\//, "").replace(/^huggingface\.co\/[^/]+\//, "");
                card.appendChild(h2);

                const pSize = document.createElement("p");
                const strongSize = document.createElement("strong");
                strongSize.textContent = "Size:";
                pSize.appendChild(strongSize);
                pSize.append(` ${model.size}`);
                card.appendChild(pSize);

                const pModified = document.createElement("p");
                const strongModified = document.createElement("strong");
                strongModified.textContent = "Modified:";
                pModified.appendChild(strongModified);
                pModified.append(` ${model.modified}`);
                card.appendChild(pModified);

                const button = document.createElement("button");
                button.textContent = "Delete";
                button.addEventListener("click", () => deleteModel(model.name));
                card.appendChild(button);

                container.appendChild(card);
            });
	} catch (err: any) {
		container.innerHTML = `<p style="color:red"><strong>Error loading installed models:</strong> ${err?.message ?? err}</p>`;
		showNotification({
			message: `Error rendering installed models: ${err?.message ?? err}`,
			type: "error",
		});
	} finally {
		spinner.style.display = "none";
	}
}

function renderAvailableModels(filter: string = "", fail?: boolean): void {
	const spinner = document.getElementById("spinner-av") as HTMLDivElement;
	const container = document.getElementById("available-models");
	if (!spinner || !container) return;

	spinner.style.display = "flex";

	try {
		if (fail) {
			throw new Error("Could not load models from Ollama. Check your internet connection.")
		}

		container.innerHTML = "";

		const installedNames = installedModels.map((m) => m.name);

		availableModels
			.filter((model) => !installedNames.includes(model.name))
			.filter((model) =>
				model.name.toLowerCase().includes(filter.toLowerCase()),
			)
			.forEach((model) => {
				const card = document.createElement("div");
				card.className = "marketplace-card";
				card.id = encodeURIComponent(model.name);

				const h2 = document.createElement("h2");
				h2.textContent = model.name;
				card.appendChild(h2);

				const pDesc = document.createElement("p");
				pDesc.className = "model-description";
				pDesc.textContent =
					model.description ?? "No description available.";
				card.appendChild(pDesc);

				const tagsDiv = document.createElement("div");
				tagsDiv.className = "model-tags";
				model.tags.forEach((tag) => {
					const span = document.createElement("span");
					span.className = "model-tag";
					span.textContent = tag;
					tagsDiv.appendChild(span);
				});
				card.appendChild(tagsDiv);

				const featuresDiv = document.createElement("div");
				featuresDiv.className = "model-features";
				const supportsTools = modelSupportsTools(model.name);
				TOOL_FEATURES.forEach((f) => {
					const span = document.createElement("span");
					span.className = `feature-badge ${supportsTools ? "on" : "off"}`;
					span.textContent = `${f.icon} ${f.label}`;
					featuresDiv.appendChild(span);
				});
				card.appendChild(featuresDiv);

				const metaDiv = document.createElement("div");
				metaDiv.className = "model-meta";

				const pullsP = document.createElement("p");
				pullsP.innerHTML = `<strong>Pulls:</strong> ${model.pulls}`;
				metaDiv.appendChild(pullsP);

				const updatedP = document.createElement("p");
				updatedP.innerHTML = `<strong>Updated:</strong> ${model.updated}`;
				metaDiv.appendChild(updatedP);

				if (model.link) {
					const linkA = document.createElement("a");
					linkA.href = `https://ollama.com${model.link}`;
					linkA.target = "_blank";
					linkA.className = "model-link";
					linkA.textContent = "More details";
					metaDiv.appendChild(linkA);
				}

				card.appendChild(metaDiv);

				const button = document.createElement("button");
				button.className = "marketplace-btn";
				button.textContent = "Open Download Dialog";
				button.addEventListener("click", () =>
					openPullModal(model.name, model.sizes),
				);
				card.appendChild(button);

				container.appendChild(card);
		});

		const targetId = decodeURIComponent(location.hash.slice(1));
		if (targetId) {
			const targetEl = document.getElementById(targetId);
			if (targetEl) {
				const yOffset = -100;
				const y =
					targetEl.getBoundingClientRect().top +
					window.pageYOffset +
					yOffset;
				window.scrollTo({ top: y, behavior: "smooth" });

				targetEl.classList.add("highlight");
			}
		}
	} catch (err: any) {
		container.innerHTML = `<p style="color:red"><strong>Error loading available models:</strong> ${err?.message ?? err}</p>`;
		showNotification({
			message: `Error rendering available models: ${err?.message ?? err}`,
			type: "error",
		});
	} finally {
		spinner.style.display = "none";
	}
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

function openManageHostsDialog() {
	const dialog = document.getElementById("manage-hosts-dialog")!;
	const list = document.getElementById("remote-host-list")!;
	list.innerHTML = "";

	const remotes: RemoteHost[] = JSON.parse(
		localStorage.getItem("remote_hosts") || "[]",
	);

	remotes.forEach((host, index) => {
		const item = document.createElement("li");

		const rowDiv = document.createElement("div");
		rowDiv.style.display = "flex";
		rowDiv.style.justifyContent = "space-between";
		rowDiv.style.alignItems = "center";
		rowDiv.style.padding = "8px 0";
		rowDiv.style.borderBottom = "1px solid #ddd";

		const textDiv = document.createElement("div");

		const strongEl = document.createElement("strong");
		strongEl.textContent = host.alias || "Unnamed";
		textDiv.appendChild(strongEl);

		textDiv.appendChild(document.createElement("br"));

		const smallEl = document.createElement("small");
		smallEl.textContent = host.url;
		textDiv.appendChild(smallEl);

		const removeButton = document.createElement("button");
		removeButton.textContent = "Remove";
		removeButton.style.background = "#ff6b6b";
		removeButton.style.color = "white";
		removeButton.style.border = "none";
		removeButton.style.padding = "4px 12px";
		removeButton.style.borderRadius = "4px";
		removeButton.style.cursor = "pointer";
		removeButton.addEventListener("click", () => {
			(window as any).removeHostMarketplace(index);
		});

		rowDiv.appendChild(textDiv);
		rowDiv.appendChild(removeButton);

		item.appendChild(rowDiv);
		list.appendChild(item);
	});

	dialog.classList.remove("hidden");

	document.getElementById("manage-hosts-close")!.onclick = () => {
		dialog.classList.add("hidden");
	};
}

function updateHostSelectOptions() {
	const hostSelect = document.getElementById(
		"host-select",
	) as HTMLSelectElement;
	if (!hostSelect) return;

	Array.from(hostSelect.options).forEach((opt) => {
		if (opt.value.startsWith("remote:")) opt.remove();
	});

	const remotes: RemoteHost[] = JSON.parse(
		localStorage.getItem("remote_hosts") || "[]",
	);
	const addRemoteOpt = hostSelect.querySelector('option[value="add_remote"]');

	remotes.forEach((host) => {
		const opt = document.createElement("option");
		opt.value = `remote:${host.url}`;
		opt.textContent = host.alias ? host.alias : `Remote: ${host.url}`;
		if (addRemoteOpt) hostSelect.insertBefore(opt, addRemoteOpt);
	});
}

function updateHostSelectState() {
	const hostSelect = document.getElementById(
		"host-select",
	) as HTMLSelectElement;
	const v = hostSelect.value;

	if (v === "add_remote") {
		const remoteHostDialog = document.getElementById("remote-host-dialog")!;
		const remoteHostInput = document.getElementById(
			"remote-host-input",
		) as HTMLInputElement;
		remoteHostDialog?.classList.remove("hidden");
		remoteHostInput?.focus();
		return;
	}

	if (v === "manage_hosts") {
		openManageHostsDialog();
		return;
	}

	currentHost = v;
	localStorage.setItem("host_select", v);

	(async () => {
		const clientUrl = getClientUrl();
		try {
			installedModels = await window.ollama.listModels(clientUrl);
			renderInstalledModels();
		} catch (err: any) {
			installedModels = [];
			renderInstalledModels("", true);
		}
	})();
}

function removeHostMarketplace(index: number) {
	const remotes: RemoteHost[] = JSON.parse(
		localStorage.getItem("remote_hosts") || "[]",
	);
	remotes.splice(index, 1);
	localStorage.setItem("remote_hosts", JSON.stringify(remotes));
	openManageHostsDialog();
}

document.addEventListener("DOMContentLoaded", async () => {
	try {
		const hostSelect = document.getElementById(
			"host-select",
		) as HTMLSelectElement;
		const remoteHostDialog = document.getElementById("remote-host-dialog")!;
		const remoteHostInput = document.getElementById(
			"remote-host-input",
		) as HTMLInputElement;
		const remoteHostAlias = document.getElementById(
			"remote-host-alias",
		) as HTMLInputElement;
		const remoteHostCancel = document.getElementById("remote-host-cancel")!;
		const remoteHostConfirm = document.getElementById(
			"remote-host-confirm",
		)!;

		const savedHost = localStorage.getItem("host_select") || "local";
		currentHost = savedHost;

		if (hostSelect) {
			updateHostSelectOptions();
			hostSelect.value = savedHost;
			hostSelect.addEventListener("change", updateHostSelectState);
		}

		remoteHostCancel?.addEventListener("click", () => {
			remoteHostDialog?.classList.add("hidden");
			if (hostSelect) {
				hostSelect.value =
					localStorage.getItem("host_select") || "local";
			}
		});

		remoteHostConfirm?.addEventListener("click", () => {
			let url = (remoteHostInput?.value || "").trim();
			const alias = (remoteHostAlias?.value || "")
				.trim()
				.substring(0, 20);

			if (!url) return;

			if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
			if (!/:\d+\/?$/.test(url) && !/:\d+\//.test(url)) {
				url = url.replace(/\/+$/, "") + ":52458";
			}
			url = url.replace(/\/+$/, "");

			const remotesStored: RemoteHost[] = JSON.parse(
				localStorage.getItem("remote_hosts") || "[]",
			);

			if (!remotesStored.some((r) => r.url === url)) {
				remotesStored.push({ url, alias });
				localStorage.setItem(
					"remote_hosts",
					JSON.stringify(remotesStored),
				);

				const opt = document.createElement("option");
				opt.value = `remote:${url}`;
				opt.textContent = alias ? alias : `Remote: ${url}`;

				const addRemoteOpt = hostSelect?.querySelector(
					'option[value="add_remote"]',
				);
				if (addRemoteOpt && hostSelect) {
					hostSelect.insertBefore(opt, addRemoteOpt);
				}
			}

			const sel = `remote:${url}`;
			currentHost = sel;
			localStorage.setItem("host_select", sel);
			if (hostSelect) hostSelect.value = sel;

			remoteHostDialog?.classList.add("hidden");
		});

		const installedContainer = document.getElementById("installed-models");
		const availableContainer = document.getElementById("available-models");
		if (!installedContainer || !availableContainer) return;

		const clientUrl = getClientUrl();

		const { supportsTools } = await window.ollama.getToolSupportingModels();
		toolSupportingModels = new Set(
			supportsTools.map((m: string) => m.toLowerCase()),
		);
		try {
			installedModels = await window.ollama.listModels(clientUrl);
			renderInstalledModels();
		} catch (err: any) {
			installedModels = [];
			renderInstalledModels("", true);
		}
		try {
			availableModels = await fetchAvailableModels();
			renderAvailableModels();
		} catch (err: any) {
			availableModels = []
			renderAvailableModels(undefined, true)
		}
	} catch (err: any) {
		showNotification({
			message: `Initialization error: ${err?.message ?? err}`,
			type: "error",
		});
	}
});

(window as any).removeHostMarketplace = removeHostMarketplace;
