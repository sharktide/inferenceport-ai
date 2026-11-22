/*
Copyright 2026 InferencePort LLC

Home is an overview of data already stored by the desktop application.
Never infer successful connections or generate placeholder counts.
*/
import { MediaDB } from "./renderer/db.js";

type StoredSession = {
    name?: string;
    model?: string;
    favorite?: boolean;
};
type InstalledModel = { name: string; size?: string | number };
type StudioHistoryItem = {
    id: string;
    title: string;
    role: string;
    timestamp: number;
    content?: string;
    mode?: "data" | "blob" | "asset";
};

const byId = (id: string): HTMLElement | null => document.getElementById(id);
const setText = (id: string, value: string): void => {
    const el = byId(id);
    if (el) el.textContent = value;
};
const formatDate = (value: number): string => {
    if (!Number.isFinite(value) || value <= 0) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};
const placeholder = (message: string): HTMLParagraphElement => {
    const p = document.createElement("p");
    p.className = "home-empty";
    p.textContent = message;
    return p;
};
function row(title: string, detail: string, href: string): HTMLAnchorElement {
    const link = document.createElement("a");
    link.className = "home-list-row";
    link.href = href;
    const content = document.createElement("span");
    content.className = "home-list-copy";
    const titleEl = document.createElement("span");
    titleEl.className = "home-row-title";
    titleEl.textContent = title;
    const detailEl = document.createElement("span");
    detailEl.className = "home-row-detail";
    detailEl.textContent = detail;
    content.append(titleEl, detailEl);
    const hint = document.createElement("span");
    hint.className = "home-row-action";
    hint.textContent = "Open";
    link.append(content, hint);
    return link;
}

let models: InstalledModel[] = [];
let loading = false;

function renderModels(): void {
    const target = byId("home-models");
    if (!target) return;
    const input = byId("home-model-filter") as HTMLInputElement | null;
    const query = input?.value.trim().toLowerCase() || "";
    const filtered = models.filter(model => model.name.toLowerCase().includes(query));
    target.replaceChildren();

    if (models.length === 0) {
        target.append(placeholder("No models installed on this host. Browse the marketplace to add one."));
        const browse = document.createElement("a");
        browse.className = "home-empty-link";
        browse.href = "marketplace/ollama.html";
        browse.textContent = "Browse local models";
        target.append(browse);
        return;
    }
    if (filtered.length === 0) {
        target.append(placeholder("No installed models match that name."));
        return;
    }
    for (const model of filtered.slice(0, 5)) {
        const detail = model.size != null && model.size !== ""
            ? String(model.size)
            : "Available on the selected host";
        const url = new URL("renderer/chat.html", window.location.href);
        url.searchParams.set("model", model.name);
        target.append(row(model.name, detail, url.href));
    }
    if (filtered.length > 5) {
        const rest = document.createElement("p");
        rest.className = "home-list-more";
        rest.textContent = `${filtered.length - 5} more installed models. Narrow your search or open Installed.`;
        target.append(rest);
    }
}

async function loadSessions(): Promise<void> {
    const target = byId("home-sessions");
    if (!target) return;
    try {
        const saved = await window.ollama.load() as Record<string, StoredSession> | null;
        const sessionEntries = Object.entries(saved && typeof saved === "object" ? saved : {})
            .filter(([, session]) => session && typeof session === "object");
        setText("home-session-count", String(sessionEntries.length));
        let access: Record<string, number> = {};
        try {
            const value = JSON.parse(localStorage.getItem("session-last-access") || "{}");
            if (value && typeof value === "object" && !Array.isArray(value)) access = value;
        } catch {
            // Corrupt optional timestamps should not prevent rendering the sessions.
        }
        sessionEntries.sort(([a, sa], [b, sb]) => {
            const fav = Number(Boolean(sb.favorite)) - Number(Boolean(sa.favorite));
            if (fav) return fav;
            return (Number(access[b]) || 0) - (Number(access[a]) || 0);
        });
        target.replaceChildren();
        if (sessionEntries.length === 0) {
            target.append(placeholder("No conversations yet. Start a chat to see it here."));
            return;
        }
        for (const [id, session] of sessionEntries.slice(0, 5)) {
            const url = new URL("renderer/chat.html", window.location.href);
            url.searchParams.set("session", id);
            const name = typeof session.name === "string" && session.name.trim()
                ? session.name
                : "Untitled conversation";
            const detail = [
                session.favorite ? "Pinned" : "",
                typeof session.model === "string" ? session.model : "",
                formatDate(Number(access[id]))
            ].filter(Boolean).join(" · ");
            target.append(row(name, detail || "Saved conversation", url.href));
        }
    } catch (error) {
        console.warn("[home] Could not load sessions", error);
        setText("home-session-count", "—");
        target.replaceChildren(placeholder("Conversations could not be loaded. Open Chat to retry."));
    }
}

