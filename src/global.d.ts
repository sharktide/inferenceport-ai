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

export {};
import type { iConstructor, iInstance, iFunctions } from "./public/scripts/staticload/index.ts";

declare global {
	interface declarations {
		iInstance: iInstance;
		iFunctions: iFunctions;
	}
	interface Window {
		ic: iConstructor;
		ifc: iFunctions;
		ollama: {
			listModels: (clientUrl?: string) => Promise<ModelInfo[]>;
			runModel: (name: string) => Promise<string>;
			deleteModel: (name: string, clientUrl?: string) => Promise<string>;
			resetChat: () => Promise<void>;
			stop: () => void;
			pullModel: (name: string, clientUrl?: string) => Promise<string>;
			onPullProgress: (cb: (data: PullProgress) => void) => void;
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
			) => void;
			onResponse: (cb: (token: string) => void) => void;
			onError: (cb: (err: string) => void) => void;
			onDone: (cb: () => void) => void;
			onAbort: (cb: () => void) => void;
			onToolCall: (cb: (call: any) => void) => void;
			load: () => Promise<Sessions>;
			save: (sessions: Sessions) => Promise<void>;
			getPath: () => Promise<string>;
			removeAllListeners: () => void;
			isAvailable: () => boolean;
			onNewAsset: (cb: (msg: ChatAsset) => void) => void;
			getToolSupportingModels: () => Promise<{ supportsTools: string[] }>;
			fetchToolSupportingModels: () => Promise<{ supportsTools: string[] }>;
			startServer: (port: number, allowedUsers: { email: string; role: string }[]) => Promise<void>;
			stopServer: () => Promise<void>;
			onLogAppend: (callback: (chunk: string) => void) => void;
			getServerLogs: () => Promise<string>;
			importGGUF: (fileName: string, data: Uint8Array | null, isModelFile: boolean, clientUrl?: string) => Promise<string>;
			importGGUFMulti: (modelfileData: Uint8Array | null, ggufName: string, ggufData: Uint8Array | null, clientUrl?: string) => Promise<string>;
			resolveVideoToolCall: (toolCallId: string, payload: Record<string, unknown> | null) => Promise<boolean>;
			resolveImageToolCall: (toolCallId: string, payload: Record<string, unknown> | null) => Promise<boolean>;
			resolveAudioToolCall: (toolCallId: string, payload: Record<string, unknown> | null) => Promise<boolean>;
		};

		utils: {
			getAsset: (assetId: string) => Promise<Buffer>;
			rmAsset: (assetId: string) => Promise<void>;
			web_open: (url: string) => Promise<void>;
			markdown_parse_and_purify: (markdown: string) => string;
			saveFile: (filePath: string, content: string) => Promise<void>;
			getPath: () => Promise<string>;
			getWarning: (modelSize: string, clientUrl?: string) => Promise<{
				modelSizeRaw: string;
				modelSizeB: number;
				cpu: string;
				cores: number;
				ramGB: string;
				avx2: boolean;
				avx512: boolean;
				warning: string;
			}>;
			isFirstLaunch: () => Promise<boolean>;
			resetFirstLaunch: () => Promise<boolean>;
		};

		hfspaces: {
			get_cards: () => string;
			delete: (username: string, repo: string) => void;
			share: (username: string, repo: string) => void;
			get_website_cards: () => string;
			delete_website: (url: string) => boolean;
			share_website: (url: string, title: string) => Promise<void>;
		};

		auth: {
			signInWithEmail: (
				email: string,
				password: string
			) => Promise<{
				session?: any;
				user?: any;
				error?: string;
			}>;
			signInWithGitHub: () => Promise<void>;
			signInWithGoogle: () => Promise<void>;
			signUpWithEmail: (
				email: string,
				password: string
			) => Promise<{
				user?: any;
				error?: string;
			}>;
			setUsername: (
				userId: string,
				username: string
			) => Promise<{ success?: boolean; profile?: any; error?: string }>;
			signOut: () => Promise<{ success?: boolean; error?: string }>;
			getSession: () => Promise<{ session?: any; error?: string }>;
			onAuthStateChange: (callback: (session: any) => void) => void;
			resetPassword: (
				email: string
			) => Promise<{ status: boolean; error: any }>;
			verifyPassword: (
				password: string
			) => Promise<{ success: boolean; error: string | undefined }>;
			deleteAccount: () => Promise<{
				success: boolean;
				error: string | undefined;
			}>;
			autoNameSession(model: string, prompt: string, clientUrl?: string): Promise<string>;
			onToolCall: (cb: (calls: any[]) => void) => void;

		};

		sync: {
			getRemoteSessions: () => Promise<Record<string, Session>>;
			saveAllSessions: (
				sessions: Record<string, Sessions>
			) => Promise<string | { error: string }>;
		};
	}

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
		history: Array<{
			role: string;
			content: string;
			tool_calls?: any[];
		}>;
		favorite: boolean;
	};

	type Sessions = Record<string, Session>;
}
