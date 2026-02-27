import { BrowserWindow, ipcMain } from "electron";
import { AsyncLocalStorage } from "node:async_hooks";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { WebSocketServer, type WebSocket } from "ws";

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
		if (
			value.__ipcType === "bytes" &&
			typeof value.base64 === "string"
		) {
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
	ws.send(JSON.stringify(payload));
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

function createSender(ws: WebSocket): { send: (channel: string, ...args: unknown[]) => void } {
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
	console.log("Broadcasting IPC event", channel, args);
	for (const win of BrowserWindow.getAllWindows()) {
		try {
			win.webContents.send(channel, ...args);
		} catch (err) {
			console.warn(`Failed to broadcast IPC event '${channel}'`, err);
		}
	}

	const store = ipcContext.getStore();

	const payload: WsEvent = {
		type: "event",
		channel,
		args: args.map((entry) => encodeValue(entry)),
	};

	if (store?.ws) {
		console.log("Broadcasting IPC event", channel, args);
		sendWs(store.ws, payload);
		return;
	}

	for (const ws of wsClients) {
		console.log("Broadcasting IPC event over websocket", channel, args);
		sendWs(ws, payload);
		console.log("Broadcasted IPC event over websocket", channel, args);
	}
}

export function initIpcWebSocketBridge(): void {
	trackIpcChannels();

	if (wsServer) return;

	const wsPort = Number(process.env.INFERENCEPORT_IPC_WS_PORT || 52459);
	const wsHost = process.env.INFERENCEPORT_IPC_WS_HOST || "127.0.0.1";

	wsServer = new WebSocketServer({
		port: wsPort,
		host: wsHost,
		perMessageDeflate: false,
	});

	wsServer.on("connection", (ws) => {
		wsClients.add(ws);

		ws.on("message", async (raw) => {
			let message: WsRequest;
			try {
				message = JSON.parse(rawToString(raw)) as WsRequest;
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
							`IPC send dispatch failed for '${message.channel}'`,
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
		});

		ws.on("close", () => {
			wsClients.delete(ws);
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
