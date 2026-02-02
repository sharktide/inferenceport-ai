import { createClient } from "@supabase/supabase-js";
import type { Session, AuthChangeEvent } from "@supabase/supabase-js";
import { app, ipcMain, BrowserWindow, session } from "electron";

import fs from "fs";
import path from "path";
import { shell } from "electron";

import type { Message, SessionType } from "./types/index.types.d.ts";

const supabaseKey =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwaXhlaGhkYnR6c2Jja2Zla3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDI0MjcsImV4cCI6MjA3NjcxODQyN30.nR1KCSRQj1E_evQWnE2VaZzg7PgLp2kqt4eDKP2PkpE"; // gitleaks:allow
const supabaseUrl = "https://dpixehhdbtzsbckfektd.supabase.co";
export const supabase = createClient(supabaseUrl, supabaseKey);

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

supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
	if (session) {
		fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
	} else {
		if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
	}
});

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
		if (error) return { error: error.message };
		return { session: data.session, user: data.user };
	});

	ipcMain.handle("auth:signUpWithEmail", async (_event, email, password) => {
		const { data, error } = await supabase.auth.signUp({ email, password });
		if (error) return { error: error.message };
		return { user: data.user };
	});

	ipcMain.handle("auth:signOut", async () => {
		const { error } = await supabase.auth.signOut();
		if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
		if (error) return { error: error.message };
		return { success: true };
	});

	ipcMain.handle("auth:getSession", async () => {
		const { data, error } = await supabase.auth.getSession();
		if (error) return { error: error.message };

		const session = data.session;
		let profile = null;

		if (session?.user?.id) {
			const { data: profileData } = await supabase
				.from("profiles")
				.select("username")
				.eq("id", session.user.id)
				.maybeSingle();
			profile = profileData || null;
		}

		return { session, profile };
	});

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

	ipcMain.handle("auth:onAuthStateChange", () => {
		const win = BrowserWindow.getFocusedWindow();
		const { data: listener } = supabase.auth.onAuthStateChange(
			(_eventType, session) => {
				win?.webContents.send("auth:stateChanged", session);
			}
		);
		return { success: true };
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

	ipcMain.handle("org:createOrganization", async (_event, { name, slug }) => {
		if (!name || !slug) return { error: "Missing name or slug" };

		const { data: sessionData, error: sessionError } =
			await supabase.auth.getSession();
		if (sessionError || !sessionData.session) return { error: "Not authenticated" };

		const userId = sessionData.session.user.id;

		const authed = createClient(supabaseUrl, supabaseKey, {
			global: { headers: { Authorization: `Bearer ${sessionData.session.access_token}` } },
		});

		const { data: existingSlug } = await authed
			.from("organizations")
			.select("id")
			.eq("slug", slug)
			.maybeSingle();
		if (existingSlug) return { error: "Slug already in use" };

		const { data, error } = await authed
			.from("organizations")
			.insert([{ name, slug, owner: userId }])
			.select()
			.single();

		if (error) return { error: error.message };

		await authed.from("organization_members").insert([{ organization_id: data.id, user_id: userId, role: "owner" }]);

		return { organization: data };
	});

	ipcMain.handle("org:getOrganizations", async () => {
		const { data: sessionData, error: sessionError } =
			await supabase.auth.getSession();
		if (sessionError || !sessionData.session) return { error: "Not authenticated" };

		const userId = sessionData.session.user.id;

		const { data: orgs, error } = await supabase
			.from("organizations")
			.select("id,name,slug,owner,created_at")
			.or(`owner.eq.${userId},id.in.(select organization_id from organization_members where user_id.eq.${userId})`);

		if (error) {
			const { data: members } = await supabase
				.from("organization_members")
				.select("organization_id")
				.eq("user_id", userId);
			const ids = (members || []).map((m: any) => m.organization_id);
			const { data: altOrgs, error: altErr } = await supabase
				.from("organizations")
				.select("id,name,slug,owner,created_at")
				.in("id", ids);
			if (altErr) return { error: altErr.message };
			return { organizations: altOrgs };
		}

		return { organizations: orgs };
	});

	ipcMain.handle("org:getMembers", async (_event, organizationId: string) => {
		if (!organizationId) return { error: "Missing organizationId" };
		const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
		if (sessionError || !sessionData.session) return { error: "Not authenticated" };

			const { data: members, error: membersErr } = await supabase
				.from("organization_members")
				.select("user_id,role,created_at")
				.eq("organization_id", organizationId);
			if (membersErr) return { error: membersErr.message };

			const userIds = (members || []).map((m: any) => m.user_id).filter(Boolean);
			let profilesMap: Record<string, any> = {};
			if (userIds.length > 0) {
				const { data: profiles, error: profilesErr } = await supabase
					.from("profiles")
					.select("id,username")
					.in("id", userIds);
				if (!profilesErr && profiles) {
					profilesMap = Object.fromEntries((profiles as any[]).map((p: any) => [p.id, p]));
				}
			}

			const out = (members || []).map((m: any) => ({ ...m, profiles: profilesMap[m.user_id] || null }));
			return { members: out };
	});

	ipcMain.handle("org:inviteMember", async (_event, { organizationId, email }) => {
		if (!organizationId || !email) return { error: "Missing organizationId or email" };
		const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
		if (sessionError || !sessionData.session) return { error: "Not authenticated" };
		const userId = sessionData.session.user.id;

		const authed = createClient(supabaseUrl, supabaseKey, {
			global: { headers: { Authorization: `Bearer ${sessionData.session.access_token}` } },
		});

		const { data: member } = await authed
			.from("organization_members")
			.select("role")
			.eq("organization_id", organizationId)
			.eq("user_id", userId)
			.maybeSingle();
		if (!member) return { error: "Not a member of organization" };

		const token = crypto.randomUUID();
		const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

		const { data, error } = await authed
			.from("organization_invitations")
			.insert([{ organization_id: organizationId, email, token, invited_by: userId, expires_at: expiresAt }])
			.select()
			.single();

		if (error) return { error: error.message };

		// TODO: send email with token link using external service

		return { invitation: data };
	});

	ipcMain.handle("org:acceptInvite", async (_event, { token }) => {
			if (!token) return { error: "Missing token" };
			// normalize token: trim and remove common prefixes
			token = String(token || "").trim().replace(/^Code:\s*/i, "");
		const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
		if (sessionError || !sessionData.session) return { error: "Not authenticated" };
		const userId = sessionData.session.user.id;
		const email = sessionData.session.user.email;

		const { data, error } = await supabase
			.from("organization_invitations")
			.select("id,organization_id,email,expires_at,accepted")
			.eq("token", token)
			.maybeSingle();
		if (error) return { error: error.message };
		console.log(data)
		const invite = data;
		if (!invite) return { error: "Invite not found" };
		if (invite.accepted) return { error: "Invite already accepted" };
		if (invite.expires_at && new Date(invite.expires_at) < new Date()) return { error: "Invite expired" };
		if (invite.email.toLowerCase() !== (email || "").toLowerCase()) return { error: "Invite email does not match your account" };

		const { error: insErr } = await supabase.from("organization_members").insert([{ organization_id: invite.organization_id, user_id: userId, role: "member" }]);
		if (insErr) return { error: insErr.message };

		await supabase.from("organization_invitations").update({ accepted: true }).eq("id", invite.id);

		return { success: true };
	});

	ipcMain.handle("org:setMemberRole", async (_event, { organizationId, userId: targetUserId, role }) => {
		if (!organizationId || !targetUserId || !role) return { error: "Missing params" };
		const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
		if (sessionError || !sessionData.session) return { error: "Not authenticated" };
		const callerId = sessionData.session.user.id;

		const { data: caller } = await supabase
			.from("organization_members")
			.select("role")
			.eq("organization_id", organizationId)
			.eq("user_id", callerId)
			.maybeSingle();
		if (!caller || (caller.role !== "owner" && caller.role !== "admin")) return { error: "Not authorized" };

		const { error } = await supabase
			.from("organization_members")
			.update({ role })
			.eq("organization_id", organizationId)
			.eq("user_id", targetUserId);
		if (error) return { error: error.message };
		return { success: true };
	});

	ipcMain.handle("org:removeMember", async (_event, { organizationId, userId: targetUserId }) => {
		if (!organizationId || !targetUserId) return { error: "Missing params" };
		const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
		if (sessionError || !sessionData.session) return { error: "Not authenticated" };
		const callerId = sessionData.session.user.id;

		const { data: caller } = await supabase
			.from("organization_members")
			.select("role")
			.eq("organization_id", organizationId)
			.eq("user_id", callerId)
			.maybeSingle();
		if (!caller || (caller.role !== "owner" && caller.role !== "admin")) return { error: "Not authorized" };

		const { error } = await supabase
			.from("organization_members")
			.delete()
			.eq("organization_id", organizationId)
			.eq("user_id", targetUserId);
		if (error) return { error: error.message };
		return { success: true };
	});

	ipcMain.handle("org:deleteOrganization", async (_event, { organizationId }) => {
		if (!organizationId) return { error: "Missing organizationId" };
		const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
		if (sessionError || !sessionData.session) return { error: "Not authenticated" };
		const callerId = sessionData.session.user.id;

		const { data: org, error: orgErr } = await supabase
			.from("organizations")
			.select("id,owner")
			.eq("id", organizationId)
			.maybeSingle();
		if (orgErr) return { error: orgErr.message };
		if (!org) return { error: "Organization not found" };
		if (org.owner !== callerId) return { error: "Only owner can delete organization" };

		const { error } = await supabase.from("organizations").delete().eq("id", organizationId);
		if (error) return { error: error.message };
		return { success: true };
	});
}

restoreSession();
