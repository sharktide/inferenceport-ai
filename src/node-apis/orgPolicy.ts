import { app, ipcMain } from "electron";
import fs from "fs";
import path from "path";

import { supabase } from "./auth.js";
import { broadcastIpcEvent } from "./helper/ipcBridge.js";
import { startProxyServer, stopProxyServer } from "./helper/server.js";

/**
 * Organization controls for the desktop app.
 *
 * The Lightning API (`GET /v1/orgs/me/desktop-policy`) says what each of the user's organizations allows in the app.
 * This module caches that (so limits still apply offline), picks the active organization, and exposes `assert*` /
 * `check*` helpers the main-process handlers call before they pull, import, host or use cloud models.
 * It needs no credits: a plan's controls apply even to orgs that never use the wallet.
 *
 * Enforcement here is client-side. It stops accidents and casual changes; the API-level model/modality policy and
 * budgets (X-InferencePort-Org) remain the hard server-side guard for anything billed to the organization.
 */

const API_BASE = "https://sharktide-lightning.hf.space";
const REFRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const ORG_HEADER = "X-InferencePort-Org";

export type DesktopPolicy = {
	lightning: "allow" | "local_only";
	lightning_billing: "personal" | "org";
	pull_mode: "any" | "allowlist" | "blocked";
	pull_models: string[] | null;
	allow_model_import: boolean;
	allow_custom_tools: boolean;
	server_hosting: "any" | "admins" | "disabled";
	server_access: "manual" | "org" | "teams";
	server_team_ids: string[];
	unlimited_verifications: boolean;
};

export type OrgDesktopEntry = {
	slug: string;
	name: string;
	role: string;
	plan: string;
	suspended: boolean;
	managed: boolean;
	policy: DesktopPolicy;
	can_host_server: boolean;
	can_bill_org: boolean;
	server_users: { email: string; role: string }[];
};

export type OrgPolicyView = {
	signedIn: boolean;
	/** True when an organization's controls are in effect for this device. */
	managed: boolean;
	orgs: { slug: string; name: string; role: string; managed: boolean }[];
	activeSlug: string | null;
	activeName: string | null;
	policy: DesktopPolicy;
	canHostServer: boolean;
	serverUsers: { email: string; role: string }[];
	billLightningToOrg: boolean;
	fetchedAt: number | null;
	error?: string;
};

export const DEFAULT_POLICY: DesktopPolicy = {
	lightning: "allow",
	lightning_billing: "personal",
	pull_mode: "any",
	pull_models: null,
	allow_model_import: true,
	allow_custom_tools: true,
	server_hosting: "any",
	server_access: "manual",
	server_team_ids: [],
	unlimited_verifications: false,
};

type Cache = { userId: string; fetchedAt: number; orgs: OrgDesktopEntry[]; activeSlug: string | null };

/** Applied to a signed-in user whose organization settings could not be fetched or verified yet (fail closed). */
const UNVERIFIED_POLICY: DesktopPolicy = {
	lightning: "local_only",
	lightning_billing: "personal",
	pull_mode: "blocked",
	pull_models: null,
	allow_model_import: false,
	allow_custom_tools: false,
	server_hosting: "disabled",
	server_access: "manual",
	server_team_ids: [],
	unlimited_verifications: false,
};
const UNVERIFIED_MESSAGE =
	"Your organization's settings could not be verified yet. Check your connection and try again.";

let cache: Cache | null = null;
let currentUserId: string | null = null;
let lastError: string | undefined;
let timer: NodeJS.Timeout | null = null;
/** Bumped whenever the signed-in account changes, so responses fetched for a previous account are discarded. */
let generation = 0;
let inFlight: Promise<OrgPolicyView> | null = null;
let initialRefresh: Promise<OrgPolicyView> | null = null;
let hosted: { users: { email: string; role: string }[]; keys: string[] } | null = null;

const cacheFile = () => path.join(app.getPath("userData"), "org-policy.json");

/* ---------- validation: nothing from the network or disk is trusted as-is ---------- */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max = 200): string => (typeof v === "string" ? v.slice(0, max) : "");
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
	typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const strList = (v: unknown, maxItems: number, maxLen = 160): string[] =>
	Array.isArray(v)
		? v.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, maxItems).map((x) => x.slice(0, maxLen))
		: [];
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

