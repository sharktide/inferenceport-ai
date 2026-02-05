import http, { IncomingMessage, ServerResponse } from "http";
import https from "https";
import { URL } from "url";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { app } from "electron";

const logDir: string = path.join(app.getPath("userData"), "logs");
const logFile = path.join(logDir, "InferencePort-Server.log");
let logWatcher: fs.FSWatcher | null = null;
let lastSize = 0;

fs.mkdirSync(logDir, { recursive: true });

const VERIFY_URL =
	"https://dpixehhdbtzsbckfektd.supabase.co/functions/v1/verify_token_with_email";
const OLLAMA_URL = "http://localhost:11434";

let server: http.Server | null = null;

let logStream: fs.WriteStream | null = null;

function sanitizeForLog(value: string): string {
	return value
		.replace(/[\r\n\t]/g, " ")
		.replace(/\x1b\[[0-9;]*m/g, "")
		.trim();
}

function initLogger() {
	if (logStream) return;
	try {
		logStream = fs.createWriteStream(logFile, { flags: "a" });
	} catch {
		void 0;
	}
}

function logLine(level: "INFO" | "WARN" | "ERROR", message: string) {
	initLogger();
	const line =
		`[${new Date().toISOString()}] [${level}] ` +
		sanitizeForLog(message) +
		"\n";

	if (level === "ERROR") console.error(line.trim());
	else if (level === "WARN") console.warn(line.trim());
	else console.log(line.trim());

	if (logStream) {
		logStream.write(line);
	}
}

function maskToken(token?: string, visibleChars = 6): string {
	if (!token) return "undefined";
	if (token.length <= visibleChars) return "*".repeat(token.length);
	return token.slice(0, visibleChars) + "*".repeat(token.length - visibleChars);
}

function hashIP(ip: string) {
	if (ip === "unknown") return "unknown";
	return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 8);
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
		if (forbidden.has(key.toLowerCase())) continue;
		clean[key] = value;
	}
	return clean;
}

function forwardRequest(req: IncomingMessage, res: ServerResponse) {
	const pathValue = req.url ?? "/";

	if (pathValue.startsWith("http://") || pathValue.startsWith("https://")) {
		res.writeHead(400, { "Content-Type": "application/json" });
		return res.end(JSON.stringify({ error: "Absolute URLs not allowed" }));
	}

	const targetUrl = new URL(pathValue, OLLAMA_URL);
	const reqChunks: Buffer[] = [];

	req.on("data", (chunk: Buffer) => reqChunks.push(chunk));

	req.on("end", () => {
		const bodyBuf = Buffer.concat(reqChunks);

		logLine(
			"INFO",
			`[Proxy] Forwarding -> ${sanitizeForLog(req.method || "UNKNOWN")} ${sanitizeForLog(targetUrl.href)}`,
		);

		const cleanHeaders = sanitizeHeaders(req.headers);
		if (bodyBuf.length && !("content-length" in cleanHeaders)) {
			cleanHeaders["content-length"] = Buffer.byteLength(bodyBuf);
		}

		const proxyReq = http.request(
			targetUrl,
			{ method: req.method, headers: cleanHeaders },
			(proxyRes) => {
				const resChunks: Buffer[] = [];
				res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);

				proxyRes.on("data", (chunk: Buffer) => {
					resChunks.push(chunk);
					res.write(chunk);
				});

				proxyRes.on("end", () => {
					res.end();
					const resBody = Buffer.concat(resChunks).toString();

					logLine(
						"INFO",
						`[Proxy] Response <- ${proxyRes.statusCode}`,
					);
				});

				proxyRes.on("error", (err) => {
					logLine("ERROR", `[Proxy] Response error: ${err?.message || "unknown"}`);
				});
			},
		);

		proxyReq.on("error", (err) => {
			logLine("ERROR", `[Proxy] Request error: ${err?.message || "unknown"}`);
			res.writeHead(500, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Proxy error" }));
		});

		if (
			bodyBuf.length &&
			req.method &&
			!["GET", "HEAD"].includes(req.method.toUpperCase())
		) {
			proxyReq.write(bodyBuf);
		}

		proxyReq.end();
	});
}

