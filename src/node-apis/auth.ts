import { createClient } from "@supabase/supabase-js";
import type { Session, AuthChangeEvent, Subscription } from "@supabase/supabase-js";
import { app, ipcMain, session } from "electron";

import fs from "fs";
import path from "path";
import { shell } from "electron";

import type { Message, SessionType } from "./types/index.types.d.ts";
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
	email: string | null;
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

function normalizePlanKeyFromName(planName: string | null): string {
	const normalized = (planName || "").toLowerCase().replace(/[^a-z]/g, "");
	if (normalized.includes("professional")) return "professional";
	if (normalized.includes("creator")) return "creator";
	if (normalized.includes("pro")) return "pro";
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

function normalizeUsageMetric(
	value: unknown,
	key: UsageMetricKey,
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
		email,
		signedUp,
		status,
		tiers,
		tierConfig,
	};
}

void getSubscriptionTierConfigSafe();

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
			email: null,
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

			const { data: sessionData, error: sessionError } =
				await supabase.auth.getSession();
			if (sessionError || !sessionData.session)
				return { error: "No active session" };

			const authedClient = createClient(supabaseUrl, supabaseKey, {
				global: {
					headers: {
						Authorization: `Bearer ${sessionData.session.access_token}`,
					},
				},
			});

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
		if (sessionError || !sessionData.session)
			return { error: "Not authenticated" };

		const userId = sessionData.session.user.id;

		const { data: sessions, error: sErr } = await supabase
			.from("chat_sessions")
			.select("*")
			.eq("user_id", userId);

		if (sErr) return { error: sErr.message };

		const { data: messages, error: mErr } = await supabase
			.from("chat_messages")
			.select("*")
			.eq("user_id", userId)
			.order("created_at", { ascending: true });

		if (mErr) return { error: mErr.message };

		const safeSessions = sessions ?? [];
		const safeMessages = messages ?? [];

		const out: Record<string, any> = {};
		for (const s of safeSessions) {
			out[s.id] = {
				name: s.name,
				model: s.model,
				favorite: s.favorite,
				history: safeMessages
					.filter((m) => m.session_id === s.id)
					.map((m) => ({ role: m.role, content: m.content })),
			};
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
			if (sessionError || !sessionData.session)
				return { error: "Not authenticated" };

			const userId = sessionData.session.user.id;

			const { data: remoteSessions, error: rsErr } = await supabase
				.from("chat_sessions")
				.select("id")
				.eq("user_id", userId);

			if (rsErr) return { error: rsErr.message };

			const safeRemoteSessions = remoteSessions ?? [];
			const remoteIds = new Set(safeRemoteSessions.map((s) => s.id));
			const localIds = new Set(Object.keys(allSessions));

			const toDelete = [...remoteIds].filter((id) => !localIds.has(id));
			if (toDelete.length > 0) {
				await supabase
					.from("chat_messages")
					.delete()
					.in("session_id", toDelete)
					.eq("user_id", userId);
				await supabase
					.from("chat_sessions")
					.delete()
					.in("id", toDelete)
					.eq("user_id", userId);
			}

			const sessionRows = Object.entries(allSessions).map(([id, s]) => ({
				id,
				name: s.name,
				model: s.model,
				favorite: s.favorite,
				updated_at: new Date().toISOString(),
				user_id: userId,
			}));

			if (sessionRows.length > 0) {
				const { error: upErr } = await supabase
					.from("chat_sessions")
					.upsert(sessionRows);
				if (upErr) return { error: upErr.message };
			}

			for (const [sessionId, session] of Object.entries(allSessions)) {
				await supabase
					.from("chat_messages")
					.delete()
					.eq("session_id", sessionId)
					.eq("user_id", userId);

				const rows = session.history.map((m: Message) => ({
					id: crypto.randomUUID(),
					session_id: sessionId,
					role: m.role,
					content: m.content,
					created_at: new Date().toISOString(),
					user_id: userId,
				}));

				if (rows.length > 0) {
					const { error: msgErr } = await supabase
						.from("chat_messages")
						.insert(rows);
					process.stdout.write(`${msgErr}\n`);
					if (msgErr) return { error: msgErr.message };
				}
			}

			return { success: true };
		}
	);

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
