/*
Copyright 2025 Rihaan Meher

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

const { contextBridge, ipcRenderer } = require("electron");

import type { ChatAsset, ModelInfo, PullProgress, Sessions } from "./node-apis/types/index.types.d.ts";
import type { MessageContent } from "./node-apis/types/index.types.d.ts";
import type { ToolList } from "./node-apis/types/tools.types.d.ts";

contextBridge.exposeInMainWorld("ollama", {
	// ===== Models =====
	listModels: (clientUrl?: string): Promise<ModelInfo[]> => ipcRenderer.invoke("ollama:list", clientUrl),
	deleteModel: (name: string, clientUrl?: string): Promise<string> =>
		ipcRenderer.invoke("ollama:delete", name, clientUrl),
	resetChat: (sessionId?: string): Promise<void> =>
		ipcRenderer.invoke("ollama:reset", sessionId),
	pullModel: (name: string, clientUrl?: string): Promise<string> =>
		ipcRenderer.invoke("ollama:pull", name, clientUrl),
	onPullProgress: (cb: (data: PullProgress) => void): void => {
		ipcRenderer.on(
			"ollama:pull-progress",
			(_e: Electron.IpcRendererEvent, data: PullProgress) => cb(data)
		);
	},
	onToolCall: (cb: (call: any) => void) =>
		ipcRenderer.on("ollama:new_tool_call", (_: Electron.IpcRendererEvent, call: any) => cb(call)),
	isAvailable: (): Promise<boolean> => ipcRenderer.invoke("ollama:available"),

	streamPrompt: (
		model: string,
		prompt: MessageContent,
		toolList: ToolList,
		clientUrl?: string,
		sessionId?: string,
	): void =>
		ipcRenderer.send(
			"ollama:chat-stream",
			model,
			prompt,
			toolList,
			clientUrl,
			sessionId,
		),
	stop: (): void => ipcRenderer.send("ollama:stop"),
	resolveVideoToolCall: (
		toolCallId: string,
		payload: Record<string, unknown> | null,
	): Promise<boolean> =>
		ipcRenderer.invoke(
			"ollama:resolve-video-tool-call",
			toolCallId,
			payload,
		),
	resolveImageToolCall: (
		toolCallId: string,
		payload: Record<string, unknown> | null,
	): Promise<boolean> =>
		ipcRenderer.invoke(
			"ollama:resolve-image-tool-call",
			toolCallId,
			payload,
		),
	resolveAudioToolCall: (
		toolCallId: string,
		payload: Record<string, unknown> | null,
	): Promise<boolean> =>
		ipcRenderer.invoke(
			"ollama:resolve-audio-tool-call",
			toolCallId,
			payload,
		),
	resolveCustomToolCall: (
		toolCallId: string,
		approval: boolean | { approved: boolean; userInputs?: Record<string, unknown> },
	): Promise<boolean> =>
		ipcRenderer.invoke(
			"ollama:resolve-custom-tool-call",
			toolCallId,
			approval,
		),
	startImageToolCall: (
		payload?: Record<string, unknown>,
	): Promise<string> =>
		ipcRenderer.invoke("ollama:start-image-tool-call", payload),
	startVideoToolCall: (
		payload?: Record<string, unknown>,
	): Promise<string> =>
		ipcRenderer.invoke("ollama:start-video-tool-call", payload),
	startAudioToolCall: (
		payload?: Record<string, unknown>,
	): Promise<string> =>
		ipcRenderer.invoke("ollama:start-audio-tool-call", payload),
	listCustomTools: (): Promise<CustomToolManifest[]> =>
		ipcRenderer.invoke("ollama:list-custom-tools"),
	createCustomTool: (payload: {
		name: string;
		functionality: string;
		version?: string;
		releaseNotes?: string;
		websiteUrl?: string;
		language: "javascript" | "python" | "cpp" | "c" | "rust" | "java";
		codeFileName: string;
		codeContent: string;
		visibility?: "private" | "public" | "unlisted";
		publishToRegistry?: boolean;
		openai?: {
			functionName?: string;
			description?: string;
			parameters?: Record<string, unknown>;
		};
		userInputs?: CustomToolUserInput[];
	}): Promise<{
		ok: boolean;
		error?: string;
		manifest?: CustomToolManifest;
	}> =>
		ipcRenderer.invoke("ollama:create-custom-tool", payload),
	getCustomToolSource: (toolId: string): Promise<{
		manifest: CustomToolManifest;
		code: string;
	} | null> => ipcRenderer.invoke("ollama:get-custom-tool-source", toolId),
	updateCustomTool: (payload: {
		id: string;
		name?: string;
		functionality?: string;
		version?: string;
		releaseNotes?: string;
		websiteUrl?: string;
		language?: "javascript" | "python" | "cpp" | "c" | "rust" | "java";
		codeFileName?: string;
		codeContent?: string;
		visibility?: "private" | "public" | "unlisted";
		openai?: {
			functionName?: string;
			description?: string;
			parameters?: Record<string, unknown>;
		};
		userInputs?: CustomToolUserInput[];
	}): Promise<{
		ok: boolean;
		error?: string;
		manifest?: CustomToolManifest;
	}> => ipcRenderer.invoke("ollama:update-custom-tool", payload),
	publishCustomTool: (toolId: string): Promise<{
		ok: boolean;
		error?: string;
		manifest?: CustomToolManifest;
		record?: CustomToolRegistryRecord;
	}> => ipcRenderer.invoke("ollama:publish-custom-tool", toolId),
	importCustomTool: (toolId: string): Promise<{
		ok: boolean;
		error?: string;
		manifest?: CustomToolManifest;
	}> => ipcRenderer.invoke("ollama:import-custom-tool", toolId),
	getCustomToolRegistryItem: (toolId: string): Promise<CustomToolRegistryRecord | null> =>
		ipcRenderer.invoke("ollama:get-custom-tool-registry-item", toolId),
	listCustomToolRegistry: (): Promise<CustomToolRegistryRecord[]> =>
		ipcRenderer.invoke("ollama:list-custom-tool-registry"),
	listMyCustomToolRegistry: (): Promise<CustomToolRegistryRecord[]> =>
		ipcRenderer.invoke("ollama:list-my-custom-tool-registry"),
	deleteCustomTool: (toolId: string): Promise<{ ok: boolean; error?: string }> =>
		ipcRenderer.invoke("ollama:delete-custom-tool", toolId),
	deleteRegistryCustomTool: (toolId: string): Promise<{ ok: boolean; error?: string }> =>
		ipcRenderer.invoke("ollama:delete-registry-custom-tool", toolId),

	onNewAsset: (cb: (msg: ChatAsset) => void): void => {
		ipcRenderer.on(
			"ollama:new-asset",
			(_e: Electron.IpcRendererEvent, msg: ChatAsset) => cb(msg)
		);
	},

	onResponse: (cb: (token: string) => void): void => {
		ipcRenderer.on(
			"ollama:chat-token",
			(_e: Electron.IpcRendererEvent, token: string) => cb(token)
		);
	},
	onError: (cb: (err: string) => void): void => {
		ipcRenderer.on(
			"ollama:chat-error",
			(_e: Electron.IpcRendererEvent, err: string) => cb(err)
		);
	},
	onDone: (cb: () => void): void => {
		ipcRenderer.on("ollama:chat-done", cb);
	},
	onAbort: (cb: () => void): void => {
		ipcRenderer.on("ollama:chat-aborted", cb);
	},

	load: (): Promise<Sessions> => ipcRenderer.invoke("sessions:load"),
	save: (sessions: Sessions): Promise<void> =>
		ipcRenderer.invoke("sessions:save", sessions),
	getPath: (): Promise<string> => ipcRenderer.invoke("session:getPath"),

	removeAllListeners: (): void => {
		ipcRenderer.removeAllListeners("ollama:chat-token");
		ipcRenderer.removeAllListeners("ollama:chat-error");
		ipcRenderer.removeAllListeners("ollama:chat-done");
	},

	getToolSupportingModels: (): Promise<{ supportsTools: string[] }> => ipcRenderer.invoke("ollama:get-tool-models"),
	fetchToolSupportingModels: (): Promise<{ supportsTools: string[] }> => ipcRenderer.invoke("ollama:fetch-tool-models"),
	getVisionSupportingModels: (): Promise<{ supportsVision: string[] }> => ipcRenderer.invoke("ollama:get-vision-models"),
	fetchVisionSupportingModels: (): Promise<{ supportsVision: string[] }> => ipcRenderer.invoke("ollama:fetch-vision-models"),
	autoNameSession: async (model: string, prompt: string, clientUrl?: string): Promise<string> => {
		return await ipcRenderer.invoke("ollama:auto-name-session", model, prompt, clientUrl);
	},
	importGGUF: (fileName: string, data: Uint8Array | null, isModelFile: boolean, clientUrl?: string): Promise<string> =>
		ipcRenderer.invoke("ollama:import-gguf", fileName, data, isModelFile, clientUrl),
	importGGUFMulti: (modelfileData: Uint8Array | null, ggufName: string, ggufData: Uint8Array | null, clientUrl?: string): Promise<string> =>
		ipcRenderer.invoke("ollama:import-gguf-multi", modelfileData, ggufName, ggufData, clientUrl),
	startServer: (
		port: number,
		users: { email: string; role: string }[],
		serverApiKeys: string[] = [],
	) =>
		ipcRenderer.invoke("ollama:start-proxy-server", port, users, serverApiKeys),
	stopServer: () => ipcRenderer.invoke("ollama:stop-proxy-server"),
	getServerLogs: (): Promise<string> => ipcRenderer.invoke("ollama:get-server-logs"),
	onLogAppend: (callback: (chunk: string) => void) => ipcRenderer.on("ollama:logs-append", (_: Electron.IpcRendererEvent, chunk: string) => callback(chunk)),
});

// ===== Utilities =====
contextBridge.exposeInMainWorld("utils", {
	getAsset: (assetId: string): Promise<Blob> => ipcRenderer.invoke("utils:getAsset", assetId),
	rmAsset: (assetId: string): Promise<void> => ipcRenderer.invoke("utils:rmAsset", assetId),
	listAssets: (): Promise<Array<string>> => ipcRenderer.invoke("utils:listAssets"),
	web_open: (url: string) => ipcRenderer.invoke("utils:web_open", url),
	markdown_parse_and_purify: (markdown: string): string =>
		ipcRenderer.invoke("utils:markdown_parse_and_purify", markdown),
	DOMPurify: (html: string): string =>
		ipcRenderer.invoke("utils:DOMPurify", html),
	sanitizeSVG: (svg: string): string =>
		ipcRenderer.invoke("utils:sanitizeSVG", svg),
	saveFile: (filePath: string, content: string) =>
		ipcRenderer.invoke("utils:saveFile", filePath, content),
	getPath: (): Promise<string> => ipcRenderer.invoke("utils:getPath"),
	getWarning: (modelSize: string, clientUrl?: string) =>
		ipcRenderer.invoke("utils:get-hardware-performance-warning", modelSize, clientUrl),
	isFirstLaunch: (): Promise<boolean> =>
		ipcRenderer.invoke("utils:is-first-launch"),
	resetFirstLaunch: (): Promise<void> =>
		ipcRenderer.invoke("utils:reset-first-launch"),
});

// ===== HF Spaces =====
contextBridge.exposeInMainWorld("hfspaces", {
	get_cards: () => ipcRenderer.invoke("hfspaces:get-cards"),
	delete: (username: string, repo: string) =>
		ipcRenderer.invoke("hfspaces:delete", username, repo),
	share: (username: string, repo: string) =>
		ipcRenderer.invoke("hfspaces:share", username, repo),
	get_website_cards: () => ipcRenderer.invoke("hfspaces:get-website-cards"),
	delete_website: (url: string) =>
		ipcRenderer.invoke("hfspaces:delete-website", url),
	share_website: (url: string, title: string) =>
		ipcRenderer.invoke("hfspaces:share-website", url, title),
});

contextBridge.exposeInMainWorld("auth", {
	signInWithGitHub: () => ipcRenderer.invoke("auth:signInWithGitHub"),
	signInWithGoogle: () => ipcRenderer.invoke("auth:signInWithGoogle"),
	signInWithEmail: (email: string, password: string) =>
		ipcRenderer.invoke("auth:signInWithEmail", email, password),
	signUpWithEmail: (email: string, password: string) =>
		ipcRenderer.invoke("auth:signUpWithEmail", email, password),
	signOut: () => ipcRenderer.invoke("auth:signOut"),
	getSession: () => ipcRenderer.invoke("auth:getSession"),
	onAuthStateChange: (callback: (session: AuthSessionView) => void) => {
		ipcRenderer.invoke("auth:onAuthStateChange");
		ipcRenderer.on("auth:stateChanged", (_e: any, session: AuthSessionView) => callback(session));
	},
	resetPassword: (email: string) =>
		ipcRenderer.invoke("auth:resetPassword", email),
	verifyPassword: (password: string) =>
		ipcRenderer.invoke("auth:verify-password", { password }),
	deleteAccount: () => ipcRenderer.invoke("auth:delete-account"),
	setUsername: (userId: string, username: string) =>
		ipcRenderer.invoke("auth:setUsername", userId, username),
	setSessionFromTokens: (accessToken: string, refreshToken: string) =>
		ipcRenderer.invoke("auth:setSessionTokens", accessToken, refreshToken),
	getSubscriptionInfo: () => ipcRenderer.invoke("auth:getSubscriptionInfo"),
	getSubscriptionTiers: () => ipcRenderer.invoke("auth:getSubscriptionTiers"),
	getTierConfig: () => ipcRenderer.invoke("auth:getTierConfig"),
	getUsage: (): Promise<AuthUsageInfo> => ipcRenderer.invoke("auth:getUsage"),
	getVerifyTokenUsage: (): Promise<AuthVerifyTokenUsageInfo> =>
		ipcRenderer.invoke("auth:getVerifyTokenUsage"),
	listLightningApiKeys: (): Promise<AuthLightningApiKey[]> =>
		ipcRenderer.invoke("auth:listLightningApiKeys"),
	createLightningApiKey: (
		name: string,
		expiresAt?: string | null,
	): Promise<AuthLightningApiKeyCreateResponse> =>
		ipcRenderer.invoke("auth:createLightningApiKey", name, expiresAt),
	revokeLightningApiKey: (
		keyId: string,
	): Promise<{ success?: boolean; apiKey?: AuthLightningApiKey; error?: string }> =>
		ipcRenderer.invoke("auth:revokeLightningApiKey", keyId),
});

// ===== Sync =====
contextBridge.exposeInMainWorld("sync", {
	getRemoteSessions: () => ipcRenderer.invoke("sync:getRemoteSessions"),
	saveAllSessions: (sessions: Sessions) =>
		ipcRenderer.invoke("sync:saveAllSessions", sessions),
	mediaList: (params?: { view?: "all" | "active" | "trash"; parentId?: string | null }) =>
		ipcRenderer.invoke("sync:mediaList", params),
	mediaGet: (id: string) => ipcRenderer.invoke("sync:mediaGet", id),
	mediaGetContent: (
		id: string,
		params?: { format?: "text" | "base64" },
	) => ipcRenderer.invoke("sync:mediaGetContent", id, params),
	mediaCreateFile: (payload: {
		name?: string;
		mimeType?: string;
		parentId?: string | null;
		sessionId?: string | null;
		kind?: string | null;
		text?: string;
		base64?: string;
		source?: string;
	}) => ipcRenderer.invoke("sync:mediaCreateFile", payload),
	mediaCreateFolder: (payload: {
		name?: string;
		parentId?: string | null;
	}) => ipcRenderer.invoke("sync:mediaCreateFolder", payload),
	mediaUpdate: (
		id: string,
		payload: { name?: string; parentId?: string | null },
	) => ipcRenderer.invoke("sync:mediaUpdate", id, payload),
	mediaUpdateContent: (
		id: string,
		payload: {
			text?: string;
			base64?: string;
			mimeType?: string | null;
			name?: string | null;
			kind?: string | null;
		},
	) => ipcRenderer.invoke("sync:mediaUpdateContent", id, payload),
	mediaMove: (payload: { ids: string[]; parentId?: string | null }) =>
		ipcRenderer.invoke("sync:mediaMove", payload),
	mediaTrash: (payload: { ids: string[] }) =>
		ipcRenderer.invoke("sync:mediaTrash", payload),
	mediaRestore: (payload: { ids: string[] }) =>
		ipcRenderer.invoke("sync:mediaRestore", payload),
	mediaDelete: (payload: { ids: string[] }) =>
		ipcRenderer.invoke("sync:mediaDelete", payload),
});

contextBridge.exposeInMainWorld("storageSync", {
	getAll: () =>
		ipcRenderer.invoke("storage:get-all") as Promise<Record<string, string>>,
	setItem: (key: string, value: string) =>
		ipcRenderer.invoke("storage:set-item", key, value),
	removeItem: (key: string) => ipcRenderer.invoke("storage:remove-item", key),
	clear: () => ipcRenderer.invoke("storage:clear"),
	onChange: (
		callback: (change: {
			type: "set" | "remove" | "clear";
			key?: string;
			value?: string;
		}) => void,
	) => {
		ipcRenderer.on(
			"storage:changed",
			(_: Electron.IpcRendererEvent, change: {
				type: "set" | "remove" | "clear";
				key?: string;
				value?: string;
			}) => callback(change),
		);
	},
});

contextBridge.exposeInMainWorld("startup", {
	getSettings: () => ipcRenderer.invoke("startup:get-settings"),
	updateSettings: (patch: {
		runAtLogin?: boolean;
		autoStartProxy?: boolean;
		proxyPort?: number;
		uiPort?: number;
		snipHotkeyInBackground?: boolean;
		mediaLibraryStorageEnabled?: boolean;
		proxyUsers?: { email: string; role: string }[];
		serverApiKeys?: string[];
	}) => ipcRenderer.invoke("startup:update-settings", patch),
});

// ===== Screen Snip =====
contextBridge.exposeInMainWorld("snip", {
	getTarget: () => ipcRenderer.invoke("snip:get-target"),
	captureScreen: async (target?: {
		displayId?: number;
		width?: number;
		height?: number;
		scaleFactor?: number;
	}) => {
		return ipcRenderer.invoke("snip:capture", target);
	},
	readyToShow: () => ipcRenderer.send("snip:ready"),
	complete: (payload: { dataUrl: string; width?: number; height?: number }) =>
		ipcRenderer.invoke("snip:complete", payload),
	cancel: () => ipcRenderer.invoke("snip:cancel"),
	onImage: (cb: (payload: { dataUrl: string; width?: number; height?: number }) => void) =>
		ipcRenderer.on("snip:image", (_e: Electron.IpcRendererEvent, payload: { dataUrl: string; width?: number; height?: number }) => cb(payload)),
});

// ===== Snip Chat =====
contextBridge.exposeInMainWorld("snipChat", {
	streamPrompt: (
		model: string,
		prompt: MessageContent,
		clientUrl?: string,
		sessionId?: string,
	): void => ipcRenderer.send("snip:chat-stream", model, prompt, clientUrl, sessionId),
	onResponse: (cb: (token: string) => void): void => {
		ipcRenderer.on("snip:chat-token", (_e: Electron.IpcRendererEvent, token: string) => cb(token));
	},
	onError: (cb: (err: string) => void): void => {
		ipcRenderer.on("snip:chat-error", (_e: Electron.IpcRendererEvent, err: string) => cb(err));
	},
	onDone: (cb: () => void): void => {
		ipcRenderer.on("snip:chat-done", cb);
	},
	removeAllListeners: (): void => {
		ipcRenderer.removeAllListeners("snip:chat-token");
		ipcRenderer.removeAllListeners("snip:chat-error");
		ipcRenderer.removeAllListeners("snip:chat-done");
	},
});
