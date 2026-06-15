const signinCard = document.getElementById('signin-card') as HTMLDivElement;
const signupCard = document.getElementById('signup-card') as HTMLDivElement;

const siEmail = document.getElementById('si-email') as HTMLInputElement;
const siPassword = document.getElementById('si-password') as HTMLInputElement;
const siPasswordGroup = document.getElementById('si-password-group') as HTMLDivElement;
const signinBtn = document.getElementById('signin-btn') as HTMLButtonElement;
const siStatus = document.getElementById('si-status') as HTMLParagraphElement;
const rstHeading = document.getElementById('rst') as HTMLHeadingElement;
const forgotLink = document.getElementById('forgot-password') as HTMLElement;
const backToSignin = document.getElementById('back-to-signin') as HTMLElement;
const showSignupLink = document.getElementById('show-signup') as HTMLAnchorElement;

const suEmail = document.getElementById('su-email') as HTMLInputElement;
const suPassword = document.getElementById('su-password') as HTMLInputElement;
const signupBtn = document.getElementById('signup-btn') as HTMLButtonElement;
const suStatus = document.getElementById('su-status') as HTMLParagraphElement;
const showSigninLink = document.getElementById('show-signin') as HTMLAnchorElement;

let isResetMode = false;

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
            siStatus,
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
                        siStatus,
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
                        siStatus,
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
}

syncUpgradeIntentFromQuery();

async function postAuthCheck() {
    try {
        //@ts-ignore
        const sessionResult = await window.auth.getSession();
        if (!sessionResult?.profile?.username) {
            window.location.href = "welcome.html";
            return;
        }
    } catch (_e) {
        // profile fetch failed, fall through to default redirect
    }
    window.location.href = "index.html";
}

async function completeOAuthRedirectIfPresent() {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(window.location.search);

    const accessToken =
        hashParams.get("access_token") || queryParams.get("access_token");
    const refreshToken =
        hashParams.get("refresh_token") || queryParams.get("refresh_token");

    if (!accessToken || !refreshToken) return;

    updateStatus("Completing sign-in...", siStatus);
    const result = await window.auth.setSessionFromTokens(accessToken, refreshToken);
    if ((result as any)?.error) {
        updateStatus(`OAuth sign-in failed: ${(result as any).error}`, siStatus);
        return;
    }

    const cleanUrl = `${window.location.pathname}`;
    window.history.replaceState({}, document.title, cleanUrl);
    postAuthCheck();
}

void completeOAuthRedirectIfPresent();

function showCard(card: 'signin' | 'signup') {
    signinCard.style.display = card === 'signin' ? '' : 'none';
    signupCard.style.display = card === 'signup' ? '' : 'none';
    if (card === 'signin') {
        isResetMode = false;
        enterSignInMode();
    }
}

function enterSignInMode() {
    rstHeading.style.display = 'none';
    siPasswordGroup.style.display = 'block';
    forgotLink.style.display = 'block';
    backToSignin.style.display = 'none';
    signinBtn.textContent = 'Sign In';
    updateStatus('', siStatus);
}

function enterResetMode() {
    rstHeading.style.display = 'block';
    siPasswordGroup.style.display = 'none';
    forgotLink.style.display = 'none';
    backToSignin.style.display = 'block';
    signinBtn.textContent = 'Send Reset Link';
    updateStatus('', siStatus);
}

forgotLink.addEventListener('click', () => {
    isResetMode = true;
    enterResetMode();
});

backToSignin.addEventListener('click', (e) => {
    e.preventDefault();
    isResetMode = false;
    enterSignInMode();
});

showSignupLink.addEventListener('click', (e) => {
    e.preventDefault();
    showCard('signup');
});

showSigninLink.addEventListener('click', (e) => {
    e.preventDefault();
    showCard('signin');
});

signinBtn.addEventListener('click', async () => {
    if (isResetMode) {
        const email = siEmail.value.trim();
        if (!email) return updateStatus("Please enter your email to reset password.", siStatus);

        const result = await window.auth.resetPassword(email);
        if (result.error) return updateStatus(`Reset failed: ${result.error}`, siStatus);

        updateStatus(`Password reset email sent to ${email}. Check your inbox.`, siStatus);
        return;
    }

    const email = siEmail.value.trim();
    const password = siPassword.value.trim();
    if (!email || !password) return updateStatus('Missing credentials', siStatus);

    const result = await window.auth.signInWithEmail(email, password);
    if (result.error) return updateStatus(`Login failed: ${result.error}`, siStatus);

    const session = result.session;
    const userId = session?.user?.id;
    if (!userId) return updateStatus('No user ID found.', siStatus);
    postAuthCheck();
});

signupBtn.addEventListener('click', async () => {
    const email = suEmail.value.trim();
    const password = suPassword.value.trim();
    if (!email || !password)
        return updateStatus('Missing credentials (email + password required)', suStatus);

    const result = await window.auth.signUpWithEmail(email, password);
    if (result.error) return updateStatus(`Signup failed: ${result.error}`, suStatus);

    updateStatus(`Account created for ${email}. Please check your email to confirm before logging in.`, suStatus);
    promptUpgradePreferenceAfterSignup();
});

function setupSocialLogin(btnId: string, providerName: string, providerFn: () => Promise<any>, statusEl: HTMLParagraphElement) {
    const btn = document.getElementById(btnId) as HTMLButtonElement;
    btn?.addEventListener("click", async () => {
        updateStatus("Opening " + providerName + " sign-in...", statusEl);
        await providerFn();
    });
}

setupSocialLogin("github-login", "GitHub", () => window.auth.signInWithGitHub(), siStatus);
setupSocialLogin("google-login", "Google", () => window.auth.signInWithGoogle(), siStatus);
setupSocialLogin("microsoft-login", "Microsoft", () => window.auth.signInWithMicrosoft(), siStatus);
setupSocialLogin("huggingface-login", "Hugging Face", () => window.auth.signInWithHuggingFace(), siStatus);

setupSocialLogin("su-github-login", "GitHub", () => window.auth.signInWithGitHub(), suStatus);
setupSocialLogin("su-google-login", "Google", () => window.auth.signInWithGoogle(), suStatus);
setupSocialLogin("su-microsoft-login", "Microsoft", () => window.auth.signInWithMicrosoft(), suStatus);
setupSocialLogin("su-huggingface-login", "Hugging Face", () => window.auth.signInWithHuggingFace(), suStatus);

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
    const modal = document.getElementById("signin-success-modal");
    if (!session?.isAuthenticated) {
        if (modal && !modal.classList.contains("hidden")) {
            modal.classList.add("hidden");
        }
        return;
    }
    if (window.location.pathname.includes("auth")) {
        postAuthCheck();
    }
});

function updateStatus(message: string, el: HTMLParagraphElement) {
    el.textContent = message;
}

document.querySelectorAll('.password-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
        const wrapper = (btn as HTMLButtonElement).closest('.password-wrapper')!;
        const input = wrapper.querySelector('input') as HTMLInputElement;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        const eyeIcon = wrapper.querySelector('.eye-icon') as HTMLElement;
        const eyeOffIcon = wrapper.querySelector('.eye-off-icon') as HTMLElement;
        if (eyeIcon) eyeIcon.style.display = isPassword ? 'none' : '';
        if (eyeOffIcon) eyeOffIcon.style.display = isPassword ? '' : 'none';
    });
});

if (initialQueryParams.get("mode") === "signup") {
    showCard('signup');
    updateStatus("Create an account, then verify your email and sign in.", suStatus);
}
