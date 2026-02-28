import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "..", "..", "public");

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

export async function startWebUiServer(
	port = 52459,
	host = "127.0.0.1",
): Promise<string> {
	if (server) return `http://${host}:${port}`;

	server = http.createServer((req, res) => {
		const filePath = tryResolvePublicPath(req.url || "/");
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
			"Access-Control-Allow-Origin": "*",
		});
		fs.createReadStream(filePath).pipe(res);
	});

	await new Promise<void>((resolve, reject) => {
		server!.once("error", reject);
		server!.listen(port, host, () => resolve());
	});

	const url = `http://${host}:${port}`;
	console.info(`Web UI server listening on ${url}`);
	return url;
}

export function stopWebUiServer(): void {
	if (!server) return;
	server.close();
	server = null;
}
