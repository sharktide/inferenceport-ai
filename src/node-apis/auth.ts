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
}

restoreSession();