function verifyToken(
	token: string | undefined | null,
	emails: string[],
	callback: (status: number, result: any | null) => void,
) {
	if (!token) return callback(401, null);

	const body = JSON.stringify({ token, emails });
	const url = new URL(VERIFY_URL);

	const req = https.request(
		url,
		{ method: "POST", headers: { "Content-Type": "application/json" } },
		(res) => {
			let data = "";
			res.on("data", (chunk) => (data += chunk));
			res.on("end", () => {
				try {
					callback(res.statusCode ?? 500, JSON.parse(data));
				} catch {
					callback(res.statusCode ?? 500, null);
				}
			});
		},
	);

	req.on("error", () => callback(500, null));
	req.write(body);
	req.end();
}

export function startProxyServer(
	port = 52458,
	allowedUsers: { email: string; role: string }[] = [],
) {
	fs.writeFileSync(logFile, "");
	if (server) {
		logLine("WARN", "Proxy server already running");
		return { server, destroy: stopProxyServer };
	}

	server = http.createServer((req, res) => {
		const ip = req.socket.remoteAddress ?? "unknown";

		logLine(
			"INFO",
			`[Connection] From=${hashIP(ip)} Path=${sanitizeForLog(req.url || "/")}`,
		);

		const authHeader = req.headers["authorization"];
		if (!authHeader?.startsWith("Bearer ")) {
			logLine("WARN", "Missing Authorization header");
			res.writeHead(401, { "Content-Type": "application/json" });
			return res.end(JSON.stringify({ error: "Missing Authorization header" }));
		}

		const token = authHeader.split(" ")[1];
		logLine("INFO", `Verifying token: ${maskToken(token)}`);

		verifyToken(token, allowedUsers.map(u => u.email), (status, result) => {
			if (status !== 200 || !result?.found || !result.email) {
				logLine("WARN", "Token verification failed");
				res.writeHead(401, { "Content-Type": "application/json" });
				return res.end(JSON.stringify({ error: "Token verification failed" }));
			}

			const matched = allowedUsers.find(u => u.email === result.email);
			if (!matched) {
				logLine(
					"WARN",
					`Authenticated but not allowed: ${sanitizeForLog(maskToken(result.email))}`,
				);
				res.writeHead(403, { "Content-Type": "application/json" });
				return res.end(JSON.stringify({ error: "Access denied" }));
			}

			logLine(
				"INFO",
				`[Auth] Verified user ${hashIP(sanitizeForLog(result.email))}`,
			);

			const role = (matched.role || "member").toLowerCase();
			logLine("INFO", `[Role] ${sanitizeForLog(role)}`);

			if (role !== "admin") {
				const method = (req.method || "GET").toUpperCase();
				const pathValue = req.url || "";
				const sensitivePattern =
					/pull|rm|remove|delete|create|models|run|pull-model|tags|tasks/i;

				if (method !== "GET" && sensitivePattern.test(pathValue)) {
					logLine(
						"WARN",
						`Access denied ${method} ${sanitizeForLog(pathValue)} role=${role}`,
					);
					res.writeHead(403, { "Content-Type": "application/json" });
					return res.end(JSON.stringify({ error: "Insufficient permissions" }));
				}
			}

			forwardRequest(req, res);
		});
	});

	server.listen(port, "0.0.0.0", () => {
		logLine("INFO", `Proxy server running on http://localhost:${port}`);
	});

	return {
		server,
		destroy: stopProxyServer,
	};
}

export function stopProxyServer() {
	if (server) {
		server.close(() => {
			logLine("INFO", "Proxy server stopped");
			server = null;
		});
	}
}

export function startLogStreaming(event: Electron.IpcMainInvokeEvent) {
	if (logWatcher) return;
	try {
		lastSize = fs.statSync(logFile).size;
	} catch {
		lastSize = 0;
	}

	logWatcher = fs.watch(logFile, async () => {
		try {
			const stat = await fs.promises.stat(logFile);
			if (stat.size < lastSize) lastSize = 0;

			const stream = fs.createReadStream(logFile, { start: lastSize, end: stat.size });
			let chunk = "";
			stream.on("data", (d) => (chunk += d.toString()));
			stream.on("end", () => {
				lastSize = stat.size;
				if (chunk) event.sender.send("ollama:logs-append", chunk);
			});
		} catch {}
	});
}

export function stopLogStreaming() {
	logWatcher?.close();
	logWatcher = null;
}

export async function getServerLogs(): Promise<string> {
	try {
		const data = await fs.promises.readFile(logFile, "utf-8");
		return data;
	} catch {
		return "";
	}
}