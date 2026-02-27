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

type WsServerMessage = WsResultMessage | WsEventMessage;

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
			return fromBase64(value.base64);
		}

		const out: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value)) {
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

	constructor(private readonly url: string) {}

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
		if (typeof raw !== "string") return;

		let message: WsServerMessage;
		try {
			message = JSON.parse(raw) as WsServerMessage;
		} catch {
			return;
		}

		if (!message || typeof message !== "object") return;

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

			const args = (message.args || []).map((entry) => decodeValue(entry));
			for (const handler of handlers) {
				try {
					handler(...args);
				} catch (err) {
					console.warn(`IPC event listener failed for ${message.channel}`, err);
				}
			}
		}
	}

	private async connect(): Promise<void> {
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			return;
		}

		if (this.connectPromise) {
			return this.connectPromise;
		}

		this.connectPromise = new Promise((resolve, reject) => {
			const socket = new WebSocket(this.url);

			socket.addEventListener("open", () => {
				this.socket = socket;
				resolve();
			});

			socket.addEventListener("message", (event) => {
				this.onServerMessage(event.data);
			});

			socket.addEventListener("error", () => {
				if (socket.readyState !== WebSocket.OPEN) {
					reject(new Error(`Unable to connect to websocket bridge at ${this.url}`));
				}
			});

			socket.addEventListener("close", () => {
				this.socket = null;
				this.connectPromise = null;
				this.rejectAllPending("Websocket bridge disconnected");
			});
		});

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
			throw new Error("Websocket is not connected");
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

function resolveWsUrl(): string {
	const globalUrl = (window as { __INFERENCEPORT_WS_URL__?: unknown })
		.__INFERENCEPORT_WS_URL__;
	if (typeof globalUrl === "string" && globalUrl.trim()) {
		return globalUrl.trim();
	}

	const params = new URLSearchParams(window.location.search);
	const queryUrl = params.get("ipc_ws") || params.get("ws");
	if (queryUrl && queryUrl.trim()) {
		return queryUrl.trim();
	}

	try {
		const localStorageUrl = localStorage.getItem("inferenceport_ws_url");
		if (localStorageUrl && localStorageUrl.trim()) {
			return localStorageUrl.trim();
		}
	} catch {
		void 0;
	}

	if (window.location.protocol === "file:") {
		return "ws://127.0.0.1:52459";
	}

	const protocol = window.location.protocol === "https:" ? "wss" : "ws";
	const host = window.location.hostname || "127.0.0.1";
	return `${protocol}://${host}:52459`;
}

