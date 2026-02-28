import { showNotification } from "./helper/notification.js";

const chipContainer = document.getElementById("email-chips") as HTMLDivElement;
const emailInput = document.getElementById("email-input") as HTMLInputElement;
const hostEmailsInput = document.getElementById('host-emails') as HTMLTextAreaElement;
const hostStartBtn = document.getElementById('host-start') as HTMLButtonElement;
const hostStopBtn = document.getElementById('host-stop') as HTMLButtonElement;
const hostStatus = document.getElementById('host-status') as HTMLParagraphElement;
const serverLogsPanel = document.getElementById('server-logs-panel') as HTMLDivElement;
const logsRefreshBtn = document.getElementById('logs-refresh') as HTMLButtonElement;
const logsStartBtn = document.getElementById('logs-start') as HTMLButtonElement;
const logsStopBtn = document.getElementById('logs-stop') as HTMLButtonElement;
const logsOutput = document.getElementById('logs-output') as HTMLPreElement;

const RESTART_REQUIRED_KEY = "host_restart_required";

const EMAIL_STORAGE_KEY = "host_emails_v2";
const HOST_USERS_KEY = "host_users_v1";

const syncCheckbox = document.getElementById('sync-chats') as HTMLInputElement | null;
const syncSection = document.querySelector('details:has(#sync-chats)') as HTMLDetailsElement | null;
const startupRunAtLoginCheckbox = document.getElementById("startup-run-at-login") as HTMLInputElement | null;
const startupAutoProxyCheckbox = document.getElementById("startup-auto-proxy") as HTMLInputElement | null;
const startupUiPortInput = document.getElementById("startup-ui-port") as HTMLInputElement | null;
const startupUiPortSaveBtn = document.getElementById("startup-ui-port-save") as HTMLButtonElement | null;
const startupUiPortStatus = document.getElementById("startup-ui-port-status") as HTMLParagraphElement | null;
const startupStatus = document.getElementById("startup-status") as HTMLParagraphElement | null;
let emails: string[] = [];
const RESERVED_PORT_MIN = 52440;
const RESERVED_PORT_MAX = 52459;

let hostConfigModal: declarations["iInstance"]["iModal"];
let renameModal: declarations["iInstance"]["iModal"];
let deleteConfirmModal: declarations["iInstance"]["iModal"];
let deletePasswordModal: declarations["iInstance"]["iModal"];

document.addEventListener("DOMContentLoaded", () => {
	hostConfigModal = new window.ic.iModal("host-config-modal", 650);
	renameModal = new window.ic.iModal("rename-modal", 400);
	deleteConfirmModal = new window.ic.iModal("delete-confirm-modal", 420);
	deletePasswordModal = new window.ic.iModal("delete-password-modal", 420);
});

(async () => {
    try {
        const { session } = await window.auth.getSession?.() ?? { session: null };
        const isLoggedIn = !!session?.user;

        if (syncCheckbox) {
            if (!isLoggedIn) {
                syncCheckbox.disabled = true;
                syncCheckbox.checked = false;
                localStorage.setItem('sync_enabled', 'false');

                if (syncSection) {
                    const msg = document.createElement('p');
                    msg.className = 'muted';
                    msg.style.color = '#d38200ff';
                    msg.textContent = 'Sign in to enable chat sync.';
                    syncSection.appendChild(msg);
                }
            } else {
                const saved = localStorage.getItem('sync_enabled');
                syncCheckbox.checked = saved === 'true';
                syncCheckbox.disabled = false;
                syncCheckbox.addEventListener('change', () => {
                    localStorage.setItem('sync_enabled', syncCheckbox.checked ? 'true' : 'false');
                });
            }
        }
    } catch (e) {
        console.warn('Could not initialize sync setting', e);
    }
})();

