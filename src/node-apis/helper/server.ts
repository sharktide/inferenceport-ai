import http, { IncomingMessage, ServerResponse } from "http";
import https from "https";
import { URL } from "url";


const VERIFY_URL =
	"https://dpixehhdbtzsbckfektd.supabase.co/functions/v1/verify_token_with_email";
const OLLAMA_URL = "http://localhost:11434";

const verifiedIPs = new Map<string, number>();
let server: http.Server | null
function forwardRequest(req: IncomingMessage, res: ServerResponse) {
	const targetUrl = new URL(req.url ?? "/", OLLAMA_URL);

	const options = {
		method: req.method,
		headers: req.headers,
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
	if (!token) {
		return callback(401, "No token provided");
	}
	const body = JSON.stringify({ token, emails });

	const url = new URL(VERIFY_URL);
	const options = {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
            "Authorization": "Bearer: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwaXhlaGhkYnR6c2Jja2Zla3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNDI0MjcsImV4cCI6MjA3NjcxODQyN30.nR1KCSRQj1E_evQWnE2VaZzg7PgLp2kqt4eDKP2PkpE" // gitleaks: allow
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

export function startProxyServer(
	port: number = 52450,
	allowedEmails: string[] = [],
) {
	const server = http.createServer((req, res) => {
		const ip = req.socket.remoteAddress ?? "unknown";
		console.log(`[Connection] Request from IP: ${ip}, Path: ${req.url}`);

		const expiry = verifiedIPs.get(ip);
		if (!expiry || Date.now() > expiry) {
			const authHeader = req.headers["authorization"];
			if (!authHeader || !authHeader.startsWith("Bearer ")) {
				res.writeHead(401, { "Content-Type": "application/json" });
				return res.end(
					JSON.stringify({ error: "Missing Authorization header" }),
				);
			}

			const token = authHeader.split(" ")[1];

			verifyToken(token, allowedEmails, (status, result) => {
				if (status !== 200 || !result || !result.found) {
					res.writeHead(401, { "Content-Type": "application/json" });
					return res.end(
						JSON.stringify({ error: "Token verification failed" }),
					);
				}

				verifiedIPs.set(ip, Date.now() + 7 * 24 * 60 * 60 * 1000);
				console.log(
					`[Auth] Verified IP ${ip} until ${new Date(verifiedIPs.get(ip)!)}`,
				);

				forwardRequest(req, res);
			});
		} else {
			forwardRequest(req, res);
		}
	});

	server.listen(port, () => {
		console.log(`Proxy server running on http://localhost:${port}`);
	});

	return {
		server,
		destroy: () => {
			server.close(() => {
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