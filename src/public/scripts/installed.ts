import { showNotification } from "./helper/notification.js"
import { getReadableColor, getEmoji } from "./helper/random.js";
const theme = localStorage.getItem("theme");

interface RemoteHost {
	url: string;
	alias: string;
}

let currentHost: string = "local";

function getClientUrl(): string | undefined {
	return currentHost.startsWith("remote:")
		? currentHost.replace("remote:", "")
		: undefined;
}

function openManageHostsDialog() {
	const dialog = document.getElementById("manage-hosts-dialog")!;
	const list = document.getElementById("remote-host-list")!;
	list.innerHTML = "";

	const remotes: RemoteHost[] = JSON.parse(
		localStorage.getItem("remote_hosts") || "[]",
	);

	remotes.forEach((host, index) => {
		const item = document.createElement("li");

		const container = document.createElement("div");
		container.style.display = "flex";
		container.style.justifyContent = "space-between";
		container.style.alignItems = "center";
		container.style.padding = "8px 0";
		container.style.borderBottom = "1px solid #ddd";

		const infoContainer = document.createElement("div");

		const strong = document.createElement("strong");
		strong.textContent = host.alias || "Unnamed";

		const br = document.createElement("br");

		const small = document.createElement("small");
		small.textContent = host.url;

		infoContainer.appendChild(strong);
		infoContainer.appendChild(br);
		infoContainer.appendChild(small);

		const button = document.createElement("button");
		button.textContent = "Remove";
		button.style.background = "#ff6b6b";
		button.style.color = "white";
		button.style.border = "none";
		button.style.padding = "4px 12px";
		button.style.borderRadius = "4px";
		button.style.cursor = "pointer";
		button.addEventListener("click", () => {
			(window as any).removeHost(index);
		});

		container.appendChild(infoContainer);
		container.appendChild(button);

		item.appendChild(container);
		list.appendChild(item);
	});

	dialog.classList.remove("hidden");

	document.getElementById("manage-hosts-close")!.onclick = () => {
		dialog.classList.add("hidden");
	};
}

