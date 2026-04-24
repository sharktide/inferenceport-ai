import { app, BrowserWindow, ipcMain } from "electron";
import { AsyncLocalStorage } from "node:async_hooks";
import {
	randomBytes,
	createHmac,
	createECDH,
	createCipheriv,
	createDecipheriv,
} from "node:crypto";
import { deriveIpcSessionKey } from "./ecdhAesSession.js";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { WebSocketServer, type WebSocket } from "ws";
import fs from "fs";
import path from "path";
import { sanitizeForLog } from "./server.js";

type InvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;
type OnHandler = (event: IpcMainEvent, ...args: unknown[]) => unknown;

type IpcContext = {
	ws: WebSocket;
};

const ipcContext = new AsyncLocalStorage<IpcContext>();
type EncodedBuffer = {
	__ipcType: "bytes";
	base64: string;
};

type WsInvokeRequest = {
	type: "invoke";
	id: string;
	channel: string;
	args?: unknown[];
};

type WsSendRequest = {
	type: "send";
	id?: string;
	channel: string;
	args?: unknown[];
};

type WsRequest = WsInvokeRequest | WsSendRequest;

type WsResult = {
	type: "result";
	id: string;
	ok: boolean;
	value?: unknown;
	error?: string;
};

type WsEvent = {
	type: "event";
	channel: string;
	args?: unknown[];
};

const invokeHandlers = new Map<string, InvokeHandler>();
const onHandlers = new Map<string, Set<OnHandler>>();
const wsClients = new Set<WebSocket>();

let wsServer: WebSocketServer | null = null;
let isPatched = false;

const WS_AUTH_TOKEN_FILE = "ipc-ws-auth-token";

function loadOrCreateWsAuthToken(): string {
	const envToken = process.env.INFERENCEPORT_IPC_WS_AUTH_TOKEN?.trim();
	if (envToken) return envToken;

	const generated = randomBytes(32).toString("base64url");

	try {
		const userDataDir = app.getPath("userData");
		const tokenPath = path.join(userDataDir, WS_AUTH_TOKEN_FILE);
		try {
		const fd = fs.openSync(
			tokenPath,
			fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
		);

		const stat = fs.fstatSync(fd);
		if (!stat.isFile()) {
			throw new Error("Token path is not a regular file");
		}

		const existing = fs.readFileSync(fd, "utf8").trim();
		fs.closeSync(fd);
		return existing;
		} catch (err: any) {
		if (err.code !== "ENOENT") throw err;
		}
		const dir = path.dirname(tokenPath);

		try {
			const st = fs.lstatSync(dir);
			if (!st.isDirectory()) throw new Error("Invalid token directory");
		} catch (err: Error | any) {
			if (err.code === "ENOENT") {
				fs.mkdirSync(dir, { recursive: false, mode: 0o700 });
			} else {
				throw err;
			}
		}

		try {
			fs.writeFileSync(tokenPath, generated, {
				encoding: "utf-8",
				mode: 0o600,
				flag: "wx",
			});
			return generated;
		} catch (err: Error | any) {
			if (err.code !== "EEXIST") {
				console.warn("Unable to persist websocket auth token", err);
				return generated;
			}
			const fd = fs.openSync(tokenPath, fs.constants.O_RDONLY);
			const existing = fs.readFileSync(fd, "utf8").trim();
			fs.closeSync(fd);

			return existing || generated;
		}
	} catch (err) {
		console.warn(
			sanitizeForLog("Unable to load websocket auth token from userData"),
			err,
		);
		return generated;
	}
}

const WS_AUTH_TOKEN = loadOrCreateWsAuthToken();
const WS_SESSION_CURVE = "prime256v1";
const wsSessionKeys = new WeakMap<WebSocket, Buffer>();

type WsAuthMessage = {
	type: "auth_challenge" | "auth_response" | "auth_ok" | "auth_error";
	challenge?: string;
	signature?: string;
	error?: string;
	encrypted?: boolean;
	warning?: string;
	secure?: {
		version: 1;
		curve: "P-256";
		serverPublicKey?: string;
		serverNonce?: string;
		clientPublicKey?: string;
		clientNonce?: string;
	};
};

type EncryptedEnvelope = {
	type: "enc";
	iv: string;
	tag: string;
	data: string;
};

type IpcBridgeOptions = {
	port?: number;
	host?: string;
	allowedOrigins?: string[];
};

