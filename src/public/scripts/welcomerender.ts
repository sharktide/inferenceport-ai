const usernameInput = document.getElementById('welcome-username') as HTMLInputElement;
const continueBtn = document.getElementById('welcome-continue') as HTMLButtonElement;
const statusText = document.getElementById('welcome-status') as HTMLParagraphElement;
const subtitle = document.querySelector('.auth-subtitle') as HTMLParagraphElement;

function updateStatus(message: string) {
    statusText.textContent = message;
}

async function waitForSession(retries = 20, interval = 200): Promise<AuthSessionView | null> {
    for (let i = 0; i < retries; i++) {
        try {
            const result = await window.auth.getSession();
            if (result.session?.isAuthenticated) {
                return result.session;
            }
        } catch (_e) {
            // IPC not ready yet
        }
        await new Promise(r => setTimeout(r, interval));
    }
    return null;
}

async function init(): Promise<void> {
    const session = await waitForSession();
    if (!session) {
        window.location.href = 'auth.html';
        return;
    }
}

void init();

continueBtn.addEventListener('click', async (): Promise<void> => {
    const session = await waitForSession(3, 100);
    if (!session?.user?.id) {
        updateStatus('Session expired. Please sign in again.');
        setTimeout(() => { window.location.href = 'auth.html'; }, 1500);
        return;
    }

    const username = usernameInput.value.trim();
    if (!username) {
        updateStatus('Please enter a username.');
        return;
    }

    if (username.length < 3 || username.length > 30) {
        updateStatus('Username must be 3-30 characters.');
        return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        updateStatus('Username can only contain letters, numbers, underscores, and hyphens.');
        return;
    }

    updateStatus('Saving...');

    const result = await window.auth.setUsername(session.user.id, username);
    if (result.error) {
        updateStatus(`Error: ${result.error}`);
        return;
    }

    window.location.href = 'index.html';
});

usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        continueBtn.click();
    }
});
