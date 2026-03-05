/*
Copyright 2025 Rihaan Meher

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

class AuthManager {
    private static instance: AuthManager | null = null;

    constructor() {
        if (AuthManager.instance) {
            throw new Error("AuthManager instance already exists. Use the existing one.");
        }
        AuthManager.instance = this;

        try {
            window.auth.onAuthStateChange(() => this.renderUserIndicator());
            this.renderUserIndicator();
        } catch (e) {
            console.warn("AuthManager init error", e);
        }
    }

    public resolveAuth(redirect: boolean = false): string {
        const path = window.location.pathname;
        const normalized = path.replace(/\\/g, "/");

        let target = "auth.html";

        if (normalized.includes("/marketplace/") || normalized.includes("/renderer/")) {
            target = "../auth.html";
        }

        if (redirect) {
            window.location.href = target;
        }

        return target;
    }

    public resolveSettings(redirect: boolean = false): string {
        const path = window.location.pathname;
        const normalized = path.replace(/\\/g, "/");

        let target = "settings.html";

        if (normalized.includes("/marketplace/") || normalized.includes("/renderer/")) {
            target = "../settings.html";
        }

        if (redirect) {
            window.location.href = target;
            return target;
        }
        return target;
    }

    private async renderUserIndicator() {
        try {
            const usernameSpan = document.getElementById("navbar-username");
            const planSpan = document.getElementById("navbar-plan");
            const upgradeBtn = document.getElementById("navbar-upgrade-btn");
            const signinBtn = document.getElementById("navbar-signin-btn");
            const nav = document.querySelector("nav");
            if (!nav || !usernameSpan || !planSpan || !upgradeBtn || !signinBtn) return;

            const res = await window.auth.getSession();
            const session = (res as any)?.session;
            const profile = (res as any)?.profile;
            const plan = (res as any)?.subscription?.planName || "Free Tier";

            if (session?.isAuthenticated && session.user) {
                usernameSpan.textContent = profile?.username || "Account";
                planSpan.textContent = plan;
                upgradeBtn.style.display = plan === "Free Tier" ? "inline-block" : "none";
                upgradeBtn.onclick = () => {
                    if (window.ic && window.ic.iModal) {
                        const modal = new window.ic.iModal("upgrade-modal", 700, undefined, false, false);
                        modal.open({
                            html: `<h2>Upgrade Your Plan</h2><p>Current plan: ${plan}</p><p>Enjoy more features and higher limits by upgrading!</p><ul><li>Higher daily limits</li><li>Priority support</li><li>Access to premium models</li></ul><button onclick='window.location.href="settings.html#upgrade"'>See all plans</button>`
                        });
                        return;
                    }
                    window.location.href = "settings.html#upgrade";
                };
                signinBtn.textContent = "Sign Out";
                signinBtn.style.display = "inline-block";
                signinBtn.onclick = () => {
                    window.auth.signOut();
            };

            } else {
                usernameSpan.textContent = "Guest";
                planSpan.textContent = "Free Tier";
                upgradeBtn.style.display = "inline-block";
                upgradeBtn.onclick = () => {
                    window.location.href = "auth.html";
                };
                signinBtn.style.display = "inline-block";
                signinBtn.onclick = () => {
                    window.location.href = "auth.html";
                };
            }
        } catch (e) {
            console.warn("renderUserIndicator error", e);
        }
    }

    public static getInstance(): AuthManager {
        if (!AuthManager.instance) {
            new AuthManager();
        }
        return AuthManager.instance!;
    }
}

export default AuthManager;
