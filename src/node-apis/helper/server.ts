import http, { IncomingMessage, ServerResponse } from "http";
import https from "https";
import { URL } from "url";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { app } from "electron";
import { getHardwareRating } from "./sysinfo.js";
import { deriveIpcSessionKey } from "./ecdhAesSession.js";
import { maybeDecryptIncomingProxyBody } from "./proxy52458Client.js";

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

export function sanitizeForLog(value: string): string {
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

const PATH_CRYPTO_CAPABILITIES = "/__inferenceport/crypto-capabilities";
const PATH_CRYPTO_HANDSHAKE = "/__inferenceport/crypto-handshake";

type ForwardRequestOptions = {
	preReadBody?: Buffer;
	sessionKey?: Buffer | null;
};

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let totalSize = 0;
		req.on("data", (chunk: Buffer) => {
			totalSize += chunk.length;
			if (totalSize > MAX_BODY_SIZE) {
				logLine("WARN", "Request body too large");
				req.destroy();
				reject(new Error("Body too large"));
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks)));
		req.on("error", reject);
	});
}

function extractBearerToken(
	authHeader: string | string[] | undefined,
): string | null {
	if (typeof authHeader !== "string") return null;
	if (!authHeader.startsWith("Bearer ")) return null;
	const token = authHeader.slice("Bearer ".length).trim();
	return token.length > 0 ? token : null;
}