function sanitizePolicy(v: unknown): DesktopPolicy {
	const p = isRecord(v) ? v : {};
	const models = strList(p.pull_models, 100);
	return {
		lightning: oneOf(p.lightning, ["allow", "local_only"], "local_only"),
		lightning_billing: oneOf(p.lightning_billing, ["personal", "org"], "personal"),
		pull_mode: oneOf(p.pull_mode, ["any", "allowlist", "blocked"], "blocked"),
		pull_models: models.length ? models : null,
		allow_model_import: p.allow_model_import === true,
		allow_custom_tools: p.allow_custom_tools === true,
		server_hosting: oneOf(p.server_hosting, ["any", "admins", "disabled"], "disabled"),
		server_access: oneOf(p.server_access, ["manual", "org", "teams"], "manual"),
		server_team_ids: strList(p.server_team_ids, 50, 64),
		unlimited_verifications: p.unlimited_verifications === true,
	};
}

function sanitizeEntry(v: unknown): OrgDesktopEntry | null {
	if (!isRecord(v)) return null;
	const slug = text(v.slug, 64);
	if (!slug) return null;
	const users = Array.isArray(v.server_users) ? v.server_users.slice(0, 5000) : [];
	return {
		slug,
		name: text(v.name, 120) || slug,
		role: text(v.role, 32),
		plan: text(v.plan, 32),
		suspended: v.suspended === true,
		managed: v.managed === true,
		policy: sanitizePolicy(v.policy),
		can_host_server: v.can_host_server === true,
		can_bill_org: v.can_bill_org === true,
		server_users: users.flatMap((u) => {
			if (!isRecord(u)) return [];
			const email = text(u.email, 320).toLowerCase();
			return EMAIL_RE.test(email) ? [{ email, role: u.role === "admin" ? "admin" : "member" }] : [];
		}),
	};
}

function sanitizeEntries(list: unknown[]): OrgDesktopEntry[] {
	return list.slice(0, 50).flatMap((o) => {
		const e = sanitizeEntry(o);
		return e ? [e] : [];
	});
}

function sanitizeCache(raw: unknown): Cache | null {
	if (!isRecord(raw) || !Array.isArray(raw.orgs)) return null;
	const userId = text(raw.userId, 64);
	const fetchedAt = typeof raw.fetchedAt === "number" && Number.isFinite(raw.fetchedAt) ? raw.fetchedAt : 0;
	if (!userId || !fetchedAt) return null;
	return { userId, fetchedAt, orgs: sanitizeEntries(raw.orgs), activeSlug: text(raw.activeSlug, 64) || null };
}

/** Only ever returns the cache that belongs to `userId`. */
function loadCache(userId: string): Cache | null {
	try {
		const c = sanitizeCache(JSON.parse(fs.readFileSync(cacheFile(), "utf8")));
		return c && c.userId === userId && Date.now() - c.fetchedAt <= CACHE_MAX_AGE_MS ? c : null;
	} catch {
		return null;
	}
}

