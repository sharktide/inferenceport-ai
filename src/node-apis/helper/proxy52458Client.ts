import {
	createCipheriv,
	createDecipheriv,
	createECDH,
	randomBytes,
} from "node:crypto";
import { issueProxyToken } from "../auth.js";
import { deriveIpcSessionKey } from "./ecdhAesSession.js";
import { Readable } from "node:stream";

const CAPABILITIES_PATH = "/__inferenceport/crypto-capabilities";
const HANDSHAKE_PATH = "/__inferenceport/crypto-handshake";
const SESSION_TTL_MS = 60 * 60 * 1000;
const SESSION_REFRESH_MS = 120_000;

type EncryptedEnvelope = {
	type: "enc";
	iv: string;
	tag: string;
	data: string;
};

type SessionState = {
	sessionId: string;
	sessionKey: Buffer;
	expiresAt: number;
};

const warnedLegacy = new Map<string, true>();

function originFromUrl(url: string): string {
	const u = new URL(url);
	return u.origin;
}

function encryptAesGcm256(
	key: Buffer,
	plaintext: Buffer,
): { iv: string; tag: string; data: string } {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();
	return {
		iv: iv.toString("base64url"),
		tag: tag.toString("base64url"),
		data: enc.toString("base64url"),
	};
}

async function bodyToBuffer(body: BodyInit): Promise<Buffer> {
	if (body instanceof Readable) {
		throw new TypeError(
			"Node.js Readable streams are not supported as request bodies in secure fetch. Convert to Buffer or Web ReadableStream."
		);
	}
	if (body instanceof ArrayBuffer) return Buffer.from(body);
	if (ArrayBuffer.isView(body)) {
		return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
	}
	if (typeof body === "string") return Buffer.from(body, "utf8");
	if (body instanceof Blob) return Buffer.from(await body.arrayBuffer());
	if (body instanceof URLSearchParams) {
		return Buffer.from(body.toString(), "utf8");
	}
	const reader = (body as ReadableStream<Uint8Array>).getReader?.();
	if (reader) {
		const chunks: Buffer[] = [];
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) chunks.push(Buffer.from(value));
		}
		return Buffer.concat(chunks);
	}
	return Buffer.from(String(body), "utf8");
}

async function fetchCapabilities(
	baseOrigin: string,
	bearer: string,
): Promise<boolean> {
	try {
		const res = await fetch(`${baseOrigin}${CAPABILITIES_PATH}`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${bearer}`,
			},
			cache: "no-store",
		});
		if (!res.ok) return false;
		const json = (await res.json()) as { supported?: unknown; version?: unknown };
		return json.supported === true && json.version === 1;
	} catch {
		return false;
	}
}

async function establishSession(
	baseOrigin: string,
	bearer: string,
): Promise<SessionState | null> {
	const supported = await fetchCapabilities(baseOrigin, bearer);
	if (!supported) {
		if (!warnedLegacy.has(baseOrigin)) {
			warnedLegacy.set(baseOrigin, true);
			console.warn(
				`[InferencePort] Proxy at ${baseOrigin} did not grant encrypted transport for this client (GET ${CAPABILITIES_PATH}). ` +
					"Traffic can still work, but bearer tokens and request bodies may be sent in cleartext on the HTTP link. Use the API-backed app flow, update the host app, or place HTTPS in front of the proxy.",
			);
		}
		return null;
	}

	const clientNonce = randomBytes(16);
	const ecdh = createECDH("prime256v1");
	ecdh.generateKeys();
	const clientPublicKey = ecdh.getPublicKey();

	const handshakeRes = await fetch(`${baseOrigin}${HANDSHAKE_PATH}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${bearer}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			clientPublicKey: clientPublicKey.toString("base64url"),
			clientNonce: clientNonce.toString("base64url"),
		}),
		cache: "no-store",
	});

	if (!handshakeRes.ok) return null;

	const payload = (await handshakeRes.json()) as {
		sessionId?: unknown;
		challenge?: unknown;
		serverPublicKey?: unknown;
		serverNonce?: unknown;
	};

	if (
		typeof payload.sessionId !== "string" ||
		typeof payload.challenge !== "string" ||
		typeof payload.serverPublicKey !== "string" ||
		typeof payload.serverNonce !== "string"
	) {
		return null;
	}

	const serverPub = Buffer.from(payload.serverPublicKey, "base64url");
	const sharedSecret = ecdh.computeSecret(serverPub);
	const clientNonceB64 = clientNonce.toString("base64url");
	const sessionKey = deriveIpcSessionKey(
		sharedSecret,
		payload.challenge,
		payload.serverNonce,
		clientNonceB64,
	);

	return {
		sessionId: payload.sessionId,
		sessionKey,
		expiresAt: Date.now() + SESSION_TTL_MS,
	};
}

