export async function isLoggedIn(root = 0) {
    try {
        const result = await window.auth.getSession();
        const loggedIn = !!result.session?.access_token;
        if (!loggedIn) {
            if (root === 0) {
                window.location.href = "auth.html";
            }
            else if (root === 1) {
                window.location.href = "../auth.html";
            }
        }
        return loggedIn;
    }
    catch (err) {
        console.error("Error checking login:", err);
        if (root === 0) {
            window.location.href = "auth.html";
        }
        else if (root === 1) {
            window.location.href = "../auth.html";
        }
        return false;
    }
}
//# sourceMappingURL=auth-checker.js.map