function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function encodeValue(value: unknown): unknown {
	if (Buffer.isBuffer(value)) {
		return {
			__ipcType: "bytes",
			base64: value.toString("base64"),
		} as EncodedBuffer;
	}

	if (ArrayBuffer.isView(value)) {
		const bytes = Buffer.from(
			value.buffer,
			value.byteOffset,
			value.byteLength,
		);
		return {
			__ipcType: "bytes",
			base64: bytes.toString("base64"),
		} as EncodedBuffer;
	}

	if (value instanceof ArrayBuffer) {
		const bytes = Buffer.from(value);
		return {
			__ipcType: "bytes",
			base64: bytes.toString("base64"),
		} as EncodedBuffer;
	}

	if (Array.isArray(value)) {
		return value.map((entry) => encodeValue(entry));
	}

	if (isObject(value)) {
		const out: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value)) {
			out[key] = encodeValue(entry);
		}
		return out;
	}

	return value;
}

function decodeValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) => decodeValue(entry));
	}

	if (isObject(value)) {
		if (value.__ipcType === "bytes" && typeof value.base64 === "string") {
			return Buffer.from(value.base64, "base64");
		}

		const out: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value)) {
			out[key] = decodeValue(entry);
		}
		return out;
	}

	return value;
}

function decodeArgs(args: unknown[] | undefined): unknown[] {
	return (args || []).map((entry) => decodeValue(entry));
}

function rawToString(raw: unknown): string {
	if (typeof raw === "string") return raw;
	if (Buffer.isBuffer(raw)) return raw.toString("utf-8");
	if (Array.isArray(raw)) {
		return Buffer.concat(raw.map((entry) => Buffer.from(entry))).toString(
			"utf-8",
		);
	}
	if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf-8");
	return String(raw);
}

function sendWs(ws: WebSocket, payload: WsResult | WsEvent): void {
	if (ws.readyState !== 1) return;
	const sessionKey = wsSessionKeys.get(ws);
	if (!sessionKey) {
		ws.send(JSON.stringify(payload));
		return;
	}

	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", sessionKey, iv);
	const plaintext = Buffer.from(JSON.stringify(payload), "utf-8");
	const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();
	const envelope: EncryptedEnvelope = {
		type: "enc",
		iv: iv.toString("base64url"),
		tag: tag.toString("base64url"),
		data: encrypted.toString("base64url"),
	};
	ws.send(JSON.stringify(envelope));
}

function sendWsEventToAll(channel: string, args: unknown[]): void {
	const payload: WsEvent = {
		type: "event",
		channel,
		args: args.map((entry) => encodeValue(entry)),
	};

	for (const ws of wsClients) {
		sendWs(ws, payload);
	}
}

function serializeError(err: unknown): string {
	if (err instanceof Error) return err.stack || err.message;
	return String(err);
}

function generateChallenge(): string {
	return randomBytes(32).toString("base64url");
}

function decryptEnvelope(
	sessionKey: Buffer,
	envelope: EncryptedEnvelope,
): string {
	const iv = Buffer.from(envelope.iv, "base64url");
	const tag = Buffer.from(envelope.tag, "base64url");
	const data = Buffer.from(envelope.data, "base64url");
	const decipher = createDecipheriv("aes-256-gcm", sessionKey, iv);
	decipher.setAuthTag(tag);
	const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
	return plaintext.toString("utf-8");
}

export function signWsAuthChallenge(challenge: string): string {
	return createHmac("sha256", WS_AUTH_TOKEN)
		.update(challenge)
		.digest("base64url");
}

function verifyHmac(
	token: string,
	challenge: string,
	signature: string,
): boolean {
	const expected = createHmac("sha256", token)
		.update(challenge)
		.digest("base64url");
	return expected === signature;
}

function createSender(ws: WebSocket): {
	send: (channel: string, ...args: unknown[]) => void;
} {
	return {
		send: (channel: string, ...args: unknown[]) => {
			sendWs(ws, {
				type: "event",
				channel,
				args: args.map((entry) => encodeValue(entry)),
			});
		},
	};
}

async function dispatchInvoke(
	msg: WsInvokeRequest,
	ws: WebSocket,
): Promise<unknown> {
	return ipcContext.run({ ws }, async () => {
		const handler = invokeHandlers.get(msg.channel);
		if (handler) {
			const event = {
				sender: createSender(ws),
			} as unknown as IpcMainInvokeEvent;

			return await handler(event, ...decodeArgs(msg.args));
		}

		const listeners = onHandlers.get(msg.channel);
		if (!listeners || listeners.size === 0) {
			throw new Error(
				`No IPC handler registered for channel '${msg.channel}'`,
			);
		}

		const event = {
			sender: createSender(ws),
			returnValue: undefined as unknown,
		} as unknown as IpcMainEvent;

		for (const listener of listeners) {
			await Promise.resolve(listener(event, ...decodeArgs(msg.args)));
		}

		return (event as { returnValue?: unknown }).returnValue;
	});
}

