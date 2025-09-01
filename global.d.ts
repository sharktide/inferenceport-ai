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
        };

        utils: {
            web_open: (url: string) => Promise<void>;
            markdown_parse: (markdown: string) => string;
            saveFile: (filePath: string, content: string) => Promise<void>;
            getPath: () => Promise<string>;
        };

        hfspaces: {
            get_cards: () => string;
            delete: (username: string, repo: string) => void;
            share: (username: string, repo: string) => void;
            get_website_cards: () => string;
            delete_website: (url: string) => boolean;
            share_website: (url: string, title: string) => Promise<void>;

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