async function loadModels(): Promise<void> {
    const target = byId("home-models");
    if (!target) return;
    const host = localStorage.getItem("host_select") || "local";
    const isRemote = host.startsWith("remote:");
    const clientUrl = isRemote ? host.slice("remote:".length) : undefined;
    let hostLabel = "Local";
    if (isRemote) {
        try {
            const remotes = JSON.parse(localStorage.getItem("remote_hosts") || "[]") as Array<{url?: string; alias?: string}>;
            const current = Array.isArray(remotes) ? remotes.find(h => h.url === clientUrl) : null;
            hostLabel = current?.alias?.trim() || "Remote";
        } catch {
            hostLabel = "Remote";
        }
    }
    setText("home-host-name", hostLabel);
    setText("home-models-description", `Models installed on ${hostLabel.toLowerCase()}.`);
    try {
        const result = await window.ollama.listModels(clientUrl);
        models = Array.isArray(result)
            ? result
                .filter(model => Boolean(model && typeof model.name === "string"))
                .map(model => ({ name: model.name, size: model.size }))
            : [];
        setText("home-model-count", String(models.length));
        renderModels();
        setText("home-connection", isRemote
            ? `Connected to ${hostLabel}. Model list updated.`
            : "Local model runtime is available.");
    } catch (error) {
        models = [];
        setText("home-model-count", "—");
        console.warn("[home] Could not load installed models", error);
        target.replaceChildren(placeholder("Unable to reach the selected model host. Check your connection or try Refresh."));
        setText("home-connection", `${hostLabel} model host is not available.`);
    }
}

function mediaTile(item: StudioHistoryItem): HTMLAnchorElement {
    const link = document.createElement("a");
    link.className = "home-media-tile";
    link.href = "renderer/studio.html?open=history";

    const preview = document.createElement("span");
    preview.className = "home-media-preview";
    const hasLocalImage = item.role === "image"
        && item.mode !== "asset"
        && typeof item.content === "string"
        && (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(item.content)
            || item.content.startsWith("blob:"));
    if (hasLocalImage) {
        const img = document.createElement("img");
        img.src = item.content!;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        preview.append(img);
    } else {
        const kind = document.createElement("span");
        kind.className = "home-media-type";
        kind.textContent = item.role === "video" ? "Video" : item.role === "audio" ? "Audio" : "Image";
        preview.append(kind);
    }

    const copy = document.createElement("span");
    copy.className = "home-media-copy";
    const title = document.createElement("span");
    title.className = "home-media-title";
    title.textContent = item.title;
    title.title = item.title;
    const detail = document.createElement("span");
    detail.className = "home-media-date";
    detail.textContent = formatDate(item.timestamp);
    copy.append(title, detail);
    link.append(preview, copy);
    return link;
}

async function loadMedia(): Promise<void> {
    const target = byId("home-media");
    if (!target) return;
    try {
        const db = new MediaDB();
        await db.open();
        const items = (await db.getAll() as StudioHistoryItem[])
            .filter(item => item && typeof item.title === "string" && typeof item.timestamp === "number")
            .sort((a, b) => b.timestamp - a.timestamp);
        setText("home-media-count", String(items.length));
        target.replaceChildren();
        if (items.length === 0) {
            target.append(placeholder("Nothing in Studio history yet. Your next creation will appear here."));
            return;
        }
        for (const item of items.slice(0, 3)) {
            target.append(mediaTile(item));
        }
    } catch (error) {
        console.warn("[home] Could not load Studio history", error);
        setText("home-media-count", "—");
        target.replaceChildren(placeholder("Studio history isn't available right now."));
    }
}

async function refresh(): Promise<void> {
    if (loading) return;
    loading = true;
    const button = byId("home-refresh") as HTMLButtonElement | null;
    if (button) {
        button.disabled = true;
        button.textContent = "Refreshing…";
    }
    try {
        await Promise.allSettled([loadSessions(), loadModels(), loadMedia()]);
    } finally {
        loading = false;
        if (button) {
            button.disabled = false;
            button.textContent = "Refresh";
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    byId("home-refresh")?.addEventListener("click", () => { void refresh(); });
    byId("home-model-filter")?.addEventListener("input", renderModels);
    void refresh();
});
