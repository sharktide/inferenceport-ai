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

    const options = {
        method: req.method,
        headers: sanitizeHeaders(req.headers),
    };

    const proxyReq = http.request(targetUrl, options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    req.pipe(proxyReq, { end: true });

    proxyReq.on("error", (err) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Proxy error", details: err.message }));
    });
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
			if (role !== "admin") {
				const method = (req.method || "GET").toUpperCase();
				const path = req.url || "";

				const sensitivePattern = /pull|rm|remove|delete|create|models|run|pull-model|tags|tasks/i;

				if (method !== "GET" && sensitivePattern.test(path)) {
					res.writeHead(403, { "Content-Type": "application/json" });
					console.log(`Access denied to ${method} ${path} for role ${role}`);
					return res.end(JSON.stringify({ error: "Insufficient permissions" }));
				}
			}

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
