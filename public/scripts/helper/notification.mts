interface NotificationAction {
	label: string;
	onClick?: () => void;
}

interface NotificationOptions {
	message: string;
	type?: "info" | "success" | "error";
	actions?: NotificationAction[];
}

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

export { showNotification }