async function dispatchSend(
	msg: WsSendRequest,
	ws: WebSocket,
): Promise<unknown> {
	return ipcContext.run({ ws }, async () => {
		const listeners = onHandlers.get(msg.channel);
		if (!listeners || listeners.size === 0) {
			return undefined;
		}

		const event = {
			sender: createSender(ws),
			returnValue: undefined as unknown,
		} as unknown as IpcMainEvent;

		for (const listener of listeners) {
			await Promise.resolve(listener(event, ...decodeArgs(msg.args)));
		}

		return (event as { returnValue?: unknown }).returnValue;
	});
}

function trackIpcChannels(): void {
	if (isPatched) return;
	isPatched = true;

	const originalHandle = ipcMain.handle.bind(ipcMain);
	const originalOn = ipcMain.on.bind(ipcMain);

	(ipcMain as unknown as { handle: typeof ipcMain.handle }).handle = (
		channel,
		listener,
	) => {
		invokeHandlers.set(channel, listener as unknown as InvokeHandler);
		return originalHandle(channel, listener);
	};

	(ipcMain as unknown as { on: typeof ipcMain.on }).on = (
		channel,
		listener,
	) => {
		const listeners = onHandlers.get(channel) || new Set<OnHandler>();
		listeners.add(listener as unknown as OnHandler);
		onHandlers.set(channel, listeners);
		return originalOn(channel, listener);
	};
}

export function broadcastIpcEvent(channel: string, ...args: unknown[]): void {
	for (const win of BrowserWindow.getAllWindows()) {
		try {
			win.webContents.send(channel, ...args);
		} catch (err) {
			console.warn(
				"Failed to broadcast IPC event",
				sanitizeForLog(channel),
				err,
			);
		}
	}

	const store = ipcContext.getStore();

	const payload: WsEvent = {
		type: "event",
		channel,
		args: args.map((entry) => encodeValue(entry)),
	};

	if (store?.ws) {
		sendWs(store.ws, payload);
		return;
	}

	for (const ws of wsClients) {
		sendWs(ws, payload);
	}
}
function normalizeOrigin(origin: string): string {
	try {
		const url = new URL(origin);
		const protocol = url.protocol;
		const hostname = url.hostname;
		const port = url.port;

		if (
			(protocol === "http:" && port === "80") ||
			(protocol === "https:" && port === "443")
		) {
			return `${protocol}//${hostname}`;
		}

		return port
			? `${protocol}//${hostname}:${port}`
			: `${protocol}//${hostname}`;
	} catch {
		return origin;
	}
}

