import http, { IncomingMessage, ServerResponse } from "http";
import https from "https";
import { URL } from "url";
import crypto from "crypto";
const VERIFY_URL =
	"https://dpixehhdbtzsbckfektd.supabase.co/functions/v1/verify_token_with_email";
const OLLAMA_URL = "http://localhost:11434";

let server: http.Server | null;

function maskToken(token: string, visibleChars = 6): string {
	if (!token) return "";
	if (token.length <= visibleChars) return "*".repeat(token.length);
	return token.slice(0, visibleChars) + "*".repeat(token.length - visibleChars);
}

function sanitizeForLog(value: string): string {
	// Remove CR and LF characters to prevent log forging via line breaks.
	return value.replace(/[\r\n]/g, "");
}
function hashIP(ip: string) {
	if (ip==="unknown") return "unknown";
    return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 8);
}
function forwardRequest(req: IncomingMessage, res: ServerResponse) {
    let path = req.url ?? "/";

    if (path.startsWith("http://") || path.startsWith("https://")) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Absolute URLs not allowed" }));
    }

	const targetUrl = new URL(path, OLLAMA_URL);

	// Collect request body for logging and forwarding
	const reqChunks: Buffer[] = [];
	req.on("data", (chunk: Buffer) => reqChunks.push(chunk));

	req.on("end", () => {
		const bodyBuf = Buffer.concat(reqChunks);
		const bodyStr = bodyBuf.length ? bodyBuf.toString() : "";

		// Log request details (mask sensitive auth token)
		const logHeaders = maskAuthInHeaders(req.headers);
		console.log(`[Proxy] Forwarding request -> ${req.method} ${targetUrl.href}`);
		console.log(`[Proxy] From: ${req.socket.remoteAddress} Headers: ${JSON.stringify(logHeaders)}`);
		if (bodyStr) console.log(`[Proxy] Request body (truncated): ${truncateString(bodyStr, 2000)}`);

		const cleanHeaders = sanitizeHeaders(req.headers);

		// Set content-length if we have a body and header was removed
		if (bodyBuf.length && !(cleanHeaders as any)["content-length"]) {
			(cleanHeaders as any)["content-length"] = Buffer.byteLength(bodyBuf);
		}

		const options = {
			method: req.method,
			headers: cleanHeaders,
		};

		const proxyReq = http.request(targetUrl, options, (proxyRes) => {
			// Collect response for logging while streaming back to client
			const resChunks: Buffer[] = [];

			res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);

			proxyRes.on("data", (chunk: Buffer) => {
				resChunks.push(chunk);
				res.write(chunk);
			});

			proxyRes.on("end", () => {
				res.end();
				const resBody = Buffer.concat(resChunks).toString();
				console.log(`[Proxy] Response <- ${proxyRes.statusCode} Headers: ${JSON.stringify(proxyRes.headers)}`);
				if (resBody) console.log(`[Proxy] Response body (truncated): ${truncateString(resBody, 2000)}`);
			});

			proxyRes.on("error", (err) => {
				console.error("[Proxy] Response error:", err);
			});
		});

		proxyReq.on("error", (err) => {
			console.error("[Proxy] Request error:", err);
			res.writeHead(500, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Proxy error", details: err.message }));
		});

		// Write body (if present) and end
		if (bodyBuf.length && req.method && req.method.toUpperCase() !== "GET" && req.method.toUpperCase() !== "HEAD") {
			proxyReq.write(bodyBuf);
		}
		proxyReq.end();
	});
}

function maskAuthInHeaders(headers: IncomingMessage["headers"]) {
	const out: Record<string, any> = {};
	for (const [k, v] of Object.entries(headers)) {
		if (!k) continue;
		if (k.toLowerCase() === "authorization") {
			try {
				const val = Array.isArray(v) ? v[0] : (v as string | undefined);
				out[k] = val ? `Bearer ${maskToken(val.split(" ").pop() || "")}` : val;
			} catch {
				out[k] = v;
			}
		} else {
			out[k] = v;
		}
	}
	return out;
}

function truncateString(s: string, max = 2000) {
	if (s.length <= max) return s;
	return s.slice(0, max) + `... (truncated ${s.length - max} bytes)`;
}


