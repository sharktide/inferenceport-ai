export async function isLoggedIn(): Promise<boolean> {
  try {
    const result = await window.auth.getSession();

    const loggedIn = !!result.session?.access_token;

    if (!loggedIn) {
      window.location.href = "auth.html";
    }

    return loggedIn;
  } catch (err) {
    console.error("Error checking login:", err);
    window.location.href = "auth.html";
    return false;
  }
}