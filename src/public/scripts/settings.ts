import { showNotification } from "./helper/notification.js";
import {
	BILLING_PORTAL_URL,
	buildUpgradePlanCards,
	escapeSubscriptionHtml,
	getSubscriptionManagementCopy,
	getSubscriptionManagementSteps,
	installExternalUrlHandler,
	normalizeUpgradePlanKey,
} from "./helper/subscriptionUpgradeUi.js";

const chipContainer = document.getElementById("email-chips") as HTMLDivElement;
const emailInput = document.getElementById("email-input") as HTMLInputElement;
const hostEmailsInput = document.getElementById(
	"host-emails",
) as HTMLTextAreaElement;
const hostStartBtn = document.getElementById("host-start") as HTMLButtonElement;
const hostStopBtn = document.getElementById("host-stop") as HTMLButtonElement;
const hostStatus = document.getElementById(
	"host-status",
) as HTMLParagraphElement;
const serverLogsPanel = document.getElementById(
	"server-logs-panel",
) as HTMLDivElement;
const logsRefreshBtn = document.getElementById(
	"logs-refresh",
) as HTMLButtonElement;
const logsStartBtn = document.getElementById("logs-start") as HTMLButtonElement;
const logsStopBtn = document.getElementById("logs-stop") as HTMLButtonElement;
const logsOutput = document.getElementById("logs-output") as HTMLPreElement;

const RESTART_REQUIRED_KEY = "host_restart_required";

const EMAIL_STORAGE_KEY = "host_emails_v2";
const HOST_USERS_KEY = "host_users_v1";
const SEARCH_ENGINE_KEY = "search_engine";

const syncCheckbox = document.getElementById(
	"sync-chats",
) as HTMLInputElement | null;
const syncSection = document.getElementById("syncing") as HTMLDivElement | null;
const startupRunAtLoginCheckbox = document.getElementById(
	"startup-run-at-login",
) as HTMLInputElement | null;
const startupAutoProxyCheckbox = document.getElementById(
	"startup-auto-proxy",
) as HTMLInputElement | null;
const startupUiPortInput = document.getElementById(
	"startup-ui-port",
) as HTMLInputElement | null;
const startupUiPortSaveBtn = document.getElementById(
	"startup-ui-port-save",
) as HTMLButtonElement | null;
const startupUiPortStatus = document.getElementById(
	"startup-ui-port-status",
) as HTMLParagraphElement | null;
const startupStatus = document.getElementById(
	"startup-status",
) as HTMLParagraphElement | null;
const searchEngineSelect = document.getElementById(
	"search-engine-select",
) as HTMLSelectElement | null;
let emails: string[] = [];
const RESERVED_PORT_MIN = 52440;
const RESERVED_PORT_MAX = 52458;

let hostConfigModal: declarations["iInstance"]["iModal"];
let renameModal: declarations["iInstance"]["iModal"];
let deleteConfirmModal: declarations["iInstance"]["iModal"];
let deletePasswordModal: declarations["iInstance"]["iModal"];
let settingsUpgradeModal: declarations["iInstance"]["iModal"];
let settingsUpgradeAuthModal: declarations["iInstance"]["iModal"];

const settingsUpgradeBtn = document.getElementById(
	"settings-upgrade-btn",
) as HTMLButtonElement | null;
const settingsUpgradePlanInfo = document.getElementById(
	"upgrade-plan-info",
) as HTMLParagraphElement | null;
const settingsUpgradeLimitsEl = document.getElementById(
	"upgrade-plan-limits",
) as HTMLDivElement | null;
const settingsPortalBtn = document.getElementById(
	"settings-portal-btn",
) as HTMLButtonElement | null;
const subscriptionManagementCopyEl = document.getElementById(
	"subscription-management-copy",
) as HTMLParagraphElement | null;
const subscriptionManagementStepsEl = document.getElementById(
	"subscription-management-steps",
) as HTMLOListElement | null;
type PlanKey = "free" | "light" | "pro" | "creator" | "professional";
const PLAN_ORDER: PlanKey[] = [
	"free",
	"light",
	"pro",
	"creator",
	"professional",
];
const PLAN_DISPLAY_NAMES: Record<PlanKey, string> = {
	free: "Free Tier",
	light: "InferencePort AI Light",
	pro: "InferencePort AI Pro",
	creator: "InferencePort AI Creator",
	professional: "InferencePort AI Professional",
};
const EMPTY_PLAN_LIMITS: AuthTierLimits = {
	cloudChatDaily: null,
	imagesDaily: null,
	videosDaily: null,
	audioWeekly: null,
};
const PLAN_LIMITS: Record<PlanKey, AuthTierLimits> = {
	free: { ...EMPTY_PLAN_LIMITS },
	light: { ...EMPTY_PLAN_LIMITS },
	pro: { ...EMPTY_PLAN_LIMITS },
	creator: { ...EMPTY_PLAN_LIMITS },
	professional: { ...EMPTY_PLAN_LIMITS },
};
const LIMIT_COPY = {
	cloudChatDaily: "Cloud chat/day",
	imagesDaily: "Image generation/day",
	videosDaily: "Video generation/day",
	audioWeekly: "Audio generation/week",
} as const;
const UPGRADE_INTENT_STORAGE_KEY = "inferenceport:upgrade-intent-target";
const DEFAULT_UPGRADE_TARGET = "settings.html#upgrade";
let currentPlanKey: PlanKey = "free";
let currentPlanName: string = PLAN_DISPLAY_NAMES.free;
let subscriptionTiers: AuthSubscriptionTier[] = [];
let isUpgradeUserAuthenticated = false;
let currentTierConfig: AuthTierConfig | null = null;

