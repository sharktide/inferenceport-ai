type EncodedBytes = {
	__ipcType: "bytes";
	base64: string;
};

type WsResultMessage = {
	type: "result";
	id: string;
	ok: boolean;
	value?: unknown;
	error?: string;
};

type WsEventMessage = {
	type: "event";
	channel: string;
	args?: unknown[];
};

type WsAuthMessage = {
	type: "auth_challenge" | "auth_response" | "auth_ok" | "auth_error";
	challenge?: string;
	signature?: string;
	error?: string;
};

type WsServerMessage = WsResultMessage | WsEventMessage | WsAuthMessage;

type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (reason?: unknown) => void;
};

type ChannelListener = (...args: unknown[]) => void;
type StorageChange = {
	type: "set" | "remove" | "clear";
	key?: string;
	value?: string;
};

type BridgeWindowGlobals = {
	__INFERENCEPORT_WS_URL__?: unknown;
};

type BridgeRuntimeConfig = {
	wsUrl: string;
};

let bridgeRuntimeConfigPromise: Promise<BridgeRuntimeConfig | null> | null =
	null;

function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function encodeValue(value: unknown): unknown {
	if (value instanceof ArrayBuffer) {
		return {
			__ipcType: "bytes",
			base64: toBase64(new Uint8Array(value)),
		} as EncodedBytes;
	}

	if (ArrayBuffer.isView(value)) {
		const bytes = new Uint8Array(
			value.buffer,
			value.byteOffset,
			value.byteLength,
		);
		return {
			__ipcType: "bytes",
			base64: toBase64(bytes),
		} as EncodedBytes;
	}

	if (Array.isArray(value)) {
		return value.map((entry) => encodeValue(entry));
	}

	if (isObject(value)) {
		const out: Record<string, unknown> = Object.create(null) as Record<
			string,
			unknown
		>;
		for (const [key, entry] of Object.entries(value)) {
			if (
				key === "__proto__" ||
				key === "constructor" ||
				key === "prototype"
			)
				continue;
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
			return fromBase64(value.base64);
		}

		const out: Record<string, unknown> = Object.create(null) as Record<
			string,
			unknown
		>;
		for (const [key, entry] of Object.entries(value)) {
			if (
				key === "__proto__" ||
				key === "constructor" ||
				key === "prototype"
			)
				continue;
			out[key] = decodeValue(entry);
		}
		return out;
	}

	return value;
}

class WsIpcClient {
	private socket: WebSocket | null = null;
	private connectPromise: Promise<void> | null = null;
	private pending = new Map<string, PendingRequest>();
	private listeners = new Map<string, Set<ChannelListener>>();
	private nextRequestId = 0;
	private readonly urls: string[];
	private authenticated = false;

	constructor(urls: string[]) {
		const normalized = urls
			.map((url) => url.trim())
			.filter((url) => url.length > 0);
		this.urls = [...new Set(normalized)];
	}

	private buildRequestId(): string {
		this.nextRequestId += 1;
		return `${Date.now()}-${this.nextRequestId}`;
	}

	private rejectAllPending(reason: string): void {
		for (const pending of this.pending.values()) {
			pending.reject(new Error(reason));
		}
		this.pending.clear();
	}

	private onServerMessage(raw: unknown): void {
		const rawLog = String(raw)
			.replace(/[\x00-\x1F\x7F]/g, " ")
			.slice(0, 500);
		console.log("Received IPC message", rawLog);
		if (typeof raw !== "string") return;

		let message: WsServerMessage;
		try {
			message = JSON.parse(raw) as WsServerMessage;
		} catch {
			return;
		}

		if (!message || typeof message !== "object") return;

		// Skip non-auth messages if not authenticated
		if (
			message.type !== "auth_challenge" &&
			message.type !== "auth_ok" &&
			message.type !== "auth_error" &&
			!this.authenticated
		) {
			return;
		}

		if (message.type === "result") {
			const pending = this.pending.get(message.id);
			if (!pending) return;

			this.pending.delete(message.id);
			if (message.ok) {
				pending.resolve(decodeValue(message.value));
				return;
			}
			pending.reject(new Error(message.error || "IPC request failed"));
			return;
		}

		if (message.type === "event") {
			const handlers = this.listeners.get(message.channel);
			if (!handlers || handlers.size === 0) return;

			const args = (message.args || []).map((entry) =>
				decodeValue(entry),
			);
			for (const handler of handlers) {
				try {
					handler(...args);
				} catch (err) {
					const channelLog =
						typeof message.channel === "string"
							? message.channel
									.replace(/[\r\n]/g, " ")
									.slice(0, 200)
							: String(message.channel)
									.replace(/[\r\n]/g, " ")
									.slice(0, 200);
					console.warn(
						"IPC event listener failed for",
						channelLog,
						err,
					);
				}
			}
		}
	}

