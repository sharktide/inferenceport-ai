const emailInput = document.getElementById('email') as HTMLInputElement;
const passwordInput = document.getElementById('password') as HTMLInputElement;
const loginButton = document.getElementById('login') as HTMLButtonElement;
const signupButton = document.getElementById('signup') as HTMLButtonElement;
const statusText = document.getElementById('status') as HTMLParagraphElement;
(window as any).mode = 0;

type AuthSessionResult = {
    session: any;
    profile: { username: string } | null;
    error?: string;
};

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
            window.location.href = "index.html";
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
    modal.classList.remove("hidden")

    returnBtn.onclick = () => {
        modal.classList.remove("hidden");
        window.location.href = "index.html";
    };
}

window.auth.onAuthStateChange((session) => {
    if (session?.user) {
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
