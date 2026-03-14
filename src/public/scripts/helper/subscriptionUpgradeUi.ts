const PLAN_ORDER = ["free", "light", "core", "creator", "professional"] as const;

type UpgradePlanKey = (typeof PLAN_ORDER)[number];

type UpgradeTierView = {
	key?: string;
	name: string;
	url: string;
	price: string;
	limits?: AuthTierLimits;
};

type UpgradeCardOptions = {
	currentPlanKey: string;
	recommendedPlanKey?: string | null;
	allowDirectCheckout: boolean;
};

const LIMIT_LABELS: Array<[keyof AuthTierLimits, string]> = [
	["cloudChatDaily", "Cloud chats / day"],
	["imagesDaily", "Images / day"],
	["videosDaily", "Videos / day"],
	["audioWeekly", "Audio jobs / week"],
];

const PLAN_BENEFIT_COPY: Record<UpgradePlanKey, string[]> = {
	free: [
		"Core local app features",
		"Upgrade anytime when you need more cloud capacity",
	],
	light: [
		"Entry paid tier for regular cloud usage",
		"More room for chat and image workflows",
		"Good fit for lighter personal workloads",
	],
	core: [
		"Balanced daily limits for frequent use",
		"Stronger image, video, and audio allowances",
		"Priority for heavier day-to-day usage",
	],
	creator: [
		"Built for frequent media generation",
		"Higher quotas across image, video, and audio tools",
		"Better fit for creator and production workflows",
	],
	professional: [
		"Highest plan for sustained usage",
		"Best option for advanced workloads or teams",
		"Maximum headroom across cloud generation tools",
	],
};

export const BILLING_PORTAL_URL = "https://sharktide-lightning.hf.space/portal";

let externalUrlHandlerInstalled = false;

export function escapeSubscriptionHtml(value: string): string {
	const map: Record<string, string> = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#039;",
	};
	return String(value ?? "").replace(/[&<>"']/g, (match) => map[match] || match);
}

export function normalizeUpgradePlanKey(planName: string): UpgradePlanKey {
	const direct = (planName || "").trim().toLowerCase();
	if ((PLAN_ORDER as readonly string[]).includes(direct)) {
		return direct as UpgradePlanKey;
	}
	const normalized = (planName || "").toLowerCase().replace(/[^a-z]/g, "");
	if (normalized.includes("professional")) return "professional";
	if (normalized.includes("creator")) return "creator";
	if (normalized.includes("core")) return "core";
	if (normalized.includes("light")) return "light";
	return "free";
}

export function formatSubscriptionPrice(price: string): string | null {
	if (!price || !price.trim()) return null;
	return `$${price.trim()}/mo`;
}

export function installExternalUrlHandler(): void {
	if (externalUrlHandlerInstalled) return;
	document.addEventListener("click", (event) => {
		const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
			"[data-external-url]",
		);
		if (!target) return;
		const url = target.getAttribute("data-external-url");
		if (!url) return;
		event.preventDefault();
		void window.utils.web_open(url);
	});
	externalUrlHandlerInstalled = true;
}

function uniq(values: string[]): string[] {
	const seen = new Set<string>();
	return values.filter((value) => {
		const key = value.trim().toLowerCase();
		if (!key || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function buildLimitBenefits(limits?: AuthTierLimits): string[] {
	if (!limits) return [];
	return LIMIT_LABELS.flatMap(([key, label]) => {
		const value = limits[key];
		if (typeof value === "number") return [`${label}: ${value}`];
		if (value === null) return [`${label}: Unlimited`];
		return [];
	});
}

export function getPlanBenefitItems(tier: UpgradeTierView): string[] {
	const key = normalizeUpgradePlanKey((tier.key as string) || tier.name);
	const limitBenefits = buildLimitBenefits(tier.limits);
	return uniq([...limitBenefits, ...PLAN_BENEFIT_COPY[key]]).slice(0, 4);
}

export function buildUpgradePlanCards(
	tiers: UpgradeTierView[],
	options: UpgradeCardOptions,
): string {
	const cards = tiers
		.filter(
			(tier) =>
				normalizeUpgradePlanKey((tier.key as string) || tier.name) !==
				normalizeUpgradePlanKey(options.currentPlanKey),
		)
		.map((tier) => {
			const tierKey = normalizeUpgradePlanKey((tier.key as string) || tier.name);
			const isRecommended =
				typeof options.recommendedPlanKey === "string" &&
				options.recommendedPlanKey.trim() &&
				normalizeUpgradePlanKey(options.recommendedPlanKey) === tierKey;
			const price = formatSubscriptionPrice(tier.price);
			const benefits = getPlanBenefitItems(tier)
				.map((benefit) => `<li>${escapeSubscriptionHtml(benefit)}</li>`)
				.join("");
			const footer = options.allowDirectCheckout
				? tier.url && tier.url.trim()
					? `<button type="button" class="subscription-card-action" data-external-url="${escapeSubscriptionHtml(tier.url)}">Choose ${escapeSubscriptionHtml(tier.name)}</button>`
					: `<button type="button" class="subscription-card-action" disabled>Checkout unavailable</button>`
				: `<div class="subscription-card-note">Existing subscribers should change to this plan from the Billing Portal.</div>`;
			return `
				<article class="subscription-plan-card${isRecommended ? " is-recommended" : ""}">
					<div class="subscription-plan-card-head">
						<div class="subscription-plan-title">
							<strong class="subscription-plan-name">${escapeSubscriptionHtml(tier.name)}</strong>
							${price ? `<div class="subscription-plan-price">${escapeSubscriptionHtml(price)}</div>` : ""}
						</div>
						${isRecommended ? '<span class="subscription-badge">Recommended</span>' : ""}
					</div>
					<ul class="subscription-benefits">
						${benefits}
					</ul>
					${footer}
				</article>
			`;
		})
		.join("");
	return cards || '<p class="subscription-empty">No upgrade plans are available right now.</p>';
}

export function getSubscriptionManagementCopy(
	isAuthenticated: boolean,
	isPaid: boolean,
	currentPlanName: string,
): string {
	if (!isAuthenticated) {
		return "Sign in first, then choose a paid plan or open the Billing Portal for future changes.";
	}
	if (!isPaid) {
		return `You are on ${currentPlanName}. Choose a paid plan below, then use the Billing Portal for future changes.`;
	}
	return `You are on ${currentPlanName}. Use the Billing Portal to switch plans without starting a second subscription.`;
}

export function getSubscriptionManagementSteps(
	isAuthenticated: boolean,
	isPaid: boolean,
): string[] {
	if (!isAuthenticated) {
		return [
			"Sign in to connect billing actions to your account.",
			"Use See Upgrade Options to start a paid subscription.",
			"After checkout, return here and use the Billing Portal for later plan changes.",
		];
	}
	if (!isPaid) {
		return [
			"Click See Upgrade Options and choose the plan you want.",
			"Stripe will open checkout for the selected subscription.",
			"After purchase, use Open Billing Portal whenever you need to change plans.",
		];
	}
	return [
		"Click Open Billing Portal.",
		"When Stripe opens, select Manage Subscription.",
		"Choose Change plan or Upgrade.",
		"Select the new plan and confirm the update.",
	];
}
