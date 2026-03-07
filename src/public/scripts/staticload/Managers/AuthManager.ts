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

import {
    BILLING_PORTAL_URL,
    buildUpgradePlanCards,
    escapeSubscriptionHtml,
    installExternalUrlHandler,
    normalizeUpgradePlanKey,
} from "../../helper/subscriptionUpgradeUi.js";

class AuthManager {
    private static instance: AuthManager | null = null;
    private static readonly PLAN_ORDER = ["free", "light", "pro", "creator", "professional"] as const;
    private static readonly PLAN_DISPLAY_NAMES = {
        free: "Free Tier",
        light: "Light",
        pro: "Pro",
        creator: "Creator",
        professional: "Professional",
    } as const;
    private static readonly UPGRADE_INTENT_STORAGE_KEY = "inferenceport:upgrade-intent-target";
    private static readonly DEFAULT_UPGRADE_TARGET = "settings.html#upgrade";

    constructor() {
        if (AuthManager.instance) {
            throw new Error("AuthManager instance already exists. Use the existing one.");
        }
        AuthManager.instance = this;

        try {
            installExternalUrlHandler();
            window.auth.onAuthStateChange(() => this.renderUserIndicator());
            this.renderUserIndicator();
        } catch (e) {
            console.warn("AuthManager init error", e);
        }
    }

    private normalizePlanKey(planName: string): keyof typeof AuthManager.PLAN_DISPLAY_NAMES {
        return normalizeUpgradePlanKey(planName);
    }

    private escapeHtml(value: string): string {
        return escapeSubscriptionHtml(value);
    }

    private resolveRoute(defaultTarget: string, customTarget?: string): string {
        const path = window.location.pathname;
        const normalized = path.replace(/\\/g, "/");
        let target = customTarget?.trim() ? customTarget : defaultTarget;
        if (
            (normalized.includes("/marketplace/") || normalized.includes("/renderer/")) &&
            !target.startsWith("../") &&
            !/^[a-z]+:\/\//i.test(target)
        ) {
            target = `../${target}`;
        }
        return target;
    }

    private openBillingPortal() {
        void window.utils.web_open(BILLING_PORTAL_URL);
    }

    private getRecommendedUpgradePlan(
        currentPlanKey: keyof typeof AuthManager.PLAN_DISPLAY_NAMES,
    ): keyof typeof AuthManager.PLAN_DISPLAY_NAMES | null {
        const currentIndex = AuthManager.PLAN_ORDER.indexOf(currentPlanKey);
        return AuthManager.PLAN_ORDER[currentIndex + 1] ?? null;
    }

    private rememberUpgradeIntent(target: string) {
        try {
            localStorage.setItem(
                AuthManager.UPGRADE_INTENT_STORAGE_KEY,
                target || AuthManager.DEFAULT_UPGRADE_TARGET,
            );
        } catch (_e) {
            void 0;
        }
    }

    private buildUpgradeAuthTarget(mode: "signin" | "signup", nextTarget: string): string {
        const params = new URLSearchParams();
        params.set("upgrade", "1");
        params.set("mode", mode);
        params.set("next", nextTarget || AuthManager.DEFAULT_UPGRADE_TARGET);
        return `auth.html?${params.toString()}`;
    }

    public resolveAuth(redirect: boolean = false, customTarget?: string): string {
        const target = this.resolveRoute("auth.html", customTarget);
        if (redirect) {
            window.location.href = target;
        }

        return target;
    }

    public resolveSettings(redirect: boolean = false): string {
        const target = this.resolveRoute("settings.html");

        if (redirect) {
            window.location.href = target;
            return target;
        }
        return target;
    }

    private openAccountRequiredModal(nextTarget: string) {
        if (!(window.ic && window.ic.iModal)) {
            this.rememberUpgradeIntent(nextTarget);
            this.resolveAuth(true, this.buildUpgradeAuthTarget("signin", nextTarget));
            return;
        }

        const modal = new window.ic.iModal(
            "navbar-upgrade-account-modal",
            520,
            undefined,
            false,
            false,
        );
        modal.open({
            html: `
                <h3>Account required to upgrade</h3>
                <p style="opacity:.85;margin:8px 0 10px;">
                    You need to sign in or create an account before you can upgrade your plan.
                </p>
            `,
            actions: [
                {
                    id: "navbar-upgrade-signin",
                    label: "Sign In",
                    onClick: () => {
                        modal.close();
                        this.rememberUpgradeIntent(nextTarget);
                        this.resolveAuth(
                            true,
                            this.buildUpgradeAuthTarget("signin", nextTarget),
                        );
                    },
                },
                {
                    id: "navbar-upgrade-signup",
                    label: "Create Account",
                    onClick: () => {
                        modal.close();
                        this.rememberUpgradeIntent(nextTarget);
                        this.resolveAuth(
                            true,
                            this.buildUpgradeAuthTarget("signup", nextTarget),
                        );
                    },
                },
                {
                    id: "navbar-upgrade-cancel",
                    label: "Close",
                    onClick: () => modal.close(),
                },
            ],
        });
    }

