import "./staticload/theme.js"
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
                    msg.style.color = '#f5a623';
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
})