	private getCandidateSummary(): string {
		return this.urls.join(", ");
	}

	private installSocketHandlers(socket: WebSocket, url: string): void {
		socket.addEventListener("message", (event) => {
			this.onServerMessage(event.data);
		});

		socket.addEventListener("close", () => {
			if (this.socket === socket) {
				this.socket = null;
				this.authenticated = false;
			}
			this.rejectAllPending("Websocket bridge disconnected");
		});

		socket.addEventListener("error", () => {
			if (socket.readyState === WebSocket.OPEN) {
				console.warn(`Websocket bridge error at ${url}`);
			}
		});
	}

	private async authenticateSocket(socket: WebSocket): Promise<void> {
		return new Promise((resolve, reject) => {
			this.completeAuth(socket, resolve, reject);
		});
	}

	private completeAuth(
		socket: WebSocket,
		resolve: () => void,
		reject: (error: unknown) => void,
	): void {
		let authSettled = false;
		const authTimeout = setTimeout(() => {
			if (!authSettled) {
				authSettled = true;
				handleAuthMessage.cleanup();
				reject(new Error("Authentication handshake timed out"));
			}
		}, 5000);

		const handleAuthMessage = async (event: Event) => {
			if (!(event instanceof MessageEvent)) return;
			if (typeof event.data !== "string") return;

			let message: WsAuthMessage;
			try {
				message = JSON.parse(event.data);
			} catch {
				return;
			}

			if (!message || typeof message !== "object") return;

			if (
				message.type === "auth_challenge" &&
				typeof message.challenge === "string"
			) {
				try {
					const signature = await resolveChallengeSignature(
						message.challenge,
					);
					socket.send(
						JSON.stringify({
							type: "auth_response",
							signature,
						}),
					);
				} catch (err) {
					if (!authSettled) {
						authSettled = true;
						handleAuthMessage.cleanup();
						reject(new Error(`Failed to sign challenge: ${err}`));
					}
				}
			} else if (message.type === "auth_ok") {
				if (!authSettled) {
					authSettled = true;
					this.authenticated = true;
					handleAuthMessage.cleanup();
					resolve();
				}
			} else if (message.type === "auth_error") {
				if (!authSettled) {
					authSettled = true;
					handleAuthMessage.cleanup();
					reject(
						new Error(
							`Server auth error: ${message.error || "Unknown error"}`,
						),
					);
				}
			}
		};

		handleAuthMessage.cleanup = () => {
			clearTimeout(authTimeout);
			socket.removeEventListener("message", handleAuthMessage);
		};

		socket.addEventListener("message", handleAuthMessage);
	}