async function initStartupSettings() {
	if (!startupRunAtLoginCheckbox || !startupAutoProxyCheckbox) return;
	try {
		const startup = await window.startup.getSettings();
		startupRunAtLoginCheckbox.checked = Boolean(startup.runAtLogin);
		startupAutoProxyCheckbox.checked = Boolean(startup.autoStartProxy);
		if (startupUiPortInput) {
			startupUiPortInput.value = String(startup.uiPort);
		}
		if (startupUiPortStatus) {
			startupUiPortStatus.textContent = `Reserved ports: ${RESERVED_PORT_MIN}-${RESERVED_PORT_MAX}.`;
		}
		if (startupStatus) {
			startupStatus.textContent = startup.runAtLogin
				? "Background startup is enabled."
				: "Background startup is disabled.";
		}
	} catch (err) {
		console.warn("Could not load startup settings", err);
	}
}

function parseUiPort(raw: string): number | null {
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return null;
	const port = Math.round(parsed);
	if (port < 1 || port > 65535) return null;
	return port;
}

function isReservedPort(port: number): boolean {
	return port >= RESERVED_PORT_MIN && port <= RESERVED_PORT_MAX;
}

startupUiPortSaveBtn?.addEventListener("click", async () => {
	if (!startupUiPortInput) return;
	const port = parseUiPort(startupUiPortInput.value.trim());

	if (port === null) {
		if (startupUiPortStatus) {
			startupUiPortStatus.textContent = "Enter a valid UI port between 1 and 65535.";
		}
		return;
	}

	if (isReservedPort(port)) {
		if (startupUiPortStatus) {
			startupUiPortStatus.textContent =
				`Port ${port} is reserved. Use a port outside ${RESERVED_PORT_MIN}-${RESERVED_PORT_MAX}.`;
		}
		return;
	}

	try {
		const updated = await window.startup.updateSettings({ uiPort: port });
		startupUiPortInput.value = String(updated.uiPort);
		if (startupUiPortStatus) {
			startupUiPortStatus.textContent = `UI port saved: ${updated.uiPort}. Restart app to fully apply.`;
		}
	} catch (err: any) {
		if (startupUiPortStatus) {
			startupUiPortStatus.textContent = `Could not save UI port: ${err?.message || err}`;
		}
	}
});

startupUiPortInput?.addEventListener("keydown", (event: KeyboardEvent) => {
	if (event.key === "Enter") {
		event.preventDefault();
		startupUiPortSaveBtn?.click();
	}
});

startupRunAtLoginCheckbox?.addEventListener("change", async () => {
	try {
		const updated = await window.startup.updateSettings({
			runAtLogin: startupRunAtLoginCheckbox.checked,
		});
		if (startupStatus) {
			startupStatus.textContent = updated.runAtLogin
				? "Background startup is enabled."
				: "Background startup is disabled.";
		}
	} catch (err) {
		console.warn("Could not update run-at-login setting", err);
	}
});

startupAutoProxyCheckbox?.addEventListener("change", async () => {
	try {
		const existingUsersRaw = localStorage.getItem(HOST_USERS_KEY);
		let existingUsers: { email: string; role: string }[] = [];
		try {
			existingUsers = existingUsersRaw ? JSON.parse(existingUsersRaw) : [];
		} catch {
			existingUsers = [];
		}

		await window.startup.updateSettings({
			autoStartProxy: startupAutoProxyCheckbox.checked,
			proxyPort: 52458,
			proxyUsers: existingUsers,
		});
	} catch (err) {
		console.warn("Could not update auto proxy startup setting", err);
	}
});

void initStartupSettings();

