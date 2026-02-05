const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('login');
const signupButton = document.getElementById('signup');
const statusText = document.getElementById('status');
window.mode = 0;
loginButton.addEventListener('click', async () => {
    if (window.mode === 0) {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        if (!email || !password)
            return updateStatus('Missing credentials');
        const result = await window.auth.signInWithEmail(email, password);
        if (result.error)
            return updateStatus(`Login failed: ${result.error}`);
        const session = result.session;
        const userId = session?.user?.id;
        if (!userId)
            return updateStatus('No user ID found.');
        //@ts-ignore
        const { profile } = await window.auth.getSession();
        if (!profile?.username) {
            window.location.href = "welcome.html";
        }
        else {
            window.location.href = "index.html";
        }
    }
    else if (window.mode === 1) {
        window.location.reload();
    }
});
const githubButton = document.getElementById("github-login");
const googleButton = document.getElementById("google-login");
githubButton?.addEventListener("click", async () => {
    updateStatus("Opening GitHub sign-in…");
    await window.auth.signInWithGitHub();
});
googleButton?.addEventListener("click", async () => {
    updateStatus("Opening Google sign-in…");
    await window.auth.signInWithGoogle();
});
function showSignInSuccessModal() {
    const modal = document.getElementById("signin-success-modal");
    const returnBtn = document.getElementById("return-home-btn");
    modal.style.display = "flex";
    returnBtn.onclick = () => {
        modal.style.display = "none";
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
    if (window.mode === 0) {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        if (!email || !password)
            return updateStatus('Missing credentials (email + password required)');
        const result = await window.auth.signUpWithEmail(email, password);
        if (result.error)
            return updateStatus(`Signup failed: ${result.error}`);
        updateStatus(`Account created for ${email}. Please check your email to confirm before logging in.`);
    }
    else if (window.mode === 1) {
        const email = emailInput.value.trim();
        if (!email)
            return updateStatus("Please enter your email to reset password.");
        const result = await window.auth.resetPassword(email);
        if (result.error)
            return updateStatus(`Reset failed: ${result.error}`);
        updateStatus(`Password reset email sent to ${email}. Check your inbox.`);
    }
});
function updateStatus(message) {
    statusText.textContent = message;
}
document.getElementById("forgot-password")?.addEventListener("click", forgotPassword);
function forgotPassword() {
    passwordInput.value = "";
    passwordInput.style.display = "none";
    emailInput.value = "";
    document.getElementById('social-buttons').style.display = "none";
    document.getElementById('rst').style.display = "block";
    loginButton.innerText = "Cancel";
    signupButton.innerText = "Contine";
    window.mode = 1;
}
export {};
//# sourceMappingURL=authrender.js.map