function verifyToken(
	token: string | undefined | null,
	emails: string[],
	callback: (status: number, result: any | null) => void,
) {
	if (!token) return callback(401, "No token provided");

	const body = JSON.stringify({ token, emails });
	const url = new URL(VERIFY_URL);

	const options = {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
	};

	const req = https.request(url, options, (res) => {
		let data = "";
		res.on("data", (chunk) => (data += chunk));
		res.on("end", () => {
			try {
				const parsed = JSON.parse(data);
				callback(res.statusCode ?? 500, parsed);
			} catch {
				callback(res.statusCode ?? 500, null);
			}
		});
	});

	req.on("error", () => callback(500, null));
	req.write(body);
	req.end();
}

function sanitizeHeaders(
	headers: IncomingMessage["headers"],
): http.OutgoingHttpHeaders {
	const forbidden = new Set([
		"host",
		"authorization",
		"connection",
		"content-length",
		"transfer-encoding",
		"upgrade",
		"proxy-authorization",
		"proxy-authenticate",
		"te",
		"trailers",
	]);

	const clean: http.OutgoingHttpHeaders = {};

	for (const [key, value] of Object.entries(headers)) {
		if (!key) continue;
		const lower = key.toLowerCase();
		if (forbidden.has(lower)) continue;
		clean[key] = value;
	}

	return clean;
}

export function startProxyServer(
	port: number = 52458,
	allowedUsers: { email: string; role: string }[] = [],
) {
	if (server) {
		console.warn("Proxy server already running");
		return {
			server,
			destroy: stopProxyServer,
		};
	}
	server = http.createServer((req, res) => {
		const ip = req.socket.remoteAddress ?? "unknown";
		console.log(`[Connection] Received request from device: ${hashIP(ip)}, Path: ${req.url}`);

		const authHeader = req.headers["authorization"];
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			res.writeHead(401, { "Content-Type": "application/json" });
			console.log("Missing Authorization header");
			return res.end(
				JSON.stringify({ error: "Missing Authorization header" }),
			);
		}

		const token = authHeader.split(" ")[1];
		if (!token) {
			res.writeHead(401, { "Content-Type": "application/json" });
			console.log("Token verification failed");
			return res.end(
				JSON.stringify({ error: "Token verification failed" }),
			);
		}
		console.log("Verifying token:", maskToken(token));

		verifyToken(token, allowedUsers.map(u => u.email), (status, result) => {
			if (status !== 200 || !result || !result.found || !result.email) {
				res.writeHead(401, { "Content-Type": "application/json" });
				console.log("Token verification failed");
				return res.end(
					JSON.stringify({ error: "Token verification failed" }),
				);
			}

			const matched = (allowedUsers || []).find(u => u.email === result.email);
			if (!matched) {
				res.writeHead(403, { "Content-Type": "application/json" });
				console.log("Authenticated but not in allowed users list", maskToken(result.email || ""));
				return res.end(JSON.stringify({ error: "Access denied" }));
			}

			console.log(`[Auth] Verified token for ${hashIP(result.email)}`);

			// Role-based checks: admin => full access. member => read-only for model operations.
			const role = (matched.role || "member").toLowerCase();
			console.log(`[Role] User role: ${role}`);
			if (role !== "admin") {
				const method = (req.method || "GET").toUpperCase();
				const path = req.url || "";
				const safePath = sanitizeForLog(path);

				const sensitivePattern = /pull|rm|remove|delete|create|models|run|pull-model|tags|tasks/i;

				if (method !== "GET" && sensitivePattern.test(path)) {
					res.writeHead(403, { "Content-Type": "application/json" });
					console.log(`Access denied to ${method} ${safePath} for role ${role}`);
					return res.end(JSON.stringify({ error: "Insufficient permissions" }));
				}
			}

			console.log("Request headers: ", JSON.stringify(req.headers));
			//console.log("Request body: ", JSON.stringify(req.));

			forwardRequest(req, res);
		});
	});

	server.listen(port, "0.0.0.0", () => {
		console.log(`Proxy server running on http://localhost:${port}`);
	});

	return {
		server,
		destroy: () => {
			server!.close(() => {
				console.log("Proxy server stopped");
			});
		},
	};
}

export function stopProxyServer() {
	if (server) {
		server.close(() => {
			console.log("Proxy server stopped");
			server = null;
		});
	}
}
