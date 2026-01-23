export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}
export interface ChatSession {
    name: string;
    model: string;
    favorite: boolean;
    history: ChatMessage[];
    __merged: boolean | undefined | null;
}
export type LocalSessionMap = Record<string, ChatSession>;
export type RemoteSessionMap = Record<string, ChatSession>;
/**
 * Merge remote sessions into local sessions.
 * If remote is empty, local is returned unchanged.
 * If local is empty, remote is returned.
 */
export declare function mergeLocalAndRemoteSessions(local: LocalSessionMap, remote: RemoteSessionMap): LocalSessionMap;
export declare function safeCallRemote(fn: CallableFunction, onErrorReturn?: null): Promise<any>;
export declare function isOffline(timeout?: number): Promise<boolean>;
//# sourceMappingURL=sync.d.ts.map