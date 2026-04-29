import { showNotification } from "./notification.js";

// Minimal OpenAI Chat Completions-style multimodal content parts (vision input).
export type UserContentPart =
	| { type: "text"; text: string }
	| { type: "image_url"; image_url: { url: string } };

export type MessageContent = string | UserContentPart[];

export interface ChatMessage {
    role: string;
    content: MessageContent;
    id?: string;
    timestamp?: number;
    tool_calls?: any[];
    tool_call_id?: string;
    versions?: Array<{
        content: unknown;
        timestamp?: number;
        tail?: ChatMessage[];
        [key: string]: unknown;
    }>;
    currentVersionIdx?: number;
    mimeType?: string;
    [key: string]: unknown;
}

export interface ChatSession {
    name: string;
    model: string | null;
    favorite: boolean;
    history: ChatMessage[];
    remoteId?: string;
    created?: number;
    updatedAt?: string;
    userId?: string;
    __merged: boolean | undefined | null;
    [key: string]: unknown;
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
    const localIdByRemoteId = new Map<string, string>();
    const consumedLocalIds = new Set<string>();
    const remoteIdFromLocal = (localId: string, session?: ChatSession): string | null => {
        const fromSession =
            typeof session?.remoteId === "string" && session.remoteId.trim().length > 0
                ? session.remoteId.trim()
                : null;
        if (fromSession) return fromSession;
        return localId && remote[localId] ? localId : null;
    };
    const toMs = (value: unknown): number => {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string" && value.trim().length > 0) {
            const parsed = Date.parse(value);
            if (!Number.isNaN(parsed)) return parsed;
        }
        return 0;
    };
    const messageTimestamp = (message: ChatMessage): number => {
        const direct = toMs(message?.timestamp);
        if (direct > 0) return direct;
        const versions = Array.isArray(message?.versions) ? message.versions : [];
        let latest = 0;
        for (const version of versions) {
            const ts = toMs(version?.timestamp);
            if (ts > latest) latest = ts;
        }
        return latest;
    };
    const historyTimestamp = (history: ChatMessage[]): number => {
        let latest = 0;
        for (const message of history || []) {
            const ts = messageTimestamp(message);
            if (ts > latest) latest = ts;
        }
        return latest;
    };
    const sessionScore = (session?: ChatSession): number => {
        if (!session) return 0;
        const updated = toMs(session.updatedAt);
        if (updated > 0) return updated;
        const fromHistory = historyTimestamp(Array.isArray(session.history) ? session.history : []);
        if (fromHistory > 0) return fromHistory;
        return toMs(session.created);
    };
    const pickHistory = (
        localHistory: ChatMessage[] = [],
        remoteHistory: ChatMessage[] = [],
        localScore: number,
        remoteScore: number,
    ): ChatMessage[] => {
        const localJson = JSON.stringify(localHistory);
        const remoteJson = JSON.stringify(remoteHistory);
        if (localJson === remoteJson) return localHistory;
        if (remoteScore > localScore) return remoteHistory;
        if (localScore > remoteScore) return localHistory;
        return remoteHistory.length >= localHistory.length ? remoteHistory : localHistory;
    };
    const serializeContent = (content: MessageContent): string => {
        if (typeof content === "string") return content;
        try {
            return JSON.stringify(content);
        } catch {
            return "";
        }
    };
    const sessionFingerprint = (session?: ChatSession): string => {
        if (!session) return "";
        const safeName = String(session.name || "").trim().toLowerCase();
        const safeModel = String(session.model || "").trim().toLowerCase();
        const history = Array.isArray(session.history) ? session.history : [];
        const signature = history
            .slice(0, 8)
            .map((message) => {
                const role = String(message?.role || "");
                const content = serializeContent(message?.content as MessageContent).slice(0, 220);
                return `${role}:${content}`;
            })
            .join("|");
        return `${safeName}::${safeModel}::${signature}`;
    };
    const unmatchedLocalByFingerprint = new Map<string, string[]>();

    for (const [localId, localSession] of Object.entries(local)) {
        const rid = remoteIdFromLocal(localId, localSession);
        if (rid) localIdByRemoteId.set(rid, localId);
    }
    for (const [localId, localSession] of Object.entries(local)) {
        const rid = remoteIdFromLocal(localId, localSession);
        if (rid) continue;
        const fp = sessionFingerprint(localSession);
        if (!fp) continue;
        const bucket = unmatchedLocalByFingerprint.get(fp) || [];
        bucket.push(localId);
        unmatchedLocalByFingerprint.set(fp, bucket);
    }

    for (const [remoteId, remoteSession] of Object.entries(remote)) {
        if (!remoteSession) continue;
        let localId = localIdByRemoteId.get(remoteId) || null;
        if (!localId) {
            const fp = sessionFingerprint(remoteSession);
            const bucket = fp ? unmatchedLocalByFingerprint.get(fp) || [] : [];
            if (bucket.length) {
                localId = bucket.shift() || null;
                if (fp) unmatchedLocalByFingerprint.set(fp, bucket);
            }
        }

        const localSession = localId ? local[localId] : null;
        if (!localId || !localSession) {
            output[remoteId] = {
                ...remoteSession,
                remoteId,
                __merged: true,
            } as ChatSession;
            continue;
        }

        consumedLocalIds.add(localId);
        const localHistory = Array.isArray(localSession.history) ? localSession.history : [];
        const remoteHistory = Array.isArray(remoteSession.history) ? remoteSession.history : [];
        const localScore = sessionScore(localSession);
        const remoteScore = sessionScore(remoteSession);
        const mergedHistory = pickHistory(localHistory, remoteHistory, localScore, remoteScore);

        output[localId] = {
            ...remoteSession,
            ...localSession,
            name: localSession.name || remoteSession.name,
            model: localSession.model || remoteSession.model,
            favorite: Boolean(localSession.favorite || remoteSession.favorite),
            history: mergedHistory,
            remoteId,
            __merged: true,
        } as ChatSession;
    }

    // Deduplicate any sessions that point to the same remote id, keeping the freshest one.
    const freshestByRemoteId = new Map<string, string>();
    for (const [localId, session] of Object.entries(output)) {
        const rid =
            typeof session?.remoteId === "string" && session.remoteId.trim().length > 0
                ? session.remoteId.trim()
                : null;
        if (!rid) continue;
        const winner = freshestByRemoteId.get(rid);
        if (!winner) {
            freshestByRemoteId.set(rid, localId);
            continue;
        }
        const winnerScore = sessionScore(output[winner]);
        const candidateScore = sessionScore(session);
        if (candidateScore > winnerScore) {
            delete output[winner];
            freshestByRemoteId.set(rid, localId);
        } else {
            delete output[localId];
        }
    }

    return output;
}


export async function safeCallRemote(fn: CallableFunction, onErrorReturn = null) {
    const online = !(await isOffline());

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

export async function isOffline(timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        await fetch("https://google.com/generate_204", {
            method: "HEAD",
            mode: "no-cors",
            signal: controller.signal,
            cache: "no-store"
        });
        clearTimeout(id);
        return false;
    } catch {
        clearTimeout(id);
        return true;
    }
}

