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

import type { ChatMessage, ChatAsset, ModelInfo, PullProgress, Session, Sessions } from "./node-apis/types/index.types.d.ts";

contextBridge.exposeInMainWorld("ollama", {
	// ===== Models =====
	listModels: (): Promise<ModelInfo[]> => ipcRenderer.invoke("ollama:list"),
	runModel: (name: string): Promise<string> =>
		ipcRenderer.invoke("ollama:run", name),
	deleteModel: (name: string): Promise<string> =>
		ipcRenderer.invoke("ollama:delete", name),
	resetChat: (): Promise<void> => ipcRenderer.invoke("ollama:reset"),
	pullModel: (name: string): Promise<string> =>
		ipcRenderer.invoke("ollama:pull", name),
	onPullProgress: (cb: (data: PullProgress) => void): void => {
		ipcRenderer.on(
			"ollama:pull-progress",
			(_e: Electron.IpcRendererEvent, data: PullProgress) => cb(data)
		);
	},
	onToolCall: (cb: (calls: any[]) => void) =>
		ipcRenderer.on("ollama:new_tool_call", (_: Electron.IpcRendererEvent, calls: any[]) => cb(calls)),
	isAvailable: (): Promise<boolean> => ipcRenderer.invoke("ollama:available"),

	streamPrompt: (
		model: string,
		prompt: string,
		searchEnabled: boolean,
		imgEnabled: boolean
	): void =>
		ipcRenderer.send(
			"ollama:chat-stream",
			model,
			prompt,
			searchEnabled,
			imgEnabled
		),
	stop: (): void => ipcRenderer.send("ollama:stop"),

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
	autoNameSession: async (model: string, prompt: string): Promise<string> => {
		return await ipcRenderer.invoke("ollama:auto-name-session", model, prompt);
	},
});

// ===== Utilities =====
contextBridge.exposeInMainWorld("utils", {
	web_open: (url: string) => ipcRenderer.invoke("utils:web_open", url),
	markdown_parse_and_purify: (markdown: string): string =>
		ipcRenderer.sendSync("utils:markdown_parse_and_purify", markdown),
	DOMPurify: (html: string): string =>
		ipcRenderer.sendSync("utils:DOMPurify", html),
	saveFile: (filePath: string, content: string) =>
		ipcRenderer.invoke("utils:saveFile", filePath, content),
	getPath: (): Promise<string> => ipcRenderer.invoke("utils:getPath"),
	getWarning: (modelSize: string) =>
		ipcRenderer.invoke("utils:get-hardware-performance-warning", modelSize),
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
	signInWithEmail: (email: string, password: string) =>
		ipcRenderer.invoke("auth:signInWithEmail", email, password),
	signUpWithEmail: (email: string, password: string) =>
		ipcRenderer.invoke("auth:signUpWithEmail", email, password),
	signOut: () => ipcRenderer.invoke("auth:signOut"),
	getSession: () => ipcRenderer.invoke("auth:getSession"),
	onAuthStateChange: (callback: (session: Session) => void) => {
		ipcRenderer.invoke("auth:onAuthStateChange");
		ipcRenderer.on("auth:stateChanged", (_e: any, session: Session) => callback(session));
	},
	resetPassword: (email: string) =>
		ipcRenderer.invoke("auth:resetPassword", email),
	verifyPassword: (password: string) =>
		ipcRenderer.invoke("auth:verify-password", { password }),
	deleteAccount: () => ipcRenderer.invoke("auth:delete-account"),
	setUsername: (userId: string, username: string) =>
		ipcRenderer.invoke("auth:setUsername", userId, username),
});

// ===== Sync =====
contextBridge.exposeInMainWorld("sync", {
	getRemoteSessions: () => ipcRenderer.invoke("sync:getRemoteSessions"),
	saveAllSessions: (sessions: Record<string, Sessions>) =>
		ipcRenderer.invoke("sync:saveAllSessions", sessions),
});
