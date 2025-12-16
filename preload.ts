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
import type { IpcMainInvokeEvent, IpcRendererEvent } from "electron";

type ModelInfo = {
	name: string;
	id: string;
	size: string;
	modified: string;
};

type PullProgress = {
	model: string;
	output: string;
};

type Session = {
  name: string;
  model: string;
  favorite: boolean;
  history: Message[];
};

type Message = {
  session_id: string;
  role: string;
  content: string;
}

type Sessions = Record<string, Session>;

contextBridge.exposeInMainWorld("ollama", {
	listModels: (): Promise<ModelInfo[]> => ipcRenderer.invoke("ollama:list"),

	runModel: (name: string): Promise<string> =>
		ipcRenderer.invoke("ollama:run", name),

	deleteModel: (name: string): Promise<string> =>
		ipcRenderer.invoke("ollama:delete", name),

	resetChat: (): Promise<void> => ipcRenderer.invoke("ollama:reset"),

	stop: (): void => ipcRenderer.send("ollama:stop"),

	pullModel: (name: string): Promise<string> =>
		ipcRenderer.invoke("ollama:pull", name),

	onPullProgress: (cb: (data: PullProgress) => void): void =>
		ipcRenderer.on(
			"ollama:pull-progress",
			(__: Electron.IpcRendererEvent, data: PullProgress) => cb(data)
		),

	streamPrompt: (model: string, prompt: string): void =>
		ipcRenderer.send("ollama:chat-stream", model, prompt),

	onResponse: (cb: (token: string) => void): void =>
		ipcRenderer.on(
			"ollama:chat-token",
			(__: Electron.IpcRendererEvent, token: string) => cb(token)
		),

	onError: (cb: (err: string) => void): void =>
		ipcRenderer.on(
			"ollama:chat-error",
			(__: Electron.IpcRendererEvent, err: string) => cb(err)
		),

	onDone: (cb: () => void): void =>
		ipcRenderer.on("ollama:chat-done", () => cb()),

	onAbort: (cb: () => void): void =>
		ipcRenderer.on("ollama:chat-aborted", () => cb()),

	load: (): Promise<Sessions> => ipcRenderer.invoke("sessions:load"),

	save: (sessions: Sessions): Promise<void> =>
		ipcRenderer.invoke("sessions:save", sessions),

	getPath: (): Promise<string> => ipcRenderer.invoke("session:getPath"),

	isAvailable: async (): Promise<boolean> => ipcRenderer.invoke('ollama:available'),

	removeAllListeners: (): void => {
		ipcRenderer.removeAllListeners("ollama:chat-token");
		ipcRenderer.removeAllListeners("ollama:chat-error");
		ipcRenderer.removeAllListeners("ollama:chat-done");
	},
});

contextBridge.exposeInMainWorld("utils", {
	web_open: (url: string): Promise<void> =>
		ipcRenderer.invoke("utils:web_open", url),

	markdown_parse: (markdown: string): string =>
		ipcRenderer.sendSync("utils:markdown_parse", markdown),

	DOMPurify: (html: string): string =>
		ipcRenderer.sendSync("utils:DOMPurify", html),

	saveFile: (filePath: string, content: string): Promise<void> => {
		return ipcRenderer.invoke('utils:saveFile', filePath, content);
	},
	getPath: (): Promise<string> => ipcRenderer.invoke("utils:getPath"),
	getWarning: (modelSize: string) =>
		ipcRenderer.invoke('utils:get-hardware-performance-warning', modelSize),
	isFirstLaunch: () => ipcRenderer.invoke("utils:is-first-launch"),
  	resetFirstLaunch: () => ipcRenderer.invoke("utils:reset-first-launch")
});

contextBridge.exposeInMainWorld("hfspaces", {
	get_cards: (): string =>
		ipcRenderer.invoke("hfspaces:get-cards"),
	delete: (username: string, repo: string): void =>
		ipcRenderer.invoke("hfspaces:delete", username, repo),
    share: (username: string, repo: string) => ipcRenderer.invoke("hfspaces:share", username, repo),
	get_website_cards: (): string =>
		ipcRenderer.invoke("hfspaces:get-website-cards"),
	delete_website: (url: string): void =>
		ipcRenderer.invoke("hfspaces:delete-website", url),
    share_website: (url: string, title: string) => ipcRenderer.invoke("hfspaces:share-website", url, title)
})

contextBridge.exposeInMainWorld('auth', {
	signInWithEmail: (email: string, password: string) =>
		ipcRenderer.invoke('auth:signInWithEmail', email, password),

	signUpWithEmail: (email: string, password: string) =>
		ipcRenderer.invoke('auth:signUpWithEmail', email, password),

	signOut: () => ipcRenderer.invoke('auth:signOut'),

	getSession: () => ipcRenderer.invoke('auth:getSession'),

	onAuthStateChange: (callback: (session: any) => void) => {
		ipcRenderer.invoke('auth:onAuthStateChange');
		ipcRenderer.on('auth:stateChanged', (_event: IpcMainInvokeEvent, session: Session) => {
		callback(session);
		});
	},
	resetPassword: async (email: string) => await ipcRenderer.invoke("auth:resetPassword", email),
	verifyPassword: async (password: string) => await ipcRenderer.invoke("auth:verify-password", { password }),
	deleteAccount: async () => await ipcRenderer.invoke("auth:delete-account"),
	setUsername: (userId: string, username: string) => ipcRenderer.invoke('auth:setUsername', userId, username),
});

contextBridge.exposeInMainWorld("sync", {
 	getRemoteSessions: () => ipcRenderer.invoke("sync:getRemoteSessions"),
  	saveAllSessions: (sessions: Record<string, Sessions>) => ipcRenderer.invoke("sync:saveAllSessions", sessions),
});