function escapeHtml(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function basicSanitize(html: string): string {
	return html
		.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
		.replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
		.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
}

function basicMarkdownParse(markdown: string): string {
	const escaped = escapeHtml(markdown);
	const withBlocks = escaped
		.replace(/^### (.+)$/gm, "<h3>$1</h3>")
		.replace(/^## (.+)$/gm, "<h2>$1</h2>")
		.replace(/^# (.+)$/gm, "<h1>$1</h1>");

	const withInline = withBlocks
		.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
		.replace(/\*(.+?)\*/g, "<em>$1</em>")
		.replace(/`([^`]+)`/g, "<code>$1</code>");

	return basicSanitize(withInline).replace(/\n/g, "<br>");
}

function hasElectronIpc(): boolean {
	return (
		typeof window.ollama?.listModels === "function" &&
		typeof window.utils?.getPath === "function"
	);
}

function getFallbackSessionStorageKey(): string {
	return "inferenceport.browser.sessions";
}

function readFallbackSessions(): Sessions {
	try {
		const raw = localStorage.getItem(getFallbackSessionStorageKey());
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Sessions;
		if (!parsed || typeof parsed !== "object") return {};
		return parsed;
	} catch {
		return {};
	}
}

function writeFallbackSessions(sessions: Sessions): void {
	try {
		localStorage.setItem(
			getFallbackSessionStorageKey(),
			JSON.stringify(sessions),
		);
	} catch {
		void 0;
	}
}

function getClientBase(clientUrl?: string): string {
	if (clientUrl && clientUrl.trim() && clientUrl.trim() !== "lightning") {
		return clientUrl.replace(/\/$/, "");
	}
	return "http://localhost:11434";
}

function randomId(): string {
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatModelSize(bytes?: number): string {
	if (!bytes || !Number.isFinite(bytes)) return "Unknown";
	const gb = bytes / (1024 ** 3);
	if (gb >= 1) return `${gb.toFixed(1)} GB`;
	const mb = bytes / (1024 ** 2);
	return `${mb.toFixed(0)} MB`;
}

function createEventHub() {
	const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
	return {
		on: (channel: string, cb: (...args: unknown[]) => void) => {
			const set = listeners.get(channel) || new Set<(...args: unknown[]) => void>();
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

	const client = new WsIpcClient(resolveWsUrl());
	const events = createEventHub();
	let chatAbortController: AbortController | null = null;

	const invokeOrDefault = async <T>(
		channel: string,
		args: unknown[],
		fallback: () => Promise<T> | T,
	): Promise<T> => {
		try {
			return (await client.invoke(channel, ...args)) as T;
		} catch {
			return await fallback();
		}
	};

	const localStreamPrompt = async (
		model: string,
		prompt: string,
		clientUrl?: string,
	): Promise<void> => {
		chatAbortController?.abort();
		chatAbortController = new AbortController();
		const signal = chatAbortController.signal;

		try {
			const baseURL =
				clientUrl === "lightning"
					? "https://sharktide-lightning.hf.space/gen"
					: getClientBase(clientUrl);
			const response = await fetch(`${baseURL}/v1/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model,
					stream: true,
					messages: [{ role: "user", content: prompt }],
				}),
				signal,
			});

			if (!response.ok || !response.body) {
				events.emit(
					"ollama:chat-error",
					`Request failed (${response.status} ${response.statusText})`,
				);
				events.emit("ollama:chat-done");
				return;
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				let newlineIndex = buffer.indexOf("\n");
				while (newlineIndex !== -1) {
					const line = buffer.slice(0, newlineIndex).trim();
					buffer = buffer.slice(newlineIndex + 1);
					if (line.startsWith("data:")) {
						const data = line.slice(5).trim();
						if (data === "[DONE]") {
							events.emit("ollama:chat-done");
							return;
						}

						try {
							const parsed = JSON.parse(data) as {
								choices?: Array<{ delta?: { content?: string } }>;
							};
							const token =
								parsed.choices?.[0]?.delta?.content || "";
							if (token) events.emit("ollama:chat-token", token);
						} catch {
							void 0;
						}
					}
					newlineIndex = buffer.indexOf("\n");
				}
			}

			events.emit("ollama:chat-done");
		} catch (err) {
			if (signal.aborted) {
				events.emit("ollama:chat-aborted");
				return;
			}
			events.emit(
				"ollama:chat-error",
				err instanceof Error ? err.message : String(err),
			);
		}
	};

	client.on("ollama:chat-token", (token) => events.emit("ollama:chat-token", token));
	client.on("ollama:chat-error", (err) => events.emit("ollama:chat-error", err));
	client.on("ollama:chat-done", () => events.emit("ollama:chat-done"));
	client.on("ollama:chat-aborted", () => events.emit("ollama:chat-aborted"));
	client.on("ollama:new_tool_call", (call) => events.emit("ollama:new_tool_call", call));
	client.on("ollama:new-asset", (asset) => events.emit("ollama:new-asset", asset));
	client.on("ollama:pull-progress", (progress) =>
		events.emit("ollama:pull-progress", progress),
	);
	client.on("ollama:logs-append", (chunk) => events.emit("ollama:logs-append", chunk));
	client.on("auth:stateChanged", (session) => events.emit("auth:stateChanged", session));
	client.on("storage:changed", (change) => events.emit("storage:changed", change));

	window.ollama = {
		listModels: async (clientUrl?: string) =>
			invokeOrDefault<ModelInfo[]>(
				"ollama:list",
				[clientUrl],
				async () => {
					const base = getClientBase(clientUrl);
					const res = await fetch(`${base}/api/tags`);
					if (!res.ok) return [];
					const data = await res.json();
					const models = Array.isArray(data.models) ? data.models : [];
					return models.map((m: any) => ({
						name: String(m.name || "unknown"),
						id: String(m.digest || "local"),
						size: formatModelSize(Number(m.size || 0)),
						modified: String(m.modified_at || "Unknown"),
					}));
				},
			),
		runModel: async (name: string) => String(name),
		deleteModel: async (name: string, clientUrl?: string) =>
			invokeOrDefault<string>("ollama:delete", [name, clientUrl], async () => {
				const base = getClientBase(clientUrl);
				const res = await fetch(`${base}/api/delete`, {
					method: "DELETE",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ model: name }),
				});
				if (!res.ok) throw new Error(await res.text());
				return `${name} deleted`;
			}),
		resetChat: async () => {
			await invokeOrDefault("ollama:reset", [], () => true);
		},
		stop: () => {
			chatAbortController?.abort();
			void client.send("ollama:stop").catch(() => {
				events.emit("ollama:chat-aborted");
			});
		},
		pullModel: async (name: string, clientUrl?: string) =>
			invokeOrDefault<string>("ollama:pull", [name, clientUrl], async () => {
				events.emit("ollama:pull-progress", {
					model: name,
					output: "Pulling model...",
				} as PullProgress);
				const base = getClientBase(clientUrl);
				const res = await fetch(`${base}/api/pull`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name }),
				});
				if (!res.ok) throw new Error(await res.text());
				events.emit("ollama:pull-progress", {
					model: name,
					output: "Pull complete",
				} as PullProgress);
				return `${name} pulled`;
			}),
		onPullProgress: (cb: (data: PullProgress) => void) => {
			events.on("ollama:pull-progress", (data) => cb(data as PullProgress));
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
				.catch(() => localStreamPrompt(model, prompt, clientUrl));
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
		load: async () =>
			invokeOrDefault<Sessions>("sessions:load", [], () => readFallbackSessions()),
		save: async (sessions: Sessions) => {
			await invokeOrDefault(
				"sessions:save",
				[sessions],
				() => writeFallbackSessions(sessions),
			);
		},
		getPath: async () =>
			invokeOrDefault<string>("session:getPath", [], () =>
				"inferenceport-browser-storage",
			),
		removeAllListeners: () => {
			events.clear("ollama:chat-token");
			events.clear("ollama:chat-error");
			events.clear("ollama:chat-done");
			events.clear("ollama:chat-aborted");
			events.clear("ollama:new_tool_call");
			events.clear("ollama:new-asset");
		},
		isAvailable: async () =>
			invokeOrDefault<boolean>("ollama:available", [], async () => {
				try {
					const base = getClientBase();
					const res = await fetch(`${base}/api/tags`);
					return res.ok;
				} catch {
					return false;
				}
			}),
		onNewAsset: (cb: (msg: any) => void) => {
			events.on("ollama:new-asset", (msg) => cb(msg));
		},
		getToolSupportingModels: async () =>
			invokeOrDefault<{ supportsTools: string[] }>(
				"ollama:get-tool-models",
				[],
				() => ({ supportsTools: [] }),
			),
		fetchToolSupportingModels: async () =>
			invokeOrDefault<{ supportsTools: string[] }>(
				"ollama:fetch-tool-models",
				[],
				() => ({ supportsTools: [] }),
			),
		startServer: async (
			port: number,
			allowedUsers: { email: string; role: string }[],
		) => {
			await invokeOrDefault("ollama:start-proxy-server", [port, allowedUsers], () => true);
		},
		stopServer: async () => {
			await invokeOrDefault("ollama:stop-proxy-server", [], () => true);
		},
		onLogAppend: (callback: (chunk: string) => void) => {
			events.on("ollama:logs-append", (chunk) => callback(String(chunk)));
		},
		getServerLogs: async () =>
			invokeOrDefault<string>("ollama:get-server-logs", [], () => ""),
		importGGUF: async (
			fileName: string,
			data: Uint8Array | null,
			isModelFile: boolean,
			clientUrl?: string,
		) =>
			invokeOrDefault<string>(
				"ollama:import-gguf",
				[fileName, data, isModelFile, clientUrl],
				() => "Import is unavailable in browser-only mode",
			),
		importGGUFMulti: async (
			modelfileData: Uint8Array | null,
			ggufName: string,
			ggufData: Uint8Array | null,
			clientUrl?: string,
		) =>
			invokeOrDefault<string>(
				"ollama:import-gguf-multi",
				[modelfileData, ggufName, ggufData, clientUrl],
				() => "Import is unavailable in browser-only mode",
			),
		resolveVideoToolCall: async (
			toolCallId: string,
			payload: Record<string, unknown> | null,
		) =>
			invokeOrDefault<boolean>(
				"ollama:resolve-video-tool-call",
				[toolCallId, payload],
				() => false,
			),
		resolveImageToolCall: async (
			toolCallId: string,
			payload: Record<string, unknown> | null,
		) =>
			invokeOrDefault<boolean>(
				"ollama:resolve-image-tool-call",
				[toolCallId, payload],
				() => false,
			),
		resolveAudioToolCall: async (
			toolCallId: string,
			payload: Record<string, unknown> | null,
		) =>
			invokeOrDefault<boolean>(
				"ollama:resolve-audio-tool-call",
				[toolCallId, payload],
				() => false,
			),
	};

	window.utils = {
		getAsset: async (assetId: string) =>
			invokeOrDefault<Uint8Array>("utils:getAsset", [assetId], () => new Uint8Array(0)),
		rmAsset: async (assetId: string) => {
			await invokeOrDefault("utils:rmAsset", [assetId], () => true);
		},
		listAssets: async () =>
			invokeOrDefault<Array<string>>("utils:listAssets", [], () => []),
		web_open: async (url: string) => {
			try {
				await client.invoke("utils:web_open", url);
			} catch {
				window.open(url, "_blank", "noopener,noreferrer");
			}
		},
		markdown_parse_and_purify: (markdown: string): string =>
			basicMarkdownParse(markdown),
		DOMPurify: (html: string): string => basicSanitize(html),
		saveFile: async (filePath: string, content: string) => {
			await invokeOrDefault("utils:saveFile", [filePath, content], () => true);
		},
		getPath: async (): Promise<string> =>
			invokeOrDefault<string>("utils:getPath", [], () =>
				"inferenceport-browser-storage",
			),
		getWarning: async (modelSize: string, clientUrl?: string) =>
			invokeOrDefault(
				"utils:get-hardware-performance-warning",
				[modelSize, clientUrl],
				() => ({
					modelSizeRaw: modelSize,
					modelSizeB: 0,
					cpu: "Browser",
					cores: navigator.hardwareConcurrency || 0,
					ramGB: "Unknown",
					avx2: false,
					avx512: false,
					warning: "",
				}),
			),
		isFirstLaunch: async () =>
			invokeOrDefault<boolean>("utils:is-first-launch", [], () => false),
		resetFirstLaunch: async () =>
			invokeOrDefault<boolean>("utils:reset-first-launch", [], () => true),
	};

	window.hfspaces = {
		get_cards: async () =>
			invokeOrDefault<string>("hfspaces:get-cards", [], () => ""),
		delete: async (username: string, repo: string) => {
			await invokeOrDefault("hfspaces:delete", [username, repo], () => true);
		},
		share: async (username: string, repo: string) => {
			await invokeOrDefault("hfspaces:share", [username, repo], () => true);
		},
		get_website_cards: async () =>
			invokeOrDefault<string>("hfspaces:get-website-cards", [], () => ""),
		delete_website: async (url: string) =>
			invokeOrDefault<boolean>("hfspaces:delete-website", [url], () => false),
		share_website: async (url: string, title: string) => {
			await invokeOrDefault("hfspaces:share-website", [url, title], () => true);
		},
	};

	window.auth = {
		signInWithEmail: async (email: string, password: string) =>
			invokeOrDefault(
				"auth:signInWithEmail",
				[email, password],
				() => ({ error: "Auth unavailable in browser-only mode" }),
			),
		signInWithGitHub: async () => {
			await invokeOrDefault("auth:signInWithGitHub", [], () => true);
		},
		signInWithGoogle: async () => {
			await invokeOrDefault("auth:signInWithGoogle", [], () => true);
		},
		signUpWithEmail: async (email: string, password: string) =>
			invokeOrDefault(
				"auth:signUpWithEmail",
				[email, password],
				() => ({ error: "Auth unavailable in browser-only mode" }),
			),
		setUsername: async (userId: string, username: string) =>
			invokeOrDefault(
				"auth:setUsername",
				[userId, username],
				() => ({ error: "Auth unavailable in browser-only mode" }),
			),
		signOut: async () =>
			invokeOrDefault("auth:signOut", [], () => ({ success: true })),
		getSession: async () =>
			invokeOrDefault("auth:getSession", [], () => ({ session: null })),
		onAuthStateChange: (callback: (session: any) => void) => {
			events.on("auth:stateChanged", (session) => callback(session));
			void client.invoke("auth:onAuthStateChange").catch(() => void 0);
		},
		resetPassword: async (email: string) =>
			invokeOrDefault(
				"auth:resetPassword",
				[email],
				() => ({ status: false, error: "Unavailable in browser-only mode" }),
			),
		verifyPassword: async (password: string) =>
			invokeOrDefault(
				"auth:verify-password",
				[{ password }],
				() => ({ success: false, error: "Unavailable in browser-only mode" }),
			),
		deleteAccount: async () =>
			invokeOrDefault(
				"auth:delete-account",
				[],
				() => ({ success: false, error: "Unavailable in browser-only mode" }),
			),
		autoNameSession: async (
			model: string,
			prompt: string,
			clientUrl?: string,
		): Promise<string> =>
			invokeOrDefault<string>(
				"ollama:auto-name-session",
				[model, prompt, clientUrl],
				() => prompt.trim().slice(0, 48) || "New chat",
			),
		onToolCall: (_cb: (calls: any[]) => void): void => {
			void 0;
		},
	};

	window.sync = {
		getRemoteSessions: async () =>
			invokeOrDefault<Record<string, Session>>(
				"sync:getRemoteSessions",
				[],
				() => ({}),
			),
		saveAllSessions: async (sessions: Record<string, Sessions>) =>
			invokeOrDefault<string | { error: string }>(
				"sync:saveAllSessions",
				[sessions],
				() => ({ error: "Sync unavailable in browser-only mode" }),
			),
	};

	window.storageSync = {
		getAll: async () =>
			invokeOrDefault<Record<string, string>>("storage:get-all", [], () => ({})),
		setItem: async (key: string, value: string) =>
			invokeOrDefault<boolean>("storage:set-item", [key, value], () => false),
		removeItem: async (key: string) =>
			invokeOrDefault<boolean>("storage:remove-item", [key], () => false),
		clear: async () =>
			invokeOrDefault<boolean>("storage:clear", [], () => false),
		onChange: (callback: (change: StorageChange) => void) => {
			events.on("storage:changed", (change) => callback(change as StorageChange));
		},
	};
}