function isValidEmail(email: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

try {
    const usersRaw = localStorage.getItem(HOST_USERS_KEY);
    if (usersRaw) {
        const users = JSON.parse(usersRaw) as { email: string; role: string }[];
        if (Array.isArray(users)) {
            emails = users.map(u => u.email);
            renderChips();
        }
    } else {
        const stored = JSON.parse(localStorage.getItem(EMAIL_STORAGE_KEY) || "[]");
        if (Array.isArray(stored)) {
            emails = stored;
            renderChips();
        }
    }
} catch {
    void 0;
}

function renderChips() {
	chipContainer.innerHTML = "";

	for (const email of emails) {
		const chip = document.createElement("div");
		chip.className = "chip" + (isValidEmail(email) ? "" : " invalid");
		chip.textContent = email;

		const remove = document.createElement("button");
		remove.textContent = "×";
		remove.onclick = () => {
			emails = emails.filter(e => e !== email);
			renderChips();
		};

		chip.appendChild(remove);
		chipContainer.appendChild(chip);
	}

	localStorage.setItem(EMAIL_STORAGE_KEY, JSON.stringify(emails));
}


function addEmail(value: string) {
	const email = value.trim();
	if (!email || emails.includes(email)) return;
	emails.push(email);
	renderChips();
	markRestartRequired();
}


emailInput.addEventListener("keydown", (e) => {
	if ((e.key === "Backspace" || e.key === "Delete") && emailInput.value === "") {
		if (emails.length > 0) {
			emails.pop();
			renderChips();
			e.preventDefault();
		}
		return;
	}

	if (e.key === "Enter" || e.key === ",") {
		e.preventDefault();
		addEmail(emailInput.value);
		emailInput.value = "";
	}
});


emailInput.addEventListener("blur", () => {
	addEmail(emailInput.value);
	emailInput.value = "";
});

window.addEventListener("DOMContentLoaded", async () => {
    const { session } = await window.auth.getSession();
    if (session) return;
    const shouldDisable = true;

    const details = document.getElementById("account-settings");
    if (!details) return;

    const buttons = details.querySelectorAll("button");

    buttons.forEach(btn => {
        if (shouldDisable) {
            btn.classList.add("disabled");
            btn.disabled = true;
        } else {
            btn.classList.remove("disabled");
            btn.disabled = false;
        }
    });

    const msg = document.createElement('p');
    const br = document.createElement('p');
    br.textContent = ' ';
    details.appendChild(br);
    msg.className = 'muted';
    msg.style.color = '#d38200ff';
    msg.textContent = 'Sign in to use account controls.';
    details.appendChild(msg);
});

async function setHostingUIRunning(running: boolean, port?: number) {
    if (hostStartBtn) hostStartBtn.disabled = running;
    if (hostStopBtn) hostStopBtn.disabled = !running;
    if (hostStatus) hostStatus.textContent = running ? `Server running on port ${port}` : 'Server stopped';
    if (running) {
        serverLogsPanel.style.display = 'block';
        logsOutput.textContent = await window.ollama.getServerLogs();
    } else {
        serverLogsPanel.style.display = 'none';
    }
}

function setServerLogUIRunning(running: boolean, port?: number) {
    if (!serverLogsPanel) return;
    serverLogsPanel.style.display = running ? 'block' : 'none';
    if (!running) {
        if (logsStartBtn) logsStartBtn.disabled = false;
        if (logsStopBtn) logsStopBtn.disabled = true;
    }
}

logsRefreshBtn?.addEventListener('click', async () => {
    if (!logsOutput) return;
    logsOutput.textContent = 'Loading...';
    try {
        const data = await window.ollama.getServerLogs();
        logsOutput.textContent = data || '';
        logsOutput.scrollTop = logsOutput.scrollHeight;
    } catch (e: any) {
        logsOutput.textContent = `Error: ${e?.message || e}`;
    }
});

const savedEmails = localStorage.getItem('host_emails') || '';
if (hostEmailsInput) hostEmailsInput.value = savedEmails;

function markRestartRequired() {
	if (!hostStartBtn?.disabled) return;

	localStorage.setItem(RESTART_REQUIRED_KEY, "true");

	if (hostStatus) {
		hostStatus.textContent = "Restart server to apply email changes.";
		hostStatus.style.color = "#d38200ff";
	}
}
function clearRestartRequired() {
	localStorage.removeItem(RESTART_REQUIRED_KEY);
	if (hostStatus) hostStatus.style.color = "";
}

async function isLocalProxyRunning(port: number, timeout = 1000): Promise<boolean> {
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        const res = await fetch(`http://127.0.0.1:${port}/__health`, { method: 'GET', signal: controller.signal });
        clearTimeout(id);
        return !!res;
    } catch (e) {
        return false;
    }
}

