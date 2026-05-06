import { createClient } from "@supabase/supabase-js";
import type {
	AuthChangeEvent,
	Session,
	Subscription,
	SupabaseClient,
} from "@supabase/supabase-js";
import { app, ipcMain, session } from "electron";
import { randomBytes, scryptSync } from "node:crypto";

import fs from "fs";
import path from "path";
import { shell } from "electron";

import type { SessionType } from "./types/index.types.d.ts";
import { broadcastIpcEvent } from "./helper/ipcBridge.js";
import { getLightningClientId } from "./helper/lightningClient.js";

const supabaseKey =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwaXhlaGhkYnR6c2Jja2Zla3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDI0MjcsImV4cCI6MjA3NjcxODQyN30.nR1KCSRQj1E_evQWnE2VaZzg7PgLp2kqt4eDKP2PkpE"; // gitleaks:allow
const supabaseUrl = "https://dpixehhdbtzsbckfektd.supabase.co";
export const supabase = createClient(supabaseUrl, supabaseKey);
const subscriptionApiBase = "https://sharktide-lightning.hf.space";
const subscriptionDetailsUrl = `${subscriptionApiBase}/subscription`;
const subscriptionTiersUrl = `${subscriptionApiBase}/tiers`;
const subscriptionTierConfigUrl = `${subscriptionApiBase}/tier-config`;
const subscriptionUsageUrl = `${subscriptionApiBase}/usage`;
const chatStorageApiBase = "https://sharktide-chat.hf.space/api";
const verifyTokenUsageUrl = `${subscriptionApiBase}/usage/verify-token-with-email`;

type SubscriptionTierView = {
	key?: string;
	name: string;
	url: string;
	price: string;
};

type SubscriptionLimitsView = {
	cloudChatDaily: number | null;
	imagesDaily: number | null;
	videosDaily: number | null;
	audioWeekly: number | null;
};

type SubscriptionTierConfigPlanView = {
	key: string;
	name: string;
	url: string;
	price: string;
	limits: SubscriptionLimitsView;
	order: number;
};

type SubscriptionTierConfigView = {
	defaultPlanKey: string;
	plans: SubscriptionTierConfigPlanView[];
};

type RendererSubscriptionView = {
	planKey: string;
	planName: string;
	isPaid: boolean;
	signedUp: string | null;
	status: string | null;
	tiers: SubscriptionTierView[];
	tierConfig: SubscriptionTierConfigView | null;
	error?: string;
};

type RemoteSubscriptionEntry = {
	status?: unknown;
	product_name?: unknown;
	plan_key?: unknown;
};

type RemoteSubscriptionPayload = {
	email?: unknown;
	signed_up?: unknown;
	plan_key?: unknown;
	plan_name?: unknown;
	subscription?: RemoteSubscriptionEntry[];
};

type UsageMetricKey =
	| "cloudChatDaily"
	| "imagesDaily"
	| "videosDaily"
	| "audioWeekly";

type StandaloneUsageMetricKey =
	| UsageMetricKey
	| "verifyTokenWithEmailDaily";

type RendererUsageMetricView = {
	limit: number | null;
	used: number;
	remaining: number | null;
	window: string;
	period: string;
};

export type RendererUsageView = {
	planKey: string;
	planName: string;
	metrics: Record<UsageMetricKey, RendererUsageMetricView>;
	generatedAt: string | null;
	error?: string;
};

type RendererVerifyTokenUsageView = {
	planKey: string;
	planName: string;
	featureName: string;
	usage: RendererUsageMetricView;
	generatedAt: string | null;
	notice?: string;
	error?: string;
};

type RendererSessionUser = {
	id: string;
	provider: string | null;
};

type RendererSessionView = {
	isAuthenticated: boolean;
	user: RendererSessionUser | null;
	expiresAt: string | null;
};

type RendererProfileView = {
	username: string;
} | null;

type LightningApiKeyRow = {
	id?: unknown;
	name?: unknown;
	key_prefix?: unknown;
	created_at?: unknown;
	last_used_at?: unknown;
	expires_at?: unknown;
	revoked_at?: unknown;
};

type RendererLightningApiKeyView = {
	id: string;
	name: string;
	keyPrefix: string;
	createdAt: string;
	lastUsedAt: string | null;
	expiresAt: string | null;
	revokedAt: string | null;
	isRevoked: boolean;
	isExpired: boolean;
};

type RendererLightningApiKeyCreateResult = {
	apiKey?: RendererLightningApiKeyView;
	rawKey?: string;
	error?: string;
};

export const sessionFile = path.join(app.getPath("userData"), "supabase-session.json");
const profilesFile = path.join(app.getPath("userData"), "profiles.json");

async function restoreSession() {
	if (fs.existsSync(sessionFile)) {
		const session = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
		if (session?.access_token) {
			await supabase.auth.setSession(session);
		}
	}
}

