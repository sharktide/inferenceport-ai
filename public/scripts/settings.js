import "./staticload/theme.js";
const usernameInput = document.getElementById('username');
const saveButton = document.getElementById('save');
const status = document.getElementById('status');
saveButton.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    if (!username)
        return status.textContent = "Please enter a username.";
    const { session } = await window.auth.getSession();
    const userId = session?.user?.id;
    if (!userId)
        return status.textContent = "Not logged in.";
    const result = await window.auth.setUsername(userId, username);
    if (result.error)
        return status.textContent = `Error: ${result.error}`;
    status.textContent = "Saving...";
    setTimeout(() => {
        document.getElementById("rename-dialog").style.display = "none";
        window.location.reload();
    }, 1000);
});
document.getElementById("rename-cancel").addEventListener('click', function () {
    document.getElementById("rename-dialog").style.display = "none";
});
//# sourceMappingURL=settings.js.map