    private openUpgradeModal(
        currentPlanName: string,
        currentPlanKey: keyof typeof AuthManager.PLAN_DISPLAY_NAMES,
        tiers: AuthSubscriptionTier[],
        settingsTarget: string,
    ) {
        if (!(window.ic && window.ic.iModal)) {
            this.resolveSettings(true);
            return;
        }

        const upgradeModal = new window.ic.iModal(
            "navbar-upgrade-modal",
            700,
            undefined,
            false,
            false,
        );
        const plansToShow =
            tiers.length > 0
                ? tiers
                : AuthManager.PLAN_ORDER
                    .filter((plan) => plan !== "free")
                    .map((plan) => ({
                        name: AuthManager.PLAN_DISPLAY_NAMES[plan],
                        url: "",
                        price: "",
                    }));

        const recommendedPlan = this.getRecommendedUpgradePlan(currentPlanKey);
        const cards = buildUpgradePlanCards(plansToShow, {
            currentPlanKey,
            recommendedPlanKey: recommendedPlan,
            allowDirectCheckout: currentPlanKey === "free",
        });

        upgradeModal.open({
            html: `
                <h3>Upgrade Your Plan</h3>
                <div class="subscription-upgrade-layout">
                    <p class="subscription-current-plan">
                        Current plan: <strong>${this.escapeHtml(currentPlanName)}</strong>.
                    </p>
                    <p class="subscription-upgrade-copy">
                        ${currentPlanKey === "free"
                            ? "Choose a paid plan to unlock more cloud usage and premium subscription benefits."
                            : "Review the available plan benefits below, then use the Billing Portal to change your active Stripe subscription."}
                    </p>
                    <div class="subscription-plan-grid">
                        ${cards}
                    </div>
                </div>
            `,
            actions: [
                ...(currentPlanKey === "free"
                    ? []
                    : [
                        {
                            id: "navbar-upgrade-open-portal",
                            label: "Open Billing Portal",
                            onClick: () => this.openBillingPortal(),
                        },
                    ]),
                {
                    id: "navbar-upgrade-open-settings",
                    label: "Open Settings",
                    onClick: () => {
                        upgradeModal.close();
                        window.location.href = settingsTarget;
                    },
                },
                {
                    id: "navbar-upgrade-close",
                    label: "Close",
                    onClick: () => upgradeModal.close(),
                },
            ],
        });
    }

    private async renderUserIndicator() {
        try {
            const usernameSpan = document.getElementById("navbar-username");
            const planSpan = document.getElementById("navbar-plan");
            const upgradeBtn = document.getElementById("navbar-upgrade-btn");
            const signinBtn = document.getElementById("navbar-signin-btn");
            const nav = document.querySelector("nav");
            if (!nav || !usernameSpan || !planSpan || !upgradeBtn || !signinBtn) return;

            const [res, subscription] = await Promise.all([
                window.auth.getSession(),
                window.auth.getSubscriptionInfo().catch(() => null),
            ]);
            const session = res?.session;
            const profile = res?.profile;
            const isAuthenticated = Boolean(session?.isAuthenticated && session?.user);
            const planKey = isAuthenticated
                ? this.normalizePlanKey(
                    subscription?.planKey || subscription?.planName || AuthManager.PLAN_DISPLAY_NAMES.free,
                )
                : "free";
            const plan = AuthManager.PLAN_DISPLAY_NAMES[planKey];
            const tiers = Array.isArray(subscription?.tiers) ? subscription.tiers : [];
            const settingsUpgradeTarget = `${this.resolveSettings(false)}#upgrade`;

            if (isAuthenticated) {
                usernameSpan.textContent = profile?.username || "Account";
                planSpan.textContent = plan;
                planSpan.setAttribute("title", plan);
                planSpan.dataset.planKey = planKey;
                upgradeBtn.style.display = "inline-block";
                upgradeBtn.textContent = planKey === "free" ? "Upgrade" : "Manage Plan";
                upgradeBtn.onclick = () => {
                    this.openUpgradeModal(plan, planKey, tiers, settingsUpgradeTarget);
                };
                signinBtn.textContent = "Sign Out";
                signinBtn.style.display = "inline-block";
                signinBtn.onclick = () => {
                    window.auth.signOut();
                    this.resolveAuth(true);
                };
            } else {
                usernameSpan.textContent = "Guest";
                planSpan.textContent = AuthManager.PLAN_DISPLAY_NAMES.free;
                planSpan.setAttribute("title", AuthManager.PLAN_DISPLAY_NAMES.free);
                planSpan.dataset.planKey = "free";
                upgradeBtn.style.display = "inline-block";
                upgradeBtn.textContent = "Upgrade";
                upgradeBtn.onclick = () => {
                    this.openAccountRequiredModal(settingsUpgradeTarget);
                };
                signinBtn.textContent = "Sign In";
                signinBtn.style.display = "inline-block";
                signinBtn.onclick = () => {
                    this.resolveAuth(true);
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
