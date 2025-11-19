import { showNotification } from "./notification.js";
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

export function mergeLocalAndRemoteSessions(
    local: LocalSessionMap,
    remote: RemoteSessionMap
): LocalSessionMap {

    const output: LocalSessionMap = { ...local };

    for (const sessionId of Object.keys(remote)) {
        const remoteSession = remote[sessionId];
        const localSession = local[sessionId];

        if (!remoteSession) continue;

        if (!localSession) {
            output[sessionId] = { ...remoteSession, __merged: true } as ChatSession;
            continue;
        }

        const localCount = localSession.history.length;
        const remoteCount = remoteSession.history.length;

        if (localCount >= remoteCount) {
            output[sessionId] = {
                ...localSession,
                __merged: true,
            } as ChatSession;
            continue;
        }

        const mergedHistory = [...remoteSession.history];

        for (const l of localSession.history) {
            const exists = mergedHistory.some(
                r => r.role === l.role && r.content === l.content
            );
            if (!exists) mergedHistory.push(l);
        }

        output[sessionId] = {
            name: localSession.name || remoteSession.name,
            model: localSession.model || remoteSession.model,
            favorite: localSession.favorite || remoteSession.favorite,
            history: mergedHistory,
            __merged: true,
        } as ChatSession;
    }

    return output;
}


export async function safeCallRemote(fn: CallableFunction, onErrorReturn = null) {
    const online = navigator.onLine;

    if (!online) {
        return onErrorReturn;
    }

    try {
        const result = await fn();
        if (result?.error) throw new Error(result.error);
        return result;
    } catch (err) {
        return onErrorReturn;
    }
}
