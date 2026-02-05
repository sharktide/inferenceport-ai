import { showNotification } from "./notification.js";
/**
 * Merge remote sessions into local sessions.
 * If remote is empty, local is returned unchanged.
 * If local is empty, remote is returned.
 */
export function mergeLocalAndRemoteSessions(local, remote) {
    const output = { ...local };
    for (const sessionId of Object.keys(remote)) {
        const remoteSession = remote[sessionId];
        const localSession = local[sessionId];
        if (!remoteSession)
            continue;
        if (!localSession) {
            output[sessionId] = { ...remoteSession, __merged: true };
            continue;
        }
        const localCount = localSession.history.length;
        const remoteCount = remoteSession.history.length;
        if (localCount >= remoteCount) {
            output[sessionId] = {
                ...localSession,
                __merged: true,
            };
            continue;
        }
        const mergedHistory = [...remoteSession.history];
        for (const l of localSession.history) {
            const exists = mergedHistory.some(r => r.role === l.role && r.content === l.content);
            if (!exists)
                mergedHistory.push(l);
        }
        output[sessionId] = {
            name: localSession.name || remoteSession.name,
            model: localSession.model || remoteSession.model,
            favorite: localSession.favorite || remoteSession.favorite,
            history: mergedHistory,
            __merged: true,
        };
    }
    return output;
}
export async function safeCallRemote(fn, onErrorReturn = null) {
    const online = !(await isOffline());
    if (!online) {
        return onErrorReturn;
    }
    try {
        const result = await fn();
        if (result?.error)
            throw new Error(result.error);
        return result;
    }
    catch (err) {
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
    }
    catch {
        clearTimeout(id);
        return true;
    }
}
//# sourceMappingURL=sync.js.map