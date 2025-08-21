const { contextBridge, ipcRenderer } = require("electron");
import type { IpcRendererEvent } from "electron";

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
	model: string;
	name: string;
	history: Array<string>;
	favorite: boolean;
};

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

	load: (): Promise<Sessions> => ipcRenderer.invoke("sessions:load"),

	save: (sessions: Sessions): Promise<void> =>
		ipcRenderer.invoke("sessions:save", sessions),

	getPath: (): Promise<string> => ipcRenderer.invoke("session:getPath"),

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
});
