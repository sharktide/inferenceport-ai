import crypto from "crypto";
import fs from "fs";
import path from "path";
import { app } from "electron";

const LIGHTNING_CLIENT_ID_FILE = "lightning-client-id";
const CLIENT_ID_MIN_LENGTH = 16;
const CLIENT_ID_MAX_LENGTH = 128;

let cachedClientId: string | null = null;

function sanitizeClientId(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (
		trimmed.length < CLIENT_ID_MIN_LENGTH ||
		trimmed.length > CLIENT_ID_MAX_LENGTH
	) {
		return null;
	}
	if (!/^[a-zA-Z0-9._:-]+$/.test(trimmed)) {
		return null;
	}
	return trimmed;
}

function generateClientId(): string {
	return `ipc-${crypto.randomUUID()}`;
}

export async function getLightningClientId(): Promise<string> {
	if (cachedClientId) return cachedClientId;

	const userData = app.getPath("userData");
	const filePath = path.join(userData, LIGHTNING_CLIENT_ID_FILE);

	try {
		const existing = await fs.promises.readFile(filePath, "utf-8");
		const sanitized = sanitizeClientId(existing);
		if (sanitized) {
			cachedClientId = sanitized;
			return sanitized;
		}
	} catch (_err) {
		void 0;
	}

	const generated = generateClientId();
	cachedClientId = generated;

	try {
		await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
		await fs.promises.writeFile(filePath, generated, {
			encoding: "utf-8",
			mode: 0o600,
		});
	} catch (_err) {
		void 0;
	}

	return generated;
}