function maybeDecryptIncomingProxyBody(
	key: Buffer,
	raw: Buffer,
): Buffer {
	if (raw.length === 0) return raw;
	try {
		const parsed = JSON.parse(raw.toString("utf8")) as EncryptedEnvelope;
		if (
			parsed?.type !== "enc" ||
			typeof parsed.iv !== "string" ||
			typeof parsed.tag !== "string" ||
			typeof parsed.data !== "string"
		) {
			return raw;
		}
		const iv = Buffer.from(parsed.iv, "base64url");
		const tag = Buffer.from(parsed.tag, "base64url");
		const data = Buffer.from(parsed.data, "base64url");
		const decipher = createDecipheriv("aes-256-gcm", key, iv);
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(data), decipher.final()]);
	} catch {
		return raw;
	}
}

export type Secure52458Fetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

/**
 * Returns a fetch function that negotiates an encrypted session when the proxy
 * advertises support, so Bearer tokens and POST bodies are not sent in the clear.
 */
export function createSecure52458Fetch(
	getBearer: () => Promise<string>,
): Secure52458Fetch {
	const sessionByOrigin = new Map<string, SessionState | null>();

	return async function secureFetch(
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> {
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.toString()
					: input.url;
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			return fetch(input, init);
		}
		if (parsed.port !== "52458") {
			return fetch(input, init);
		}

		const origin = parsed.origin;
		const bearer = await getBearer();
		let session = sessionByOrigin.get(origin);
		if (
			!session ||
			session.expiresAt <= Date.now() + SESSION_REFRESH_MS
		) {
			session = await establishSession(origin, bearer);
			sessionByOrigin.set(origin, session);
		}

		if (!session) {
			const headers = new Headers(init?.headers);
			headers.set("Authorization", `Bearer ${bearer}`);
			return fetch(input, { ...init, headers });
		}

		const headers = new Headers(init?.headers);
		headers.delete("authorization");
		headers.set("X-Inferenceport-Session", session.sessionId);
		headers.set("Authorization", `Bearer ${bearer}`);

		const method = (init?.method || "GET").toUpperCase();
		let body = init?.body;

		if (
			body != null &&
			method !== "GET" &&
			method !== "HEAD"
		) {
			const plain = await bodyToBuffer(body);
			const enc = encryptAesGcm256(session.sessionKey, plain);
			const envelope: EncryptedEnvelope = {
				type: "enc",
				iv: enc.iv,
				tag: enc.tag,
				data: enc.data,
			};
			headers.set("Content-Type", "application/json");
			body = JSON.stringify(envelope);
		}

		const nextInit: RequestInit = { ...init, headers };
		if (body !== undefined) {
			nextInit.body = body;
		}
		const res = await fetch(input, nextInit);

		if (res.status === 401) {
			sessionByOrigin.delete(origin);
		}

		return res;
	};
}

export { maybeDecryptIncomingProxyBody };

/** Shared fetch wrapper for all Node-side calls to the 52458 proxy. */
export const defaultSecure52458Fetch = createSecure52458Fetch(issueProxyToken);