	private async connectSingle(
		url: string,
		timeoutMs = 1200,
	): Promise<WebSocket> {
		return await new Promise((resolve, reject) => {
			const socket = new WebSocket(url);
			let settled = false;

			const cleanup = () => {
				clearTimeout(timerId);
				socket.removeEventListener("open", onOpen);
				socket.removeEventListener("error", onError);
				socket.removeEventListener("close", onClose);
			};

			const fail = (reason: Error) => {
				if (settled) return;
				settled = true;
				cleanup();
				try {
					socket.close();
				} catch {
					void 0;
				}
				reject(reason);
			};

			const onOpen = () => {
				if (settled) return;
				// Start authentication before installing normal handlers
				this.authenticateSocket(socket)
					.then(() => {
						if (settled) return;
						settled = true;
						cleanup();
						this.installSocketHandlers(socket, url);
						resolve(socket);
					})
					.catch((err) => fail(err as Error));
			};

			const onError = () => {
				fail(
					new Error(
						`Unable to connect to websocket bridge at ${url}`,
					),
				);
			};

			const onClose = () => {
				fail(
					new Error(
						`Websocket bridge closed during connect at ${url}`,
					),
				);
			};

			const timerId = setTimeout(() => {
				fail(
					new Error(
						`Timed out connecting to websocket bridge at ${url}`,
					),
				);
			}, timeoutMs);

			socket.addEventListener("open", onOpen);
			socket.addEventListener("error", onError);
			socket.addEventListener("close", onClose);
		});
	}

	private async connect(): Promise<void> {
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			return;
		}

		if (this.connectPromise) {
			return this.connectPromise;
		}

		this.connectPromise = (async () => {
			for (const candidate of this.urls) {
				try {
					const socket = await this.connectSingle(candidate);
					this.socket = socket;
					return;
				} catch {
					void 0;
				}
			}
			throw new Error(
				`Unable to connect to websocket bridge. Tried: ${this.getCandidateSummary()}.`,
			);
		})();

		try {
			await this.connectPromise;
		} finally {
			this.connectPromise = null;
		}
	}

	private async sendRequest(
		type: "invoke" | "send",
		channel: string,
		args: unknown[],
		expectReply: boolean,
	): Promise<unknown> {
		await this.connect();
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
			throw new Error(
				`Websocket is not connected. Tried: ${this.getCandidateSummary()}`,
			);
		}

		const payload: Record<string, unknown> = {
			type,
			channel,
			args: args.map((entry) => encodeValue(entry)),
		};

		if (!expectReply) {
			this.socket.send(JSON.stringify(payload));
			return undefined;
		}

		const id = this.buildRequestId();
		payload.id = id;

		return await new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.socket!.send(JSON.stringify(payload));
		});
	}

	async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
		return await this.sendRequest("invoke", channel, args, true);
	}

	async send(channel: string, ...args: unknown[]): Promise<void> {
		await this.sendRequest("send", channel, args, false);
	}

	on(channel: string, listener: ChannelListener): void {
		const set = this.listeners.get(channel) || new Set<ChannelListener>();
		set.add(listener);
		this.listeners.set(channel, set);
	}

	removeAllListeners(channel: string): void {
		this.listeners.delete(channel);
	}
}

function resolveWsCandidates(): string[] {
	const globalUrl = (window as BridgeWindowGlobals).__INFERENCEPORT_WS_URL__;
	if (typeof globalUrl === "string" && globalUrl.trim()) {
		return [globalUrl.trim()];
	}

	const params = new URLSearchParams(window.location.search);
	const queryUrl = params.get("ipc_ws") || params.get("ws");
	if (queryUrl && queryUrl.trim()) {
		return [queryUrl.trim()];
	}

	try {
		const localStorageUrl = localStorage.getItem("inferenceport_ws_url");
		if (localStorageUrl && localStorageUrl.trim()) {
			return [localStorageUrl.trim()];
		}
	} catch {
		void 0;
	}

	if (window.location.protocol === "file:") {
		return ["ws://127.0.0.1:52457", "ws://127.0.0.1:52456"];
	}

	const protocol = window.location.protocol === "https:" ? "wss" : "ws";
	const host = window.location.hostname || "127.0.0.1";
	return [`${protocol}://${host}:52457`, `${protocol}://${host}:52456`];
}

async function fetchBridgeRuntimeConfig(): Promise<BridgeRuntimeConfig | null> {
	if (window.location.protocol === "file:") return null;

	if (!bridgeRuntimeConfigPromise) {
		bridgeRuntimeConfigPromise = (async () => {
			try {
				const response = await fetch("/__inferenceport/ipc-config", {
					method: "GET",
					cache: "no-store",
					credentials: "omit",
				});
				if (!response.ok) return null;
				const payload = (await response.json()) as {
					wsUrl?: unknown;
				};
				if (
					typeof payload.wsUrl !== "string" ||
					!payload.wsUrl.trim()
				) {
					return null;
				}

				try {
					localStorage.setItem(
						"inferenceport_ws_url",
						payload.wsUrl.trim(),
					);
				} catch {
					void 0;
				}

				return {
					wsUrl: payload.wsUrl.trim(),
				};
			} catch {
				return null;
			}
		})();
	}

	return await bridgeRuntimeConfigPromise;
}

