import { showNotification } from "./helper/notification.js"
import { getReadableColor, getEmoji } from "./helper/random.js";
import { isLoggedIn } from "./helper/checkers/auth-checker.js";
const theme = localStorage.getItem("theme");
async function renderOllama() {
    const spinner = document.getElementById("spinner-ollama");
    const container = document.getElementById("installed-models");
    if (!container) {
        console.error("Container element not found.");
        return;
    }

    spinner!.style.display = "flex";

    try {
        const models = await window.ollama.listModels();
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
				color: var(--text-dark);
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
	document.getElementById("hf-spaces")!.innerHTML = await window.hfspaces.get_cards();
	spinner.style.display = "none";
}

async function renderWebsites() {
	const spinner = document.getElementById("spinner-website") as HTMLDivElement
	spinner.style.display = "flex";
	document.getElementById("websites")!.innerHTML = await window.hfspaces.get_website_cards();
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
				window.ollama.deleteModel(username);
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

document.addEventListener("DOMContentLoaded", async () => {
	console.log(await isLoggedIn())
	renderOllama();
	renderSpaces();
	renderWebsites();
});

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


(window as any).showDelModal = showDelModal;
(window as any).toggleMenu = toggleMenu;
(window as any).shareSpace = shareSpace;
(window as any).shareWebsite = shareWebsite;

