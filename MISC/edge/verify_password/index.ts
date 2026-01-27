// supabase/functions/verify-password/index.ts
//@ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";
import { rateLimit } from "./verify.ts";

async function signToken(payload: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(payload),
	);

	const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
	return `${payload}:${sigBase64}`;
}

Deno.serve(async (req) => {
	if (req.method !== "POST") {
		return new Response(JSON.stringify({ error: "Method not allowed" }), {
			status: 405,
		});
	}

	const ip = req.headers.get("x-forwarded-for") || "unknown";
	if (!rateLimit(ip)) {
		return new Response(JSON.stringify({ error: "Too many requests" }), {
			status: 429,
		});
	}

	const { email, password } = await req.json();

	const supabase = createClient(
		Deno.env.get("SUPABASE_URL")!,
		Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
	);

	const { data, error } = await supabase.auth.signInWithPassword({
		email,
		password,
	});
	if (error) {
		return new Response(JSON.stringify({ error: "Invalid credentials" }), {
			status: 401,
		});
	}

	const payload = `${data.user.id}:${Date.now()}`;
	const token = await signToken(payload, Deno.env.get("COOKIE_SECRET")!);

	const headers = new Headers();
	headers.append(
		"Set-Cookie",
		`pw_verified=${token}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`,
	);

	return new Response(JSON.stringify({ success: true }), { headers });
});
