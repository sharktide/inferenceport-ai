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
	type AuthUserView = {
		id: string;
		provider: string | null;
	};

	type AuthSessionView = {
		isAuthenticated: boolean;
		user: AuthUserView | null;
		expiresAt: string | null;
	};

	type AuthProfileView = {
		username: string;
	} | null;

	type AuthSessionResponse = {
		session: AuthSessionView;
		profile: AuthProfileView;
		error?: string;
	};

	type AuthSubscriptionTier = {
		key?: string;
		name: string;
		url: string;
		price: string;
		limits?: AuthTierLimits;
	};

	type AuthTierLimits = {
		cloudChatDaily: number | null;
		imagesDaily: number | null;
		videosDaily: number | null;
		audioWeekly: number | null;
	};

	type AuthTierConfigPlan = {
		key: string;
		name: string;
		url: string;
		price: string;
		limits: AuthTierLimits;
		order: number;
	};

	type AuthTierConfig = {
		defaultPlanKey: string;
		plans: AuthTierConfigPlan[];
	};

	type AuthSubscriptionInfo = {
		planKey: string;
		planName: string;
		isPaid: boolean;
		signedUp: string | null;
		status: string | null;
		tiers: AuthSubscriptionTier[];
		tierConfig: AuthTierConfig | null;
		error?: string;
	};

	type AuthUsageMetric = {
		limit: number | null;
		used: number;
		remaining: number | null;
		window: string;
		period: string;
	};

	type AuthUsageInfo = {
		planKey: string;
		planName: string;
		metrics: {
			cloudChatDaily: AuthUsageMetric;
			imagesDaily: AuthUsageMetric;
			videosDaily: AuthUsageMetric;
			audioWeekly: AuthUsageMetric;
		};
		generatedAt: string | null;
		error?: string;
	};

	interface declarations {
		iInstance: iInstance;
		iFunctions: iFunctions;
	}
	interface Window {
		ic: iConstructor;
		ifc: iFunctions;
		ollama: {
			autoNameSession(model: string, prompt: string, clientUrl?: string): Promise<string>;

			listModels: (clientUrl?: string) => Promise<ModelInfo[]>;
			runModel: (name: string) => Promise<string>;
			deleteModel: (name: string, clientUrl?: string) => Promise<string>;
			resetChat: (sessionId?: string) => Promise<void>;
			stop: () => void;
			pullModel: (name: string, clientUrl?: string) => Promise<string>;
			onPullProgress: (cb: (data: PullProgress) => void) => void;
			streamPrompt: (
				model: string,
				prompt: MessageContent,
				toolList: {
					search: boolean;
					searchEngine: Array<string>;
					imageGen: boolean;
					videoGen: boolean;
					audioGen: boolean;
				},
				clientUrl?: string,
				sessionId?: string,
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
			isAvailable: () => Promise<boolean>;
			onNewAsset: (cb: (msg: any) => void) => void;
			getToolSupportingModels: () => Promise<{ supportsTools: string[] }>;
			fetchToolSupportingModels: () => Promise<{ supportsTools: string[] }>;
			getVisionSupportingModels: () => Promise<{ supportsVision: string[] }>;
			fetchVisionSupportingModels: () => Promise<{ supportsVision: string[] }>;
			startServer: (port: number, allowedUsers: { email: string; role: string }[]) => Promise<void>;
			stopServer: () => Promise<void>;
			onLogAppend: (callback: (chunk: string) => void) => void;
			getServerLogs: () => Promise<string>;
			importGGUF: (fileName: string, data: Uint8Array | null, isModelFile: boolean, clientUrl?: string) => Promise<string>;
			importGGUFMulti: (modelfileData: Uint8Array | null, ggufName: string, ggufData: Uint8Array | null, clientUrl?: string) => Promise<string>;
			resolveVideoToolCall: (toolCallId: string, payload: Record<string, unknown> | null) => Promise<boolean>;
			resolveImageToolCall: (toolCallId: string, payload: Record<string, unknown> | null) => Promise<boolean>;
			resolveAudioToolCall: (toolCallId: string, payload: Record<string, unknown> | null) => Promise<boolean>;
			startImageToolCall: (payload?: Record<string, unknown>) => Promise<string>;
			startVideoToolCall: (payload?: Record<string, unknown>) => Promise<string>;
			startAudioToolCall: (payload?: Record<string, unknown>) => Promise<string>;
			onToolCall: (cb: (calls: any[]) => void) => void;
		};

		utils: {
			getAsset: (assetId: string) => Promise<Uint8Array>;
			rmAsset: (assetId: string) => Promise<void>;
			listAssets: () => Promise<Array<string>>;
			web_open: (url: string) => Promise<void>;
			markdown_parse_and_purify: (markdown: string) => Promise<string>;
			DOMPurify: (html: string) => Promise<string>;
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
			get_cards: () => Promise<string>;
			delete: (username: string, repo: string) => Promise<void>;
			share: (username: string, repo: string) => Promise<void>;
			get_website_cards: () => Promise<string>;
			delete_website: (url: string) => Promise<boolean>;
			share_website: (url: string, title: string) => Promise<void>;
		};

		auth: {
			signInWithEmail: (
				email: string,
				password: string
			) => Promise<AuthSessionResponse>;
			signInWithGitHub: () => Promise<void>;
			signInWithGoogle: () => Promise<void>;
			signUpWithEmail: (
				email: string,
				password: string
			) => Promise<{
				success?: boolean;
				userId?: string | null;
				error?: string;
			}>;
			setUsername: (
				userId: string,
				username: string
			) => Promise<{ success?: boolean; profile?: any; error?: string }>;
			signOut: () => Promise<{ success?: boolean; error?: string }>;
			getSession: () => Promise<AuthSessionResponse>;
			onAuthStateChange: (callback: (session: AuthSessionView) => void) => void;
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
			setSessionFromTokens: (
				accessToken: string,
				refreshToken: string,
			) => Promise<AuthSessionResponse>;
			getSubscriptionInfo: () => Promise<AuthSubscriptionInfo>;
			getSubscriptionTiers: () => Promise<AuthSubscriptionTier[]>;
			getTierConfig: () => Promise<AuthTierConfig | null>;
			getUsage: () => Promise<AuthUsageInfo>;
		};

		sync: {
			getRemoteSessions: () => Promise<Record<string, Session>>;
			saveAllSessions: (
				sessions: Record<string, Sessions>
			) => Promise<string | { error: string }>;
		};

		storageSync: {
			getAll: () => Promise<Record<string, string>>;
			setItem: (key: string, value: string) => Promise<boolean>;
			removeItem: (key: string) => Promise<boolean>;
			clear: () => Promise<boolean>;
			onChange: (
				callback: (change: {
					type: "set" | "remove" | "clear";
					key?: string;
					value?: string;
				}) => void,
			) => void;
		};

		startup: {
			getSettings: () => Promise<{
				runAtLogin: boolean;
				autoStartProxy: boolean;
				proxyPort: number;
				proxyUsers: { email: string; role: string }[];
				uiPort: number;
				snipHotkeyInBackground: boolean;
			}>;
			updateSettings: (patch: {
				runAtLogin?: boolean;
				autoStartProxy?: boolean;
				proxyPort?: number;
				uiPort?: number;
				snipHotkeyInBackground?: boolean;
				proxyUsers?: { email: string; role: string }[];
			}) => Promise<{
				runAtLogin: boolean;
				autoStartProxy: boolean;
				proxyPort: number;
				proxyUsers: { email: string; role: string }[];
				uiPort: number;
				snipHotkeyInBackground: boolean;
			}>;
		};

		snip: {
			getTarget: () => Promise<{
				displayId: number;
				bounds: { x: number; y: number; width: number; height: number };
				scaleFactor: number;
			} | null>;
			captureScreen: (target?: {
				displayId?: number;
				width?: number;
				height?: number;
				scaleFactor?: number;
			}) => Promise<{
				dataUrl: string;
				width: number;
				height: number;
				displayId?: number;
				scaleFactor?: number;
			}>;
			readyToShow: () => void;
			complete: (payload: { dataUrl: string; width?: number; height?: number }) => Promise<boolean>;
			cancel: () => Promise<boolean>;
			onImage: (cb: (payload: { dataUrl: string; width?: number; height?: number }) => void) => void;
		};

		snipChat: {
			streamPrompt: (
				model: string,
				prompt: MessageContent,
				clientUrl?: string,
				sessionId?: string,
			) => void;
			onResponse: (cb: (token: string) => void) => void;
			onError: (cb: (err: string) => void) => void;
			onDone: (cb: () => void) => void;
			stop: () => void;
			removeAllListeners: () => void;
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

	// OpenAI Chat Completions-style multimodal user content parts (vision input).
	// Kept minimal + JSON-serializable since it's persisted and sent over IPC.
	type UserContentPart =
		| { type: "text"; text: string }
		| { type: "image_url"; image_url: { url: string } };

	type MessageContent = string | UserContentPart[];

	type Session = {
		model: string;
		name: string;
		history: Array<{
			role: string;
			content: MessageContent;
			tool_calls?: any[];
		}>;
		favorite: boolean;
	};

	type Sessions = Record<string, Session>;
}