async function signChallengeWithServer(
	challenge: string,
): Promise<string | null> {
	if (window.location.protocol === "file:") return null;
	try {
		const response = await fetch("/__inferenceport/ws-sign", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			cache: "no-store",
			credentials: "omit",
			body: JSON.stringify({ challenge }),
		});
		if (!response.ok) return null;
		const payload = (await response.json()) as { signature?: unknown };
		if (
			typeof payload.signature !== "string" ||
			!payload.signature.trim()
		) {
			return null;
		}
		return payload.signature.trim();
	} catch {
		return null;
	}
}

async function resolveChallengeSignature(challenge: string): Promise<string> {
	const serverSignature = await signChallengeWithServer(challenge);
	if (serverSignature) return serverSignature;

	throw new Error(
		"Unable to sign websocket challenge. Ensure the Web UI is served by this app and /__inferenceport/ws-sign is reachable.",
	);
}

function escapeHtml(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function hasElectronIpc(): boolean {
	return (
		typeof window.ollama?.listModels === "function" &&
		typeof window.utils?.getPath === "function"
	);
}

function getBrowserAuthSessionKey(): string {
	return "inferenceport.browser.auth.session";
}

function getDefaultAuthSession(): AuthSessionView {
	return {
		isAuthenticated: false,
		user: null,
		expiresAt: null,
	};
}

function normalizeAuthSessionView(value: unknown): AuthSessionView {
	if (!isObject(value)) return getDefaultAuthSession();

	const rawUser = isObject(value.user) ? value.user : null;
	const user =
		rawUser && typeof rawUser.id === "string"
			? {
					id: rawUser.id,
					provider:
						typeof rawUser.provider === "string"
							? rawUser.provider
							: null,
				}
			: null;

	return {
		isAuthenticated:
			typeof value.isAuthenticated === "boolean"
				? value.isAuthenticated
				: false,
		user,
		expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : null,
	};
}

function readBrowserAuthSession(): AuthSessionView {
	try {
		const raw = localStorage.getItem(getBrowserAuthSessionKey());
		if (!raw) return getDefaultAuthSession();
		return normalizeAuthSessionView(JSON.parse(raw));
	} catch {
		return getDefaultAuthSession();
	}
}

function writeBrowserAuthSession(session: AuthSessionView | null): void {
	try {
		if (!session) {
			localStorage.removeItem(getBrowserAuthSessionKey());
			return;
		}
		localStorage.setItem(
			getBrowserAuthSessionKey(),
			JSON.stringify(session),
		);
	} catch {
		void 0;
	}
}

function buildProviderAuthUrl(provider: "github" | "google"): string {
	const supabaseUrl = "https://dpixehhdbtzsbckfektd.supabase.co";
	const redirectTo = `https://inference.js.org/authcallback.html?rd=${window.location.origin}/auth.html`;
	const params = new URLSearchParams({
		provider,
		redirect_to: redirectTo,
	});
	return `${supabaseUrl}/auth/v1/authorize?${params.toString()}`;
}

function createEventHub() {
	const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
	return {
		on: (channel: string, cb: (...args: unknown[]) => void) => {
			const set =
				listeners.get(channel) ||
				new Set<(...args: unknown[]) => void>();
			set.add(cb);
			listeners.set(channel, set);
		},
		emit: (channel: string, ...args: unknown[]) => {
			const set = listeners.get(channel);
			if (!set) return;
			for (const cb of set) cb(...args);
		},
		clear: (channel: string) => {
			listeners.delete(channel);
		},
	};
}

export function installWebSocketTransportFallback(): void {
	if (hasElectronIpc()) return;

	void fetchBridgeRuntimeConfig();

	const client = new WsIpcClient(resolveWsCandidates());
	const events = createEventHub();
	let chatAbortController: AbortController | null = null;

	const invokeOrDefault = async <T>(
		channel: string,
		args: unknown[],
	): Promise<T> => {
		return (await client.invoke(channel, ...args)) as T;
	};

	client.on("ollama:chat-token", (token) =>
		events.emit("ollama:chat-token", token),
	);
	client.on("ollama:chat-error", (err) =>
		events.emit("ollama:chat-error", err),
	);
	client.on("ollama:chat-done", () => events.emit("ollama:chat-done"));
	client.on("ollama:chat-aborted", () => events.emit("ollama:chat-aborted"));
	client.on("ollama:new_tool_call", (call) =>
		events.emit("ollama:new_tool_call", call),
	);
	client.on("ollama:new-asset", (asset) =>
		events.emit("ollama:new-asset", asset),
	);
	client.on("ollama:pull-progress", (progress) =>
		events.emit("ollama:pull-progress", progress),
	);
	client.on("ollama:logs-append", (chunk) =>
		events.emit("ollama:logs-append", chunk),
	);
	client.on("auth:stateChanged", (session) => {
		const safeSession = normalizeAuthSessionView(session);
		writeBrowserAuthSession(safeSession);
		events.emit("auth:stateChanged", safeSession);
	});
	client.on("storage:changed", (change) =>
		events.emit("storage:changed", change),
	);

	window.ollama = {
		listModels: async (clientUrl?: string) =>
			invokeOrDefault<ModelInfo[]>("ollama:list", [clientUrl]),
		runModel: async (name: string) => String(name),
		deleteModel: async (name: string, clientUrl?: string) =>
			invokeOrDefault<string>("ollama:delete", [name, clientUrl]),
		autoNameSession: async (
			model: string,
			prompt: string,
			clientUrl?: string | undefined,
		) => {
			return await invokeOrDefault<string>("ollama:auto-name-session", [
				model,
				prompt,
				clientUrl,
			]);
		},
		resetChat: async () => {
			await invokeOrDefault("ollama:reset", []);
		},
		stop: () => {
			void client.send("ollama:stop").catch(() => {
				events.emit("ollama:chat-aborted");
			});
		},
		pullModel: async (name: string, clientUrl?: string) =>
			invokeOrDefault<string>("ollama:pull", [name, clientUrl]),
		onPullProgress: (cb: (data: PullProgress) => void) => {
			events.on("ollama:pull-progress", (data) =>
				cb(data as PullProgress),
			);
		},
		streamPrompt: (
			model: string,
			prompt: string,
			toolList: {
				search: boolean;
				imageGen: boolean;
				videoGen: boolean;
				audioGen: boolean;
			},
			clientUrl?: string,
		) => {
			void client
				.send("ollama:chat-stream", model, prompt, toolList, clientUrl)
				.catch((err) => {
					queueMicrotask(() => {
						const detail =
							err instanceof Error ? err.message : String(err);
						events.emit(
							"ollama:chat-error",
							`Unable to reach local websocket bridge (ports 52457 then 52456). ${detail}`,
						);
					});
				});
		},
		onResponse: (cb: (token: string) => void) => {
			events.on("ollama:chat-token", (token) => cb(String(token)));
		},
		onError: (cb: (err: string) => void) => {
			events.on("ollama:chat-error", (err) => cb(String(err)));
		},
		onDone: (cb: () => void) => {
			events.on("ollama:chat-done", () => cb());
		},
		onAbort: (cb: () => void) => {
			events.on("ollama:chat-aborted", () => cb());
		},
		onToolCall: (cb: (call: any) => void) => {
			events.on("ollama:new_tool_call", (call) => cb(call));
		},
		load: async () => invokeOrDefault<Sessions>("sessions:load", []),
		save: async (sessions: Sessions) => {
			await invokeOrDefault("sessions:save", [sessions]);
		},
		getPath: async () => invokeOrDefault<string>("session:getPath", []),
		removeAllListeners: () => {
			events.clear("ollama:chat-token");
			events.clear("ollama:chat-error");
			events.clear("ollama:chat-done");
			events.clear("ollama:chat-aborted");
		},
		isAvailable: async () =>
			invokeOrDefault<boolean>("ollama:available", []),
		onNewAsset: (cb: (msg: any) => void) => {
			events.on("ollama:new-asset", (msg) => cb(msg));
		},
		getToolSupportingModels: async () =>
			invokeOrDefault<{ supportsTools: string[] }>(
				"ollama:get-tool-models",
				[],
			),
		fetchToolSupportingModels: async () =>
			invokeOrDefault<{ supportsTools: string[] }>(
				"ollama:fetch-tool-models",
				[],
			),
		startServer: async (
			port: number,
			allowedUsers: { email: string; role: string }[],
		) => {
			await invokeOrDefault("ollama:start-proxy-server", [
				port,
				allowedUsers,
			]);
		},
		stopServer: async () => {
			await invokeOrDefault("ollama:stop-proxy-server", []);
		},
		onLogAppend: (callback: (chunk: string) => void) => {
			events.on("ollama:logs-append", (chunk) => callback(String(chunk)));
		},
		getServerLogs: async () =>
			invokeOrDefault<string>("ollama:get-server-logs", []),
		importGGUF: async (
			fileName: string,
			data: Uint8Array | null,
			isModelFile: boolean,
			clientUrl?: string,
		) =>
			invokeOrDefault<string>("ollama:import-gguf", [
				fileName,
				data,
				isModelFile,
				clientUrl,
			]),
		importGGUFMulti: async (
			modelfileData: Uint8Array | null,
			ggufName: string,
			ggufData: Uint8Array | null,
			clientUrl?: string,
		) =>
			invokeOrDefault<string>("ollama:import-gguf-multi", [
				modelfileData,
				ggufName,
				ggufData,
				clientUrl,
			]),
		resolveVideoToolCall: async (
			toolCallId: string,
			payload: Record<string, unknown> | null,
		) =>
			invokeOrDefault<boolean>("ollama:resolve-video-tool-call", [
				toolCallId,
				payload,
			]),
		resolveImageToolCall: async (
			toolCallId: string,
			payload: Record<string, unknown> | null,
		) =>
			invokeOrDefault<boolean>("ollama:resolve-image-tool-call", [
				toolCallId,
				payload,
			]),
		resolveAudioToolCall: async (
			toolCallId: string,
			payload: Record<string, unknown> | null,
		) =>
			invokeOrDefault<boolean>("ollama:resolve-audio-tool-call", [
				toolCallId,
				payload,
			]),
	};

	window.utils = {
		getAsset: async (assetId: string) =>
			invokeOrDefault<Uint8Array>("utils:getAsset", [assetId]),
		rmAsset: async (assetId: string) => {
			await invokeOrDefault("utils:rmAsset", [assetId]);
		},
		listAssets: async () =>
			invokeOrDefault<Array<string>>("utils:listAssets", []),
		web_open: async (url: string) => {
			try {
				await client.invoke("utils:web_open", url);
			} catch {
				window.open(url, "_blank", "noopener,noreferrer");
			}
		},
		markdown_parse_and_purify: async (
			markdown: string,
		): Promise<string> => {
			return client.invoke(
				"utils:markdown_parse_and_purify",
				markdown,
			) as Promise<string>;
		},
		DOMPurify: (html: string): Promise<string> => {
			return client.invoke("utils:dompurify", html) as Promise<string>;
		},
		saveFile: async (filePath: string, content: string) => {
			await invokeOrDefault("utils:saveFile", [filePath, content]);
		},
		getPath: async (): Promise<string> =>
			invokeOrDefault<string>("utils:getPath", []),
		getWarning: async (modelSize: string, clientUrl?: string) =>
			invokeOrDefault("utils:get-hardware-performance-warning", [
				modelSize,
				clientUrl,
			]),
		isFirstLaunch: async () =>
			invokeOrDefault<boolean>("utils:is-first-launch", []),
		resetFirstLaunch: async () =>
			invokeOrDefault<boolean>("utils:reset-first-launch", []),
	};

	window.hfspaces = {
		get_cards: async () =>
			invokeOrDefault<string>("hfspaces:get-cards", []),
		delete: async (username: string, repo: string) => {
			await invokeOrDefault("hfspaces:delete", [username, repo]);
		},
		share: async (username: string, repo: string) => {
			await invokeOrDefault("hfspaces:share", [username, repo]);
		},
		get_website_cards: async () =>
			invokeOrDefault<string>("hfspaces:get-website-cards", []),
		delete_website: async (url: string) =>
			invokeOrDefault<boolean>("hfspaces:delete-website", [url]),
		share_website: async (url: string, title: string) => {
			await invokeOrDefault("hfspaces:share-website", [url, title]);
		},
	};

	window.auth = {
		signInWithEmail: async (email: string, password: string) =>
			invokeOrDefault("auth:signInWithEmail", [email, password]),
		signInWithGitHub: async () => {
			window.location.assign(buildProviderAuthUrl("github"));
		},
		signInWithGoogle: async () => {
			window.location.assign(buildProviderAuthUrl("google"));
		},
		signUpWithEmail: async (email: string, password: string) =>
			invokeOrDefault("auth:signUpWithEmail", [email, password]),
		setUsername: async (userId: string, username: string) =>
			invokeOrDefault("auth:setUsername", [userId, username]),
		signOut: async () => {
			writeBrowserAuthSession(null);
			events.emit("auth:stateChanged", getDefaultAuthSession());
			return await invokeOrDefault("auth:signOut", []);
		},
		getSession: async () => {
			const result = await invokeOrDefault<AuthSessionResponse>(
				"auth:getSession",
				[],
			);
			if (result?.session) {
				writeBrowserAuthSession(
					normalizeAuthSessionView(result.session),
				);
			}
			return result;
		},
		onAuthStateChange: (callback: (session: AuthSessionView) => void) => {
			events.on("auth:stateChanged", (session) =>
				callback(normalizeAuthSessionView(session)),
			);
			void client.invoke("auth:onAuthStateChange").catch(() => void 0);
			callback(readBrowserAuthSession());
		},
		resetPassword: async (email: string) =>
			invokeOrDefault("auth:resetPassword", [email]),
		verifyPassword: async (password: string) =>
			invokeOrDefault("auth:verify-password", [{ password }]),
		deleteAccount: async () => invokeOrDefault("auth:delete-account", []),
		setSessionFromTokens: async (
			accessToken: string,
			refreshToken: string,
		) => {
			const result = await invokeOrDefault<AuthSessionResponse>(
				"auth:setSessionTokens",
				[accessToken, refreshToken],
			);
			if (result?.session) {
				const safeSession = normalizeAuthSessionView(result.session);
				writeBrowserAuthSession(safeSession);
				events.emit("auth:stateChanged", safeSession);
			}
			return result;
		},
	};

	window.sync = {
		getRemoteSessions: async () =>
			invokeOrDefault<Record<string, Session>>(
				"sync:getRemoteSessions",
				[],
			),
		saveAllSessions: async (sessions: Record<string, Sessions>) =>
			invokeOrDefault<string | { error: string }>(
				"sync:saveAllSessions",
				[sessions],
			),
	};

	window.storageSync = {
		getAll: async () =>
			invokeOrDefault<Record<string, string>>("storage:get-all", []),
		setItem: async (key: string, value: string) =>
			invokeOrDefault<boolean>("storage:set-item", [key, value]),
		removeItem: async (key: string) =>
			invokeOrDefault<boolean>("storage:remove-item", [key]),
		clear: async () => invokeOrDefault<boolean>("storage:clear", []),
		onChange: (callback: (change: StorageChange) => void) => {
			events.on("storage:changed", (change) =>
				callback(change as StorageChange),
			);
		},
	};

	window.startup = {
		getSettings: async () => invokeOrDefault("startup:get-settings", []),
		updateSettings: async (patch) =>
			invokeOrDefault("startup:update-settings", [patch]),
	};
}
