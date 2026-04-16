import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { signWsAuthChallenge } from "./ipcBridge.js";
import type { TLSSocket } from "tls";
import type { Socket } from "net"
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "..", "..", "public");
const INTERNAL_ROUTE_WINDOW_MS = 60_000;
const INTERNAL_ROUTE_MAX_REQUESTS = 120;
const internalRouteHits = new Map<string, { count: number; resetAt: number }>();

let server: http.Server | null = null;

const mimeByExt: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".mjs": "application/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

function getMimeType(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	return mimeByExt[ext] || "application/octet-stream";
}

function tryResolvePublicPath(rawPath: string): string | null {
	let pathname = decodeURIComponent(rawPath.split("?")[0] || "/");
	if (!pathname.startsWith("/")) pathname = `/${pathname}`;
	if (pathname === "/") pathname = "/index.html";

	const candidates = new Set<string>();
	const direct = path.resolve(publicDir, `.${pathname}`);
	candidates.add(direct);

	if (!path.extname(pathname)) {
		candidates.add(path.resolve(publicDir, `.${pathname}.html`));
		candidates.add(path.resolve(publicDir, `.${pathname}`, "index.html"));
	}

	for (const candidate of candidates) {
		if (!candidate.startsWith(publicDir)) continue;
		if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
		return candidate;
	}

	return null;
}

function getRequestHost(req: http.IncomingMessage, fallbackHost: string): string {
	const hostHeader = req.headers.host;
	if (typeof hostHeader !== "string" || hostHeader.trim().length === 0) {
		return fallbackHost;
	}
	return hostHeader.split(":")[0] || fallbackHost;
}

function sendJson(
	res: http.ServerResponse,
	statusCode: number,
	body: Record<string, unknown>,
): void {
	res.writeHead(statusCode, {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff",
	});
	res.end(JSON.stringify(body));
}

function getAllowedOrigins(port: number, protocol: string): Set<string> {
	if (port === 80 && protocol === "http") return new Set(["http://127.0.0.1", "http://localhost", "http://127.0.0.1/", "http://localhost/"]);
	else if (port === 443 && protocol === "https") return new Set(["https://127.0.0.1", "https://localhost", "http://127.0.0.1/", "http://localhost/"]);
	else return new Set([
		`http://127.0.0.1:${port}`,
		`http://localhost:${port}`,
		`http://127.0.0.1:${port}/`,
		`http://localhost:${port}/`
	]);
}

const allowedOriginsCache = new Map<string, Set<string>>();

function getAllowedOriginsCached(port: number, protocol: string): Set<string> {
	const key = `${protocol}:${port}`;
	const cached = allowedOriginsCache.get(key);
	if (cached) return cached;
	const created = getAllowedOrigins(port, protocol);
	allowedOriginsCache.set(key, created);
	return created;
}

function getOriginFromReferer(referer: string): string {
	try {
		return new URL(referer).origin.toLowerCase();
	} catch {
		return "";
	}
}

function isFetchMetadataAllowed(req: http.IncomingMessage): boolean {
	const secFetchSite =
		typeof req.headers["sec-fetch-site"] === "string"
			? req.headers["sec-fetch-site"].trim().toLowerCase()
			: "";
	if (secFetchSite && secFetchSite !== "same-origin") {
		return false;
	}

	const secFetchMode =
		typeof req.headers["sec-fetch-mode"] === "string"
			? req.headers["sec-fetch-mode"].trim().toLowerCase()
			: "";
	if (
		secFetchMode &&
		secFetchMode !== "cors" &&
		secFetchMode !== "same-origin"
	) {
		return false;
	}

	return true;
}

interface ExtendedSocket extends Socket {
  encrypted: boolean | undefined;
}

function isAllowedWebUiRequest(req: http.IncomingMessage, port: number): boolean {
	if (!isFetchMetadataAllowed(req)) return false;
	const allowedOrigins = getAllowedOriginsCached(
		port,
		(req.socket as ExtendedSocket).encrypted ? "https" : "http",
	);
	const origin =
		typeof req.headers.origin === "string"
			? req.headers.origin.trim().toLowerCase()
			: "";
	const referer =
		typeof req.headers.referer === "string"
			? req.headers.referer.trim()
			: "";
	const refererOrigin = referer ? getOriginFromReferer(referer) : "";
	const effectiveOrigin = origin || refererOrigin;
	if (!effectiveOrigin || !allowedOrigins.has(effectiveOrigin)) {
		return false;
	}

	if (refererOrigin && refererOrigin !== effectiveOrigin) {
		return false;
	}

	return true;
}

