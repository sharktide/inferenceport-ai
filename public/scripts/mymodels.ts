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

interface NotificationAction {
	label: string;
	onClick?: () => void;
}

interface NotificationOptions {
	message: string;
	type?: "info" | "success" | "error";
	actions?: NotificationAction[];
}

// Utility Functions
function showNotification({
	message,
	type = "info",
	actions = [],
}: NotificationOptions): void {
	const container = document.getElementById("notification-container");
	if (!container) return;

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

async function renderOllama() {
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
			const provider = document.createElement("p");
			provider.textContent = "Provider: Ollama";
			const size = document.createElement("p");
			//@ts-ignore
			size.textContent = "Size: ".concat(model.size);
			const button = document.createElement("button");
			button.textContent = "Open Chat";
			button.onclick = () => runModel(model.name);
			card.appendChild(title);
			card.appendChild(provider);
			card.appendChild(size);
			card.appendChild(button);
			container.appendChild(card);
		});
	} catch (err: any) {
		container.innerHTML = `<p>Error loading models: ${err.message}</p>`;
	}
}

async function renderSpaces() {
	document.getElementById("hf-spaces")!.innerHTML =
        //@ts-ignore
		await window.hfspaces.get_cards();
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

	// Clean up any previous listeners
	delete_yes.replaceWith(delete_yes.cloneNode(true));
	const new_delete_yes = document.getElementById(
		"delete-yes"
	) as HTMLButtonElement;

	// Set attributes
	new_delete_yes.setAttribute("username", username);
	new_delete_yes.setAttribute("repo", repo);
	new_delete_yes.setAttribute("type", type);

	// Define handler
	function handleDeleteClick() {
		if (type === "space") {
			try {
				//@ts-ignore
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
	renderOllama();
	renderSpaces();
});

function runModel(name: string): void {
	window.location.href = `./renderer/chat.html?model=${encodeURIComponent(name)}`;
}

(window as any).showDelModal = showDelModal;