(async () => {
    const portNum = 52458;
    try {
        const running = await isLocalProxyRunning(portNum, 800);
        if (running) {
            setHostingUIRunning(true, portNum);
            setServerLogUIRunning(true, portNum);
            try {
                const data = await window.ollama.getServerLogs();
                if (logsOutput) logsOutput.textContent = data || '';
            } catch {}
        }
    } catch (e) {
    }
})();

hostStartBtn?.addEventListener('click', async () => {
	const models = await window.ollama.listModels(undefined);
	if (models.length === 0) {
		if (hostStatus) hostStatus.textContent = 'No models available. Please download a model before starting the server.';
		showNotification({ message: "Could not start the server", type: "error" });
		return;
	}

	const port = 52458;
	const emailsToUse = emails.filter(isValidEmail);
	if (emailsToUse.length === 0) {
		if (hostStatus) hostStatus.textContent = 'No valid emails configured.';
		return;
	}

	const existingUsersRaw = localStorage.getItem(HOST_USERS_KEY);
	let existingUsers: { email: string; role: string }[] = [];
	try {
		existingUsers = existingUsersRaw ? JSON.parse(existingUsersRaw) : [];
	} catch {}

	const users = emailsToUse.map(e => {
		const found = existingUsers.find(u => u.email === e);
		return { email: e, role: found?.role || 'member' };
	});

	const rows = users.map((u, idx) => `
		<tr>
			<td style="padding:8px; text-align:left">${u.email}</td>
			<td style="padding:8px; text-align:right">
				<select data-idx="${idx}">
					<option value="member" ${u.role === 'member' ? 'selected' : ''}>Member</option>
					<option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
				</select>
			</td>
		</tr>
	`).join("");

	const html = `
		<h3>Configure Hosted Users & Roles</h3>
		<table style="width:100%; border-collapse:collapse">
			<tr>
				<th style="text-align:left">Email</th>
				<th style="text-align:left">Role</th>
			</tr>
			${rows}
		</table>
	`;

	hostConfigModal.open({
		html,
		actions: [
			{
				id: "cancel-host",
				label: "Cancel",
				onClick: () => hostConfigModal.close()
			},
			{
				id: "start-host",
				label: "Start Server",
				onClick: async () => {
					hostConfigModal.close();
					if (hostStatus) hostStatus.textContent = "Starting...";

					try {
						clearRestartRequired();
						await window.ollama.startServer(port, users);
						localStorage.setItem(HOST_USERS_KEY, JSON.stringify(users));
						localStorage.setItem('host_emails', hostEmailsInput?.value || '');
						await window.startup.updateSettings({
							proxyPort: port,
							proxyUsers: users,
						});
						setHostingUIRunning(true, port);
					} catch (e: any) {
						if (hostStatus) hostStatus.textContent = `Error: ${e?.message || e}`;
					}
				}
			}
		]
	});

	requestAnimationFrame(() => {
		document.querySelectorAll<HTMLSelectElement>("#host-config-modal select")
			.forEach(select => {
				select.addEventListener("change", () => {
					const idx = Number(select.dataset.idx);
					users[idx]!.role = select.value;
				});
			});
	});
});

hostStopBtn.addEventListener('click', async () => {
    if (hostStatus) hostStatus.textContent = 'Stopping...';
    try {
        await window.ollama.stopServer();
        clearRestartRequired();
        setHostingUIRunning(false);
    } catch (e: any) {
        if (hostStatus) hostStatus.textContent = `Error: ${e?.message || e}`;
    }
});

