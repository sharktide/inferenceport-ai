import { createClient } from "@supabase/supabase-js";
import { app, ipcMain, BrowserWindow } from "electron";
import { IpcMainEvent, IpcMainInvokeEvent } from "electron/main";
const fs = require("fs");
const path = require("path");

const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwaXhlaGhkYnR6c2Jja2Zla3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDI0MjcsImV4cCI6MjA3NjcxODQyN30.nR1KCSRQj1E_evQWnE2VaZzg7PgLp2kqt4eDKP2PkpE"
const supabaseUrl = "https://dpixehhdbtzsbckfektd.supabase.co";
const supabase = createClient(supabaseUrl, supabaseKey);

const sessionFile = path.join(app.getPath("userData"), "supabase-session.json");
const profilesFile = path.join(app.getPath("userData"), "profiles.json");

// Try to restore session
async function restoreSession() {
  if (fs.existsSync(sessionFile)) {
    const session = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
    if (session?.access_token) {
      await supabase.auth.setSession(session);
    }
  }
}

// Save session whenever it changes
supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
  } else {
    if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
  }
});

type Message = {
  role: string;
  content: string;
};

type SessionType = {
  name: string;
  model: string;
  favorite: boolean;
  history: Message[];
};

type MessageType = {
  session_id: string;
  role: string;
  content: string;
}

export function register() {
    ipcMain.handle("auth:signInWithEmail", async (_event, email, password) => {
		const { data, error } = await supabase.auth.signInWithPassword({ email, password });
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
			.from('profiles')
			.select('username')
			.eq('id', session.user.id)
			.maybeSingle();
			profile = profileData || null;
		}

		return { session, profile };
    });


    ipcMain.handle('auth:setUsername', async (_event, userId: string, username: string) => {
		if (!userId || !username) return { error: 'Missing userId or username' };

		const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
		if (sessionError || !sessionData.session) return { error: 'No active session' };

		const authedClient = createClient(supabaseUrl, supabaseKey, {
			global: { headers: { Authorization: `Bearer ${sessionData.session.access_token}` } },
		});

		const { data: existing, error: checkError } = await authedClient
			.from('profiles')
			.select('id')
			.eq('username', username)
			.maybeSingle();

		if (checkError) return { error: checkError.message };
		if (existing) return { error: 'Username already taken' };

		const { data, error } = await authedClient
			.from('profiles')
			.upsert(
			{ id: userId, username },
			{ onConflict: 'id' }
			)
			.select()
			.single();

		if (error) return { error: error.message };
		return { success: true, profile: data };
    });

    ipcMain.handle("auth:onAuthStateChange", () => {
		const win = BrowserWindow.getFocusedWindow();
		const { data: listener } = supabase.auth.onAuthStateChange((_eventType, session) => {
			win?.webContents.send("auth:stateChanged", session);
		});
		return { success: true };
    });
    
    ipcMain.handle("auth:resetPassword", async (_event, email: string) => {
		if (!email) return { error: "Email is required" };

		const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
			redirectTo: "https://inferenceportai.vercel.app/reset.html",
		});

		if (error) return { error: error.message };
		return { success: true };
    });
    // --- CHAT SYNC API ------------------------------------------------------
	ipcMain.handle("sync:getRemoteSessions", async (_event) => {
		const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
		if (sessionError || !sessionData.session) return { error: "Not authenticated" };

		const { data: sessions, error: sErr } = await supabase
			.from("chat_sessions")
			.select("*");

		if (sErr) return { error: sErr.message };

		const { data: messages, error: mErr } = await supabase
			.from("chat_messages")
			.select("*")
			.order("created_at", { ascending: true });

		if (mErr) return { error: mErr.message };

		// Always normalize to arrays
		const safeSessions = sessions ?? [];
		const safeMessages = messages ?? [];

		const out: Record<string, any> = {};

		for (const s of safeSessions) {
			out[s.id] = {
				name: s.name,
				model: s.model,
				favorite: s.favorite,
				history: safeMessages
					.filter(m => m.session_id === s.id)
					.map(m => ({ role: m.role, content: m.content }))
			};
		}

		return { sessions: out };
	});


	ipcMain.handle("sync:saveAllSessions", async (_event: IpcMainInvokeEvent, allSessions: Record<string, SessionType>) => {
		if (!allSessions || typeof allSessions !== "object") {
			return { error: `Invalid allSessions payload ${allSessions} ${typeof allSessions}` };
		}

		const sessionEntries = Object.entries(allSessions);
		if (sessionEntries.length === 0) {
			return { success: true, message: "No sessions to sync" };
		}
		console.log("Starting to save all sessions to remote...");
		const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
		if (sessionError || !sessionData.session)
			return { error: "Not authenticated" };
		console.log("Saving all sessions to remote...");
		const { data: remoteSessions, error: rsErr } = await supabase
			.from("chat_sessions")
			.select("id");

		if (rsErr) return { error: rsErr.message };

		console.log("Fetched remote session IDs.");

		const safeRemoteSessions = remoteSessions ?? [];

		const remoteIds = new Set(safeRemoteSessions.map(s => s.id));
		if (!allSessions || typeof allSessions !== "object") {
			return { error: "Invalid allSessions payload" };
		}
		const localIds = new Set(Object.keys(allSessions));

		const toDelete = [...remoteIds].filter(id => !localIds.has(id));
		if (toDelete.length > 0) {
			await supabase.from("chat_messages").delete().in("session_id", toDelete);
			await supabase.from("chat_sessions").delete().in("id", toDelete);
		}
		const sessionRows = Object.entries(allSessions).map(([id, s]) => ({
			id,
			name: s.name,
			model: s.model,
			favorite: s.favorite,
			updated_at: new Date().toISOString(),
		}));

		if (sessionRows.length > 0) {
			const { error: upErr } = await supabase
				.from("chat_sessions")
				.upsert(sessionRows);

			if (upErr) return { error: upErr.message };
		}

		// -------------------------------------------
		// 3. Replace messages for each session
		// -------------------------------------------
		for (const [sessionId, session] of Object.entries(allSessions)) {
			// Delete old
			await supabase.from("chat_messages").delete().eq("session_id", sessionId);

			// Insert new
			const rows = session.history.map((m: Message, index: number) => ({
				id: crypto.randomUUID(),
				session_id: sessionId,
				role: m.role,
				content: m.content,
				created_at: new Date().toISOString(),
			}));

			if (rows.length > 0) {
				const { error: msgErr } = await supabase.from("chat_messages").insert(rows);
				if (msgErr) return { error: msgErr.message };
			}
		}

		return { success: true };
	});

}

restoreSession();
