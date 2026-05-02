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
    toolCalls?: any[];
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
    const ensureMessageVersioningShape = (message: ChatMessage): ChatMessage => {
        if (!message || typeof message !== "object") return message;
        const msg = message as ChatMessage;
        if (!Array.isArray(msg.versions) || msg.versions.length === 0) {
            msg.versions = [{
                content: msg.content ?? "",
                tail: [],
                timestamp: toMs(msg.timestamp) || Date.now(),
            }];
            msg.currentVersionIdx = 0;
        }
        const currentIdx =
            typeof msg.currentVersionIdx === "number" &&
            Number.isFinite(msg.currentVersionIdx)
                ? msg.currentVersionIdx
                : 0;
        const idx = Math.max(0, Math.min(currentIdx, msg.versions.length - 1));
        msg.currentVersionIdx = idx;
        const active: any = msg.versions[idx] || {};
        if (!Array.isArray(active.tail)) active.tail = [];
        if (active.content === undefined || active.content === null) {
            active.content = msg.content ?? "";
        }
        const mirroredToolCalls = Array.isArray((active as any).tool_calls)
            ? (active as any).tool_calls
            : Array.isArray((active as any).toolCalls)
                ? (active as any).toolCalls
                : Array.isArray(msg.tool_calls)
                    ? msg.tool_calls
                    : Array.isArray(msg.toolCalls)
                        ? msg.toolCalls
                        : [];
        if (mirroredToolCalls.length > 0) {
            (active as any).tool_calls = cloneJson(mirroredToolCalls);
            (active as any).toolCalls = cloneJson(mirroredToolCalls);
            msg.tool_calls = cloneJson(mirroredToolCalls);
            msg.toolCalls = cloneJson(mirroredToolCalls);
        } else {
            delete (active as any).tool_calls;
            delete (active as any).toolCalls;
            delete msg.tool_calls;
            delete msg.toolCalls;
        }
        active.timestamp = toMs(active.timestamp) || toMs(msg.timestamp) || Date.now();
        msg.versions[idx] = active as any;
        msg.content = active.content as MessageContent;
        return msg;
    };
    const getActiveVersion = (message: ChatMessage) => {
        const fixed = ensureMessageVersioningShape(message);
        const currentIdx =
            typeof fixed.currentVersionIdx === "number" &&
            Number.isFinite(fixed.currentVersionIdx)
                ? fixed.currentVersionIdx
                : 0;
        const idx = Math.max(0, Math.min(currentIdx, (fixed.versions || []).length - 1));
        return fixed.versions?.[idx] as any;
    };
    const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
    const normalizeHistoryForStorage = (history: ChatMessage[] = []): ChatMessage[] => {
        const raw = Array.isArray(history) ? history : [];
        if (!raw.length) return [];
        const firstRaw = raw[0];
        if (firstRaw && raw.length === 1 && Array.isArray((firstRaw as any)?.versions)) {
            return [cloneJson(ensureMessageVersioningShape(cloneJson(firstRaw)))];
        }
        const seenMessageIds = new Set<string>();
        const nodes = raw
            .filter((entry) => entry && typeof entry === "object")
            .filter((entry) => {
                const id = typeof entry.id === "string" ? entry.id.trim() : "";
                if (!id) return true;
                if (seenMessageIds.has(id)) return false;
                seenMessageIds.add(id);
                return true;
            })
            .map((entry) => ensureMessageVersioningShape(cloneJson(entry)));
        if (!nodes.length) return [];
        const root = nodes[0];
        if (!root) return [];
        let cursor = root;
        for (let i = 1; i < nodes.length; i++) {
            const active: any = getActiveVersion(cursor);
            const nextNode = nodes[i];
            if (!nextNode) continue;
            active.tail = [...(active.tail || []), nextNode];
            cursor = nextNode;
        }
        return [root];
    };
    const flattenHistory = (history: ChatMessage[] = []): ChatMessage[] => {
        const treeHistory = normalizeHistoryForStorage(history);
        const root = treeHistory[0] as any;
        if (!root) return [];
        const out: ChatMessage[] = [];
        const walk = (node: any) => {
            if (!node || typeof node !== "object") return;
            const fixed = ensureMessageVersioningShape(node);
            out.push(cloneJson({
                ...fixed,
                versions: Array.isArray(fixed.versions)
                    ? fixed.versions.map((version: any) => ({ ...version, tail: [] }))
                    : [],
            }));
            const active = getActiveVersion(fixed);
            const tail = Array.isArray(active?.tail) ? active.tail : [];
            for (const child of tail) walk(child);
        };
        walk(root);
        return out;
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
        const flatHistory = flattenHistory(history);
        let latest = 0;
        for (const message of flatHistory) {
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
        const normalizedLocal = normalizeHistoryForStorage(localHistory);
        const normalizedRemote = normalizeHistoryForStorage(remoteHistory);
        const localJson = JSON.stringify(normalizedLocal);
        const remoteJson = JSON.stringify(normalizedRemote);
        if (localJson === remoteJson) return normalizedLocal;
        if (remoteScore > localScore) return normalizedRemote;
        if (localScore > remoteScore) return normalizedLocal;
        return normalizedRemote.length >= normalizedLocal.length ? normalizedRemote : normalizedLocal;
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
        const history = flattenHistory(Array.isArray(session.history) ? session.history : []);
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
                history: normalizeHistoryForStorage(
                    Array.isArray(remoteSession.history) ? remoteSession.history : [],
                ),
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
            history: normalizeHistoryForStorage(mergedHistory),
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