function escapeHtml(value: string): string {
	return escapeSubscriptionHtml(value);
}

function isKnownPlanKey(value: string): value is PlanKey {
	return (
		value === "free" ||
		value === "light" ||
		value === "pro" ||
		value === "creator" ||
		value === "professional"
	);
}

function normalizePlanKey(planName: string): PlanKey {
	return normalizeUpgradePlanKey(planName) as PlanKey;
}

function applyTierConfig(tierConfig: AuthTierConfig | null | undefined): void {
	if (!tierConfig || !Array.isArray(tierConfig.plans)) return;
	currentTierConfig = tierConfig;
	const orderedKeys: PlanKey[] = [];
	tierConfig.plans
		.slice()
		.sort((a, b) => a.order - b.order)
		.forEach((plan) => {
			const key = (plan.key || "").toLowerCase();
			if (!isKnownPlanKey(key)) return;
			if (!orderedKeys.includes(key)) orderedKeys.push(key);
			if (typeof plan.name === "string" && plan.name.trim()) {
				PLAN_DISPLAY_NAMES[key] = plan.name.trim();
			}
			PLAN_LIMITS[key] = {
				cloudChatDaily:
					typeof plan.limits?.cloudChatDaily === "number"
						? plan.limits.cloudChatDaily
						: null,
				imagesDaily:
					typeof plan.limits?.imagesDaily === "number"
						? plan.limits.imagesDaily
						: null,
				videosDaily:
					typeof plan.limits?.videosDaily === "number"
						? plan.limits.videosDaily
						: null,
				audioWeekly:
					typeof plan.limits?.audioWeekly === "number"
						? plan.limits.audioWeekly
						: null,
			};
		});
	if (orderedKeys.length > 0) {
		const missing = (["free", "light", "pro", "creator", "professional"] as PlanKey[]).filter(
			(key) => !orderedKeys.includes(key),
		);
		PLAN_ORDER.splice(0, PLAN_ORDER.length, ...orderedKeys, ...missing);
	}
}

function getPaidTiersFromConfig(
	tierConfig: AuthTierConfig | null | undefined,
): AuthSubscriptionTier[] {
	if (!tierConfig || !Array.isArray(tierConfig.plans)) return [];
	const defaultKey = normalizePlanKey(tierConfig.defaultPlanKey || "free");
	return tierConfig.plans
		.filter((plan) => normalizePlanKey(plan.key) !== defaultKey)
		.map((plan) => ({
			key: plan.key,
			name: plan.name,
			url: plan.url,
			price: plan.price,
			limits: plan.limits,
		}));
}

function rememberUpgradeIntent(target: string = DEFAULT_UPGRADE_TARGET): void {
	try {
		localStorage.setItem(UPGRADE_INTENT_STORAGE_KEY, target);
	} catch (_e) {
		void 0;
	}
}

function formatLimitValue(value: number | null): string {
	return value === null ? "Unlimited" : String(value);
}

function getSortedTierCatalog(): AuthSubscriptionTier[] {
	const weight = new Map(PLAN_ORDER.map((plan, index) => [plan, index]));
	return [...subscriptionTiers].sort((a, b) => {
		const aWeight =
			weight.get(normalizePlanKey((a.key as string) || a.name)) ?? 999;
		const bWeight =
			weight.get(normalizePlanKey((b.key as string) || b.name)) ?? 999;
		return aWeight - bWeight;
	});
}

function getTierPrice(name: string): string | null {
	const match = subscriptionTiers.find(
		(tier) => normalizePlanKey((tier.key as string) || tier.name) === normalizePlanKey(name),
	);
	if (!match?.price) return null;
	return `$${match.price}/mo`;
}

