import { createHash } from "node:crypto";

/**
 * Derives the AES-256-GCM session key used by the IPC websocket bridge and
 * the 52458 proxy encrypted transport. Must match the browser client in
 * ipcTransportFallback.ts (shared secret + UTF-8 challenge + raw nonce bytes).
 */
export function deriveIpcSessionKey(
	sharedSecret: Buffer,
	challenge: string,
	serverNonceB64: string,
	clientNonceB64: string,
): Buffer {
	return createHash("sha256")
		.update(sharedSecret)
		.update(challenge, "utf8")
		.update(Buffer.from(serverNonceB64, "base64url"))
		.update(Buffer.from(clientNonceB64, "base64url"))
		.digest();
}