export function initIpcWebSocketBridge(options: IpcBridgeOptions = {}): void {
	trackIpcChannels();

	if (wsServer) return;

	const wsPort = Number(
		options.port ?? process.env.INFERENCEPORT_IPC_WS_PORT ?? 52459,
	);
	const wsHost =
		options.host ?? process.env.INFERENCEPORT_IPC_WS_HOST ?? "127.0.0.1";
	const allowedOrigins = new Set(
		(options.allowedOrigins || [])
			.map((o) => normalizeOrigin(o.trim().toLowerCase()))
			.filter((o) => o.length > 0),
	);

	wsServer = new WebSocketServer({
		port: wsPort,
		host: wsHost,
		perMessageDeflate: false,
	});

	wsServer.on("connection", (ws, req) => {
		const originHeader =
			typeof req.headers.origin === "string"
				? normalizeOrigin(req.headers.origin.trim().toLowerCase())
				: "";
		if (allowedOrigins.size > 0 && !allowedOrigins.has(originHeader)) {
			try {
				ws.close(1008, "Origin not allowed");
			} catch {
				void 0;
			}
			return;
		}

		const challenge = generateChallenge();
		const serverNonce = randomBytes(16).toString("base64url");
		const serverECDH = createECDH(WS_SESSION_CURVE);
		serverECDH.generateKeys();
		const authMessage: WsAuthMessage = {
			type: "auth_challenge",
			challenge,
			secure: {
				version: 1,
				curve: "P-256",
				serverPublicKey: serverECDH.getPublicKey().toString("base64url"),
				serverNonce,
			},
		};
		sendWs(ws, authMessage as unknown as WsEvent);

		let authenticated = false;

		const onAuthMessage = async (raw: unknown) => {
			let message: WsAuthMessage | WsRequest;
			try {
				message = JSON.parse(rawToString(raw)) as
					| WsAuthMessage
					| WsRequest;
			} catch {
				return;
			}

			if (!message || typeof message !== "object") return;

			if (!authenticated) {
				// Handle authentication
				if (
					(message as WsAuthMessage).type === "auth_response" &&
					typeof (message as WsAuthMessage).signature === "string"
				) {
					if (
						verifyHmac(
							WS_AUTH_TOKEN,
							challenge,
							(message as WsAuthMessage).signature!,
						)
						) {
							authenticated = true;
							wsClients.add(ws);
							let encrypted = false;
							const secure = (message as WsAuthMessage).secure;
						if (
							secure?.version === 1 &&
								secure.curve === "P-256" &&
								typeof secure.clientPublicKey === "string" &&
								typeof secure.clientNonce === "string"
							) {
								try {
									const clientPublicKey = Buffer.from(
										secure.clientPublicKey,
										"base64url",
									);
									const sharedSecret =
										serverECDH.computeSecret(clientPublicKey);
									const sessionKey = deriveIpcSessionKey(
										sharedSecret,
										challenge,
										serverNonce,
										secure.clientNonce,
									);
									wsSessionKeys.set(ws, sessionKey);
									encrypted = true;
								} catch {
									encrypted = false;
								}
							}
							ws.send(
								JSON.stringify({
									type: "auth_ok",
									encrypted,
									warning: encrypted
										? undefined
										: "Legacy client connected without encrypted IPC payloads. Update this client to enable secure transport.",
								} as WsAuthMessage),
							);
							if (!encrypted) {
								console.warn(
									"Legacy websocket client connected without encrypted IPC payloads.",
								);
							}
							// Remove auth listener and attach normal message handler
							ws.off("message", onAuthMessage);
							ws.on("message", onNormalMessage);
					} else {
						sendWs(ws, {
							type: "auth_error",
							error: "Invalid signature",
						} as unknown as WsEvent);
						ws.close();
					}
				} else {
					sendWs(ws, {
						type: "auth_error",
						error: "Malformed auth response",
					} as unknown as WsEvent);
					ws.close();
				}
				return;
			}
		};

		const onNormalMessage = async (raw: unknown) => {
			let message: WsRequest;
			try {
				let parsed = JSON.parse(rawToString(raw)) as
					| WsRequest
					| EncryptedEnvelope;
				if (
					parsed &&
					typeof parsed === "object" &&
					(parsed as EncryptedEnvelope).type === "enc"
				) {
					const sessionKey = wsSessionKeys.get(ws);
					if (!sessionKey) return;
					const decrypted = decryptEnvelope(
						sessionKey,
						parsed as EncryptedEnvelope,
					);
					parsed = JSON.parse(decrypted) as WsRequest;
				}
				message = parsed as WsRequest;
			} catch {
				return;
			}

			if (!message || typeof message !== "object") return;

			if (message.type === "invoke") {
				try {
					const value = await dispatchInvoke(message, ws);
					sendWs(ws, {
						type: "result",
						id: message.id,
						ok: true,
						value: encodeValue(value),
					});
				} catch (err) {
					sendWs(ws, {
						type: "result",
						id: message.id,
						ok: false,
						error: serializeError(err),
					});
				}
				return;
			}

			if (message.type === "send") {
				if (!message.id) {
					void dispatchSend(message, ws).catch((err) => {
						console.warn(
							sanitizeForLog(
								`IPC send dispatch failed for '${message.channel}'`,
							),
							err,
						);
					});
					return;
				}

				try {
					const value = await dispatchSend(message, ws);
					sendWs(ws, {
						type: "result",
						id: message.id,
						ok: true,
						value: encodeValue(value),
					});
				} catch (err) {
					sendWs(ws, {
						type: "result",
						id: message.id,
						ok: false,
						error: serializeError(err),
					});
				}
			}
		};

		ws.on("message", onAuthMessage);

		ws.on("close", () => {
			wsClients.delete(ws);
			wsSessionKeys.delete(ws);
		});
	});

	wsServer.on("listening", () => {
		console.info(
			`IPC websocket bridge listening on ws://${wsHost}:${wsPort}`,
		);
	});

	wsServer.on("error", (err) => {
		console.error("IPC websocket bridge error", err);
	});
}

export function stopIpcWebSocketBridge(): void {
	if (!wsServer) return;

	for (const ws of wsClients) {
		try {
			ws.close();
		} catch {
			void 0;
		}
	}
	wsClients.clear();
	wsServer.close();
	wsServer = null;
}
