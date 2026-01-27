// supabase/functions/delete-account/index.ts
//@ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";

function safeBase64Decode(str: string): Uint8Array | null {
	try {
		const bin = atob(str);
		return Uint8Array.from(bin, (c) => c.charCodeAt(0));
	} catch {
		return null;
	}
}

async function verifyToken(
	token: string,
	secret: string,
): Promise<{ ok: boolean; id?: string }> {
	const parts = token.split(":");
	if (parts.length !== 3) return { ok: false };

	const [userId, ts, sigBase64] = parts;

	const sig = safeBase64Decode(sigBase64);
	if (!sig) return { ok: false };

	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);

	const payload = `${userId}:${ts}`;
	const valid = await crypto.subtle.verify(
		"HMAC",
		key,
		sig,
		new TextEncoder().encode(payload),
	);

	if (!valid) return { ok: false };

	const age = Date.now() - parseInt(ts, 10);
	if (age > 10 * 60 * 1000) return { ok: false };

	return { ok: true, id: userId };
}

Deno.serve(async (req) => {
	if (req.method !== "POST") {
		return new Response(JSON.stringify({ error: "Method not allowed" }), {
			status: 405,
		});
	}

	const cookies = req.headers.get("Cookie") || "";
	const auth = req.headers.get("Authorization");

	const match = cookies.match(/pw_verified=([^;]+)/);
	if (!auth || !match) {
		return new Response(
			JSON.stringify({ error: "Verification required" }),
			{ status: 403 },
		);
	}

	const token = match[1];
	const { ok, id: cookieUserId } = await verifyToken(
		token,
		Deno.env.get("COOKIE_SECRET")!,
	);
	if (!ok || !cookieUserId) {
		return new Response(
			JSON.stringify({ error: "Verification required" }),
			{ status: 403 },
		);
	}

	const supabase = createClient(
		Deno.env.get("SUPABASE_URL")!,
		Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
	);

	const jwt = auth.replace("Bearer ", "");
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser(jwt);

	if (error || !user) {
		return new Response(JSON.stringify({ error: "Invalid user session" }), {
			status: 401,
		});
	}

	if (user.id !== cookieUserId) {
		return new Response(JSON.stringify({ error: "User mismatch" }), {
			status: 403,
		});
	}

	await supabase.auth.admin.deleteUser(user.id);

	const headers = new Headers();
	headers.append(
		"Set-Cookie",
		"pw_verified=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/",
	);

	return new Response(JSON.stringify({ success: true }), { headers });
});