function forwardRequest(
	req: IncomingMessage,
	res: ServerResponse,
	options?: ForwardRequestOptions,
) {
	const pathValue = req.url ?? "/";

	if (pathValue.startsWith("http://") || pathValue.startsWith("https://")) {
		res.writeHead(400, { "Content-Type": "application/json" });
		return res.end(JSON.stringify({ error: "Absolute URLs not allowed" }));
	}

	const targetUrl = new URL(pathValue, OLLAMA_URL);
	const safeUrl = targetUrl.origin + targetUrl.pathname;

	const finalize = (rawBody: Buffer) => {
		let bodyBuf = rawBody;
		if (options?.sessionKey && bodyBuf.length > 0) {
			bodyBuf = maybeDecryptIncomingProxyBody(options.sessionKey, bodyBuf);
		}

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
	};

	if (options?.preReadBody !== undefined) {
		finalize(options.preReadBody);
		return;
	}

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
		finalize(Buffer.concat(reqChunks));
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
	serverApiKeys: string[] = [],
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

	const cryptoSessions = new Map<
		string,
		{ key: Buffer; email: string; role: string; expiresAt: number }
	>();
	const WS_SESSION_CURVE = "prime256v1";
	const CRYPTO_SESSION_TTL_MS = 60 * 60 * 1000;

	const purgeExpiredCryptoSessions = (): void => {
		const now = Date.now();
		for (const [id, rec] of [...cryptoSessions.entries()]) {
			if (rec.expiresAt <= now) cryptoSessions.delete(id);
		}
	};

	const lookupCryptoSession = (
		id: string,
	): { key: Buffer; email: string; role: string } | null => {
		purgeExpiredCryptoSessions();
		const rec = cryptoSessions.get(id);
		if (!rec || rec.expiresAt <= Date.now()) return null;
		return { key: rec.key, email: rec.email, role: rec.role };
	};

	const pathOnly = (req: IncomingMessage): string =>
		(req.url || "").split("?")[0] || "/";

	const handleCryptoHandshake = (
		req: IncomingMessage,
		res: ServerResponse,
		matched: { email: string; role: string },
	): void => {
		void readRequestBody(req)
			.then((raw) => {
				let parsed: { clientPublicKey?: unknown; clientNonce?: unknown };
				try {
					parsed = JSON.parse(raw.toString("utf8") || "{}");
				} catch {
					res.writeHead(400, { "Content-Type": "application/json" });
					return res.end(JSON.stringify({ error: "Invalid JSON" }));
				}
				if (
					typeof parsed.clientPublicKey !== "string" ||
					typeof parsed.clientNonce !== "string"
				) {
					res.writeHead(400, { "Content-Type": "application/json" });
					return res.end(
						JSON.stringify({
							error: "Missing clientPublicKey or clientNonce",
						}),
					);
				}

				const challenge = crypto.randomBytes(32).toString("base64url");
				const serverNonce = crypto.randomBytes(16).toString("base64url");
				const serverECDH = crypto.createECDH(WS_SESSION_CURVE);
				serverECDH.generateKeys();
				try {
					const clientPublicKey = Buffer.from(
						parsed.clientPublicKey,
						"base64url",
					);
					const sharedSecret = serverECDH.computeSecret(clientPublicKey);
					const sessionKey = deriveIpcSessionKey(
						sharedSecret,
						challenge,
						serverNonce,
						parsed.clientNonce,
					);
					const sessionId = crypto.randomBytes(24).toString("base64url");
					cryptoSessions.set(sessionId, {
						key: sessionKey,
						email: matched.email,
						role: matched.role || "member",
						expiresAt: Date.now() + CRYPTO_SESSION_TTL_MS,
					});
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(
						JSON.stringify({
							sessionId,
							challenge,
							serverPublicKey: serverECDH
								.getPublicKey()
								.toString("base64url"),
							serverNonce,
						}),
					);
				} catch (err: unknown) {
					logLine(
						"ERROR",
						`Crypto handshake failed: ${sanitizeForLog(String(err))}`,
					);
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Handshake failed" }));
				}
			})
			.catch(() => {
				res.writeHead(500, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Failed to read body" }));
			});
	};

	const routeVerifiedRequest = (
		req: IncomingMessage,
		res: ServerResponse,
		matched: { email: string; role: string },
		sessionKey: Buffer | null,
		ip: string,
	): void => {
		const pathname = pathOnly(req);

		if (req.method === "POST" && pathname === PATH_CRYPTO_HANDSHAKE) {
			handleCryptoHandshake(req, res, matched);
			return;
		}

		if ((matched.role || "member").toLowerCase() !== "admin") {
			const method = (req.method || "GET").toUpperCase();
			if (
				method !== "GET" &&
				/pull|rm|delete|create|models|run/i.test(req.url || "")
			) {
				res.writeHead(403, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						error: "Insufficient permissions",
					}),
				);
				return;
			}
		}

		if (req.method === "POST" && pathname === "/sysinfo") {
			if (!checkHealthRateLimit(ip)) {
				res.writeHead(429);
				res.end();
				return;
			}

			void readRequestBody(req)
				.then(async (buf) => {
					let work = buf;
					if (sessionKey && work.length > 0) {
						work = maybeDecryptIncomingProxyBody(sessionKey, work);
					}
					try {
						const parsed = JSON.parse(work.toString("utf8") || "{}");
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

						const rating = await getHardwareRating(modelSizeRaw);

						if (rating) {
							res.writeHead(200, {
								"Content-Type": "application/json",
							});
							return res.end(JSON.stringify(rating));
						}
						throw new Error("Failed to get hardware rating");
					} catch (err: unknown) {
						logLine(
							"ERROR",
							`Sysinfo error: ${sanitizeForLog(String((err as Error)?.message || err))}`,
						);
						res.writeHead(520, {
							"Content-Type": "application/json",
						});
						return res.end(
							JSON.stringify({ error: "Sysinfo failure" }),
						);
					}
				})
				.catch(() => {
					res.writeHead(500, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Sysinfo read failed" }));
				});
			return;
		}

		if (checkHealthRateLimit(ip)) {
			if (sessionKey) {
				void readRequestBody(req)
					.then((bodyBuf) => {
						forwardRequest(req, res, {
							preReadBody: bodyBuf,
							sessionKey,
						});
					})
					.catch(() => {
						res.writeHead(500, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "Failed to read request body" }));
					});
			} else {
				forwardRequest(req, res);
			}
		} else {
			res.writeHead(429);
			res.end();
		}
	};

	server = http.createServer((req, res) => {
		const reqOrigin = req.headers.origin;
		if (
			reqOrigin === "http://localhost:52458" ||
			reqOrigin === "https://inference.js.org"
		) {
			res.setHeader("Access-Control-Allow-Origin", reqOrigin);
			res.setHeader(
				"Access-Control-Allow-Methods",
				"GET, POST, PUT, DELETE, OPTIONS",
			);
			res.setHeader(
				"Access-Control-Allow-Headers",
				"Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Inferenceport-Session",
			);
		}
		const ip = req.socket.remoteAddress ?? "unknown";

		if (req.method === "OPTIONS") {
			if (
				reqOrigin === "http://localhost:52458" ||
				reqOrigin === "https://inference.js.org"
			) {
				res.writeHead(204);
			} else {
				res.writeHead(403);
			}
			return res.end();
		}

		if (req.method === "GET" && req.url === "/__health") {
			if (!checkHealthRateLimit(ip)) {
				res.writeHead(429);
				return res.end();
			}
			res.writeHead(204);
			return res.end();
		}

		const pathnameEarly = pathOnly(req);
		if (req.method === "GET" && pathnameEarly === PATH_CRYPTO_CAPABILITIES) {
			res.writeHead(200, { "Content-Type": "application/json" });
			return res.end(
				JSON.stringify({ supported: true, version: 1 }),
			);
		}

		logLine(
			"INFO",
			`[Connection] From=${hashIP(ip)} Path=${sanitizeForLog(req.url || "/")}`,
		);

		const sessionHeader = req.headers["x-inferenceport-session"];
		const sessionId =
			typeof sessionHeader === "string" ? sessionHeader.trim() : "";
		const authHeader = req.headers["authorization"];
		const bearerToken = extractBearerToken(authHeader);

		if (sessionId) {
			const sess = lookupCryptoSession(sessionId);
			if (!sess) {
				res.writeHead(401, { "Content-Type": "application/json" });
				return res.end(
					JSON.stringify({ error: "Invalid or expired session" }),
				);
			}
			const matched = allowedUsers.find((u) => u.email === sess.email);
			if (!matched) {
				res.writeHead(403, { "Content-Type": "application/json" });
				return res.end(JSON.stringify({ error: "Access denied" }));
			}
			routeVerifiedRequest(req, res, matched, sess.key, ip);
			return;
		}

		if (!bearerToken) {
			res.writeHead(401, { "Content-Type": "application/json" });
			return res.end(
				JSON.stringify({ error: "Missing Authorization header" }),
			);
		}

		if (serverApiKeys.includes(bearerToken)) {
			const fallbackMatched =
				allowedUsers.find((u) => (u.role || "").toLowerCase() === "admin") ||
				allowedUsers[0] || {
					email: "__server_api_key__",
					role: "admin",
				};
			routeVerifiedRequest(req, res, fallbackMatched, null, ip);
			return;
		}

		logLine("INFO", `Verifying token: ${maskToken(bearerToken)}`);

		verifyToken(
			bearerToken,
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

				routeVerifiedRequest(req, res, matched, null, ip);
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