(document.getElementById("open-rename") as HTMLButtonElement).addEventListener("click", () => {
	renameModal.open({
		html: `
			<div style="text-align:left">
				<h3>Change Username</h3>
				<p>Pick your new username:</p>
				<input type="text" id="rename-username" placeholder="Enter username" style="width:100%">
				<p id="rename-status" style="margin-top:8px;"></p>
			</div>
		`,
		actions: [
			{
				id: "rename-cancel",
				label: "Cancel",
				onClick: () => renameModal.close()
			},
			{
				id: "rename-save",
				label: "Save",
				onClick: async () => {
					const input = document.getElementById("rename-username") as HTMLInputElement;
					const statusEl = document.getElementById("rename-status") as HTMLParagraphElement;
					const username = input.value.trim();

					if (!username) {
						statusEl.textContent = "Please enter a username.";
						return;
					}

					statusEl.textContent = "Saving...";

					const { session } = await window.auth.getSession();
					const userId = session?.user?.id;
					if (!userId) {
						statusEl.textContent = "Not logged in.";
						return;
					}

					const result = await window.auth.setUsername(userId, username);
					if (result.error) {
						statusEl.textContent = `Error: ${result.error}`;
						return;
					}

					renameModal.close();
                    setTimeout(() => {
                        window.location.reload();
                    }, 700);
				}
			}
		]
	});
});

(document.getElementById("open-delete") as HTMLButtonElement).addEventListener("click", () => {
	deleteConfirmModal.open({
		html: `
			<div style="text-align:left">
				<h3 style="color:red">Delete Account</h3>
				<p>Are you sure you want to permanently delete your account?</p>
			</div>
		`,
		actions: [
			{
				id: "delete-cancel",
				label: "Cancel",
				onClick: () => deleteConfirmModal.close()
			},
			{
				id: "delete-continue",
				label: "Delete",
				onClick: async () => {
					deleteConfirmModal.close();
					await handleDeleteFlow();
				}
			}
		]
	});
});

async function handleDeleteFlow() {
	const { session } = await window.auth.getSession();
	if (!session?.user) return;

	if (session.user.app_metadata?.provider === "email") {
		deletePasswordModal.open({
			html: `
				<div style="text-align:left">
					<h3 style="color:red">Confirm Password</h3>
					<p>Please enter your password to delete your account.</p>
					<input type="password" id="delete-password-input" style="width:100%">
					<p id="delete-password-status"></p>
				</div>
			`,
			actions: [
				{
					id: "pw-cancel",
					label: "Cancel",
					onClick: () => deletePasswordModal.close()
				},
				{
					id: "pw-delete",
					label: "Delete",
					onClick: async () => {
						const input = document.getElementById("delete-password-input") as HTMLInputElement;
						const statusEl = document.getElementById("delete-password-status") as HTMLParagraphElement;

						statusEl.textContent = "Verifying...";

						const { success, error } = await window.auth.verifyPassword(input.value);
						if (!success) {
							statusEl.textContent = `Error: ${error || "Verification failed"}`;
							return;
						}

						await performFinalDeletion(statusEl);
					}
				}
			]
		});
	} else {
		await performFinalDeletion();
	}
}

async function performFinalDeletion(statusEl?: HTMLElement) {
	if (statusEl) statusEl.textContent = "Deleting account...";

	const result = await window.auth.deleteAccount();
	if (!result.success) {
		if (statusEl) statusEl.textContent = `Error: ${result.error || "Deletion failed"}`;
		return;
	}

	if (statusEl) statusEl.textContent = "Deleted.";

	setTimeout(() => {
		window.auth.signOut().finally(() => {
			window.location.href = "index.html";
		});
	}, 800);
}

setHostingUIRunning(false);
