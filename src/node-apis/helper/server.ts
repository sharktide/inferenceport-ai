import http, { IncomingMessage, ServerResponse } from "http";
import https from "https";
import { URL } from "url";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { app } from "electron";
import { getHardwareRating } from "./sysinfo.js";

const logDir = path.join(app.getPath("userData"), "logs");
const logFile = path.join(logDir, "InferencePort-Server.log");

fs.mkdirSync(logDir, { recursive: true });

try {
	fs.openSync(logFile, "wx", 0o600);
} catch (err: any) {
	if (err.code !== "EEXIST") throw err;
}

const VERIFY_URL =
	"https://dpixehhdbtzsbckfektd.supabase.co/functions/v1/verify_token_with_email";
const OLLAMA_URL = "http://localhost:11434";

let server: http.Server | null = null;
let logStream: fs.WriteStream | null = null;

const MAX_LOG_SIZE = 10 * 1024 * 1024;

function sanitizeForLog(value: string): string {
	return value
		.replace(/[\r\n\t]/g, " ")
		.replace(/\x1b\[[0-9;]*m/g, "")
		.trim();
}

function rotateLogIfNeeded() {
	try {
		const stat = fs.statSync(logFile);
		if (stat.size >= MAX_LOG_SIZE) {
			const rotated = logFile.replace(".log", `-${Date.now()}.log`);
			logStream?.end();
			logStream = null;
			fs.renameSync(logFile, rotated);
		}
	} catch {}
}

function initLogger() {
	if (logStream) return;
	try {
		logStream = fs.createWriteStream(logFile, { flags: "a" });
	} catch {}
}

function logLine(level: "INFO" | "WARN" | "ERROR", message: string) {
	rotateLogIfNeeded();
	initLogger();

	const line =
		`[${new Date().toISOString()}] [${level}] ` +
		sanitizeForLog(message) +
		"\n";

	if (level === "ERROR") console.error(line.trim());
	else if (level === "WARN") console.warn(line.trim());
	else console.log(line.trim());

	logStream?.write(line);
}

const HEALTH_RATE_LIMIT = { windowMs: 60_000, max: 30 };
const healthHits = new Map<string, { count: number; resetAt: number }>();

function checkHealthRateLimit(ip: string): boolean {
	const now = Date.now();
	const entry = healthHits.get(ip);

	if (!entry || now > entry.resetAt) {
		healthHits.set(ip, {
			count: 1,
			resetAt: now + HEALTH_RATE_LIMIT.windowMs,
		});
		return true;
	}

	if (entry.count >= HEALTH_RATE_LIMIT.max) return false;
	entry.count++;
	return true;
}

function maskToken(token?: string, visibleChars = 6): string {
	if (!token) return "undefined";
	if (token.length <= visibleChars) return "*".repeat(token.length);
	return (
		token.slice(0, visibleChars) + "*".repeat(token.length - visibleChars)
	);
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
		if (!key || forbidden.has(key.toLowerCase())) continue;
		clean[key] = value;
	}
	return clean;
}

const MAX_BODY_SIZE = 20 * 1024 * 1024;

