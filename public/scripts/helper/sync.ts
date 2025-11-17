export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

export interface ChatSession {
    name: string;
    model: string;
    favorite: boolean;
    history: ChatMessage[];
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

        // Local missing? → Take remote wholly
        if (!localSession) {
            output[sessionId] = remoteSession!;
            continue;
        }

        // Merge history
        const mergedHistory = [...localSession.history];

        for (const r of remoteSession!.history) {
            const exists = localSession.history.some(
                l => l.role === r.role && l.content === r.content
            );
            if (!exists) mergedHistory.push(r);
        }

        // Merge metadata
        output[sessionId] = {
            name: localSession.name || remoteSession!.name,
            model: localSession.model || remoteSession!.model,
            favorite: localSession.favorite || remoteSession!.favorite,
            history: mergedHistory
        };
    }

    return output;
}
