const emailInput = document.getElementById('email') as HTMLInputElement;
const passwordInput = document.getElementById('password') as HTMLInputElement;
const loginButton = document.getElementById('login') as HTMLButtonElement;
const signupButton = document.getElementById('signup') as HTMLButtonElement;
const statusText = document.getElementById('status') as HTMLParagraphElement;
(window as any).mode = 0;
const UPGRADE_INTENT_STORAGE_KEY = "inferenceport:upgrade-intent-target";
const DEFAULT_UPGRADE_TARGET = "settings.html#upgrade";
const initialQueryParams = new URLSearchParams(window.location.search);
let upgradeChoiceModal: declarations["iInstance"]["iModal"] | null = null;

type AuthSessionResult = {
    session: AuthSessionView;
    profile: AuthProfileView;
    error?: string;
};

function getUpgradeIntentTarget(): string | null {
    try {
        const target = localStorage.getItem(UPGRADE_INTENT_STORAGE_KEY);
        return target && target.trim() ? target : null;
    } catch (_e) {
        return null;
    }
}

function setUpgradeIntentTarget(target: string): void {
    try {
        localStorage.setItem(UPGRADE_INTENT_STORAGE_KEY, target || DEFAULT_UPGRADE_TARGET);
    } catch (_e) {
        void 0;
    }
}

function clearUpgradeIntentTarget(): void {
    try {
        localStorage.removeItem(UPGRADE_INTENT_STORAGE_KEY);
    } catch (_e) {
        void 0;
    }
}

function getUpgradeModal(): declarations["iInstance"]["iModal"] | null {
    if (!(window.ic && window.ic.iModal)) return null;
    if (!upgradeChoiceModal) {
        upgradeChoiceModal = new window.ic.iModal(
            "auth-upgrade-modal",
            520,
            undefined,
            false,
            false,
        );
    }
    return upgradeChoiceModal;
}

function promptUpgradeAfterAuth(defaultTarget: string) {
    const upgradeTarget = getUpgradeIntentTarget();
    if (!upgradeTarget) {
        window.location.href = defaultTarget;
        return;
    }

    const modal = getUpgradeModal();
    if (!modal) {
        clearUpgradeIntentTarget();
        window.location.href = upgradeTarget;
        return;
    }

    modal.open({
        html: `
            <h3>Upgrade your plan now?</h3>
            <p style="opacity:.85;margin:8px 0 10px;">
                You are signed in. Do you want to review paid plans now?
            </p>
        `,
        actions: [
            {
                id: "auth-upgrade-now",
                label: "Yes, show plans",
                onClick: () => {
                    clearUpgradeIntentTarget();
                    modal.close();
                    window.location.href = upgradeTarget;
                },
            },
            {
                id: "auth-upgrade-later",
                label: "Not now",
                onClick: () => {
                    clearUpgradeIntentTarget();
                    modal.close();
                    window.location.href = defaultTarget;
                },
            },
        ],
    });
}

function promptUpgradePreferenceAfterSignup() {
    if (!getUpgradeIntentTarget()) return;
    const modal = getUpgradeModal();
    if (!modal) {
        updateStatus(
            "After you verify your email and sign in, you can upgrade from Settings > Upgrade Plan.",
        );
        return;
    }

    modal.open({
        html: `
            <h3>Would you like to upgrade after signup?</h3>
            <p style="opacity:.85;margin:8px 0 10px;">
                Once you verify your email and sign in, do you want to review upgrade plans?
            </p>
        `,
        actions: [
            {
                id: "auth-signup-upgrade-yes",
                label: "Yes, ask me",
                onClick: () => {
                    modal.close();
                    updateStatus(
                        "Great. Verify your email, sign in, and we will ask if you want to upgrade.",
                    );
                },
            },
            {
                id: "auth-signup-upgrade-no",
                label: "No thanks",
                onClick: () => {
                    clearUpgradeIntentTarget();
                    modal.close();
                    updateStatus(
                        "Account created. You can upgrade anytime from Settings.",
                    );
                },
            },
        ],
    });
}

function syncUpgradeIntentFromQuery() {
    if (initialQueryParams.get("upgrade") !== "1") return;
    const nextTarget = initialQueryParams.get("next") || DEFAULT_UPGRADE_TARGET;
    setUpgradeIntentTarget(nextTarget);
    if (initialQueryParams.get("mode") === "signup") {
        updateStatus("Create an account to continue with upgrading.");
    } else {
        updateStatus("Sign in to continue with upgrading.");
    }
}