function readBody(req: http.IncomingMessage, maxBytes = 16 * 1024): Promise<string> {
	return new Promise((resolve, reject) => {
		let total = 0;
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => {
			total += chunk.length;
			if (total > maxBytes) {
				reject(new Error("Request body too large"));
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
		req.on("error", reject);
	});
}

function getRateLimitKey(req: http.IncomingMessage): string {
	const forwarded =
		typeof req.headers["x-forwarded-for"] === "string"
			? req.headers["x-forwarded-for"].split(",")[0]?.trim()
			: "";
	const remote = req.socket.remoteAddress?.trim() || "";
	return (forwarded || remote || "unknown").toLowerCase();
}

function checkAndBumpInternalRateLimit(req: http.IncomingMessage): boolean {
	const now = Date.now();
	const key = getRateLimitKey(req);
	const current = internalRouteHits.get(key);
	if (!current || now >= current.resetAt) {
		internalRouteHits.set(key, {
			count: 1,
			resetAt: now + INTERNAL_ROUTE_WINDOW_MS,
		});
		return false;
	}

	current.count += 1;
	if (current.count > INTERNAL_ROUTE_MAX_REQUESTS) return true;
	return false;
}

export async function startWebUiServer(
	port = 52459,
	host = "127.0.0.1",
	wsPort = 52457,
): Promise<string> {
	const launchUrl = `http://${host}:${port}`;
	if (server) return launchUrl;

	server = http.createServer((req, res) => {
		const reqPath = req.url || "/";
		const pathname = decodeURIComponent(reqPath.split("?")[0] || "/");

		if (pathname.startsWith("/__inferenceport/")) {
			if (checkAndBumpInternalRateLimit(req)) {
				sendJson(res, 429, { error: "Too many requests" });
				return;
			}
		}

		if (pathname === "/__inferenceport/ipc-config") {
			if (req.method !== "GET") {
				sendJson(res, 405, { error: "Method not allowed" });
				return;
			}
			if (!isAllowedWebUiRequest(req, port)) {
				sendJson(res, 403, { error: "Origin not allowed" });
				return;
			}
			const requestHost = getRequestHost(req, host);
			const wsUrl = `ws://${requestHost}:${wsPort}/`;
			sendJson(res, 200, { wsUrl });
			return;
		}

		if (pathname === "/__inferenceport/ws-sign") {
			if (req.method !== "POST") {
				sendJson(res, 405, { error: "Method not allowed" });
				return;
			}
			if (!isAllowedWebUiRequest(req, port)) {
				sendJson(res, 403, { error: "Origin not allowed" });
				return;
			}
			void readBody(req)
				.then((raw) => {
					const parsed = JSON.parse(raw || "{}") as { challenge?: unknown };
					if (
						typeof parsed.challenge !== "string" ||
						parsed.challenge.trim().length === 0
					) {
						sendJson(res, 400, { error: "Missing challenge" });
						return;
					}
					const signature = signWsAuthChallenge(parsed.challenge);
					sendJson(res, 200, { signature });
				})
				.catch(() => {
					sendJson(res, 400, { error: "Invalid request body" });
				});
			return;
		}

		const filePath = tryResolvePublicPath(reqPath);
		if (!filePath) {
			res.writeHead(404, {
				"Content-Type": "text/plain; charset=utf-8",
				"Cache-Control": "no-store",
			});
			res.end("Not found");
			return;
		}

		res.writeHead(200, {
			"Content-Type": getMimeType(filePath),
			"Cache-Control": "no-cache",
			"X-Content-Type-Options": "nosniff",
		});
		fs.createReadStream(filePath).pipe(res);
	});

	await new Promise<void>((resolve, reject) => {
		server!.once("error", reject);
		server!.listen(port, host, () => resolve());
	});

	console.info(`Web UI server listening on ${launchUrl}`);
	return launchUrl;
}

export function stopWebUiServer(): void {
	if (!server) return;
	server.close();
	server = null;
}