function updateHostSelectOptions() {
	const hostSelect = document.getElementById("host-select") as HTMLSelectElement;
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
	const hostSelect = document.getElementById("host-select") as HTMLSelectElement;
	const v = hostSelect.value;

	if (v === "add_remote") {
		const remoteHostDialog = document.getElementById("remote-host-dialog")!;
		const remoteHostInput = document.getElementById("remote-host-input") as HTMLInputElement;
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
	renderOllama();
}

async function renderOllama() {
    const spinner = document.getElementById("spinner-ollama");
    const container = document.getElementById("installed-models");
    if (!container) {
        console.error("Container element not found.");
        return;
    }

    spinner!.style.display = "flex";
    container.innerHTML = "";

    try {
        const clientUrl = getClientUrl();
        const models = await window.ollama.listModels(clientUrl);
		if (models.length === 0) {
			const modelsNotFound = document.createElement("p")
            modelsNotFound.innerHTML = "No models installed. Visit the <a href='marketplace/ollama.html' style='color: var(--dark-text) !important'>marketplace</a> to choose from over 100 different chatbots";
            if (theme === 'light') {
                modelsNotFound.style.setProperty("color", 'rgb(0, 0, 0)', 'important');
            }
			container.appendChild(modelsNotFound);
			return;
		}
        models.forEach((model) => {
            const card = document.createElement("div");
            card.className = "marketplace-card";
            card.setAttribute("modelid", model.name);
			const c1 = getReadableColor();
			const c2 = getReadableColor();
            card.style.cssText = `
                background: linear-gradient(to right, ${c1}, ${c2});
                padding: 16px;
                border-radius: var(--border-radius);
                margin-bottom: 12px;
                position: relative;
            `;

            const title = document.createElement("h3");
            title.textContent = `${getEmoji()} ${model.name}`;
            title.style.cssText = "margin: 0; font-size: 18px;";

            const provider = document.createElement("p");
            provider.textContent = "by Ollama";
            provider.style.cssText = "margin: 4px 0 0; font-size: 14px; color: var(--text-dark);";

            const size = document.createElement("p");
            size.textContent = `Size: ${model.size}`;
            size.style.cssText = "margin: 8px 0 12px; font-size: 13px; color: var(--text-muted); line-height: 1.4;";

            const launchBtn = document.createElement("button");
            launchBtn.textContent = "Open Chat";
            launchBtn.className = "darkhvr";
            launchBtn.style.cssText = `background: linear-gradient(to right, ${c1}, ${c2}); filter: brightness(90%);`;
            launchBtn.onclick = () => runModel(model.name);

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "Delete";
            deleteBtn.className = "darkhvr";
            deleteBtn.style.cssText = `background: linear-gradient(to right, ${c1}, ${c2}); filter: brightness(90%);`;
            deleteBtn.onclick = () => showDelModal(model.name, model.name, "ollama");

            const menuContainer = document.createElement("div");
            menuContainer.className = "menu-container";
            menuContainer.style.cssText = "position: absolute; top: 12px; right: 12px;";

            const menuButton = document.createElement("button");
            menuButton.className = "menu-button";
            menuButton.innerHTML = "⋮";
            menuButton.onclick = () => toggleMenu(menuButton);
            menuButton.style.cssText = "background: transparent; border: none; font-size: 18px;";

            const menuDropdown = document.createElement("div");
            menuDropdown.className = "menu-dropdown";
            menuDropdown.style.cssText = `
                display: none;
                position: absolute;
                right: 0;
                background: var(--bg-light);
                border: 1px solid #ccc;
                border-radius: 4px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.1);
                z-index: 10;
            `;

            const shareBtn = document.createElement("button");
            shareBtn.textContent = "Info";
            shareBtn.onclick = () => window.open(`https://ollama.com/library/${model.name}`)
            shareBtn.style.cssText = `
                padding: 8px 12px;
                width: 100%;
                background: none;
                border: none;
                text-align: left;
                background-color: var(--bg-light);
				color: var(--text-dark) !important;
            `;

            menuDropdown.appendChild(shareBtn);
            menuContainer.appendChild(menuButton);
            menuContainer.appendChild(menuDropdown);

            card.appendChild(title);
            card.appendChild(provider);
            card.appendChild(size);
            card.appendChild(launchBtn);
            card.appendChild(document.createElement("br"));
            card.appendChild(deleteBtn);
            card.appendChild(menuContainer);

            container.appendChild(card);
        });
    } catch (err: any) {
        container.innerHTML = `<p>Error loading models: ${err.message}</p>`;
    } finally {
        spinner!.style.display = "none";
    }
}


async function renderSpaces() {
	const spinner = document.getElementById("spinner-hf") as HTMLDivElement;
	spinner.style.display = "flex";
	const spaces = await window.hfspaces.get_cards();
	if (!spaces || spaces == "") {
		const modelsNotFound = document.createElement("p")
		modelsNotFound.innerHTML = "No models added. Visit the <a href='marketplace/spaces.html' style='color: var(--dark-text) !important'>marketplace</a> to choose from over 10,000 different AI models";
		if (theme === 'light') {
			modelsNotFound.style.setProperty("color", 'rgb(0, 0, 0)', 'important');
		}
		document.getElementById("hf-spaces")!.appendChild(modelsNotFound);
		spinner.style.display = "none";
		return;
	}
	document.getElementById("hf-spaces")!.innerHTML = spaces;
	spinner.style.display = "none";
}

async function renderWebsites() {
	const spinner = document.getElementById("spinner-website") as HTMLDivElement
	spinner.style.display = "flex";
	const websites = await window.hfspaces.get_website_cards();
	if (!websites || websites == "") {
		const modelsNotFound = document.createElement("p")
		modelsNotFound.innerHTML = "No website shortcuts added. Visit the <a href='marketplace/website.html' style='color: var(--dark-text) !important'>marketplace</a> to add any website shortcut to this app";
		if (theme === 'light') {
			modelsNotFound.style.setProperty("color", 'rgb(0, 0, 0)', 'important');
		}
		document.getElementById("websites")!.appendChild(modelsNotFound);
		spinner.style.display = "none";
		return;
	}
	document.getElementById("websites")!.innerHTML = websites;
	spinner.style.display = "none";
}

document
	.getElementById("del-modal-close")
	?.addEventListener("click", closePullModal);

function closePullModal(): void {
	document.getElementById("del-modal")?.classList.add("hidden");
}

function showDelModal(username: string, repo: string, type: string) {
	const modal = document.getElementById("del-modal");
	const delete_yes = document.getElementById(
		"delete-yes"
	) as HTMLButtonElement;
	const cancel_btn = document.getElementById(
		"del-modal-close"
	) as HTMLButtonElement;
	const cancelNo = document.getElementById("cancel-no") as HTMLButtonElement;

	delete_yes.replaceWith(delete_yes.cloneNode(true));
	const new_delete_yes = document.getElementById(
		"delete-yes"
	) as HTMLButtonElement;

	new_delete_yes.setAttribute("username", username);
	new_delete_yes.setAttribute("repo", repo);
	new_delete_yes.setAttribute("type", type);

	function handleDeleteClick() {
		if (type === "ollama") {
			try {
				const clientUrl = getClientUrl();
				window.ollama.deleteModel(username, clientUrl);
                const card = document.querySelector(`.marketplace-card[modelid="${username}"]`) as HTMLElement;
                if (card) {
                    card.style.transition = "opacity 0.4s ease, transform 0.4s ease";
                    card.style.opacity = "0";
                    card.style.transform = "scale(0.95)";
                    setTimeout(() => card.remove(), 400);
                }
				showNotification({
					message: `Deleted: ${username}`,
					type: "success",
					actions: [
						{
							label: "Close",
							onClick: () => void(0),
						},
					],
				});
			} catch {
				showNotification({
					message: `Failed to Delete`,
					type: "error",
					actions: [{ label: "OK", onClick: () => void 0 }],
				});
			}
		}
		else if (type === "space") {
			try {
				window.hfspaces.delete(username, repo);
                const spaceId = `${username}/${repo}`;
                const card = document.querySelector(`.marketplace-card[spaceid="${spaceId}"]`) as HTMLElement;
                if (card) {
                    card.style.transition = "opacity 0.4s ease, transform 0.4s ease";
                    card.style.opacity = "0";
                    card.style.transform = "scale(0.95)";
                    setTimeout(() => card.remove(), 400);
                }
				showNotification({
					message: `Deleted: ${username}/${repo}`,
					type: "success",
					actions: [
						{
							label: "Close",
							onClick: () => void(0),
						},
					],
				});
			} catch {
				showNotification({
					message: `Failed to Delete`,
					type: "error",
					actions: [{ label: "OK", onClick: () => void 0 }],
				});
			}
		} else if (type === "website") {
			try {
				window.hfspaces.delete_website(username);
                const siteID = `${username}`;
                const card = document.querySelector(`.marketplace-card[siteId="${siteID}"]`) as HTMLElement;
                if (card) {
                    card.style.transition = "opacity 0.4s ease, transform 0.4s ease";
                    card.style.opacity = "0";
                    card.style.transform = "scale(0.95)";
                    setTimeout(() => card.remove(), 400);
                }
				showNotification({
					message: `Deleted: ${repo}`,
					type: "success",
					actions: [
						{
							label: "Close",
							onClick: () => void(0),
						},
					],
				});
			} catch {
				showNotification({
					message: `Failed to Delete`,
					type: "error",
					actions: [{ label: "OK", onClick: () => void 0 }],
				});
			}
		} else {
			showNotification({
				message: `Type "Delete ${type}" is not supported`,
				type: "error",
				actions: [{ label: "OK", onClick: () => void 0 }],
			});
		}

		// Cleanup
		new_delete_yes.removeEventListener("click", handleDeleteClick);
		new_delete_yes.removeAttribute("username");
		new_delete_yes.removeAttribute("repo");
		new_delete_yes.removeAttribute("type");
		modal?.classList.add("hidden");
	}

	// Attach listener
	new_delete_yes.addEventListener("click", handleDeleteClick);

	// Cancel button closes modal and clears attributes
	cancelNo.onclick = cancel;
	cancel_btn.onclick = cancel;
	function cancel() {
		new_delete_yes.removeEventListener("click", handleDeleteClick);
		new_delete_yes.removeAttribute("username");
		new_delete_yes.removeAttribute("repo");
		new_delete_yes.removeAttribute("type");
		modal?.classList.add("hidden");
	}

	modal?.classList.remove("hidden");
}

function runModel(name: string): void {
	window.location.href = `./renderer/chat.html?model=${encodeURIComponent(name)}`;
}

function toggleMenu(button: HTMLButtonElement) {
    const dropdown = button.nextElementSibling as HTMLElement
    dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
}

function shareSpace(username: string, repo: string) {
    window.hfspaces.share(username, repo);
}
function shareWebsite(url: string, title: string) {
    window.hfspaces.share_website(url, title);
}

function removeHost(index: number) {
	const remotes: RemoteHost[] = JSON.parse(
		localStorage.getItem("remote_hosts") || "[]",
	);
	remotes.splice(index, 1);
	localStorage.setItem("remote_hosts", JSON.stringify(remotes));
	openManageHostsDialog();
}

// Initialize host selection
document.addEventListener("DOMContentLoaded", () => {
	const hostSelect = document.getElementById("host-select") as HTMLSelectElement;
	const remoteHostDialog = document.getElementById("remote-host-dialog")!;
	const remoteHostInput = document.getElementById("remote-host-input") as HTMLInputElement;
	const remoteHostAlias = document.getElementById("remote-host-alias") as HTMLInputElement;
	const remoteHostCancel = document.getElementById("remote-host-cancel")!;
	const remoteHostConfirm = document.getElementById("remote-host-confirm")!;

	const savedHost = localStorage.getItem("host_select") || "local";
	currentHost = savedHost;
	if (hostSelect) hostSelect.value = savedHost;

	if (hostSelect) {
		updateHostSelectOptions();
		hostSelect.addEventListener("change", updateHostSelectState);
	}

	remoteHostCancel?.addEventListener("click", () => {
		remoteHostDialog?.classList.add("hidden");
		if (hostSelect) hostSelect.value = localStorage.getItem("host_select") || "local";
	});

	remoteHostConfirm?.addEventListener("click", () => {
		let url = (remoteHostInput?.value || "").trim();
		const alias = (remoteHostAlias?.value || "").trim().substring(0, 20);

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
			localStorage.setItem("remote_hosts", JSON.stringify(remotesStored));

			const opt = document.createElement("option");
			opt.value = `remote:${url}`;
			opt.textContent = alias ? alias : `Remote: ${url}`;
			const addRemoteOpt = hostSelect?.querySelector(
				'option[value="add_remote"]',
			);
			if (addRemoteOpt && hostSelect)
				hostSelect.insertBefore(opt, addRemoteOpt);
		}

		const sel = `remote:${url}`;
		if (hostSelect) hostSelect.value = sel;
		currentHost = sel;
		localStorage.setItem("host_select", sel);
		remoteHostDialog?.classList.add("hidden");
	});
	
	renderOllama();
	renderSpaces();
	renderWebsites();
});

(window as any).showDelModal = showDelModal;
(window as any).toggleMenu = toggleMenu;
(window as any).shareSpace = shareSpace;
(window as any).shareWebsite = shareWebsite;
(window as any).removeHost = removeHost;

