import { app, ipcMain } from "electron";
import fs from "fs";
import path from "path";

import { supabase } from "./auth.js";
import { broadcastIpcEvent } from "./helper/ipcBridge.js";

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

let cache: Cache | null = null;
let currentUserId: string | null = null;
let lastError: string | undefined;
let timer: NodeJS.Timeout | null = null;

const cacheFile = () => path.join(app.getPath("userData"), "org-policy.json");

function loadCache(userId: string): Cache | null {
	try {
		const raw = JSON.parse(fs.readFileSync(cacheFile(), "utf8")) as Cache;
		if (raw.userId !== userId || Date.now() - raw.fetchedAt > CACHE_MAX_AGE_MS || !Array.isArray(raw.orgs)) return null;
		return raw;
	} catch {
		return null;
	}
}

/** Loads the last known policy at startup, before sign-in has finished, so limits apply to auto-started servers. */
export function primeOrgPolicyFromDisk(): void {
	try {
		const raw = JSON.parse(fs.readFileSync(cacheFile(), "utf8")) as Cache;
		if (Date.now() - raw.fetchedAt <= CACHE_MAX_AGE_MS && Array.isArray(raw.orgs)) {
			cache = raw;
			currentUserId = raw.userId;
		}
	} catch {
		void 0;
	}
}

function saveCache(): void {
	try {
		if (cache) fs.writeFileSync(cacheFile(), JSON.stringify(cache), { mode: 0o600 });
		else fs.rmSync(cacheFile(), { force: true });
	} catch {
		void 0;
	}
}

function pickActive(orgs: OrgDesktopEntry[], preferred: string | null): OrgDesktopEntry | null {
	const usable = orgs.filter((o) => !o.suspended);
	return (
		usable.find((o) => o.slug === preferred) ||
		usable.find((o) => o.managed) ||
		usable[0] ||
		null
	);
}

function active(): OrgDesktopEntry | null {
	return cache ? pickActive(cache.orgs, cache.activeSlug) : null;
}

/** The policy currently in force. Without a managed organization everything is allowed. */
export function getPolicy(): DesktopPolicy {
	const org = active();
	return org && org.managed ? org.policy : DEFAULT_POLICY;
}

export function getOrgPolicyView(): OrgPolicyView {
	const org = active();
	const policy = getPolicy();
	const managed = !!org?.managed;
	return {
		signedIn: currentUserId !== null,
		managed,
		orgs: (cache?.orgs ?? []).filter((o) => !o.suspended).map((o) => ({ slug: o.slug, name: o.name, role: o.role, managed: o.managed })),
		activeSlug: org?.slug ?? null,
		activeName: org?.name ?? null,
		policy,
		canHostServer: org ? org.can_host_server || !org.managed : true,
		serverUsers: org && org.can_host_server ? org.server_users : [],
		billLightningToOrg: managed && policy.lightning === "allow" && policy.lightning_billing === "org" && !!org?.can_bill_org,
		fetchedAt: cache?.fetchedAt ?? null,
		...(lastError ? { error: lastError } : {}),
	};
}

function emitChanged(): void {
	broadcastIpcEvent("org:policyChanged", getOrgPolicyView());
}

export async function refreshOrgPolicy(): Promise<OrgPolicyView> {
	try {
		const { data } = await supabase.auth.getSession();
		const session = data.session;
		if (!session?.access_token) {
			cache = null;
			currentUserId = null;
			lastError = undefined;
			saveCache();
			emitChanged();
			return getOrgPolicyView();
		}
		if (currentUserId !== session.user.id) {
			currentUserId = session.user.id;
			cache = loadCache(session.user.id);
		}
		const res = await fetch(`${API_BASE}/v1/orgs/me/desktop-policy`, {
			headers: { Authorization: `Bearer ${session.access_token}`, Accept: "application/json" },
		});
		if (!res.ok) throw new Error(`Organization policy lookup failed (${res.status})`);
		const body = (await res.json()) as { orgs?: OrgDesktopEntry[] };
		const orgs = Array.isArray(body.orgs) ? body.orgs : [];
		cache = {
			userId: session.user.id,
			fetchedAt: Date.now(),
			orgs,
			activeSlug: cache?.activeSlug ?? null,
		};
		lastError = undefined;
		saveCache();
	} catch (err) {
		// Keep enforcing the last known policy when offline or the API is down.
		lastError = err instanceof Error ? err.message : String(err);
	}
	emitChanged();
	return getOrgPolicyView();
}

function setActiveOrg(slug: string | null): OrgPolicyView {
	if (cache) {
		cache.activeSlug = slug;
		saveCache();
	}
	emitChanged();
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

export function checkPull(model: string): { ok: true } | { ok: false; reason: string } {
	const policy = getPolicy();
	if (policy.pull_mode === "any") return { ok: true };
	if (policy.pull_mode === "blocked") {
		return { ok: false, reason: `${orgLabel()} does not allow downloading models in the app.` };
	}
	if (policy.pull_models && modelMatches(model, policy.pull_models)) return { ok: true };
	return { ok: false, reason: `${model} is not on ${orgLabel()}'s approved model list.` };
}

export function assertPullAllowed(model: string): void {
	const res = checkPull(model);
	if (!res.ok) throw new OrgPolicyError(res.reason);
}

export function assertImportAllowed(): void {
	if (!getPolicy().allow_model_import) {
		throw new OrgPolicyError(`${orgLabel()} does not allow importing your own models.`);
	}
}

export function assertCustomToolsAllowed(): void {
	if (!getPolicy().allow_custom_tools) {
		throw new OrgPolicyError(`${orgLabel()} does not allow custom tools.`);
	}
}

export function assertLightningAllowed(): void {
	if (getPolicy().lightning === "local_only") {
		throw new OrgPolicyError(`${orgLabel()} only allows local models in the app. Choose a model installed on this device.`);
	}
}

export function assertHostingAllowed(): void {
	const view = getOrgPolicyView();
	if (view.managed && !view.canHostServer) {
		throw new OrgPolicyError(`${orgLabel()} does not allow you to host a server.`);
	}
}

/** Header that bills Lightning usage to the active organization (and applies its model/modality policy), or null. */
export function lightningOrgHeaders(): Record<string, string> {
	const view = getOrgPolicyView();
	return view.billLightningToOrg && view.activeSlug ? { [ORG_HEADER]: view.activeSlug } : {};
}

/* ---------- wiring ---------- */

export function startOrgPolicySync(): void {
	if (timer) return;
	void refreshOrgPolicy();
	timer = setInterval(() => void refreshOrgPolicy(), REFRESH_MS);
	timer.unref?.();
	supabase.auth.onAuthStateChange((event) => {
		if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void refreshOrgPolicy();
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