syncUpgradeIntentFromQuery();

async function completeOAuthRedirectIfPresent() {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(window.location.search);

    const accessToken =
        hashParams.get("access_token") || queryParams.get("access_token");
    const refreshToken =
        hashParams.get("refresh_token") || queryParams.get("refresh_token");

    if (!accessToken || !refreshToken) return;

    updateStatus("Completing sign-in...");
    const result = await window.auth.setSessionFromTokens(accessToken, refreshToken);
    if ((result as any)?.error) {
        updateStatus(`OAuth sign-in failed: ${(result as any).error}`);
        return;
    }

    const cleanUrl = `${window.location.pathname}`;
    window.history.replaceState({}, document.title, cleanUrl);
    showSignInSuccessModal();
}

void completeOAuthRedirectIfPresent();

loginButton.addEventListener('click', async () => {
    if ((window as any).mode === 0) {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        if (!email || !password) return updateStatus('Missing credentials');

        const result = await window.auth.signInWithEmail(email, password);
        if (result.error) return updateStatus(`Login failed: ${result.error}`);

        const session = result.session;
        const userId = session?.user?.id;
        if (!userId) return updateStatus('No user ID found.');
        //@ts-ignore
        const { profile }: AuthSessionResult = await window.auth.getSession();
        if (!profile?.username) {
            window.location.href = "welcome.html";
        } else {
            promptUpgradeAfterAuth("index.html");
        }
    }
    else if ((window as any).mode === 1) {
        window.location.reload()
    }
});

const githubButton = document.getElementById(
	"github-login"
) as HTMLButtonElement;
const googleButton = document.getElementById(
	"google-login"
) as HTMLButtonElement;

githubButton?.addEventListener("click", async () => {
	updateStatus("Opening GitHub sign-in…");
	await window.auth.signInWithGitHub();
});

googleButton?.addEventListener("click", async () => {
    updateStatus("Opening Google sign-in…");
    await window.auth.signInWithGoogle();
});

function showSignInSuccessModal() {
    const modal = document.getElementById("signin-success-modal")!;
    const returnBtn = document.getElementById("return-home-btn")!;
    modal.classList.remove("hidden");
    const hasUpgradeIntent = Boolean(getUpgradeIntentTarget());
    returnBtn.textContent = hasUpgradeIntent ? "Continue" : "Return Home";

    returnBtn.onclick = () => {
        modal.classList.add("hidden");
        if (hasUpgradeIntent) {
            promptUpgradeAfterAuth("index.html");
            return;
        }
        window.location.href = "index.html";
    };
}

window.auth.onAuthStateChange((session) => {
    if (session?.isAuthenticated) {
        if (window.location.pathname.includes("auth")) {
            showSignInSuccessModal();
        }
    }
});

signupButton.addEventListener('click', async () => {
    if ((window as any).mode === 0) {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        if (!email || !password)
            return updateStatus('Missing credentials (email + password required)');

        const result = await window.auth.signUpWithEmail(email, password);
        if (result.error) return updateStatus(`Signup failed: ${result.error}`);

        updateStatus(`Account created for ${email}. Please check your email to confirm before logging in.`);
        promptUpgradePreferenceAfterSignup();
    }
    else if ((window as any).mode === 1) {
        const email = emailInput.value.trim();
        if (!email) return updateStatus("Please enter your email to reset password.");

        const result = await window.auth.resetPassword(email);
        if (result.error) return updateStatus(`Reset failed: ${result.error}`);

        updateStatus(`Password reset email sent to ${email}. Check your inbox.`);
    }
});


function updateStatus(message: string) {
    statusText.textContent = message;
}

document.getElementById("forgot-password")?.addEventListener("click", forgotPassword)
function forgotPassword() {
    passwordInput.value = "";
    passwordInput.style.display = "none";
    emailInput.value = "";
    (document.getElementById('social-buttons') as HTMLDivElement).style.display = "none";
    (document.getElementById('rst') as HTMLTitleElement).style.display = "block";

    loginButton.innerText = "Cancel";
    signupButton.innerText = "Contine";
    (window as any).mode = 1
}

if (initialQueryParams.get("mode") === "signup") {
    updateStatus("Create an account, then verify your email and sign in.");
}