/** Atomic: write a temp file, then rename over the old cache, so an interrupted write never leaves a truncated file. */
function saveCache(): void {
	const file = cacheFile();
	try {
		if (!cache) {
			fs.rmSync(file, { force: true });
			return;
		}
		const tmp = `${file}.${process.pid}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(cache), { mode: 0o600 });
		fs.renameSync(tmp, file);
	} catch {
		void 0;
	}
}

/* ---------- state ---------- */

type PolicyState = "signed_out" | "unverified" | "ready";

function state(): PolicyState {
	if (!currentUserId) return "signed_out";
	return cache && cache.userId === currentUserId ? "ready" : "unverified";
}

function pickActive(orgs: OrgDesktopEntry[], preferred: string | null): OrgDesktopEntry | null {
	const usable = orgs.filter((o) => !o.suspended);
	return usable.find((o) => o.slug === preferred) || usable.find((o) => o.managed) || usable[0] || null;
}

function active(): OrgDesktopEntry | null {
	return state() === "ready" && cache ? pickActive(cache.orgs, cache.activeSlug) : null;
}

/** The policy currently in force. Signed out or unmanaged: everything allowed. Signed in but unverified: restricted. */
export function getPolicy(): DesktopPolicy {
	if (state() === "unverified") return UNVERIFIED_POLICY;
	const org = active();
	return org && org.managed ? org.policy : DEFAULT_POLICY;
}

export function getOrgPolicyView(): OrgPolicyView {
	const s = state();
	const org = active();
	const policy = getPolicy();
	const managed = !!org?.managed;
	const error = s === "unverified" ? (lastError ?? UNVERIFIED_MESSAGE) : lastError;
	return {
		signedIn: currentUserId !== null,
		managed: managed || s === "unverified",
		orgs: (s === "ready" && cache ? cache.orgs : [])
			.filter((o) => !o.suspended)
			.map((o) => ({ slug: o.slug, name: o.name, role: o.role, managed: o.managed })),
		activeSlug: org?.slug ?? null,
		activeName: org?.name ?? null,
		policy,
		canHostServer: s === "unverified" ? false : org ? org.can_host_server || !org.managed : true,
		serverUsers: org && org.can_host_server ? org.server_users : [],
		billLightningToOrg: managed && policy.lightning === "allow" && policy.lightning_billing === "org" && !!org?.can_bill_org,
		fetchedAt: cache?.fetchedAt ?? null,
		...(error ? { error } : {}),
	};
}

/* ---------- refresh ---------- */

function applied(): void {
	broadcastIpcEvent("org:policyChanged", getOrgPolicyView());
	enforceRunningServer();
}

/** Starts a new account epoch: any in-flight response for the previous account will be discarded. */
function switchAccount(userId: string | null): void {
	generation += 1;
	currentUserId = userId;
	cache = userId ? loadCache(userId) : null;
	lastError = undefined;
	if (!userId) saveCache();
}

async function doRefresh(): Promise<OrgPolicyView> {
	try {
		const { data } = await supabase.auth.getSession();
		const session = data.session;
		if (!session?.access_token) {
			if (currentUserId !== null || cache) switchAccount(null);
			applied();
			return getOrgPolicyView();
		}
		const userId = session.user.id;
		if (currentUserId !== userId) switchAccount(userId);
		const epoch = generation;

		const res = await fetch(`${API_BASE}/v1/orgs/me/desktop-policy`, {
			headers: { Authorization: `Bearer ${session.access_token}`, Accept: "application/json" },
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!res.ok) throw new Error(`Organization policy lookup failed (${res.status})`);
		const body: unknown = await res.json();
		const orgs = sanitizeEntries(isRecord(body) && Array.isArray(body.orgs) ? body.orgs : []);

		// The account may have changed (sign-out, switch) while the request was in flight: drop the response.
		const { data: after } = await supabase.auth.getSession();
		if (generation !== epoch || after.session?.user.id !== userId) return getOrgPolicyView();

		cache = { userId, fetchedAt: Date.now(), orgs, activeSlug: cache?.userId === userId ? cache.activeSlug : null };
		lastError = undefined;
		saveCache();
	} catch (err) {
		// Keep enforcing the last known policy for this account when offline or the API is down.
		lastError = err instanceof Error ? err.message : String(err);
	}
	applied();
	return getOrgPolicyView();
}

/** At most one request at a time; a stalled request times out instead of piling up behind the interval. */
export function refreshOrgPolicy(): Promise<OrgPolicyView> {
	if (inFlight) return inFlight;
	const run: Promise<OrgPolicyView> = doRefresh().finally(() => {
		if (inFlight === run) inFlight = null;
	});
	inFlight = run;
	return run;
}

/** Resolves once the first policy lookup has finished. Every enforcement point awaits this before deciding. */
export async function orgPolicyReady(): Promise<void> {
	initialRefresh ??= refreshOrgPolicy();
	await initialRefresh.catch(() => void 0);
}

/** Surfaces an account-level problem (for example a failed SSO provisioning) next to the organization controls. */
export function reportOrgError(message: string): void {
	lastError = message;
	broadcastIpcEvent("org:policyChanged", getOrgPolicyView());
}

function setActiveOrg(slug: string | null): OrgPolicyView {
	if (cache && state() === "ready") {
		cache.activeSlug = slug;
		saveCache();
	}
	applied();
	return getOrgPolicyView();
}

/* ---------- enforcement helpers ---------- */

export class OrgPolicyError extends Error {
	code = "ORG_POLICY";
	constructor(message: string) {
		super(message);
	}
}

function orgLabel(): string {
	return active()?.name ?? "your organization";
}

/** Pattern match: `*` suffix is a prefix match; a pattern without a tag matches every tag of that model. */
export function modelMatches(model: string, patterns: string[]): boolean {
	const m = model.trim().toLowerCase();
	const base = m.split(":")[0];
	return patterns.some((raw) => {
		const p = raw.trim().toLowerCase();
		if (!p) return false;
		if (p.endsWith("*")) return m.startsWith(p.slice(0, -1));
		return p.includes(":") ? m === p : base === p;
	});
}

function denyUnverified(): never {
	throw new OrgPolicyError(UNVERIFIED_MESSAGE);
}

export function checkPull(model: string): { ok: true } | { ok: false; reason: string } {
	if (state() === "unverified") return { ok: false, reason: UNVERIFIED_MESSAGE };
	const policy = getPolicy();
	if (policy.pull_mode === "any") return { ok: true };
	if (policy.pull_mode === "blocked") {
		return { ok: false, reason: `${orgLabel()} does not allow downloading models in the app.` };
	}
	if (policy.pull_models && modelMatches(model, policy.pull_models)) return { ok: true };
	return { ok: false, reason: `${model} is not on ${orgLabel()}'s approved model list.` };
}

export async function assertPullAllowed(model: string): Promise<void> {
	await orgPolicyReady();
	const res = checkPull(model);
	if (!res.ok) throw new OrgPolicyError(res.reason);
}

export async function assertImportAllowed(): Promise<void> {
	await orgPolicyReady();
	if (state() === "unverified") denyUnverified();
	if (!getPolicy().allow_model_import) {
		throw new OrgPolicyError(`${orgLabel()} does not allow importing your own models.`);
	}
}

export async function assertCustomToolsAllowed(): Promise<void> {
	await orgPolicyReady();
	if (state() === "unverified") denyUnverified();
	if (!getPolicy().allow_custom_tools) {
		throw new OrgPolicyError(`${orgLabel()} does not allow custom tools.`);
	}
}

/** Billing header only (no cloud-use guard): for registry calls that are not inference. */
export function lightningOrgHeaders(): Record<string, string> {
	const view = getOrgPolicyView();
	return view.billLightningToOrg && view.activeSlug ? { [ORG_HEADER]: view.activeSlug } : {};
}

/** Lightning request guard + billing header from ONE synchronous snapshot. Call it last, after every await. */
export function lightningSnapshot(): Record<string, string> {
	if (state() === "unverified") denyUnverified();
	if (getPolicy().lightning === "local_only") {
		throw new OrgPolicyError(`${orgLabel()} only allows local models in the app. Choose a model installed on this device.`);
	}
	return lightningOrgHeaders();
}

function hostingDenied(): string | null {
	if (state() === "unverified") return UNVERIFIED_MESSAGE;
	const view = getOrgPolicyView();
	return view.managed && !view.canHostServer ? `${orgLabel()} does not allow you to host a server.` : null;
}

export async function assertHostingAllowed(): Promise<void> {
	await orgPolicyReady();
	const denied = hostingDenied();
	if (denied) throw new OrgPolicyError(denied);
}

/** Restrict a requested allowlist to what the organization's server-access mode permits. */
export function applyServerAccess(
	users: { email: string; role: string }[],
	serverApiKeys: string[],
): { users: { email: string; role: string }[]; serverApiKeys: string[] } {
	const org = active();
	if (!org || !org.managed || org.policy.server_access === "manual") return { users, serverApiKeys };
	const allowed = new Map(org.server_users.map((u) => [u.email, u.role]));
	const filtered = users.flatMap((u) => {
		const role = allowed.get(String(u.email).trim().toLowerCase());
		return role ? [{ email: u.email, role }] : [];
	});
	// Shared API keys would let anyone outside the organization in, so they are not used in these modes.
	return { users: filtered, serverApiKeys: [] };
}

/** Starts the proxy server only if the organization allows it, with the allowlist the organization permits. */
export async function startPolicyCheckedProxy(
	port: number,
	users: { email: string; role: string }[],
	serverApiKeys: string[],
): Promise<void> {
	await assertHostingAllowed();
	const result = applyServerAccess(users, serverApiKeys);
	if (result.users.length === 0 && users.length > 0) {
		throw new OrgPolicyError(
			`${orgLabel()} only allows hosting for its members. Use "Add organization members" to build the allowed users.`,
		);
	}
	startProxyServer(port, result.users, result.serverApiKeys);
	hosted = { users: result.users, keys: result.serverApiKeys };
}

export function stopPolicyCheckedProxy(): void {
	hosted = null;
	stopProxyServer();
}

/** Re-checks a running server whenever the policy or active organization changes, and stops it if no longer allowed. */
function enforceRunningServer(): void {
	if (!hosted) return;
	let allowed = hostingDenied() === null;
	if (allowed) {
		const again = applyServerAccess(hosted.users, hosted.keys);
		allowed = again.users.length === hosted.users.length && again.serverApiKeys.length === hosted.keys.length;
	}
	if (!allowed) stopPolicyCheckedProxy();
}

/* ---------- wiring ---------- */

export function startOrgPolicySync(): void {
	if (timer) return;
	initialRefresh = refreshOrgPolicy();
	timer = setInterval(() => void refreshOrgPolicy(), REFRESH_MS);
	timer.unref?.();
	supabase.auth.onAuthStateChange((event) => {
		if (event === "SIGNED_OUT") {
			// Clear synchronously so the previous account's policy is never visible to the next one.
			switchAccount(null);
			applied();
		}
		if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
			inFlight = null;
			void refreshOrgPolicy();
		}
	});
}

export default function register(): void {
	ipcMain.handle("org:get-policy", () => getOrgPolicyView());
	ipcMain.handle("org:refresh-policy", () => refreshOrgPolicy());
	ipcMain.handle("org:set-active", (_event, slug: string | null) => {
		const valid = typeof slug === "string" && cache?.orgs.some((o) => o.slug === slug && !o.suspended);
		return setActiveOrg(valid ? slug : null);
	});
	startOrgPolicySync();
}
