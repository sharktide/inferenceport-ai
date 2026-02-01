const usernameInput = document.getElementById('username') as HTMLInputElement;
const saveButton = document.getElementById('save') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLParagraphElement;

const syncCheckbox = document.getElementById('sync-chats') as HTMLInputElement | null;
const syncSection = document.querySelector('details:has(#sync-chats)') as HTMLDetailsElement | null;

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
                    status && (status.textContent = 'Saved.');
                    setTimeout(() => { if (status) status.textContent = ''; }, 1200);
                });
            }
        }
    } catch (e) {
        console.warn('Could not initialize sync setting', e);
    }
})();

const chipContainer = document.getElementById("email-chips")!;
const emailInput = document.getElementById("email-input") as HTMLInputElement;
const EMAIL_STORAGE_KEY = "host_emails_v2";
const HOST_USERS_KEY = "host_users_v1";

let emails: string[] = [];

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

saveButton.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    if (!username) return status.textContent = "Please enter a username.";

    const { session } = await window.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return status.textContent = "Not logged in.";

    const result = await window.auth.setUsername(userId, username);
    if (result.error) return status.textContent = `Error: ${result.error}`;

    status.textContent = "Saving...";
    setTimeout(() => {
        (document.getElementById("rename-dialog") as HTMLDivElement).style.display = "none";
        window.location.reload();
    }, 1000);
});

(document.getElementById("rename-cancel") as HTMLButtonElement).addEventListener('click', function() {
    (document.getElementById("rename-dialog") as HTMLDivElement).style.display = "none";
});

(document.getElementById("deleteforreal") as HTMLButtonElement).addEventListener('click', async function() {
    const passwordInput = document.getElementById("password") as HTMLInputElement;
    const password = passwordInput.value;
    const deleteStatus = document.getElementById("delete-password-status") as HTMLParagraphElement;

    deleteStatus.textContent = "Deleting account...";
    try {
        const { success, error } = await window.auth.verifyPassword(password);
        if (!success) {
            deleteStatus.textContent = `Error: ${error || 'Verification failed'}`;
            return;
        }
        const result = await window.auth.deleteAccount();
        if (!result.success) {
            deleteStatus.textContent = `Error: ${result.error || 'Deletion failed'}`;
            return;
        }
        deleteStatus.textContent = "Account deleted successfully.";
    } catch (e: Error | any | unknown) {
        deleteStatus.textContent = `Error: ${e.message || e}`;
        return;
    }

    setTimeout(() => {
        window.auth.signOut().finally(() => {
            window.location.href = "index.html";
        });
    }, 1000);
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

const hostEmailsInput = document.getElementById('host-emails') as HTMLTextAreaElement | null;
const hostStartBtn = document.getElementById('host-start') as HTMLButtonElement | null;
const hostStopBtn = document.getElementById('host-stop') as HTMLButtonElement | null;
const hostStatus = document.getElementById('host-status') as HTMLParagraphElement | null;
const RESTART_REQUIRED_KEY = "host_restart_required";

function setHostingUIRunning(running: boolean, port?: number) {
    if (hostStartBtn) hostStartBtn.disabled = running;
    if (hostStopBtn) hostStopBtn.disabled = !running;
    if (hostStatus) hostStatus.textContent = running ? `Server running on port ${port}` : 'Server stopped';
}

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
        const res = await fetch(`http://127.0.0.1:${port}/v1`, { method: 'GET', signal: controller.signal });
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
        if (running) setHostingUIRunning(true, portNum);
    } catch (e) {
    }
})();

hostStartBtn?.addEventListener('click', async () => {
    const port = 52458;
    const emailsToUse = emails.filter(isValidEmail);
    if (emailsToUse.length === 0) {
        if (hostStatus) hostStatus.textContent = 'No valid emails configured.';
        return;
    }

    // Open configuration dialog to assign roles before starting server
    const existingUsersRaw = localStorage.getItem(HOST_USERS_KEY);
    let existingUsers: { email: string; role: string }[] = [];
    try { existingUsers = existingUsersRaw ? JSON.parse(existingUsersRaw) : []; } catch { existingUsers = []; }

    const users: { email: string; role: string }[] = emailsToUse.map(e => {
        const found = existingUsers.find(u => u.email === e);
        return { email: e, role: (found && found.role) || 'member' };
    });

    // Build modal
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.right = '0';
    modal.style.bottom = '0';
    modal.style.background = 'rgba(0,0,0,0.4)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.id = 'host-config-modal';

    const dialog = document.createElement('div');
    dialog.style.background = 'var(--gray)';
    dialog.style.padding = '16px';
    dialog.style.borderRadius = '8px';
    dialog.style.width = '600px';
    dialog.style.maxHeight = '80vh';
    dialog.style.overflow = 'auto';

    const title = document.createElement('h3');
    title.textContent = 'Configure Hosted Users & Roles';
    dialog.appendChild(title);

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    const header = document.createElement('tr');
    header.innerHTML = '<th style="text-align:left">Email</th><th style="text-align:left">Role</th>';
    table.appendChild(header);

    users.forEach((u, idx) => {
        const row = document.createElement('tr');
        const emailTd = document.createElement('td');
        emailTd.textContent = u.email;
        emailTd.style.padding = '8px';

        const roleTd = document.createElement('td');
        roleTd.style.padding = '8px';
        const select = document.createElement('select');
        ['member','admin'].forEach(r => {
            const opt = document.createElement('option');
            opt.value = r;
            opt.textContent = r.charAt(0).toUpperCase() + r.slice(1);
            if (r === u.role) opt.selected = true;
            select.appendChild(opt);
        });
        roleTd.appendChild(select);

        row.appendChild(emailTd);
        row.appendChild(roleTd);
        table.appendChild(row);

        // attach selector back to user object on change
        select.addEventListener('change', () => {
            users[idx]!.role = select.value;
        });
    });

    dialog.appendChild(table);

    const actions = document.createElement('div');
    actions.style.marginTop = '12px';
    actions.style.textAlign = 'right';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.marginRight = '8px';
    cancelBtn.onclick = () => modal.remove();
    cancelBtn.style.marginBottom = "10px";

    const startBtn = document.createElement('button');
    startBtn.textContent = 'Start Server';
    startBtn.onclick = async () => {
        modal.remove();
        if (hostStatus) hostStatus.textContent = 'Starting...';
        try {
            clearRestartRequired();
            await window.ollama.startServer(port, users);
            localStorage.setItem(HOST_USERS_KEY, JSON.stringify(users));
            localStorage.setItem('host_emails', hostEmailsInput?.value || '');
            setHostingUIRunning(true, port);
        } catch (e: any) {
            if (hostStatus) hostStatus.textContent = `Error: ${e?.message || e}`;
        }
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(startBtn);
    dialog.appendChild(actions);
    modal.appendChild(dialog);
    document.body.appendChild(modal);
    // end modal
});

hostStopBtn?.addEventListener('click', async () => {
    if (hostStatus) hostStatus.textContent = 'Stopping...';
    try {
        await window.ollama.stopServer();
        clearRestartRequired();
        setHostingUIRunning(false);
    } catch (e: any) {
        if (hostStatus) hostStatus.textContent = `Error: ${e?.message || e}`;
    }
});

setHostingUIRunning(false);