function getRecommendedUpgradePlan(): PlanKey | null {
	const currentIndex = PLAN_ORDER.indexOf(currentPlanKey);
	for (let i = Math.max(currentIndex + 1, 0); i < PLAN_ORDER.length; i++) {
		const candidate = PLAN_ORDER[i];
		if (!candidate) continue;
		const candidateLimit = PLAN_LIMITS[candidate].cloudChatDaily;
		if (candidateLimit == null || typeof candidateLimit === "number") {
			return candidate;
		}
	}
	return null;
}

function openBillingPortal(): void {
	void window.utils.web_open(BILLING_PORTAL_URL);
}

function renderSettingsUpgradePanel() {
	if (settingsUpgradePlanInfo) {
		const price = getTierPrice(currentPlanName);
		const suffix =
			isUpgradeUserAuthenticated && currentPlanKey !== "free"
				? "Compare the plans below, then use the Billing Portal to change or upgrade your subscription."
				: "Compare paid plan benefits before opening checkout.";
		settingsUpgradePlanInfo.textContent = `Current plan: ${currentPlanName}${price ? ` (${price})` : ""}. ${suffix}`;
	}

	if (!settingsUpgradeLimitsEl) return;
	const limits = PLAN_LIMITS[currentPlanKey];
	let html = "<strong>Rate Limits:</strong><ul>";
	(Object.keys(limits) as Array<keyof typeof LIMIT_COPY>).forEach((key) => {
		html += `<li>${LIMIT_COPY[key]}: ${formatLimitValue(limits[key])}</li>`;
	});
	html += "</ul>";
	settingsUpgradeLimitsEl.innerHTML = html;
	settingsUpgradeLimitsEl.classList.add("is-visible");

	if (subscriptionManagementCopyEl) {
		subscriptionManagementCopyEl.textContent = getSubscriptionManagementCopy(
			isUpgradeUserAuthenticated,
			currentPlanKey !== "free",
			currentPlanName,
		);
	}

	if (subscriptionManagementStepsEl) {
		subscriptionManagementStepsEl.innerHTML = getSubscriptionManagementSteps(
			isUpgradeUserAuthenticated,
			currentPlanKey !== "free",
		)
			.map((step) => `<li>${escapeHtml(step)}</li>`)
			.join("");
	}

	if (settingsPortalBtn) {
		settingsPortalBtn.disabled = !isUpgradeUserAuthenticated;
		settingsPortalBtn.title = isUpgradeUserAuthenticated
			? "Open Stripe Billing Portal"
			: "Sign in to manage your subscription";
	}
}

async function refreshUpgradeSubscriptionData(force = false): Promise<void> {
	if (!force && !isUpgradeUserAuthenticated) {
		try {
			applyTierConfig(await window.auth.getTierConfig());
			subscriptionTiers = getPaidTiersFromConfig(currentTierConfig);
		} catch (_err) {
			void 0;
		}
		currentPlanKey = "free";
		currentPlanName = PLAN_DISPLAY_NAMES.free;
		renderSettingsUpgradePanel();
		return;
	}

	try {
		const sessionRes = await window.auth.getSession();
		isUpgradeUserAuthenticated = Boolean(sessionRes?.session?.isAuthenticated);
		if (!isUpgradeUserAuthenticated) {
			applyTierConfig(await window.auth.getTierConfig());
			currentPlanKey = "free";
			currentPlanName = PLAN_DISPLAY_NAMES.free;
			subscriptionTiers = getPaidTiersFromConfig(currentTierConfig);
			renderSettingsUpgradePanel();
			return;
		}

		const info = await window.auth.getSubscriptionInfo();
		applyTierConfig(info?.tierConfig);
		currentPlanKey =
			typeof info?.planKey === "string" && info.planKey.trim()
				? normalizePlanKey(info.planKey)
				: normalizePlanKey(info?.planName || "");
		currentPlanName = PLAN_DISPLAY_NAMES[currentPlanKey];
		subscriptionTiers = Array.isArray(info?.tiers)
			? info.tiers
			: getPaidTiersFromConfig(info?.tierConfig);
	} catch (_err) {
		currentPlanKey = "free";
		currentPlanName = PLAN_DISPLAY_NAMES.free;
		subscriptionTiers = getPaidTiersFromConfig(currentTierConfig);
	}

	renderSettingsUpgradePanel();
}

function redirectToAuthForUpgrade(mode: "signin" | "signup") {
	const params = new URLSearchParams();
	params.set("upgrade", "1");
	params.set("mode", mode);
	params.set("next", DEFAULT_UPGRADE_TARGET);
	rememberUpgradeIntent(DEFAULT_UPGRADE_TARGET);
	window.location.href = `auth.html?${params.toString()}`;
}

