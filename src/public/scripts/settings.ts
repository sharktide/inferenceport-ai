const usernameInput = document.getElementById('username') as HTMLInputElement;
const saveButton = document.getElementById('save') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLParagraphElement;

const syncCheckbox = document.getElementById('sync-chats') as HTMLInputElement | null;
const syncSection = document.querySelector('details:has(#sync-chats)') as HTMLDetailsElement | null;

// Initialize sync checkbox from localStorage (default: off)
// Only enable if user is logged in
(async () => {
    try {
        const { session } = await window.auth.getSession?.() ?? { session: null };
        const isLoggedIn = !!session?.user;

        if (syncCheckbox) {
            if (!isLoggedIn) {
                syncCheckbox.disabled = true;
                syncCheckbox.checked = false;
                // Turn off sync if it was previously enabled
                localStorage.setItem('sync_enabled', 'false');

                // Show helpful message
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
    const deleteStatus = document.getElementById("delete-password-status") as HTMLParagraphElement;
    deleteStatus.textContent = "Deleting account...";

    try {
        const { session } = await window.auth.getSession();
        if (!session?.user) {
            deleteStatus.textContent = "Not logged in.";
            return;
        }

        if (session.user.app_metadata?.provider === "email") {
            const passwordInput = document.getElementById("password") as HTMLInputElement;
            const password = passwordInput.value;
            const { success, error } = await window.auth.verifyPassword(password);
            if (!success) {
                deleteStatus.textContent = `Error: ${error || 'Verification failed'}`;
                return;
            }
        }

        const result = await window.auth.deleteAccount();
        if (!result.success) {
            deleteStatus.textContent = `Error: ${result.error || 'Deletion failed'}`;
            return;
        }

        deleteStatus.textContent = "Account deleted successfully.";
        setTimeout(() => {
            window.auth.signOut().finally(() => {
                window.location.href = "index.html";
            });
        }, 1000);
    } catch (e: any) {
        deleteStatus.textContent = `Error: ${e.message || e}`;
    }
});

(document.getElementById("del-ps") as HTMLButtonElement).addEventListener('click', showDelModal)
async function showDelModal(): Promise<void> {
    const deleteStatus = document.getElementById("delete-password-status") as HTMLParagraphElement;
    (document.getElementById('delete-dialog') as HTMLDivElement).style.display = 'none';
    try {
        const { session } = await window.auth.getSession();
        if (!session?.user) {
            deleteStatus.textContent = "Not logged in.";
            return;
        }

        if (session.user.app_metadata?.provider === "email") {
            (document.getElementById('delete-password-dialog') as HTMLDivElement).style.display = 'flex'
            return
        } else {
            const result = await window.auth.deleteAccount();
            if (!result.success) {
                deleteStatus.textContent = `Error: ${result.error || 'Deletion failed'}`;
                return;
            }

            deleteStatus.textContent = "Account deleted successfully.";
            setTimeout(() => {
                window.auth.signOut().finally(() => {
                    window.location.href = "index.html";
                });
            }, 1000);
        }
    } catch (e: any) {
        deleteStatus.textContent = `Error: ${e.message || e}`;
        return
    }
}
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
    const manage = document.getElementById('manage-orgs') as HTMLButtonElement | null;
    if (manage) {
        manage.addEventListener('click', () => { window.location.href = 'organizations.html'; });
    }
});