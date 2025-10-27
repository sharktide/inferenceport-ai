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

declare global {
    interface Window {
        ollama: {
            listModels: () => Promise<ModelInfo[]>;
            runModel: (name: string) => Promise<string>;
            deleteModel: (name: string) => Promise<string>;
            resetChat: () => Promise<void>;
            stop: () => void;
            pullModel: (name: string) => Promise<string>;
            onPullProgress: (cb: (data: PullProgress) => void) => void;
            streamPrompt: (model: string, prompt: string) => void;
            onResponse: (cb: (token: string) => void) => void;
            onError: (cb: (err: string) => void) => void;
            onDone: (cb: () => void) => void;
            load: () => Promise<Sessions>;
            save: (sessions: Sessions) => Promise<void>;
            getPath: () => Promise<string>;
            removeAllListeners: () => void;
            isAvailable: () => boolean;
        };

        utils: {
            web_open: (url: string) => Promise<void>;
            markdown_parse: (markdown: string) => string;
            saveFile: (filePath: string, content: string) => Promise<void>;
            getPath: () => Promise<string>;
            getWarning: (modelSize: string) => Promise<{
                modelSizeRaw: string;
                modelSizeB: number;
                cpu: string;
                cores: number;
                ramGB: string;
                avx2: boolean;
                avx512: boolean;
                warning: string;
            }>;
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
            signInWithEmail: (email: string, password: string) => Promise<{
                session?: any;
                user?: any;
                error?: string;
            }>;
            signUpWithEmail: (email: string, password: string) => Promise<{
                user?: any;
                error?: string;
            }>;
            setUsername: (userId: string, username: string) => Promise<{ success?: boolean; profile?: any; error?: string }>;
            signOut: () => Promise<{ success?: boolean; error?: string }>;
            getSession: () => Promise<{ session?: any; error?: string }>;
            onAuthStateChange: (callback: (session: any) => void) => void;
            resetPassword: (email: string) => Promise<{status: boolean, error: any}>;
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
        history: Array<string>;
        favorite: boolean;
    };

    type Sessions = Record<string, Session>;
}