function openUpgradeRequiresAccountModal() {
	if (!settingsUpgradeAuthModal && window.ic && window.ic.iModal) {
		settingsUpgradeAuthModal = new window.ic.iModal(
			"settings-upgrade-auth-modal",
			520,
			undefined,
			false,
			false,
		);
	}
	if (!settingsUpgradeAuthModal) {
		redirectToAuthForUpgrade("signin");
		return;
	}

	settingsUpgradeAuthModal.open({
		html: `
			<h3>Account required to upgrade</h3>
			<p style="opacity:.85;margin:8px 0 10px;">
				You need an account before you can upgrade your plan.
			</p>
		`,
		actions: [
			{
				id: "settings-upgrade-auth-signin",
				label: "Sign In",
				onClick: () => {
					settingsUpgradeAuthModal.close();
					redirectToAuthForUpgrade("signin");
				},
			},
			{
				id: "settings-upgrade-auth-signup",
				label: "Create Account",
				onClick: () => {
					settingsUpgradeAuthModal.close();
					redirectToAuthForUpgrade("signup");
				},
			},
			{
				id: "settings-upgrade-auth-close",
				label: "Close",
				onClick: () => settingsUpgradeAuthModal.close(),
			},
		],
	});
}

async function openSettingsUpgradeModal() {
	await refreshUpgradeSubscriptionData(true);

	if (!isUpgradeUserAuthenticated) {
		openUpgradeRequiresAccountModal();
		return;
	}

	if (!settingsUpgradeModal && window.ic && window.ic.iModal) {
		settingsUpgradeModal = new window.ic.iModal(
			"settings-upgrade-modal",
			700,
			undefined,
			false,
			false,
		);
	}
	if (!settingsUpgradeModal) return;

	const recommended = getRecommendedUpgradePlan();
	const tiers = getSortedTierCatalog();
	const plansToShow =
		tiers.length > 0
			? tiers
			: PLAN_ORDER.filter((plan) => plan !== "free").map((plan) => ({
					key: plan,
					name: PLAN_DISPLAY_NAMES[plan],
					url: "",
					price: "",
				}));

	const cards = plansToShow
		? buildUpgradePlanCards(plansToShow, {
				currentPlanKey,
				recommendedPlanKey: recommended,
				allowDirectCheckout: currentPlanKey === "free",
			})
		: "";

	settingsUpgradeModal.open({
		html: `
			<h3>Upgrade Your Plan</h3>
			<div class="subscription-upgrade-layout">
				<p class="subscription-current-plan">
					Current plan: <strong>${escapeHtml(currentPlanName)}</strong>${getTierPrice(currentPlanName) ? ` (${escapeHtml(getTierPrice(currentPlanName) || "")})` : ""}.
				</p>
				<p class="subscription-upgrade-copy">
					${currentPlanKey === "free"
						? "Choose a paid plan to unlock higher limits, premium models, and priority support."
						: "Review the available plan benefits below, then use the Billing Portal to change your active subscription in Stripe."}
				</p>
				<div class="subscription-plan-grid">
					${cards || "<p class='subscription-empty'>No upgrade plans are available right now.</p>"}
				</div>
			</div>
		`,
		actions: [
			...(currentPlanKey === "free"
				? []
				: [
						{
							id: "open-settings-billing-portal",
							label: "Open Billing Portal",
							onClick: () => openBillingPortal(),
						},
					]),
			{
				id: "close-settings-upgrade-dialog",
				label: "Close",
				onClick: () => settingsUpgradeModal.close(),
			},
		],
	});
}