function forwardRequest(req: IncomingMessage, res: ServerResponse) {
	const pathValue = req.url ?? "/";

	if (pathValue.startsWith("http://") || pathValue.startsWith("https://")) {
		res.writeHead(400, { "Content-Type": "application/json" });
		return res.end(JSON.stringify({ error: "Absolute URLs not allowed" }));
	}

	const targetUrl = new URL(pathValue, OLLAMA_URL);
	const safeUrl = targetUrl.origin + targetUrl.pathname;

	let totalSize = 0;
	const reqChunks: Buffer[] = [];

	req.on("data", (chunk: Buffer) => {
		totalSize += chunk.length;
		if (totalSize > MAX_BODY_SIZE) {
			logLine("WARN", "Request body too large");
			req.destroy();
			return;
		}
		reqChunks.push(chunk);
	});

	req.on("end", () => {
		const bodyBuf = Buffer.concat(reqChunks);

		logLine(
			"INFO",
			`[Proxy] Forwarding -> ${sanitizeForLog(req.method || "UNKNOWN")} ${sanitizeForLog(safeUrl)}`,
		);

		const cleanHeaders = sanitizeHeaders(req.headers);
		if (bodyBuf.length && !("content-length" in cleanHeaders)) {
			cleanHeaders["content-length"] = Buffer.byteLength(bodyBuf);
		}

		const proxyReq = http.request(
			targetUrl,
			{ method: req.method, headers: cleanHeaders },
			(proxyRes) => {
				res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
				proxyRes.pipe(res);
			},
		);

		proxyReq.on("error", (err) => {
			logLine("ERROR", `[Proxy] Request error: ${err.message}`);
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
	if (logStream) {
		logStream.end();
		logStream = null;
	}
	fs.truncateSync(logFile, 0);

	if (server) {
		logLine("WARN", "Proxy server already running");
		return { server, destroy: stopProxyServer };
	}

	server = http.createServer((req, res) => {
		const ip = req.socket.remoteAddress ?? "unknown";

		if (req.method === "GET" && req.url === "/__health") {
			if (!checkHealthRateLimit(ip)) {
				res.writeHead(429);
				return res.end();
			}
			res.writeHead(204);
			return res.end();
		}

		logLine(
			"INFO",
			`[Connection] From=${hashIP(ip)} Path=${sanitizeForLog(req.url || "/")}`,
		);

		const authHeader = req.headers["authorization"];
		if (!authHeader?.startsWith("Bearer ")) {
			res.writeHead(401, { "Content-Type": "application/json" });
			return res.end(
				JSON.stringify({ error: "Missing Authorization header" }),
			);
		}

		const token = authHeader.split(" ")[1];
		logLine("INFO", `Verifying token: ${maskToken(token)}`);

		verifyToken(
			token,
			allowedUsers.map((u) => u.email),
			(status, result) => {
				if (status !== 200 || !result?.found || !result.email) {
					res.writeHead(401, { "Content-Type": "application/json" });
					return res.end(
						JSON.stringify({ error: "Token verification failed" }),
					);
				}

				const matched = allowedUsers.find(
					(u) => u.email === result.email,
				);
				if (!matched) {
					res.writeHead(403, { "Content-Type": "application/json" });
					return res.end(JSON.stringify({ error: "Access denied" }));
				}

				if ((matched.role || "member").toLowerCase() !== "admin") {
					const method = (req.method || "GET").toUpperCase();
					if (
						method !== "GET" &&
						/pull|rm|delete|create|models|run/i.test(req.url || "")
					) {
						res.writeHead(403, {
							"Content-Type": "application/json",
						});
						return res.end(
							JSON.stringify({
								error: "Insufficient permissions",
							}),
						);
					}
				}
				if (req.method === "POST" && req.url === "/sysinfo") {
					if (!checkHealthRateLimit(ip)) {
						res.writeHead(429);
						return res.end();
					}

					let body = "";
					req.on("data", (chunk) => {
						body += chunk;
						if (body.length > MAX_BODY_SIZE) {
							logLine("WARN", "Sysinfo body too large");
							req.destroy();
						}
					});

					req.on("end", async () => {
						try {
							const parsed = JSON.parse(body || "{}");
							const modelSizeRaw = parsed.modelSizeRaw;

							if (!modelSizeRaw) {
								res.writeHead(400, {
									"Content-Type": "application/json",
								});
								return res.end(
									JSON.stringify({
										error: "Missing modelSizeRaw",
									}),
								);
							}

							const rating =
								await getHardwareRating(modelSizeRaw);

							if (rating) {
								res.writeHead(200, {
									"Content-Type": "application/json",
								});
								return res.end(JSON.stringify({ rating }));
							} else {
								throw new Error(
									"Failed to get hardware rating",
								);
							}
						} catch (err: any) {
							logLine("ERROR", `Sysinfo error: ${err.message}`);
							res.writeHead(520, {
								"Content-Type": "application/json",
							});
							return res.end(
								JSON.stringify({ error: "Sysinfo failure" }),
							);
						}
					});

					return;
				}

				if (!checkHealthRateLimit(ip)) {
					forwardRequest(req, res);
				} else {
					res.writeHead(429);
					return res.end();
				}
			},
		);
	});

	server.listen(port, "0.0.0.0", () => {
		logLine("INFO", `Proxy server running on http://localhost:${port}`);
	});

	return { server, destroy: stopProxyServer };
}

export function stopProxyServer() {
	server?.close(() => {
		logLine("INFO", "Proxy server stopped");
		server = null;
	});
}

export async function getServerLogs(): Promise<string> {
	try {
		return await fs.promises.readFile(logFile, "utf-8");
	} catch {
		return "";
	}
}
