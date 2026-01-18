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
            const nav = document.querySelector("nav");
            if (!nav) return;

            const container = document.createElement("div");
            container.id = "user-indicator";
            container.style.marginLeft = "auto";
            container.style.marginRight = "18px";
            container.style.display = "flex";
            container.style.alignItems = "center";
            container.style.gap = "8px";

            const res = await window.auth.getSession();
            const session = (res as any)?.session;
            const profile = (res as any)?.profile;

            if (session && session.user) {
                const name = profile?.username || session.user?.email || "Account";
                const link = document.createElement("a");
                link.href = this.resolveSettings();
                link.textContent = String(name);
                link.style.textDecoration = "none";
                link.style.color = "inherit";
                link.id = "account-link";

                const signOutBtn = document.createElement("button");
                signOutBtn.textContent = "Sign out";
                signOutBtn.addEventListener("click", async (e) => {
                    e.preventDefault();
                    localStorage.setItem("sync_enabled", "false");
                    await window.auth.signOut();
                    window.location.href = this.resolveAuth();
                });

                container.appendChild(link);
                container.appendChild(signOutBtn);
            } else {
                const signIn = document.createElement("a");
                signIn.href = this.resolveAuth();
                signIn.textContent = "Sign in";
                signIn.style.textDecoration = "none";
                signIn.style.color = "inherit";
                container.appendChild(signIn);
            }
            nav.querySelectorAll("#user-indicator").forEach(el => el.remove());
            nav.appendChild(container);
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
