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
import * as toolSettings from "./helper/toolSettings.js";

const chipContainer = document.getElementById("email-chips") as HTMLDivElement;
const emailInput = document.getElementById("email-input") as HTMLInputElement;
const hostEmailsInput = document.getElementById(
	"host-emails",
) as HTMLTextAreaElement;
const serverApiKeysInput = document.getElementById(
	"server-api-keys",
) as HTMLTextAreaElement | null;
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
const tokenVerifyUsageValueEl = document.getElementById(
	"token-verify-usage-value",
) as HTMLSpanElement | null;
const tokenVerifyUsageFillEl = document.getElementById(
	"token-verify-usage-fill",
) as HTMLDivElement | null;
const tokenVerifyUsageMetaEl = document.getElementById(
	"token-verify-usage-meta",
) as HTMLParagraphElement | null;
const tokenVerifyUsageNoticeEl = document.getElementById(
	"token-verify-usage-notice",
) as HTMLParagraphElement | null;

const RESTART_REQUIRED_KEY = "host_restart_required";

const EMAIL_STORAGE_KEY = "host_emails_v2";
const HOST_USERS_KEY = "host_users_v1";
const HOST_SERVER_API_KEYS_KEY = "host_server_api_keys_v1";
const startup = await window.startup.getSettings();

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
const startupSnipHotkeyCheckbox = document.getElementById(
	"startup-snip-hotkey",
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
const startupSnipStatus = document.getElementById(
	"startup-snip-status",
) as HTMLParagraphElement | null;
const searchEngineSelect = document.getElementById(
	"search-engine-select",
) as HTMLSelectElement | null;

// Tool toggle elements
const toolWebSearchToggle = document.getElementById(
	"tool-web-search",
) as HTMLElement | null;
const toolImageGenToggle = document.getElementById(
	"tool-image-gen",
) as HTMLElement | null;
const toolVideoGenToggle = document.getElementById(
	"tool-video-gen",
) as HTMLElement | null;
const toolAudioGenToggle = document.getElementById(
	"tool-audio-gen",
) as HTMLElement | null;

// Search engine checkboxes
const searchEngineDuckduckgoCheckbox = document.getElementById(
	"search-engine-duckduckgo",
) as HTMLInputElement | null;
const searchEngineOllamaCheckbox = document.getElementById(
	"search-engine-ollama",
) as HTMLInputElement | null;

let emails: string[] = [];
const RESERVED_PORT_MIN = 52440;
const RESERVED_PORT_MAX = 52458;

let hostConfigModal: declarations["iInstance"]["iModal"];
let renameModal: declarations["iInstance"]["iModal"];
let deleteConfirmModal: declarations["iInstance"]["iModal"];
let deletePasswordModal: declarations["iInstance"]["iModal"];
let settingsUpgradeModal: declarations["iInstance"]["iModal"];
let settingsUpgradeAuthModal: declarations["iInstance"]["iModal"];
let apiKeyCreateModal: declarations["iInstance"]["iModal"];
let apiKeyRevealModal: declarations["iInstance"]["iModal"];

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
const settingsApiRefreshBtn = document.getElementById(
	"settings-api-refresh-btn",
) as HTMLButtonElement | null;
const settingsApiCreateBtn = document.getElementById(
	"settings-api-create-btn",
) as HTMLButtonElement | null;
const settingsApiStatusEl = document.getElementById(
	"settings-api-status",
) as HTMLParagraphElement | null;
const settingsApiListEl = document.getElementById(
	"settings-api-list",
) as HTMLDivElement | null;
type PlanKey = "free" | "light" | "core" | "creator" | "professional";
const PLAN_ORDER: PlanKey[] = [
	"free",
	"light",
	"core",
	"creator",
	"professional",
];
const PLAN_DISPLAY_NAMES: Record<PlanKey, string> = {
	free: "Free Tier",
	light: "InferencePort AI Light",
	core: "InferencePort AI Core",
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
	core: { ...EMPTY_PLAN_LIMITS },
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
let lightningApiKeys: AuthLightningApiKey[] = [];

function escapeHtml(value: string): string {
	return escapeSubscriptionHtml(value);
}

function formatDateTime(value: string | null): string {
	if (!value) return "Never";
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value;
	return parsed.toLocaleString();
}

function getApiKeyStatus(
	apiKey: AuthLightningApiKey,
): { label: string; className: string } {
	if (apiKey.isRevoked) {
		return { label: "Revoked", className: "is-revoked" };
	}
	if (apiKey.isExpired) {
		return { label: "Expired", className: "is-expired" };
	}
	return { label: "Active", className: "is-active" };
}

function renderLightningApiKeys(): void {
	if (!settingsApiListEl) return;

	if (!isUpgradeUserAuthenticated) {
		settingsApiListEl.innerHTML =
			'<p class="settings-api-empty">Sign in to create and manage Lightning API keys.</p>';
		return;
	}

	if (!Array.isArray(lightningApiKeys) || lightningApiKeys.length === 0) {
		settingsApiListEl.innerHTML =
			'<p class="settings-api-empty">No API keys yet. Generate one to authenticate Lightning requests without a Supabase session JWT.</p>';
		return;
	}

	settingsApiListEl.innerHTML = lightningApiKeys
		.map((apiKey) => {
			const status = getApiKeyStatus(apiKey);
			return `
				<article class="settings-api-key-row">
					<div class="settings-api-key-head">
						<div class="settings-api-key-title">
							<div class="settings-api-key-name">${escapeHtml(apiKey.name)}</div>
							<div class="settings-api-key-prefix">${escapeHtml(apiKey.keyPrefix)}...</div>
						</div>
						<div class="settings-api-key-badge ${status.className}">${escapeHtml(status.label)}</div>
					</div>
					<div class="settings-api-key-meta">
						<span>Created: ${escapeHtml(formatDateTime(apiKey.createdAt))}</span>
						<span>Last used: ${escapeHtml(formatDateTime(apiKey.lastUsedAt))}</span>
						<span>Expires: ${escapeHtml(apiKey.expiresAt ? formatDateTime(apiKey.expiresAt) : "Never")}</span>
					</div>
					<div class="settings-api-actions">
						<button
							type="button"
							class="theme-toggle settings-subscription-btn settings-subscription-btn--secondary"
							data-api-key-action="revoke"
							data-api-key-id="${escapeHtml(apiKey.id)}"
							${apiKey.isRevoked ? "disabled" : ""}
						>
							${apiKey.isRevoked ? "Revoked" : "Revoke Key"}
						</button>
					</div>
				</article>
			`;
		})
		.join("");

	settingsApiListEl
		.querySelectorAll<HTMLButtonElement>('[data-api-key-action="revoke"]')
		.forEach((button) => {
			button.addEventListener("click", () => {
				const keyId = button.dataset.apiKeyId;
				if (!keyId) return;
				void revokeLightningApiKey(keyId);
			});
		});
}

function setLightningApiStatus(message: string, tone: "default" | "warning" = "default"): void {
	if (!settingsApiStatusEl) return;
	settingsApiStatusEl.textContent = message;
	settingsApiStatusEl.style.color =
		tone === "warning" ? "#d38200ff" : "";
}

async function refreshLightningApiKeys(force = false): Promise<void> {
	if (!isUpgradeUserAuthenticated && !force) {
		lightningApiKeys = [];
		setLightningApiStatus(
			"Sign in to create and manage Lightning API keys.",
			"warning",
		);
		renderLightningApiKeys();
		return;
	}

	try {
		const { session } = await window.auth.getSession();
		isUpgradeUserAuthenticated = Boolean(session?.isAuthenticated);
		if (!isUpgradeUserAuthenticated) {
			lightningApiKeys = [];
			setLightningApiStatus(
				"Sign in to create and manage Lightning API keys.",
				"warning",
			);
			renderLightningApiKeys();
			return;
		}

		lightningApiKeys = await window.auth.listLightningApiKeys();
		setLightningApiStatus(
			"Use a generated key as `Authorization: Bearer <your-api-key>` when calling Lightning.",
		);
		renderLightningApiKeys();
	} catch (error) {
		lightningApiKeys = [];
		setLightningApiStatus(
			`Could not load API keys: ${error instanceof Error ? error.message : String(error)}`,
			"warning",
		);
		renderLightningApiKeys();
	}
}

function bindCopyApiKeyButton(rawKey: string): void {
	setTimeout(() => {
		const copyButton = document.getElementById(
			"copy-lightning-api-key",
		) as HTMLButtonElement | null;
		const statusEl = document.getElementById(
			"copy-lightning-api-key-status",
		) as HTMLParagraphElement | null;
		if (!copyButton) return;
		copyButton.addEventListener("click", async () => {
			try {
				await navigator.clipboard.writeText(rawKey);
				if (statusEl) statusEl.textContent = "Copied to clipboard.";
			} catch (error) {
				if (statusEl) {
					statusEl.textContent = `Copy failed: ${error instanceof Error ? error.message : String(error)}`;
				}
			}
		});
	}, 0);
}

function openApiKeyRevealModal(apiKey: AuthLightningApiKey, rawKey: string): void {
	if (!apiKeyRevealModal) return;
	apiKeyRevealModal.open({
		html: `
			<div style="text-align:left">
				<h3>API key created</h3>
				<p>Copy this key now. For security, it is only shown once.</p>
				<p><strong>${escapeHtml(apiKey.name)}</strong></p>
				<pre style="white-space:pre-wrap;word-break:break-all;">${escapeHtml(rawKey)}</pre>
				<p id="copy-lightning-api-key-status" class="muted">Use it as <code>Authorization: Bearer &lt;your-api-key&gt;</code>.</p>
			</div>
		`,
		actions: [
			{
				id: "copy-lightning-api-key",
				label: "Copy Key",
				onClick: async () => {
					try {
						await navigator.clipboard.writeText(rawKey);
						showNotification({
							message: "API key copied to clipboard",
							type: "success",
						});
					} catch (error) {
						showNotification({
							message: `Copy failed: ${error instanceof Error ? error.message : String(error)}`,
							type: "warning",
						});
					}
				},
			},
			{
				id: "close-lightning-api-key",
				label: "Close",
				onClick: () => apiKeyRevealModal.close(),
			},
		],
	});
	bindCopyApiKeyButton(rawKey);
}

function openCreateApiKeyModal(): void {
	if (!apiKeyCreateModal) return;
	apiKeyCreateModal.open({
		html: `
			<div style="text-align:left">
				<h3>Create Lightning API key</h3>
				<p>Give this key a label so you can recognize where it is used later.</p>
				<input type="text" id="lightning-api-key-name" placeholder="Production deploy, local scripts, CI, etc." style="width:100%">
				<p style="margin:12px 0 6px;">Optional expiration (ISO date/time)</p>
				<input type="text" id="lightning-api-key-expiry" placeholder="2026-12-31T23:59:59Z" style="width:100%">
				<p id="lightning-api-key-create-status" style="margin-top:8px;"></p>
			</div>
		`,
		actions: [
			{
				id: "create-lightning-api-key-cancel",
				label: "Cancel",
				onClick: () => apiKeyCreateModal.close(),
			},
			{
				id: "create-lightning-api-key-submit",
				label: "Generate",
				onClick: async () => {
					const nameInput = document.getElementById(
						"lightning-api-key-name",
					) as HTMLInputElement | null;
					const expiryInput = document.getElementById(
						"lightning-api-key-expiry",
					) as HTMLInputElement | null;
					const statusEl = document.getElementById(
						"lightning-api-key-create-status",
					) as HTMLParagraphElement | null;
					const name = nameInput?.value.trim() || "";
					const expiresAt = expiryInput?.value.trim() || null;

					if (!name) {
						if (statusEl) statusEl.textContent = "Please enter a name for this key.";
						return;
					}

					if (statusEl) statusEl.textContent = "Creating API key...";

					const result = await window.auth.createLightningApiKey(name, expiresAt);
					if (result.error || !result.apiKey || !result.rawKey) {
						if (statusEl) {
							statusEl.textContent = `Error: ${result.error || "Could not create API key"}`;
						}
						return;
					}

					apiKeyCreateModal.close();
					lightningApiKeys = [result.apiKey, ...lightningApiKeys];
					setLightningApiStatus(
						"New key created. Copy it now before closing the reveal dialog.",
					);
					renderLightningApiKeys();
					openApiKeyRevealModal(result.apiKey, result.rawKey);
				},
			},
		],
	});
}

async function revokeLightningApiKey(keyId: string): Promise<void> {
	const target = lightningApiKeys.find((entry) => entry.id === keyId);
	if (!target) return;

	let modal: any;
	modal = new window.ic.iModal("revoke-api-key-modal", 420, {
		title: "Revoke API Key",
		text: `Revoke the API key "${target.name}"? Existing integrations using it will stop working immediately.`,
		actions: [
			{
				id: "cancel-revoke",
				label: "Cancel",
				onClick: () => modal.close(),
			},
			{
				id: "confirm-revoke",
				label: "Revoke",
				onClick: async () => {
					modal.close();
					let result:
						| {
								success?: boolean | null;
								apiKey?: AuthLightningApiKey | null;
								error?: string | null;
						  }
						| undefined;
					try {
						result = await window.auth.revokeLightningApiKey(keyId);
					} catch {
						result = {
							success: null,
							apiKey: null,
							error: null,
						};
					}
					if (!result.success || !result.apiKey) {
						showNotification({
							message: result.error || "Could not revoke API key",
							type: "warning",
						});
						return;
					}

					lightningApiKeys = lightningApiKeys.map((entry) =>
						entry.id === keyId ? result.apiKey! : entry,
					);

					setLightningApiStatus(`Revoked API key "${target.name}".`);
					renderLightningApiKeys();

					showNotification({
						message: `Revoked API key "${target.name}"`,
						type: "success",
					});
				},
			},
		],
	});

	modal.open();
}

function isKnownPlanKey(value: string): value is PlanKey {
	return (
		value === "free" ||
		value === "light" ||
		value === "core" ||
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
		const missing = (["free", "light", "core", "creator", "professional"] as PlanKey[]).filter(
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
(async () => {
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
	apiKeyCreateModal = new window.ic.iModal(
		"settings-api-key-create-modal",
		560,
		undefined,
		false,
		false,
	);
	apiKeyRevealModal = new window.ic.iModal(
		"settings-api-key-reveal-modal",
		620,
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
	settingsApiRefreshBtn?.addEventListener("click", () => {
		void refreshLightningApiKeys(true);
	});
	settingsApiCreateBtn?.addEventListener("click", () => {
		refreshLightningApiKeys(true)
			.then(() => {
				if (!isUpgradeUserAuthenticated) {
					showNotification({
						message: "Sign in to generate Lightning API keys",
						type: "warning",
					});
					return;
				}
				openCreateApiKeyModal();
			})
			.catch((error) => {
				showNotification({
					message: `Could not open API key dialog: ${error instanceof Error ? error.message : String(error)}`,
					type: "warning",
				});
			});
	});
	void refreshUpgradeSubscriptionData(true);
	void refreshLightningApiKeys(true);
	window.auth.onAuthStateChange((session) => {
		isUpgradeUserAuthenticated = Boolean(session?.isAuthenticated);
		setAccountControlsEnabled(isUpgradeUserAuthenticated);
		void refreshUpgradeSubscriptionData(true);
		void refreshLightningApiKeys(true);
	});

	if (window.location.hash.replace(/^#/, "").toLowerCase() === "upgrade") {
		const accountButton = document.querySelector(
			'.tab-button[data-tab="account"]',
		) as HTMLButtonElement | null;
		accountButton?.click();
		setTimeout(() => void openSettingsUpgradeModal(), 180);
	}
})();
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
})();

async function initStartupSettings() {
	if (!startupRunAtLoginCheckbox || !startupAutoProxyCheckbox) return;
	try {
		startupRunAtLoginCheckbox.checked = Boolean(startup.runAtLogin);
		startupAutoProxyCheckbox.checked = Boolean(startup.autoStartProxy);
		if (startupSnipHotkeyCheckbox) {
			startupSnipHotkeyCheckbox.checked = Boolean(
				startup.snipHotkeyInBackground,
			);
		}
		if (startupUiPortInput) {
			startupUiPortInput.value = String(startup.uiPort);
		}
		if (serverApiKeysInput) {
			serverApiKeysInput.value = Array.isArray(startup.serverApiKeys)
				? startup.serverApiKeys.join("\n")
				: "";
		}
		if (startupUiPortStatus) {
			startupUiPortStatus.textContent = `Reserved ports: ${RESERVED_PORT_MIN}-${RESERVED_PORT_MAX}.`;
		}
		if (startupStatus) {
			startupStatus.textContent = startup.runAtLogin
				? "Background startup is enabled."
				: "Background startup is disabled.";
		}
		if (startupSnipStatus) {
			startupSnipStatus.textContent = startup.snipHotkeyInBackground
				? (startup.runAtLogin
					? "Screen snip hotkey is enabled in the background."
					: "Screen snip hotkey is enabled, but requires background startup to work when the app is closed.")
				: "Screen snip hotkey is disabled when the app is closed.";
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
    if (startupUiPortStatus) {
        startupUiPortStatus.textContent =
            "Changing the UI port may disconnect hosted clients. Disengaging is recommended before changing ports.";
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
			startupUiPortStatus.textContent = `UI port saved: ${updated.uiPort}. Restart computer and/or app to fully apply. Disengaging is recommended to clear browser data for the old port.`;
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
		if (startupSnipStatus) {
			startupSnipStatus.textContent = updated.snipHotkeyInBackground
				? (updated.runAtLogin
					? "Screen snip hotkey is enabled in the background."
					: "Screen snip hotkey is enabled, but requires background startup to work when the app is closed.")
				: "Screen snip hotkey is disabled when the app is closed.";
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

		const serverApiKeys = parseServerApiKeysInput(
			serverApiKeysInput?.value || "",
		);
		await window.startup.updateSettings({
			autoStartProxy: startupAutoProxyCheckbox.checked,
			proxyPort: 52458,
			proxyUsers: existingUsers,
			serverApiKeys,
		});
	} catch (err) {
		console.warn("Could not update auto proxy startup setting", err);
		showNotification({
			message: "Could not update auto proxy startup setting",
			type: "warning",
		});
	}
});

startupSnipHotkeyCheckbox?.addEventListener("change", async () => {
	try {
		const updated = await window.startup.updateSettings({
			snipHotkeyInBackground: startupSnipHotkeyCheckbox.checked,
		});
		if (startupSnipStatus) {
			startupSnipStatus.textContent = updated.snipHotkeyInBackground
				? (updated.runAtLogin
					? "Screen snip hotkey is enabled in the background."
					: "Screen snip hotkey is enabled, but requires background startup to work when the app is closed.")
				: "Screen snip hotkey is disabled when the app is closed.";
		}
	} catch (err) {
		console.warn("Could not update snip hotkey setting", err);
		showNotification({
			message: "Could not update snip hotkey setting",
			type: "warning",
		});
	}
});

void initStartupSettings();

function isValidEmail(email: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseServerApiKeysInput(value: string): string[] {
	return value
		.split(/\r?\n/)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
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

function setAccountControlsEnabled(enabled: boolean): void {
	const details = document.getElementById("account-settings");
	if (!details) return;

	const buttons = details.querySelectorAll("button");

	buttons.forEach((btn) => {
		if (!enabled) {
			btn.classList.add("disabled");
			btn.disabled = true;
		} else {
			btn.classList.remove("disabled");
			btn.disabled = false;
		}
	});

	const existingHint = details.querySelector(
		'[data-account-auth-hint="true"]',
	) as HTMLParagraphElement | null;

	if (!enabled) {
		if (existingHint) return;
		const msg = document.createElement("p");
		msg.dataset.accountAuthHint = "true";
		msg.className = "muted";
		msg.style.color = "#d38200ff";
		msg.textContent = "Sign in to use account controls.";
		details.appendChild(msg);
		return;
	}

	existingHint?.remove();
}

window.addEventListener("DOMContentLoaded", async () => {
	const { session } = await window.auth.getSession();
	setAccountControlsEnabled(Boolean(session?.isAuthenticated));
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
		await refreshVerifyTokenUsage();
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

function toFiniteRatio(used: number, limit: number | null): number {
	if (limit == null || limit <= 0) return 0;
	return Math.max(0, Math.min(1, used / limit));
}

function renderVerifyTokenUsage(usage: AuthVerifyTokenUsageInfo): void {
	if (
		!tokenVerifyUsageValueEl ||
		!tokenVerifyUsageFillEl ||
		!tokenVerifyUsageMetaEl
	) {
		return;
	}

	const limit =
		typeof usage.usage.limit === "number" ? usage.usage.limit : 100;
	const used = Math.max(0, Number(usage.usage.used) || 0);
	const remaining =
		typeof usage.usage.remaining === "number"
			? Math.max(0, usage.usage.remaining)
			: Math.max(0, limit - used);
	const ratio = toFiniteRatio(used, limit);

	tokenVerifyUsageValueEl.textContent = `${remaining} left today`;
	tokenVerifyUsageMetaEl.textContent = usage.error
		? `Usage check problem: ${usage.error}`
		: `${used} / ${limit} used today${usage.generatedAt ? ` • updated ${new Date(usage.generatedAt).toLocaleTimeString()}` : ""}`;

	tokenVerifyUsageFillEl.classList.remove("is-warning", "is-danger");
	tokenVerifyUsageFillEl.style.width = `${Math.round(ratio * 100)}%`;
	if (ratio >= 1) {
		tokenVerifyUsageFillEl.classList.add("is-danger");
	} else if (ratio >= 0.75) {
		tokenVerifyUsageFillEl.classList.add("is-warning");
	}

	if (tokenVerifyUsageNoticeEl) {
		tokenVerifyUsageNoticeEl.textContent =
			usage.notice ||
			"Need more usage? Contact us at inferenceportai@gmail.com.";
	}
}

async function refreshVerifyTokenUsage(): Promise<void> {
	if (
		!tokenVerifyUsageValueEl ||
		!tokenVerifyUsageFillEl ||
		!tokenVerifyUsageMetaEl
	) {
		return;
	}

	tokenVerifyUsageValueEl.textContent = "Loading...";
	tokenVerifyUsageMetaEl.textContent = "Checking remaining usage...";
	tokenVerifyUsageFillEl.classList.remove("is-warning", "is-danger");
	tokenVerifyUsageFillEl.style.width = "0%";

	try {
		const usage = await window.auth.getVerifyTokenUsage();
		renderVerifyTokenUsage(usage);
	} catch (error) {
		renderVerifyTokenUsage({
			planKey: "free",
			planName: "Free Tier",
			featureName: "Token Verification Requests",
			usage: {
				limit: 100,
				used: 0,
				remaining: 100,
				window: "",
				period: "daily",
			},
			generatedAt: null,
			error: error instanceof Error ? error.message : String(error),
			notice: "Need more usage? Contact us at inferenceportai@gmail.com.",
		});
	}
}

logsRefreshBtn?.addEventListener("click", async () => {
	if (!logsOutput) return;
	logsOutput.textContent = "Loading...";
	try {
		const data = await window.ollama.getServerLogs();
		logsOutput.textContent = data || "";
		logsOutput.scrollTop = logsOutput.scrollHeight;
		await refreshVerifyTokenUsage();
	} catch (e: any) {
		logsOutput.textContent = `Error: ${e?.message || e}`;
	}
});

const savedEmails = localStorage.getItem("host_emails") || "";
if (hostEmailsInput && !hostEmailsInput.value.trim()) {
	hostEmailsInput.value = savedEmails;
}
if (serverApiKeysInput) {
	// Never persist API keys in localStorage; clear any legacy cleartext value.
	localStorage.removeItem(HOST_SERVER_API_KEYS_KEY);
}

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
			await refreshVerifyTokenUsage();
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
						const serverApiKeys = parseServerApiKeysInput(
							serverApiKeysInput?.value || "",
						);
						await window.ollama.startServer(
							port,
							users,
							serverApiKeys,
						);
						localStorage.setItem(
							HOST_USERS_KEY,
							JSON.stringify(users),
						);
						localStorage.setItem(
							"host_emails",
							hostEmailsInput?.value || "",
						);
						// Do not store server API keys in localStorage (cleartext secret storage).
						await window.startup.updateSettings({
							proxyPort: port,
							proxyUsers: users,
							serverApiKeys,
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

toolSettings.initializeSettings();
const currentSettings = toolSettings.getSettings();

if (toolWebSearchToggle) {
    (toolWebSearchToggle as any).checked = currentSettings.webSearch;

    toolWebSearchToggle.addEventListener("change", () => {
        const newState = Boolean((toolWebSearchToggle as any).checked);

        const engines = toolSettings.getSettings().searchEngines;

        if (newState && engines.length === 0) {
            showNotification({
                message: "Enable a search engine first.",
                type: "warning",
            });

            (toolWebSearchToggle as any).checked = false;
            return;
        }

        toolSettings.setToolEnabled("webSearch", newState);
    });
}
if (toolImageGenToggle) {
    (toolImageGenToggle as any).checked = currentSettings.imageGen;
    toolImageGenToggle.addEventListener("change", () => {
        const newState = Boolean((toolImageGenToggle as any).checked);
        toolSettings.setToolEnabled("imageGen", newState);
    });
}

if (toolVideoGenToggle) {
    (toolVideoGenToggle as any).checked = currentSettings.videoGen;
    toolVideoGenToggle.addEventListener("change", () => {
        const newState = Boolean((toolVideoGenToggle as any).checked);
        toolSettings.setToolEnabled("videoGen", newState);
    });
}

if (toolAudioGenToggle) {
    (toolAudioGenToggle as any).checked = currentSettings.audioGen;
    toolAudioGenToggle.addEventListener("change", () => {
        const newState = Boolean((toolAudioGenToggle as any).checked);
        toolSettings.setToolEnabled("audioGen", newState);
    });
}

if (searchEngineDuckduckgoCheckbox) {
    searchEngineDuckduckgoCheckbox.checked = currentSettings.searchEngines.includes("duckduckgo");
    searchEngineDuckduckgoCheckbox.addEventListener("change", () => {
        const engines = [
            ...(searchEngineDuckduckgoCheckbox.checked ? ["duckduckgo"] : []),
            ...(searchEngineOllamaCheckbox?.checked ? ["ollama"] : []),
        ];
		if (engines.length === 0) {
			toolSettings.setToolEnabled("webSearch", false);

			if (toolWebSearchToggle) {
				(toolWebSearchToggle as any).checked = false;
			}
		}
        toolSettings.setSearchEngines(engines);
    });
}

if (searchEngineOllamaCheckbox) {
    searchEngineOllamaCheckbox.checked = currentSettings.searchEngines.includes("ollama");
    searchEngineOllamaCheckbox.addEventListener("change", () => {
        const engines = [
            ...(searchEngineDuckduckgoCheckbox?.checked ? ["duckduckgo"] : []),
            ...(searchEngineOllamaCheckbox.checked ? ["ollama"] : []),
        ];
		if (engines.length === 0) {
			toolSettings.setToolEnabled("webSearch", false);

			if (toolWebSearchToggle) {
				(toolWebSearchToggle as any).checked = false;
			}
		}
        toolSettings.setSearchEngines(engines);
    });
}

setHostingUIRunning(false);

document.querySelectorAll('.tab-button').forEach((button) => {
	(button as HTMLButtonElement).addEventListener('click', () => {
		document.querySelectorAll('.tab-button').forEach((btn) => btn.classList.remove('active'));
		document.querySelectorAll('.tab-pane').forEach((pane) => pane.classList.remove('active'));
		
		button.classList.add('active');
		const tabId = (button as HTMLButtonElement).getAttribute('data-tab');
		if (tabId) {
			const pane = document.getElementById(tabId);
			if (pane) pane.classList.add('active');
		}
	});
});

const disengageBtn = document.getElementById("startup-disengage-btn") as HTMLButtonElement | null;
const disengageStatus = document.getElementById("startup-disengage-status") as HTMLParagraphElement | null;

disengageBtn?.addEventListener("click", async () => {
    try {
        const port = startup.uiPort;

        const url = `http://127.0.0.1:${port}/disengage.html`;
        window.utils.web_open(url);

        if (disengageStatus) {
            disengageStatus.textContent = `Opening disengage page on port ${port}…`;
        }
    } catch (err) {
        if (disengageStatus) {
            disengageStatus.textContent = "Could not open disengage page.";
        }
    }
});