export async function issueProxyToken(): Promise<string> {
	console.log("Issuing Proxy Token");
	const session = await getSession();
	const jwt = session.access_token;

	const res = await fetch(
		"https://dpixehhdbtzsbckfektd.supabase.co/functions/v1/issue-token",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${jwt}`,
				"Content-Type": "application/json",
			},
		},
	);

	if (!res.ok) {
		throw new Error(`Token issue failed: ${res.statusText}`);
	}

	const { token } = await res.json();
	if (!token) throw new Error("No token returned");

	return token;
}

supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
	if (session) {
		fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
	} else {
		if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
	}
});

export async function getSession(): Promise<Session> {
	return supabase.auth.getSession().then(({ data, error }) => {
		if (error) throw error;
		if (!data.session) throw new Error("No session");
		return data.session;
	});
}

function getSessionProvider(session: Session): string | null {
	const providerFromMetadata = session.user?.app_metadata?.provider;
	if (typeof providerFromMetadata === "string" && providerFromMetadata.trim()) {
		return providerFromMetadata.trim();
	}

	const userRecord = session.user as { identities?: Array<{ provider?: string }> };
	const providerFromIdentity = userRecord.identities?.[0]?.provider;
	if (typeof providerFromIdentity === "string" && providerFromIdentity.trim()) {
		return providerFromIdentity.trim();
	}

	return null;
}

function toRendererSession(session: Session | null): RendererSessionView {
	if (!session?.user?.id) {
		return {
			isAuthenticated: false,
			user: null,
			expiresAt: null,
		};
	}

	return {
		isAuthenticated: true,
		user: {
			id: session.user.id,
			provider: getSessionProvider(session),
		},
		expiresAt: session.expires_at
			? new Date(session.expires_at * 1000).toISOString()
			: null,
	};
}

async function getProfileForUser(userId: string | undefined): Promise<RendererProfileView> {
	if (!userId) return null;

	const { data } = await supabase
		.from("profiles")
		.select("username")
		.eq("id", userId)
		.maybeSingle();

	if (!data?.username || typeof data.username !== "string") {
		return null;
	}

	return {
		username: data.username,
	};
}

async function buildRendererSessionPayload(session: Session | null): Promise<{
	session: RendererSessionView;
	profile: RendererProfileView;
}> {
	return {
		session: toRendererSession(session),
		profile: await getProfileForUser(session?.user?.id),
	};
}

function asTrimmedString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeIsoTimestamp(value: unknown): string | null {
	const trimmed = asTrimmedString(value);
	if (!trimmed) return null;
	const parsed = Date.parse(trimmed);
	if (Number.isNaN(parsed)) return null;
	return new Date(parsed).toISOString();
}

function isIsoTimestampExpired(value: string | null): boolean {
	if (!value) return false;
	const expiresAt = Date.parse(value);
	return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function normalizeLightningApiKey(
	value: unknown,
): RendererLightningApiKeyView | null {
	if (!value || typeof value !== "object") return null;
	const row = value as LightningApiKeyRow;
	const id = asTrimmedString(row.id);
	const name = asTrimmedString(row.name);
	const keyPrefix = asTrimmedString(row.key_prefix);
	const createdAt = normalizeIsoTimestamp(row.created_at);
	if (!id || !name || !keyPrefix || !createdAt) return null;

	const lastUsedAt = normalizeIsoTimestamp(row.last_used_at);
	const expiresAt = normalizeIsoTimestamp(row.expires_at);
	const revokedAt = normalizeIsoTimestamp(row.revoked_at);

	return {
		id,
		name,
		keyPrefix,
		createdAt,
		lastUsedAt,
		expiresAt,
		revokedAt,
		isRevoked: revokedAt !== null,
		isExpired: revokedAt === null && isIsoTimestampExpired(expiresAt),
	};
}

async function getAuthenticatedSupabaseClient(): Promise<{
	client: SupabaseClient;
	session: Session;
}> {
	const { data, error } = await supabase.auth.getSession();
	if (error) {
		throw error;
	}
	if (!data.session?.access_token) {
		throw new Error("No active session");
	}

	return {
		session: data.session,
		client: createClient(supabaseUrl, supabaseKey, {
			global: {
				headers: {
					Authorization: `Bearer ${data.session.access_token}`,
				},
			},
		}),
	};
}

function buildLightningApiKeySecret(): string {
	return `ipa_live_${randomBytes(24).toString("base64url")}`;
}

function hashLightningApiKey(secret: string): string {
	const salt = randomBytes(16);
	const derivedKey = scryptSync(secret, salt, 32);
	return `scrypt$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

function buildLightningApiKeyPrefix(secret: string): string {
	return secret.slice(0, 16);
}

function parseLightningApiKeyExpiry(value?: string | null): string | null {
	const trimmed = asTrimmedString(value);
	if (!trimmed) return null;
	const parsed = Date.parse(trimmed);
	if (Number.isNaN(parsed)) {
		throw new Error("Expiration date must be a valid ISO timestamp");
	}
	return new Date(parsed).toISOString();
}

async function listLightningApiKeys(): Promise<RendererLightningApiKeyView[]> {
	const { client } = await getAuthenticatedSupabaseClient();
	const { data, error } = await client
		.from("lightning_api_keys")
		.select("id, name, key_prefix, created_at, last_used_at, expires_at, revoked_at")
		.order("created_at", { ascending: false });

	if (error) {
		throw new Error(error.message);
	}

	return (data || [])
		.map((entry) => normalizeLightningApiKey(entry))
		.filter((entry): entry is RendererLightningApiKeyView => Boolean(entry));
}

function normalizePlanKeyFromName(planName: string | null): string {
	const normalized = (planName || "").toLowerCase().replace(/[^a-z]/g, "");
	if (normalized.includes("professional")) return "professional";
	if (normalized.includes("creator")) return "creator";
	if (normalized.includes("core")) return "core";
	if (normalized.includes("light")) return "light";
	return "free";
}

function normalizeLimitValue(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) return null;
	const rounded = Math.round(n);
	return rounded >= 0 ? rounded : null;
}

function normalizeTier(value: unknown): SubscriptionTierView | null {
	if (!value || typeof value !== "object") return null;
	const asRecord = value as Record<string, unknown>;
	const name = asTrimmedString(asRecord.name);
	if (!name) return null;
	const key = asTrimmedString(asRecord.key);

	return {
		...(key ? { key } : {}),
		name,
		url: asTrimmedString(asRecord.url) ?? "",
		price: asTrimmedString(asRecord.price) ?? "",
	};
}

function normalizeTierConfigPlan(
	value: unknown,
	index: number,
): SubscriptionTierConfigPlanView | null {
	if (!value || typeof value !== "object") return null;
	const asRecord = value as Record<string, unknown>;
	const key = asTrimmedString(asRecord.key)?.toLowerCase();
	const name = asTrimmedString(asRecord.name);
	if (!key || !name) return null;

	const limitsRecord =
		asRecord.limits && typeof asRecord.limits === "object"
			? (asRecord.limits as Record<string, unknown>)
			: {};

	return {
		key,
		name,
		url: asTrimmedString(asRecord.url) ?? "",
		price: asTrimmedString(asRecord.price) ?? "",
		limits: {
			cloudChatDaily: normalizeLimitValue(limitsRecord.cloudChatDaily),
			imagesDaily: normalizeLimitValue(limitsRecord.imagesDaily),
			videosDaily: normalizeLimitValue(limitsRecord.videosDaily),
			audioWeekly: normalizeLimitValue(limitsRecord.audioWeekly),
		},
		order:
			typeof asRecord.order === "number" && Number.isFinite(asRecord.order)
				? Math.round(asRecord.order)
				: index,
	};
}

function normalizeTierConfig(value: unknown): SubscriptionTierConfigView | null {
	if (!value || typeof value !== "object") return null;
	const asRecord = value as Record<string, unknown>;
	const plansRaw = Array.isArray(asRecord.plans) ? asRecord.plans : [];
	const plans = plansRaw
		.map((entry, index) => normalizeTierConfigPlan(entry, index))
		.filter(
			(entry): entry is SubscriptionTierConfigPlanView => Boolean(entry),
		)
		.sort((a, b) => a.order - b.order);
	if (plans.length === 0) return null;
	const defaultPlanKey =
		asTrimmedString(asRecord.defaultPlanKey)?.toLowerCase() ?? "free";
	return {
		defaultPlanKey,
		plans,
	};
}

function defaultUsageMetric(period: string): RendererUsageMetricView {
	return {
		limit: null,
		used: 0,
		remaining: null,
		window: "",
		period,
	};
}

function createUsageFallback(
	tierConfig: SubscriptionTierConfigView | null,
	error?: string,
): RendererUsageView {
	const defaultPlanKey = tierConfig?.defaultPlanKey || "free";
	const planName =
		tierConfig?.plans.find((p) => p.key === defaultPlanKey)?.name || "Free Tier";
	return {
		planKey: defaultPlanKey,
		planName,
		metrics: {
			cloudChatDaily: defaultUsageMetric("daily"),
			imagesDaily: defaultUsageMetric("daily"),
			videosDaily: defaultUsageMetric("daily"),
			audioWeekly: defaultUsageMetric("weekly"),
		},
		generatedAt: null,
		...(error ? { error } : {}),
	};
}

function createVerifyTokenUsageFallback(
	tierConfig: SubscriptionTierConfigView | null,
	error?: string,
): RendererVerifyTokenUsageView {
	const defaultPlanKey = tierConfig?.defaultPlanKey || "free";
	const planName =
		tierConfig?.plans.find((p) => p.key === defaultPlanKey)?.name || "Free Tier";
	return {
		planKey: defaultPlanKey,
		planName,
		featureName: "Token Verification Requests",
		usage: {
			...defaultUsageMetric("daily"),
			limit: 100,
			remaining: 100,
		},
		generatedAt: null,
		notice: "Need more usage? Contact us at inferenceportai@gmail.com.",
		...(error ? { error } : {}),
	};
}

function normalizeUsageMetric(
	value: unknown,
	key: StandaloneUsageMetricKey,
	planLimit: number | null,
): RendererUsageMetricView {
	const fallbackPeriod = key === "audioWeekly" ? "weekly" : "daily";
	if (!value || typeof value !== "object") {
		return {
			...defaultUsageMetric(fallbackPeriod),
			limit: planLimit,
		};
	}

	const asRecord = value as Record<string, unknown>;
	const used = normalizeLimitValue(asRecord.used) ?? 0;
	const remainingRaw = normalizeLimitValue(asRecord.remaining);
	const limit = normalizeLimitValue(asRecord.limit) ?? planLimit;
	const remaining =
		remainingRaw !== null
			? remainingRaw
			: limit === null
				? null
				: Math.max(0, limit - used);
	const window = asTrimmedString(asRecord.window) ?? "";
	const period = asTrimmedString(asRecord.period) ?? fallbackPeriod;

	return {
		limit,
		used,
		remaining,
		window,
		period,
	};
}

function normalizeVerifyTokenUsageView(
	value: unknown,
	tierConfig: SubscriptionTierConfigView | null,
): RendererVerifyTokenUsageView | null {
	if (!value || typeof value !== "object") return null;
	const asRecord = value as Record<string, unknown>;
	const tierMap = new Map((tierConfig?.plans || []).map((plan) => [plan.key, plan]));
	const payloadPlanKey = asTrimmedString(asRecord.plan_key)?.toLowerCase();
	let planKey =
		payloadPlanKey && tierMap.has(payloadPlanKey)
			? payloadPlanKey
			: normalizePlanKeyFromName(asTrimmedString(asRecord.plan_name));
	if (tierMap.size > 0 && !tierMap.has(planKey)) {
		planKey = tierConfig?.defaultPlanKey || "free";
	}
	const planName =
		tierMap.get(planKey)?.name ||
		asTrimmedString(asRecord.plan_name) ||
		"Free Tier";
	const usage = normalizeUsageMetric(
		asRecord.usage,
		"verifyTokenWithEmailDaily",
		100,
	);

	return {
		planKey,
		planName,
		featureName:
			asTrimmedString(asRecord.feature_name) || "Token Verification Requests",
		usage,
		generatedAt: asTrimmedString(asRecord.generated_at),
		notice:
			asTrimmedString(asRecord.notice) ||
			"Need more usage? Contact us at inferenceportai@gmail.com.",
		...(asTrimmedString(asRecord.error)
			? { error: asTrimmedString(asRecord.error)! }
			: {}),
	};
}

function normalizeUsageView(
	value: unknown,
	tierConfig: SubscriptionTierConfigView | null,
): RendererUsageView | null {
	if (!value || typeof value !== "object") return null;
	const asRecord = value as Record<string, unknown>;
	const tierMap = new Map((tierConfig?.plans || []).map((plan) => [plan.key, plan]));
	const payloadPlanKey = asTrimmedString(asRecord.plan_key)?.toLowerCase();
	let planKey =
		payloadPlanKey && tierMap.has(payloadPlanKey)
			? payloadPlanKey
			: normalizePlanKeyFromName(asTrimmedString(asRecord.plan_name));
	if (tierMap.size > 0 && !tierMap.has(planKey)) {
		planKey = tierConfig?.defaultPlanKey || "free";
	}
	const planName =
		tierMap.get(planKey)?.name ||
		asTrimmedString(asRecord.plan_name) ||
		"Free Tier";
	const usageRecord =
		asRecord.usage && typeof asRecord.usage === "object"
			? (asRecord.usage as Record<string, unknown>)
			: {};
	const planLimits = tierMap.get(planKey)?.limits;

	const metrics = {
		cloudChatDaily: normalizeUsageMetric(
			usageRecord.cloudChatDaily,
			"cloudChatDaily",
			planLimits?.cloudChatDaily ?? null,
		),
		imagesDaily: normalizeUsageMetric(
			usageRecord.imagesDaily,
			"imagesDaily",
			planLimits?.imagesDaily ?? null,
		),
		videosDaily: normalizeUsageMetric(
			usageRecord.videosDaily,
			"videosDaily",
			planLimits?.videosDaily ?? null,
		),
		audioWeekly: normalizeUsageMetric(
			usageRecord.audioWeekly,
			"audioWeekly",
			planLimits?.audioWeekly ?? null,
		),
	};

	return {
		planKey,
		planName,
		metrics,
		generatedAt: asTrimmedString(asRecord.generated_at),
	};
}

const TIER_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const tierConfigCache: {
	value: SubscriptionTierConfigView | null;
	expiresAt: number;
} = {
	value: null,
	expiresAt: 0,
};

async function getSubscriptionTierConfigSafe(
	force = false,
): Promise<SubscriptionTierConfigView | null> {
	const now = Date.now();
	if (
		!force &&
		tierConfigCache.value &&
		tierConfigCache.expiresAt > now
	) {
		return tierConfigCache.value;
	}

	try {
		const res = await fetch(subscriptionTierConfigUrl, {
			headers: {
				Accept: "application/json",
			},
		});
		if (!res.ok) {
			return tierConfigCache.value;
		}

		const payload = await res.json();
		const normalized = normalizeTierConfig(payload);
		if (!normalized) return tierConfigCache.value;

		tierConfigCache.value = normalized;
		tierConfigCache.expiresAt = now + TIER_CONFIG_CACHE_TTL_MS;
		return normalized;
	} catch (_err) {
		return tierConfigCache.value;
	}
}

function getTiersFromConfig(
	config: SubscriptionTierConfigView | null,
): SubscriptionTierView[] {
	if (!config?.plans?.length) return [];
	return config.plans
		.filter((plan) => plan.key !== config.defaultPlanKey)
		.map((plan) => ({
			key: plan.key,
			name: plan.name,
			url: plan.url,
			price: plan.price,
		}));
}

async function getSubscriptionTiersSafe(): Promise<SubscriptionTierView[]> {
	const tierConfig = await getSubscriptionTierConfigSafe();
	const fromConfig = getTiersFromConfig(tierConfig);
	if (fromConfig.length > 0) return fromConfig;

	try {
		const res = await fetch(subscriptionTiersUrl, {
			headers: {
				Accept: "application/json",
			},
		});

		if (!res.ok) {
			return [];
		}

		const payload = await res.json();
		if (!Array.isArray(payload)) return [];
		return payload
			.map((entry) => normalizeTier(entry))
			.filter((entry): entry is SubscriptionTierView => Boolean(entry));
	} catch (_err) {
		return [];
	}
}

async function getUsageSafe(
	tierConfig: SubscriptionTierConfigView | null,
): Promise<RendererUsageView> {
	const fallback = createUsageFallback(tierConfig);
	let accessToken: string | null = null;
	try {
		const { data, error } = await supabase.auth.getSession();
		if (!error && data.session?.access_token) {
			accessToken = data.session.access_token;
		}
	} catch (_err) {
		void 0;
	}

	let clientId = "";
	try {
		clientId = await getLightningClientId();
	} catch (_err) {
		void 0;
	}

	const makeHeaders = (includeAuth: boolean): Record<string, string> => {
		const headers: Record<string, string> = {
			Accept: "application/json",
		};
		if (clientId) {
			headers["X-Client-ID"] = clientId;
		}
		if (includeAuth && accessToken) {
			headers.Authorization = `Bearer ${accessToken}`;
		}
		return headers;
	};

	try {
		let res = await fetch(subscriptionUsageUrl, {
			headers: makeHeaders(Boolean(accessToken)),
		});

		if ((res.status === 401 || res.status === 403) && accessToken) {
			res = await fetch(subscriptionUsageUrl, {
				headers: makeHeaders(false),
			});
		}

		if (!res.ok) {
			return {
				...fallback,
				error: `Usage lookup failed (${res.status})`,
			};
		}

		const payload = await res.json();
		const normalized = normalizeUsageView(payload, tierConfig);
		if (!normalized) {
			return {
				...fallback,
				error: "Usage payload invalid",
			};
		}
		return normalized;
	} catch (err) {
		return {
			...fallback,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

async function getVerifyTokenUsageSafe(
	tierConfig: SubscriptionTierConfigView | null,
): Promise<RendererVerifyTokenUsageView> {
	const fallback = createVerifyTokenUsageFallback(tierConfig);
	let accessToken: string | null = null;
	try {
		const { data, error } = await supabase.auth.getSession();
		if (!error && data.session?.access_token) {
			accessToken = data.session.access_token;
		}
	} catch (_err) {
		void 0;
	}

	const makeHeaders = (includeAuth: boolean): Record<string, string> => {
		const headers: Record<string, string> = {
			Accept: "application/json",
		};
		if (includeAuth && accessToken) {
			headers.Authorization = `Bearer ${accessToken}`;
		}
		return headers;
	};

	try {
		let res = await fetch(verifyTokenUsageUrl, {
			headers: makeHeaders(Boolean(accessToken)),
		});

		if ((res.status === 401 || res.status === 403) && accessToken) {
			res = await fetch(verifyTokenUsageUrl, {
				headers: makeHeaders(false),
			});
		}

		if (!res.ok) {
			return {
				...fallback,
				error: `Usage lookup failed (${res.status})`,
			};
		}

		const payload = await res.json();
		const normalized = normalizeVerifyTokenUsageView(payload, tierConfig);
		if (!normalized) {
			return {
				...fallback,
				error: "Usage payload invalid",
			};
		}
		return normalized;
	} catch (err) {
		return {
			...fallback,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

function toSubscriptionView(
	payload: RemoteSubscriptionPayload | null,
	tiers: SubscriptionTierView[],
	tierConfig: SubscriptionTierConfigView | null,
): RendererSubscriptionView {
	const subscriptionEntries = Array.isArray(payload?.subscription)
		? payload.subscription
		: [];

	const preferredEntry =
		subscriptionEntries.find((entry) => {
			const status = asTrimmedString(entry?.status)?.toLowerCase();
			return status === "active" || status === "trialing";
		}) ?? subscriptionEntries[0];

	const tierMap = new Map(
		(tierConfig?.plans || []).map((plan) => [plan.key, plan]),
	);
	const payloadPlanKey =
		asTrimmedString(preferredEntry?.plan_key)?.toLowerCase() ??
		asTrimmedString(payload?.plan_key)?.toLowerCase();
	let planKey =
		payloadPlanKey && tierMap.has(payloadPlanKey)
			? payloadPlanKey
			: normalizePlanKeyFromName(
					asTrimmedString(preferredEntry?.product_name) ??
						asTrimmedString(payload?.plan_name),
				);
	if (tierMap.size > 0 && !tierMap.has(planKey)) {
		planKey = tierConfig?.defaultPlanKey || "free";
	}
	const fallbackPlanName =
		tierMap.get(planKey)?.name ??
		asTrimmedString(preferredEntry?.product_name) ??
		"Free Tier";
	const planName = fallbackPlanName;
	const status = asTrimmedString(preferredEntry?.status);
	const email = asTrimmedString(payload?.email);
	const signedUp = asTrimmedString(payload?.signed_up);
	const defaultPlanKey = tierConfig?.defaultPlanKey || "free";

	return {
		planKey,
		planName,
		isPaid: planKey !== defaultPlanKey,
		signedUp,
		status,
		tiers,
		tierConfig,
	};
}

void getSubscriptionTierConfigSafe();

async function parseJsonSafe(response: Response): Promise<any> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

function normalizeRemoteSessionForSync(
	value: unknown,
): (SessionType & { remoteId: string; created?: number }) | null {
	if (!value || typeof value !== "object") return null;
	const asRecord = value as Record<string, unknown>;
	const id = asTrimmedString(asRecord.id);
	if (!id) return null;

	const clone = <T>(input: T): T => structuredClone(input) as T;
	const applyActiveVersion = (message: Record<string, unknown>): Record<string, unknown> => {
		const msg = clone(message);
		const versions = Array.isArray(msg.versions)
			? (msg.versions as Array<Record<string, unknown>>)
			: [];
		if (!versions.length) {
			msg.versions = [
				{
					content: msg.content ?? "",
					tail: [],
					timestamp: Date.now(),
				},
			];
			msg.currentVersionIdx = 0;
			return msg;
		}
		const rawIndex =
			typeof msg.currentVersionIdx === "number" &&
			Number.isFinite(msg.currentVersionIdx)
				? Math.round(msg.currentVersionIdx)
				: 0;
		const index = Math.max(0, Math.min(rawIndex, versions.length - 1));
		msg.currentVersionIdx = index;
		const current = versions[index] || {};
		if (!Array.isArray(current.tail)) current.tail = [];
			if (typeof current.content === "undefined" || current.content === null) {
				current.content = msg.content ?? "";
			}
			versions[index] = current;
		msg.versions = versions;
		msg.content = current.content;
		const toolCalls =
			Array.isArray(current.tool_calls) || Array.isArray(current.toolCalls)
				? ((current.tool_calls || current.toolCalls) as unknown[])
				: Array.isArray(msg.tool_calls) || Array.isArray(msg.toolCalls)
					? ((msg.tool_calls || msg.toolCalls) as unknown[])
					: [];
		if (toolCalls.length > 0) {
			current.tool_calls = clone(toolCalls);
			current.toolCalls = clone(toolCalls);
			msg.tool_calls = clone(toolCalls);
			msg.toolCalls = clone(toolCalls);
		} else {
			delete current.tool_calls;
			delete current.toolCalls;
			delete msg.tool_calls;
			delete msg.toolCalls;
		}
		if (!msg.id) {
			msg.id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
		}
		if (
			typeof msg.timestamp !== "number" ||
			!Number.isFinite(msg.timestamp)
		) {
			msg.timestamp = Date.now();
		}
		return msg;
	};
	const normalizeTreeNode = (node: Record<string, unknown>): Record<string, unknown> => {
		const synced = applyActiveVersion(node);
		const versions = Array.isArray(synced.versions)
			? (synced.versions as Array<Record<string, unknown>>)
			: [];
		const idx =
			typeof synced.currentVersionIdx === "number"
				? Math.max(0, Math.min(Math.round(synced.currentVersionIdx), versions.length - 1))
				: 0;
		const active = versions[idx] || {};
		const rawTail = Array.isArray(active.tail) ? active.tail : [];
		const normalizedTail = rawTail
			.filter((tailNode) => tailNode && typeof tailNode === "object")
			.map((tailNode) => normalizeTreeNode(tailNode as Record<string, unknown>));
		active.tail = normalizedTail;
		versions[idx] = active;
		synced.versions = versions;
		synced.content = active.content;
		return synced;
	};
	const toTreeHistory = (rawHistory: unknown[]): unknown[] => {
		if (!Array.isArray(rawHistory) || rawHistory.length === 0) return [];
		const looksTree =
			rawHistory.length === 1 &&
			rawHistory[0] &&
			typeof rawHistory[0] === "object" &&
			Array.isArray((rawHistory[0] as Record<string, unknown>).versions);
		if (looksTree) {
			return [normalizeTreeNode(rawHistory[0] as Record<string, unknown>)];
		}
		const nodes = rawHistory
			.filter((entry) => entry && typeof entry === "object")
			.filter((entry, index, arr) => {
				const id = asTrimmedString((entry as Record<string, unknown>)?.id);
				if (!id) return true;
				for (let i = 0; i < index; i++) {
					const prior = arr[i] as Record<string, unknown> | undefined;
					if (asTrimmedString(prior?.id) === id) return false;
				}
				return true;
			})
			.map((entry) => applyActiveVersion(entry as Record<string, unknown>));
		if (!nodes.length) return [];
		const root = nodes[0];
		if (!root) return [];
		for (let i = 1; i < nodes.length; i++) {
			const next = nodes[i];
			if (!next) continue;
			const versions = Array.isArray(root.versions)
				? (root.versions as Array<Record<string, unknown>>)
				: [];
			const idx =
				typeof root.currentVersionIdx === "number"
					? Math.max(0, Math.min(Math.round(root.currentVersionIdx), versions.length - 1))
					: 0;
			const active = versions[idx] || {};
			const tail = Array.isArray(active.tail) ? active.tail : [];
			active.tail = [...tail, next];
			versions[idx] = active;
			root.versions = versions;
		}
		return [normalizeTreeNode(root)];
	};
	const historyRaw = Array.isArray(asRecord.history) ? asRecord.history : [];
	const history = toTreeHistory(historyRaw);
	const created =
		typeof asRecord.created === "number" && Number.isFinite(asRecord.created)
			? Math.round(asRecord.created)
			: undefined;
	const updatedAt = asTrimmedString(asRecord.updatedAt);

	return {
		name: asTrimmedString(asRecord.name) ?? "New Chat",
		model: asTrimmedString(asRecord.model) ?? "",
		favorite: false,
		history: history as SessionType["history"],
		remoteId: id,
		...(typeof created === "number" ? { created } : {}),
		...(updatedAt ? { updatedAt } : {}),
	};
}

function normalizeRemoteIdFromLocalSession(
	_localId: string,
	session: SessionType,
): string | null {
	if (!session || typeof session !== "object") return null;
	const fromSession = asTrimmedString((session as Record<string, unknown>).remoteId);
	if (fromSession) return fromSession;
	return null;
}

type ChatStorageAuthContext = {
	accessToken: string;
	authHeaders: Record<string, string>;
};

function toChatStorageError(
	payload: unknown,
	status: number,
	fallback: string,
): string {
	if (!payload || typeof payload !== "object") {
		return `${fallback} (${status})`;
	}
	const asRecord = payload as Record<string, unknown>;
	return (
		asTrimmedString(asRecord.message) ||
		asTrimmedString(asRecord.error) ||
		`${fallback} (${status})`
	);
}

async function getChatStorageAuthContext(): Promise<
	| { ok: true; value: ChatStorageAuthContext }
	| { ok: false; error: string }
> {
	const { data: sessionData, error: sessionError } =
		await supabase.auth.getSession();
	if (sessionError || !sessionData.session?.access_token) {
		return { ok: false, error: "Not authenticated" };
	}

	const accessToken = sessionData.session.access_token;
	return {
		ok: true,
		value: {
			accessToken,
			authHeaders: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
				"Content-Type": "application/json",
			},
		},
	};
}

function normalizeMediaView(value: unknown): "all" | "active" | "trash" {
	const normalized = String(value || "active").trim().toLowerCase();
	if (normalized === "all" || normalized === "trash") return normalized;
	return "active";
}

function normalizeParentId(value: unknown): string | null {
	return asTrimmedString(value);
}

function buildMediaBreadcrumbs(
	allItems: Array<Record<string, unknown>>,
	parentId: string | null,
): Array<{ id: string; name: string }> {
	if (!parentId) return [];
	const itemById = new Map<string, Record<string, unknown>>();
	for (const item of allItems) {
		const id = asTrimmedString(item?.id);
		if (!id) continue;
		itemById.set(id, item);
	}
	const breadcrumbs: Array<{ id: string; name: string }> = [];
	const seen = new Set<string>();
	let cursor: string | null = parentId;
	while (cursor && !seen.has(cursor)) {
		seen.add(cursor);
		const item = itemById.get(cursor);
		if (!item) break;
		const id = asTrimmedString(item.id);
		const name = asTrimmedString(item.name);
		if (!id || !name) break;
		breadcrumbs.unshift({ id, name });
		cursor = asTrimmedString(item.parentId);
	}
	return breadcrumbs;
}

export default function register() {
	ipcMain.handle("auth:signInWithGitHub", async () => {
		const authUrl =
			`${supabaseUrl}/auth/v1/authorize` +
			`?provider=github` +
			`&redirect_to=https://inference.js.org/authcallback.html`;

		await shell.openExternal(authUrl);
		return { success: true };
	});
	ipcMain.handle("auth:signInWithGoogle", async () => {
		const authUrl =
			`${supabaseUrl}/auth/v1/authorize` +
			`?provider=google` +
			`&redirect_to=https://inference.js.org/authcallback.html`;
		await shell.openExternal(authUrl);
		return { success: true };
	});
	ipcMain.handle("auth:signInWithEmail", async (_event, email, password) => {
		const { data, error } = await supabase.auth.signInWithPassword({
			email,
			password,
		});
		if (error) {
			return {
				error: error.message,
				session: toRendererSession(null),
				profile: null,
			};
		}
		return await buildRendererSessionPayload(data.session);
	});

	ipcMain.handle("auth:signUpWithEmail", async (_event, email, password) => {
		const { data, error } = await supabase.auth.signUp({ email, password });
		if (error) return { error: error.message };
		return { success: true, userId: data.user?.id || null };
	});

	ipcMain.handle("auth:signOut", async () => {
		const { error } = await supabase.auth.signOut();
		if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
		if (error) return { error: error.message };
		return { success: true };
	});

	ipcMain.handle("auth:getSession", async () => {
		const { data, error } = await supabase.auth.getSession();
		if (error) {
			return {
				error: error.message,
				session: toRendererSession(null),
				profile: null,
			};
		}

		return await buildRendererSessionPayload(data.session);
	});

	ipcMain.handle("auth:getSubscriptionTiers", async () => {
		return await getSubscriptionTiersSafe();
	});

	ipcMain.handle("auth:getTierConfig", async () => {
		return await getSubscriptionTierConfigSafe();
	});

	ipcMain.handle("auth:getUsage", async () => {
		const tierConfig = await getSubscriptionTierConfigSafe();
		return await getUsageSafe(tierConfig);
	});

	ipcMain.handle("auth:getVerifyTokenUsage", async () => {
		const tierConfig = await getSubscriptionTierConfigSafe();
		return await getVerifyTokenUsageSafe(tierConfig);
	});

	ipcMain.handle("auth:getSubscriptionInfo", async () => {
		const tierConfig = await getSubscriptionTierConfigSafe();
		const tiers = await getSubscriptionTiersSafe();
		const defaultPlanKey = tierConfig?.defaultPlanKey || "free";
		const defaultPlanName =
			tierConfig?.plans.find((p) => p.key === defaultPlanKey)?.name ||
			"Free Tier";
		const fallback: RendererSubscriptionView = {
			planKey: defaultPlanKey,
			planName: defaultPlanName,
			isPaid: false,
			signedUp: null,
			status: null,
			tiers,
			tierConfig,
		};

		try {
			const { data, error } = await supabase.auth.getSession();
			if (error || !data.session?.access_token) {
				return {
					...fallback,
					...(error ? { error: error.message } : {}),
				};
			}

			const res = await fetch(subscriptionDetailsUrl, {
				headers: {
					Authorization: `Bearer ${data.session.access_token}`,
					Accept: "application/json",
				},
			});

			// Free tier users may not have a subscription payload.
			if (res.status === 401 || res.status === 403 || res.status === 404) {
				return fallback;
			}

			if (!res.ok) {
				return {
					...fallback,
					error: `Subscription lookup failed (${res.status})`,
				};
			}

			const payload = (await res.json()) as RemoteSubscriptionPayload;
			return toSubscriptionView(payload, tiers, tierConfig);
		} catch (err) {
			return {
				...fallback,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	});

	ipcMain.handle("auth:listLightningApiKeys", async () => {
		try {
			return await listLightningApiKeys();
		} catch (error) {
			throw new Error(
				error instanceof Error ? error.message : String(error),
			);
		}
	});

	ipcMain.handle(
		"auth:createLightningApiKey",
		async (_event, name: string, expiresAt?: string | null) => {
			const normalizedName = asTrimmedString(name);
			if (!normalizedName) {
				return { error: "API key name is required" };
			}
			if (normalizedName.length > 64) {
				return { error: "API key name must be 64 characters or fewer" };
			}

			try {
				const parsedExpiresAt = parseLightningApiKeyExpiry(expiresAt);
				const { client, session } = await getAuthenticatedSupabaseClient();
				const rawKey = buildLightningApiKeySecret();
				const keyHash = hashLightningApiKey(rawKey);
				const keyPrefix = buildLightningApiKeyPrefix(rawKey);

				const { data, error } = await client
					.from("lightning_api_keys")
					.insert({
						user_id: session.user.id,
						name: normalizedName,
						key_hash: keyHash,
						key_prefix: keyPrefix,
						expires_at: parsedExpiresAt,
					})
					.select(
						"id, name, key_prefix, created_at, last_used_at, expires_at, revoked_at",
					)
					.single();

				if (error) {
					return { error: error.message };
				}

				const normalized = normalizeLightningApiKey(data);
				if (!normalized) {
					return { error: "Created API key response was invalid" };
				}

				const result: RendererLightningApiKeyCreateResult = {
					apiKey: normalized,
					rawKey,
				};
				return result;
			} catch (error) {
				return {
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	ipcMain.handle(
		"auth:revokeLightningApiKey",
		async (_event, keyId: string) => {
			const normalizedKeyId = asTrimmedString(keyId);
			if (!normalizedKeyId) {
				return { error: "API key id is required" };
			}

			try {
				const { client } = await getAuthenticatedSupabaseClient();
				const { data, error } = await client
					.from("lightning_api_keys")
					.update({ revoked_at: new Date().toISOString() })
					.eq("id", normalizedKeyId)
					.is("revoked_at", null)
					.select(
						"id, name, key_prefix, created_at, last_used_at, expires_at, revoked_at",
					)
					.maybeSingle();

				if (error) {
					return { error: error.message };
				}
				if (!data) {
					return { error: "API key not found or already revoked" };
				}

				const normalized = normalizeLightningApiKey(data);
				if (!normalized) {
					return { error: "Updated API key response was invalid" };
				}

				return { success: true, apiKey: normalized };
			} catch (error) {
				return {
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	ipcMain.handle(
		"auth:setSessionTokens",
		async (_event, accessToken: string, refreshToken: string) => {
			if (!accessToken || !refreshToken) {
				return {
					error: "Missing access or refresh token",
					session: toRendererSession(null),
					profile: null,
				};
			}

			const { data: setData, error: setError } =
				await supabase.auth.setSession({
					access_token: accessToken,
					refresh_token: refreshToken,
				});

			if (setError) {
				return {
					error: setError.message,
					session: toRendererSession(null),
					profile: null,
				};
			}

			return await buildRendererSessionPayload(setData.session);
		},
	);

	ipcMain.handle(
		"auth:setUsername",
		async (_event, userId: string, username: string) => {
			if (!userId || !username)
				return { error: "Missing userId or username" };

			let authedClient: SupabaseClient;
			try {
				({ client: authedClient } = await getAuthenticatedSupabaseClient());
			} catch (error) {
				return {
					error: error instanceof Error ? error.message : String(error),
				};
			}

			const { data: existing, error: checkError } = await authedClient
				.from("profiles")
				.select("id")
				.eq("username", username)
				.maybeSingle();

			if (checkError) return { error: checkError.message };
			if (existing) return { error: "Username already taken" };

			const { data, error } = await authedClient
				.from("profiles")
				.upsert({ id: userId, username }, { onConflict: "id" })
				.select()
				.single();

			if (error) return { error: error.message };
			return { success: true, profile: data };
		}
	);

	let authStateChangeUnsubscribe: { subscription: Subscription } | null = null;

	ipcMain.handle("auth:onAuthStateChange", (event) => {
		if (authStateChangeUnsubscribe) {
			authStateChangeUnsubscribe.subscription.unsubscribe();
		}

		authStateChangeUnsubscribe = supabase.auth.onAuthStateChange(
			(_eventType: AuthChangeEvent, session: Session | null) => {
				broadcastIpcEvent("auth:stateChanged", toRendererSession(session));
			}
		).data;

		return { success: true };
	});

	ipcMain.on("destroy", () => {
		if (authStateChangeUnsubscribe) {
			authStateChangeUnsubscribe.subscription.unsubscribe();
			authStateChangeUnsubscribe = null;
		}
	});

	ipcMain.handle("auth:resetPassword", async (_event, email: string) => {
		if (!email) return { error: "Email is required" };

		const { data, error } = await supabase.auth.resetPasswordForEmail(
			email,
			{
				redirectTo: "https://inferenceportai.vercel.app/reset.html",
			}
		);

		if (error) return { error: error.message };
		return { success: true };
	});

	// --- CHAT SYNC API ------------------------------------------------------
	ipcMain.handle("sync:getRemoteSessions", async (_event) => {
		const { data: sessionData, error: sessionError } =
			await supabase.auth.getSession();
		if (sessionError || !sessionData.session?.access_token) {
			return { error: "Not authenticated" };
		}

		const res = await fetch(`${chatStorageApiBase}/db/chats?includeHistory=1`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${sessionData.session.access_token}`,
				Accept: "application/json",
			},
		});
		const payload = await parseJsonSafe(res);
		if (!res.ok) {
			return {
				error:
					asTrimmedString(payload?.message) ||
					asTrimmedString(payload?.error) ||
					`Remote session fetch failed (${res.status})`,
			};
		}

		const out: Record<string, SessionType> = {};
		const items = Array.isArray(payload?.items) ? payload.items : [];
		for (const item of items) {
			const normalized = normalizeRemoteSessionForSync(item);
			if (!normalized) continue;
			out[normalized.remoteId] = normalized;
		}

		return { sessions: out };
	});

	ipcMain.handle(
		"sync:saveAllSessions",
		async (_event, allSessions: Record<string, SessionType>) => {
			if (!allSessions || typeof allSessions !== "object") {
				return {
					error: `Invalid allSessions payload ${allSessions} ${typeof allSessions}`,
				};
			}

			const { data: sessionData, error: sessionError } =
				await supabase.auth.getSession();
			if (sessionError || !sessionData.session?.access_token) {
				return { error: "Not authenticated" };
			}

			const authHeaders = {
				Authorization: `Bearer ${sessionData.session.access_token}`,
				Accept: "application/json",
				"Content-Type": "application/json",
			};

			const listRes = await fetch(
				`${chatStorageApiBase}/db/chats?includeHistory=0`,
				{
					method: "GET",
					headers: authHeaders,
				},
			);
			const listPayload = await parseJsonSafe(listRes);
			if (!listRes.ok) {
				return {
					error:
						asTrimmedString(listPayload?.message) ||
						asTrimmedString(listPayload?.error) ||
						`Remote session list failed (${listRes.status})`,
				};
			}

			const remoteItems = Array.isArray(listPayload?.items)
				? listPayload.items
				: [];
			const remoteIds = new Set<string>();
			const remoteIdMap: Record<string, string> = {};
			for (const item of remoteItems) {
				const id = asTrimmedString((item as Record<string, unknown>)?.id);
				if (id) remoteIds.add(id);
			}

				const referencedRemoteIds = new Set<string>();
				for (const [localId, localSession] of Object.entries(allSessions)) {
					const remoteId =
						normalizeRemoteIdFromLocalSession(localId, localSession) ||
						(remoteIds.has(localId) ? localId : null);
					if (remoteId) referencedRemoteIds.add(remoteId);
				}

			for (const remoteId of remoteIds) {
				if (referencedRemoteIds.has(remoteId)) continue;
				const deleteRes = await fetch(
					`${chatStorageApiBase}/db/chats/${encodeURIComponent(remoteId)}`,
					{
						method: "DELETE",
						headers: authHeaders,
					},
				);
				if (!deleteRes.ok && deleteRes.status !== 404) {
					const deletePayload = await parseJsonSafe(deleteRes);
					return {
						error:
							asTrimmedString(deletePayload?.message) ||
							asTrimmedString(deletePayload?.error) ||
							`Remote session delete failed (${deleteRes.status})`,
					};
				}
			}

			for (const [localId, localSession] of Object.entries(allSessions)) {
					const localRecord = localSession as Record<string, unknown>;
					const normalizeLocalHistoryToTree = (history: unknown): Record<string, unknown>[] => {
						const rawHistory = Array.isArray(history) ? history : [];
						if (!rawHistory.length) return [];
						const isInlineMediaSource = (value: unknown): boolean => {
							if (typeof value !== "string") return false;
							const v = value.trim();
							return (
								v.startsWith("data:") ||
								v.startsWith("blob:") ||
								v.startsWith("http://") ||
								v.startsWith("https://")
							);
						};
						const normalizeMediaContent = (
							role: unknown,
							content: unknown,
							mimeType: unknown,
							name: unknown,
						): unknown => {
							const roleName = asTrimmedString(role);
							const mediaRole = roleName === "image" || roleName === "video" || roleName === "audio";
							if (!mediaRole) return content;
							if (typeof content === "string") {
								const trimmed = content.trim();
								if (!trimmed || isInlineMediaSource(trimmed)) return content;
								const fallbackMimeType =
									roleName === "image"
										? "image/png"
										: roleName === "video"
											? "video/mp4"
											: "audio/mpeg";
								return {
									assetId: trimmed,
									mimeType: asTrimmedString(mimeType) || fallbackMimeType,
									name: asTrimmedString(name) || `${roleName}`,
								};
							}
							if (content && typeof content === "object") {
								const asRec = content as Record<string, unknown>;
								const assetId = asTrimmedString(asRec.assetId) || asTrimmedString(asRec.id);
								if (!assetId) return content;
								const fallbackMimeType =
									roleName === "image"
										? "image/png"
										: roleName === "video"
											? "video/mp4"
											: "audio/mpeg";
								return {
									...asRec,
									assetId,
									mimeType: asTrimmedString(asRec.mimeType) || asTrimmedString(mimeType) || fallbackMimeType,
									name: asTrimmedString(asRec.name) || asTrimmedString(name) || `${roleName}`,
								};
							}
							return content;
						};
						const first = rawHistory[0];
						const looksTree =
							rawHistory.length === 1 &&
							first &&
							typeof first === "object" &&
							Array.isArray((first as Record<string, unknown>).versions);
						if (looksTree) {
							return [structuredClone(first) as Record<string, unknown>];
						}
						const normalizedNodes = rawHistory
							.filter((entry) => entry && typeof entry === "object")
							.filter((entry, index, arr) => {
								const id = asTrimmedString(
									(entry as Record<string, unknown>)?.id,
								);
								if (!id) return true;
								for (let i = 0; i < index; i++) {
									const prior = arr[i] as Record<string, unknown> | undefined;
									if (asTrimmedString(prior?.id) === id) return false;
								}
								return true;
							})
							.map((entry) => {
								const msg = structuredClone(entry) as Record<string, unknown>;
								const versions = Array.isArray(msg.versions)
									? (msg.versions as Array<Record<string, unknown>>)
									: [];
								if (!versions.length) {
									msg.versions = [{
										content: msg.content ?? "",
										tail: [],
										timestamp:
											typeof msg.timestamp === "number" && Number.isFinite(msg.timestamp)
												? msg.timestamp
												: Date.now(),
									}];
									msg.currentVersionIdx = 0;
								}
								const idx =
									typeof msg.currentVersionIdx === "number" &&
									Number.isFinite(msg.currentVersionIdx)
										? Math.max(
											0,
											Math.min(Math.round(msg.currentVersionIdx), versions.length - 1),
										)
										: 0;
								msg.currentVersionIdx = idx;
								const active = (msg.versions as Array<Record<string, unknown>>)[idx] || {};
								active.tail = [];
								if (active.content === undefined || active.content === null) {
									active.content = msg.content ?? "";
								}
								const toolCalls =
									Array.isArray(active.tool_calls) || Array.isArray(active.toolCalls)
										? ((active.tool_calls || active.toolCalls) as unknown[])
										: Array.isArray(msg.tool_calls) || Array.isArray(msg.toolCalls)
											? ((msg.tool_calls || msg.toolCalls) as unknown[])
											: [];
								if (toolCalls.length > 0) {
									active.tool_calls = structuredClone(toolCalls);
									active.toolCalls = structuredClone(toolCalls);
									msg.tool_calls = structuredClone(toolCalls);
									msg.toolCalls = structuredClone(toolCalls);
								} else {
									delete active.tool_calls;
									delete active.toolCalls;
									delete msg.tool_calls;
									delete msg.toolCalls;
								}
								(msg.versions as Array<Record<string, unknown>>)[idx] = active;
								msg.content = normalizeMediaContent(
									msg.role,
									active.content,
									msg.mimeType,
									msg.name,
								);
								active.content = msg.content;
								return msg;
							});
						if (!normalizedNodes.length) return [];
						const root = normalizedNodes[0] as Record<string, unknown>;
						let cursor = root;
						for (let i = 1; i < normalizedNodes.length; i++) {
							const next = normalizedNodes[i];
							if (!next) continue;
							const cursorVersions = Array.isArray(cursor.versions)
								? (cursor.versions as Array<Record<string, unknown>>)
								: [];
							const cursorIdx =
								typeof cursor.currentVersionIdx === "number" &&
								Number.isFinite(cursor.currentVersionIdx)
									? Math.max(
										0,
										Math.min(Math.round(cursor.currentVersionIdx), cursorVersions.length - 1),
									)
									: 0;
							const cursorActive = cursorVersions[cursorIdx] || {};
							const cursorTail = Array.isArray(cursorActive.tail)
								? (cursorActive.tail as Record<string, unknown>[])
								: [];
							cursorActive.tail = [...cursorTail, next];
							cursorVersions[cursorIdx] = cursorActive;
							cursor.versions = cursorVersions;
							cursor = next;
						}
						return [root];
					};
					const historyPayload = normalizeLocalHistoryToTree(localSession.history);
					const candidateRemoteId = normalizeRemoteIdFromLocalSession(
						localId,
						localSession,
					) || (remoteIds.has(localId) ? localId : null);
				const patch = {
					name:
						typeof localSession.name === "string" && localSession.name.trim()
							? localSession.name.trim()
							: "New Chat",
					model:
						typeof localSession.model === "string" &&
						localSession.model.trim().length > 0
							? localSession.model.trim()
							: null,
					history: historyPayload,
					...(Number.isFinite(localRecord.created)
						? { created: Math.round(Number(localRecord.created)) }
						: {}),
				};

				if (candidateRemoteId && remoteIds.has(candidateRemoteId)) {
					const patchRes = await fetch(
						`${chatStorageApiBase}/db/chats/${encodeURIComponent(candidateRemoteId)}`,
						{
							method: "PATCH",
							headers: authHeaders,
							body: JSON.stringify(patch),
						},
					);
					const patchPayload = await parseJsonSafe(patchRes);
					if (!patchRes.ok) {
						return {
							error:
								asTrimmedString(patchPayload?.message) ||
								asTrimmedString(patchPayload?.error) ||
								`Remote session update failed (${patchRes.status})`,
						};
					}
					remoteIdMap[localId] = candidateRemoteId;
					continue;
				}

				const createRes = await fetch(`${chatStorageApiBase}/db/chats`, {
					method: "POST",
					headers: authHeaders,
					body: JSON.stringify(patch),
				});
				const createPayload = await parseJsonSafe(createRes);
				if (!createRes.ok) {
					return {
						error:
							asTrimmedString(createPayload?.message) ||
							asTrimmedString(createPayload?.error) ||
							`Remote session create failed (${createRes.status})`,
					};
				}
				const createdId = asTrimmedString(createPayload?.item?.id);
				if (createdId) {
					remoteIdMap[localId] = createdId;
					remoteIds.add(createdId);
				}
			}

			return { success: true, remoteIdMap };
		},
	);

	ipcMain.handle(
		"sync:mediaList",
		async (_event, params?: { view?: string; parentId?: string | null }) => {
			const auth = await getChatStorageAuthContext();
			if (!auth.ok) return { error: auth.error };
			const { authHeaders } = auth.value;
			const view = normalizeMediaView(params?.view);
			const parentId = normalizeParentId(params?.parentId);

			const listRes = await fetch(
				`${chatStorageApiBase}/db/media?view=${encodeURIComponent(view)}`,
				{
					method: "GET",
					headers: authHeaders,
				},
			);
			const listPayload = await parseJsonSafe(listRes);
			if (!listRes.ok) {
				return {
					error: toChatStorageError(
						listPayload,
						listRes.status,
						"Remote media list failed",
					),
				};
			}

			const allItems = Array.isArray(listPayload?.items)
				? (listPayload.items as Array<Record<string, unknown>>)
				: [];
			const items =
				view === "trash" || view === "all"
					? allItems
					: allItems.filter(
							(item) => normalizeParentId(item.parentId) === parentId,
						);
			const breadcrumbs =
				view === "active"
					? buildMediaBreadcrumbs(allItems, parentId)
					: [];

			return {
				items,
				breadcrumbs,
				usage:
					listPayload && typeof listPayload === "object"
						? (listPayload as Record<string, unknown>).usage ?? null
						: null,
			};
		},
	);

	ipcMain.handle("sync:mediaGet", async (_event, id: string) => {
		const mediaId = asTrimmedString(id);
		if (!mediaId) return { error: "Media id is required" };
		const auth = await getChatStorageAuthContext();
		if (!auth.ok) return { error: auth.error };
		const { authHeaders } = auth.value;

		const res = await fetch(
			`${chatStorageApiBase}/db/media/${encodeURIComponent(mediaId)}`,
			{
				method: "GET",
				headers: authHeaders,
			},
		);
		const payload = await parseJsonSafe(res);
		if (!res.ok) {
			return {
				error: toChatStorageError(
					payload,
					res.status,
					"Remote media get failed",
				),
			};
		}
		const item =
			payload && typeof payload === "object"
				? (payload as Record<string, unknown>).item
				: null;
		return { item };
	});

	ipcMain.handle(
		"sync:mediaGetContent",
		async (
			_event,
			id: string,
			params?: { format?: "text" | "base64" },
		) => {
			const mediaId = asTrimmedString(id);
			if (!mediaId) return { error: "Media id is required" };
			const auth = await getChatStorageAuthContext();
			if (!auth.ok) return { error: auth.error };
			const { authHeaders } = auth.value;
			const format =
				params?.format === "text" || params?.format === "base64"
					? params.format
					: null;
			const query = format ? `?format=${encodeURIComponent(format)}` : "";

			const res = await fetch(
				`${chatStorageApiBase}/db/media/${encodeURIComponent(mediaId)}/content${query}`,
				{
					method: "GET",
					headers: authHeaders,
				},
			);
			const payload = await parseJsonSafe(res);
			if (!res.ok) {
				return {
					error: toChatStorageError(
						payload,
						res.status,
						"Remote media content fetch failed",
					),
				};
			}
			return payload || {};
		},
	);

	ipcMain.handle(
		"sync:mediaCreateFile",
		async (
			_event,
			payload: {
				name?: string;
				mimeType?: string;
				parentId?: string | null;
				sessionId?: string | null;
				kind?: string | null;
				text?: string;
				base64?: string;
				source?: string;
			},
		) => {
			const auth = await getChatStorageAuthContext();
			if (!auth.ok) return { error: auth.error };
			const { authHeaders } = auth.value;
			const res = await fetch(`${chatStorageApiBase}/db/media/files`, {
				method: "POST",
				headers: authHeaders,
				body: JSON.stringify(payload || {}),
			});
			const body = await parseJsonSafe(res);
			if (!res.ok) {
				return {
					error: toChatStorageError(
						body,
						res.status,
						"Remote media create failed",
					),
					usage:
						body && typeof body === "object"
							? (body as Record<string, unknown>).usage ?? null
							: null,
				};
			}
			return body || {};
		},
	);

	ipcMain.handle(
		"sync:mediaCreateFolder",
		async (_event, payload: { name?: string; parentId?: string | null }) => {
			const auth = await getChatStorageAuthContext();
			if (!auth.ok) return { error: auth.error };
			const { authHeaders } = auth.value;
			const res = await fetch(`${chatStorageApiBase}/db/media/folders`, {
				method: "POST",
				headers: authHeaders,
				body: JSON.stringify(payload || {}),
			});
			const body = await parseJsonSafe(res);
			if (!res.ok) {
				return {
					error: toChatStorageError(
						body,
						res.status,
						"Remote media folder create failed",
					),
				};
			}
			return body || {};
		},
	);

	ipcMain.handle(
		"sync:mediaUpdate",
		async (
			_event,
			id: string,
			payload: { name?: string; parentId?: string | null },
		) => {
			const mediaId = asTrimmedString(id);
			if (!mediaId) return { error: "Media id is required" };
			const auth = await getChatStorageAuthContext();
			if (!auth.ok) return { error: auth.error };
			const { authHeaders } = auth.value;
			const res = await fetch(
				`${chatStorageApiBase}/db/media/${encodeURIComponent(mediaId)}`,
				{
					method: "PATCH",
					headers: authHeaders,
					body: JSON.stringify(payload || {}),
				},
			);
			const body = await parseJsonSafe(res);
			if (!res.ok) {
				return {
					error: toChatStorageError(
						body,
						res.status,
						"Remote media update failed",
					),
				};
			}
			return body || {};
		},
	);

	ipcMain.handle(
		"sync:mediaUpdateContent",
		async (
			_event,
			id: string,
			payload: {
				text?: string;
				base64?: string;
				mimeType?: string | null;
				name?: string | null;
				kind?: string | null;
			},
		) => {
			const mediaId = asTrimmedString(id);
			if (!mediaId) return { error: "Media id is required" };
			const auth = await getChatStorageAuthContext();
			if (!auth.ok) return { error: auth.error };
			const { authHeaders } = auth.value;
			const res = await fetch(
				`${chatStorageApiBase}/db/media/${encodeURIComponent(mediaId)}/content`,
				{
					method: "PUT",
					headers: authHeaders,
					body: JSON.stringify(payload || {}),
				},
			);
			const body = await parseJsonSafe(res);
			if (!res.ok) {
				return {
					error: toChatStorageError(
						body,
						res.status,
						"Remote media content update failed",
					),
					usage:
						body && typeof body === "object"
							? (body as Record<string, unknown>).usage ?? null
							: null,
				};
			}
			return body || {};
		},
	);

	ipcMain.handle(
		"sync:mediaMove",
		async (
			_event,
			payload: { ids?: string[]; parentId?: string | null },
		) => {
			const auth = await getChatStorageAuthContext();
			if (!auth.ok) return { error: auth.error };
			const { authHeaders } = auth.value;
			const ids = Array.isArray(payload?.ids)
				? payload.ids.map((id) => asTrimmedString(id)).filter(Boolean)
				: [];
			const parentId = normalizeParentId(payload?.parentId);
			if (!ids.length) return { items: [] };

			const moved: unknown[] = [];
			let usage: unknown = null;
			for (const id of ids) {
				const res = await fetch(
					`${chatStorageApiBase}/db/media/${encodeURIComponent(id as string)}`,
					{
						method: "PATCH",
						headers: authHeaders,
						body: JSON.stringify({ parentId }),
					},
				);
				const body = await parseJsonSafe(res);
				if (!res.ok) {
					return {
						error: toChatStorageError(body, res.status, "Remote media move failed"),
					};
				}
				if (body && typeof body === "object") {
					const asRecord = body as Record<string, unknown>;
					if (Array.isArray(asRecord.updates)) moved.push(...asRecord.updates);
					else if (asRecord.item) moved.push(asRecord.item);
					if (typeof asRecord.usage !== "undefined") usage = asRecord.usage;
				}
			}
			return { items: moved, usage };
		},
	);

	ipcMain.handle("sync:mediaTrash", async (_event, payload: { ids?: string[] }) => {
		const auth = await getChatStorageAuthContext();
		if (!auth.ok) return { error: auth.error };
		const { authHeaders } = auth.value;
		const ids = Array.isArray(payload?.ids)
			? payload.ids.map((id) => asTrimmedString(id)).filter(Boolean)
			: [];
		const res = await fetch(`${chatStorageApiBase}/db/media/trash`, {
			method: "POST",
			headers: authHeaders,
			body: JSON.stringify({ ids }),
		});
		const body = await parseJsonSafe(res);
		if (!res.ok) {
			return {
				error: toChatStorageError(body, res.status, "Remote media trash failed"),
			};
		}
		return body || {};
	});

	ipcMain.handle("sync:mediaRestore", async (_event, payload: { ids?: string[] }) => {
		const auth = await getChatStorageAuthContext();
		if (!auth.ok) return { error: auth.error };
		const { authHeaders } = auth.value;
		const ids = Array.isArray(payload?.ids)
			? payload.ids.map((id) => asTrimmedString(id)).filter(Boolean)
			: [];
		const res = await fetch(`${chatStorageApiBase}/db/media/restore`, {
			method: "POST",
			headers: authHeaders,
			body: JSON.stringify({ ids }),
		});
		const body = await parseJsonSafe(res);
		if (!res.ok) {
			return {
				error: toChatStorageError(body, res.status, "Remote media restore failed"),
			};
		}
		return body || {};
	});

	ipcMain.handle("sync:mediaDelete", async (_event, payload: { ids?: string[] }) => {
		const auth = await getChatStorageAuthContext();
		if (!auth.ok) return { error: auth.error };
		const { authHeaders } = auth.value;
		const ids = Array.isArray(payload?.ids)
			? payload.ids.map((id) => asTrimmedString(id)).filter(Boolean)
			: [];
		const res = await fetch(`${chatStorageApiBase}/db/media`, {
			method: "DELETE",
			headers: authHeaders,
			body: JSON.stringify({ ids }),
		});
		const body = await parseJsonSafe(res);
		if (!res.ok) {
			return {
				error: toChatStorageError(body, res.status, "Remote media delete failed"),
			};
		}
		return body || {};
	});

	ipcMain.handle("auth:verify-password", async (event, { password }) => {
		const { data, error } = await supabase.auth.getSession();
		if (error) return { success: false, error: error.message };

		const sb = data.session;
		if (!sb) {
			return { success: false, error: "No session" };
		}
		const res = await fetch(
			"https://dpixehhdbtzsbckfektd.supabase.co/functions/v1/verify_password",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${sb.access_token}`,
				},
				body: JSON.stringify({ email: sb.user.email, password }),
			}
		);

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			console.error(err.error || "Verify failed");
			return { success: false, error: err.error || "Verify failed" };
		}

		const sc = res.headers.get("set-cookie");
		if (sc) {
			const match = sc.match(/pw_verified=([^;]+);/);
			if (match) {
				const token = match[1];
				if (!token) {
					console.error("Cannot set cookie: token is undefined");
					return { success: false };
				}

				await session.defaultSession.cookies.set({
					url: "https://dpixehhdbtzsbckfektd.supabase.co",
					name: "pw_verified",
					value: token,
					path: "/",
					secure: true,
					httpOnly: true,
					sameSite: "lax",
					expirationDate: Math.floor(Date.now() / 1000) + 600,
				});
			}
		}

		return { success: true };
	});

	ipcMain.handle("auth:delete-account", async () => {
		let cookies: Electron.Cookie[] =
			await session.defaultSession.cookies.get({
				url: "https://dpixehhdbtzsbckfektd.supabase.co",
				name: "pw_verified",
			});
		if (!cookies || !cookies[0]) {
			cookies = cookies || [];
			console.warn("Cookie is null");
			cookies[0] = { name: "pw_verified", sameSite: "lax", value: "null" }
		}
		const cookieHeader: string = cookies.length
			? `pw_verified=${cookies[0].value}`
			: "";
		const { data, error } = await supabase.auth.getSession();

		if (error) return { error: error.message };

		const sb = data.session;

		const res = await fetch(
			"https://dpixehhdbtzsbckfektd.supabase.co/functions/v1/delete_account",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${sb?.access_token}`,
					...(cookieHeader ? { Cookie: cookieHeader } : {}),
				},
			}
		);

		const out = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(out.error || "Delete failed");

		await session.defaultSession.cookies.remove(
			"https://dpixehhdbtzsbckfektd.supabase.co",
			"pw_verified"
		);

		return { success: true };
	});
}

restoreSession();