document.addEventListener("DOMContentLoaded", () => {
	installExternalUrlHandler();
	hostConfigModal = new window.ic.iModal("host-config-modal", 650);
	renameModal = new window.ic.iModal("rename-modal", 400);
	deleteConfirmModal = new window.ic.iModal("delete-confirm-modal", 420);
	deletePasswordModal = new window.ic.iModal("delete-password-modal", 420);
	settingsUpgradeModal = new window.ic.iModal(
		"settings-upgrade-modal",
		700,
		undefined,
		false,
		false,
	);
	settingsUpgradeAuthModal = new window.ic.iModal(
		"settings-upgrade-auth-modal",
		520,
		undefined,
		false,
		false,
	);

	settingsUpgradeBtn?.addEventListener("click", () => {
		void openSettingsUpgradeModal();
	});
	settingsPortalBtn?.addEventListener("click", () => {
		openBillingPortal();
	});
	void refreshUpgradeSubscriptionData(true);
	window.auth.onAuthStateChange((session) => {
		isUpgradeUserAuthenticated = Boolean(session?.isAuthenticated);
		void refreshUpgradeSubscriptionData(true);
	});

	if (window.location.hash.replace(/^#/, "").toLowerCase() === "upgrade") {
		const accountButton = document.querySelector(
			'.tab-button[data-tab="account"]',
		) as HTMLButtonElement | null;
		accountButton?.click();
		setTimeout(() => void openSettingsUpgradeModal(), 180);
	}
});

(async () => {
	try {
		const { session } = (await window.auth.getSession?.()) ?? {
			session: null,
		};
		const isLoggedIn = !!session?.isAuthenticated;

		if (syncCheckbox) {
			if (!isLoggedIn) {
				syncCheckbox.disabled = true;
				syncCheckbox.checked = false;
				localStorage.setItem("sync_enabled", "false");

				if (syncSection) {
					const msg = document.createElement("p");
					msg.className = "muted";
					msg.style.color = "#d38200ff";
					msg.textContent = "Sign in to enable chat sync.";
					syncSection.appendChild(msg);
				}
			} else {
				const saved = localStorage.getItem("sync_enabled");
				syncCheckbox.checked = saved === "true";
				syncCheckbox.disabled = false;
				syncCheckbox.addEventListener("change", () => {
					localStorage.setItem(
						"sync_enabled",
						syncCheckbox.checked ? "true" : "false",
					);
				});
			}
		}
	} catch (e) {
		console.warn("Could not initialize sync setting", e);
	}
	// Initialize search engine select
	if (searchEngineSelect) {
		const savedEngine = localStorage.getItem(SEARCH_ENGINE_KEY) || "duckduckgo";
		searchEngineSelect.value = savedEngine;
		searchEngineSelect.addEventListener("change", () => {
			localStorage.setItem(SEARCH_ENGINE_KEY, searchEngineSelect.value);
		});
	}
})();

async function initStartupSettings() {
	if (!startupRunAtLoginCheckbox || !startupAutoProxyCheckbox) return;
	try {
		const startup = await window.startup.getSettings();
		startupRunAtLoginCheckbox.checked = Boolean(startup.runAtLogin);
		startupAutoProxyCheckbox.checked = Boolean(startup.autoStartProxy);
		if (startupUiPortInput) {
			startupUiPortInput.value = String(startup.uiPort);
		}
		if (startupUiPortStatus) {
			startupUiPortStatus.textContent = `Reserved ports: ${RESERVED_PORT_MIN}-${RESERVED_PORT_MAX}.`;
		}
		if (startupStatus) {
			startupStatus.textContent = startup.runAtLogin
				? "Background startup is enabled."
				: "Background startup is disabled.";
		}
	} catch (err) {
		console.warn("Could not load startup settings", err);
	}
}

function parseUiPort(raw: string): number | null {
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return null;
	const port = Math.round(parsed);
	if (port < 1 || port > 65535) return null;
	return port;
}

function isReservedPort(port: number): boolean {
	return port >= RESERVED_PORT_MIN && port <= RESERVED_PORT_MAX;
}

startupUiPortSaveBtn?.addEventListener("click", async () => {
	if (!startupUiPortInput) return;
	const port = parseUiPort(startupUiPortInput.value.trim());

	if (port === null) {
		if (startupUiPortStatus) {
			startupUiPortStatus.textContent =
				"Enter a valid UI port between 1 and 65535.";
		}
		return;
	}

	if (isReservedPort(port)) {
		if (startupUiPortStatus) {
			startupUiPortStatus.textContent = `Port ${port} is reserved. Use a port outside ${RESERVED_PORT_MIN}-${RESERVED_PORT_MAX}.`;
		}
		return;
	}

	try {
		const updated = await window.startup.updateSettings({ uiPort: port });
		startupUiPortInput.value = String(updated.uiPort);
		if (startupUiPortStatus) {
			startupUiPortStatus.textContent = `UI port saved: ${updated.uiPort}. Restart app to fully apply. If changes do not take effect, restart your computer. Make sure this port isn't already being used by nother process or changes may not take effect.`;
		}
	} catch (err: any) {
		if (startupUiPortStatus) {
			startupUiPortStatus.textContent = `Could not save UI port: ${err?.message || err}`;
		}
	}
});

startupUiPortInput?.addEventListener("keydown", (event: KeyboardEvent) => {
	if (event.key === "Enter") {
		event.preventDefault();
		startupUiPortSaveBtn?.click();
	}
});

startupRunAtLoginCheckbox?.addEventListener("change", async () => {
	try {
		const updated = await window.startup.updateSettings({
			runAtLogin: startupRunAtLoginCheckbox.checked,
		});
		if (startupStatus) {
			startupStatus.textContent = updated.runAtLogin
				? "Background startup is enabled."
				: "Background startup is disabled.";
		}
	} catch (err) {
		console.warn("Could not update run-at-login setting", err);
	}
});

startupAutoProxyCheckbox?.addEventListener("change", async () => {
	try {
		const existingUsersRaw = localStorage.getItem(HOST_USERS_KEY);
		let existingUsers: { email: string; role: string }[] = [];
		try {
			existingUsers = existingUsersRaw
				? JSON.parse(existingUsersRaw)
				: [];
		} catch {
			existingUsers = [];
		}

		await window.startup.updateSettings({
			autoStartProxy: startupAutoProxyCheckbox.checked,
			proxyPort: 52458,
			proxyUsers: existingUsers,
		});
	} catch (err) {
		console.warn("Could not update auto proxy startup setting", err);
		showNotification({
			message: "Could not update auto proxy startup setting",
			type: "warning",
		});
	}
});

void initStartupSettings();

function isValidEmail(email: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

try {
	const usersRaw = localStorage.getItem(HOST_USERS_KEY);
	if (usersRaw) {
		const users = JSON.parse(usersRaw) as { email: string; role: string }[];
		if (Array.isArray(users)) {
			emails = users.map((u) => u.email);
			renderChips();
		}
	} else {
		const stored = JSON.parse(
			localStorage.getItem(EMAIL_STORAGE_KEY) || "[]",
		);
		if (Array.isArray(stored)) {
			emails = stored;
			renderChips();
		}
	}
} catch {
	void 0;
}

function renderChips() {
	chipContainer.innerHTML = "";

	for (const email of emails) {
		const chip = document.createElement("div");
		chip.className = "chip" + (isValidEmail(email) ? "" : " invalid");
		chip.textContent = email;

		const remove = document.createElement("button");
		remove.textContent = "×";
		remove.onclick = () => {
			emails = emails.filter((e) => e !== email);
			renderChips();
		};

		chip.appendChild(remove);
		chipContainer.appendChild(chip);
	}

	localStorage.setItem(EMAIL_STORAGE_KEY, JSON.stringify(emails));
}

function addEmail(value: string) {
	const email = value.trim();
	if (!email || emails.includes(email)) return;
	emails.push(email);
	renderChips();
	markRestartRequired();
}

emailInput.addEventListener("keydown", (e) => {
	if (
		(e.key === "Backspace" || e.key === "Delete") &&
		emailInput.value === ""
	) {
		if (emails.length > 0) {
			emails.pop();
			renderChips();
			e.preventDefault();
		}
		return;
	}

	if (e.key === "Enter" || e.key === ",") {
		e.preventDefault();
		addEmail(emailInput.value);
		emailInput.value = "";
	}
});

emailInput.addEventListener("blur", () => {
	addEmail(emailInput.value);
	emailInput.value = "";
});

window.addEventListener("DOMContentLoaded", async () => {
	const { session } = await window.auth.getSession();
	if (session?.isAuthenticated) return;
	const shouldDisable = true;

	const details = document.getElementById("account-settings");
	if (!details) return;

	const buttons = details.querySelectorAll("button");

	buttons.forEach((btn) => {
		if (shouldDisable) {
			btn.classList.add("disabled");
			btn.disabled = true;
		} else {
			btn.classList.remove("disabled");
			btn.disabled = false;
		}
	});

	const msg = document.createElement("p");
	const br = document.createElement("p");
	br.textContent = " ";
	details.appendChild(br);
	msg.className = "muted";
	msg.style.color = "#d38200ff";
	msg.textContent = "Sign in to use account controls.";
	details.appendChild(msg);
});

async function setHostingUIRunning(running: boolean, port?: number) {
	if (hostStartBtn) hostStartBtn.disabled = running;
	if (hostStopBtn) hostStopBtn.disabled = !running;
	if (hostStatus)
		hostStatus.textContent = running
			? `Server running on port ${port}`
			: "Server stopped";
	if (running) {
		serverLogsPanel.style.display = "block";
		logsOutput.textContent = await window.ollama.getServerLogs();
	} else {
		serverLogsPanel.style.display = "none";
	}
}

function setServerLogUIRunning(running: boolean, port?: number) {
	if (!serverLogsPanel) return;
	serverLogsPanel.style.display = running ? "block" : "none";
	if (!running) {
		if (logsStartBtn) logsStartBtn.disabled = false;
		if (logsStopBtn) logsStopBtn.disabled = true;
	}
}

logsRefreshBtn?.addEventListener("click", async () => {
	if (!logsOutput) return;
	logsOutput.textContent = "Loading...";
	try {
		const data = await window.ollama.getServerLogs();
		logsOutput.textContent = data || "";
		logsOutput.scrollTop = logsOutput.scrollHeight;
	} catch (e: any) {
		logsOutput.textContent = `Error: ${e?.message || e}`;
	}
});

const savedEmails = localStorage.getItem("host_emails") || "";
if (hostEmailsInput) hostEmailsInput.value = savedEmails;

function markRestartRequired() {
	if (!hostStartBtn?.disabled) return;

	localStorage.setItem(RESTART_REQUIRED_KEY, "true");

	if (hostStatus) {
		hostStatus.textContent = "Restart server to apply email changes.";
		hostStatus.style.color = "#d38200ff";
	}
}
function clearRestartRequired() {
	localStorage.removeItem(RESTART_REQUIRED_KEY);
	if (hostStatus) hostStatus.style.color = "";
}

async function isLocalProxyRunning(
	port: number,
	timeout = 1000,
): Promise<boolean> {
	try {
		const controller = new AbortController();
		const id = setTimeout(() => controller.abort(), timeout);
		const res = await fetch(`http://127.0.0.1:${port}/__health`, {
			method: "GET",
			signal: controller.signal,
		});
		clearTimeout(id);
		return !!res;
	} catch (e) {
		return false;
	}
}

(async () => {
	const portNum = 52458;
	try {
		const running = await isLocalProxyRunning(portNum, 800);
		if (running) {
			setHostingUIRunning(true, portNum);
			setServerLogUIRunning(true, portNum);
			try {
				const data = await window.ollama.getServerLogs();
				if (logsOutput) logsOutput.textContent = data || "";
			} catch {}
		}
	} catch (e) {}
})();

hostStartBtn?.addEventListener("click", async () => {
	const models = await window.ollama.listModels(undefined);
	if (models.length === 0) {
		if (hostStatus)
			hostStatus.textContent =
				"No models available. Please download a model before starting the server.";
		showNotification({
			message: "Could not start the server",
			type: "error",
		});
		return;
	}

	const port = 52458;
	const emailsToUse = emails.filter(isValidEmail);
	if (emailsToUse.length === 0) {
		if (hostStatus) hostStatus.textContent = "No valid emails configured.";
		return;
	}

	const existingUsersRaw = localStorage.getItem(HOST_USERS_KEY);
	let existingUsers: { email: string; role: string }[] = [];
	try {
		existingUsers = existingUsersRaw ? JSON.parse(existingUsersRaw) : [];
	} catch {}

	const users = emailsToUse.map((e) => {
		const found = existingUsers.find((u) => u.email === e);
		return { email: e, role: found?.role || "member" };
	});

	const rows = users
		.map(
			(u, idx) => `
		<tr>
			<td style="padding:8px; text-align:left">${u.email}</td>
			<td style="padding:8px; text-align:right">
				<select data-idx="${idx}">
					<option value="member" ${u.role === "member" ? "selected" : ""}>Member</option>
					<option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
				</select>
			</td>
		</tr>
	`,
		)
		.join("");

	const html = `
		<h3>Configure Hosted Users & Roles</h3>
		<table style="width:100%; border-collapse:collapse">
			<tr>
				<th style="text-align:left">Email</th>
				<th style="text-align:left">Role</th>
			</tr>
			${rows}
		</table>
	`;

	hostConfigModal.open({
		html,
		actions: [
			{
				id: "cancel-host",
				label: "Cancel",
				onClick: () => hostConfigModal.close(),
			},
			{
				id: "start-host",
				label: "Start Server",
				onClick: async () => {
					hostConfigModal.close();
					if (hostStatus) hostStatus.textContent = "Starting...";

					try {
						clearRestartRequired();
						await window.ollama.startServer(port, users);
						localStorage.setItem(
							HOST_USERS_KEY,
							JSON.stringify(users),
						);
						localStorage.setItem(
							"host_emails",
							hostEmailsInput?.value || "",
						);
						await window.startup.updateSettings({
							proxyPort: port,
							proxyUsers: users,
						});
						setHostingUIRunning(true, port);
					} catch (e: any) {
						if (hostStatus)
							hostStatus.textContent = `Error: ${e?.message || e}`;
					}
				},
			},
		],
	});

	requestAnimationFrame(() => {
		document
			.querySelectorAll<HTMLSelectElement>("#host-config-modal select")
			.forEach((select) => {
				select.addEventListener("change", () => {
					const idx = Number(select.dataset.idx);
					users[idx]!.role = select.value;
				});
			});
	});
});

hostStopBtn.addEventListener("click", async () => {
	if (hostStatus) hostStatus.textContent = "Stopping...";
	try {
		await window.ollama.stopServer();
		clearRestartRequired();
		setHostingUIRunning(false);
	} catch (e: any) {
		if (hostStatus) hostStatus.textContent = `Error: ${e?.message || e}`;
	}
});

(document.getElementById("open-rename") as HTMLButtonElement).addEventListener(
	"click",
	() => {
		renameModal.open({
			html: `
			<div style="text-align:left">
				<h3>Change Username</h3>
				<p>Pick your new username:</p>
				<input type="text" id="rename-username" placeholder="Enter username" style="width:100%">
				<p id="rename-status" style="margin-top:8px;"></p>
			</div>
		`,
			actions: [
				{
					id: "rename-cancel",
					label: "Cancel",
					onClick: () => renameModal.close(),
				},
				{
					id: "rename-save",
					label: "Save",
					onClick: async () => {
						const input = document.getElementById(
							"rename-username",
						) as HTMLInputElement;
						const statusEl = document.getElementById(
							"rename-status",
						) as HTMLParagraphElement;
						const username = input.value.trim();

						if (!username) {
							statusEl.textContent = "Please enter a username.";
							return;
						}

						statusEl.textContent = "Saving...";

						const { session } = await window.auth.getSession();
						const userId = session?.user?.id;
						if (!userId) {
							statusEl.textContent = "Not logged in.";
							return;
						}

						const result = await window.auth.setUsername(
							userId,
							username,
						);
						if (result.error) {
							statusEl.textContent = `Error: ${result.error}`;
							return;
						}

						renameModal.close();
						setTimeout(() => {
							window.location.reload();
						}, 700);
					},
				},
			],
		});
	},
);

(document.getElementById("open-delete") as HTMLButtonElement).addEventListener(
	"click",
	() => {
		deleteConfirmModal.open({
			html: `
			<div style="text-align:left">
				<h3 style="color:red">Delete Account</h3>
				<p>Are you sure you want to permanently delete your account?</p>
			</div>
		`,
			actions: [
				{
					id: "delete-cancel",
					label: "Cancel",
					onClick: () => deleteConfirmModal.close(),
				},
				{
					id: "delete-continue",
					label: "Delete",
					onClick: async () => {
						deleteConfirmModal.close();
						await handleDeleteFlow();
					},
				},
			],
		});
	},
);

async function handleDeleteFlow() {
	const { session } = await window.auth.getSession();
	if (!session?.isAuthenticated || !session.user) return;

	if (session.user.provider === "email") {
		deletePasswordModal.open({
			html: `
				<div style="text-align:left">
					<h3 style="color:red">Confirm Password</h3>
					<p>Please enter your password to delete your account.</p>
					<input type="password" id="delete-password-input" style="width:100%">
					<p id="delete-password-status"></p>
				</div>
			`,
			actions: [
				{
					id: "pw-cancel",
					label: "Cancel",
					onClick: () => deletePasswordModal.close(),
				},
				{
					id: "pw-delete",
					label: "Delete",
					onClick: async () => {
						const input = document.getElementById(
							"delete-password-input",
						) as HTMLInputElement;
						const statusEl = document.getElementById(
							"delete-password-status",
						) as HTMLParagraphElement;

						statusEl.textContent = "Verifying...";

						const { success, error } =
							await window.auth.verifyPassword(input.value);
						if (!success) {
							statusEl.textContent = `Error: ${error || "Verification failed"}`;
							return;
						}

						await performFinalDeletion(statusEl);
					},
				},
			],
		});
	} else {
		await performFinalDeletion();
	}
}

async function performFinalDeletion(statusEl?: HTMLElement) {
	if (statusEl) statusEl.textContent = "Deleting account...";

	const result = await window.auth.deleteAccount();
	if (!result.success) {
		if (statusEl)
			statusEl.textContent = `Error: ${result.error || "Deletion failed"}`;
		return;
	}

	if (statusEl) statusEl.textContent = "Deleted.";

	setTimeout(() => {
		window.auth.signOut().finally(() => {
			window.location.href = "index.html";
		});
	}, 800);
}

setHostingUIRunning(false);

// Tab switching logic
document.querySelectorAll('.tab-button').forEach((button) => {
	(button as HTMLButtonElement).addEventListener('click', () => {
		// Remove active class from all buttons and panes
		document.querySelectorAll('.tab-button').forEach((btn) => btn.classList.remove('active'));
		document.querySelectorAll('.tab-pane').forEach((pane) => pane.classList.remove('active'));
		
		// Add active class to clicked button and corresponding pane
		button.classList.add('active');
		const tabId = (button as HTMLButtonElement).getAttribute('data-tab');
		if (tabId) {
			const pane = document.getElementById(tabId);
			if (pane) pane.classList.add('active');
		}
	});
});
