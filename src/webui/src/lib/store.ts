"use client";

/* ------------------------------------------------------------------ */
/*  InferencePort AI — UI concept build · app store (Zustand)          */
/*  All engine behaviour is simulated client-side; no backend.        */
/* ------------------------------------------------------------------ */

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
  CATALOG,
  CLOUD_MODELS,
  HARDWARE,
  generateReply,
  getModel,
  type CatalogModel,
} from "@/lib/data";
import { toast } from "@/hooks/use-toast";

/* ------------------------------- types ---------------------------- */

export type ViewType =
  | "home"
  | "chat"
  | "models"
  | "downloads"
  | "benchmark"
  | "settings";

export type ProviderKind = "local" | "cloud" | "api";

export interface Tab {
  id: string;
  type: ViewType;
  title: string;
  sessionId?: string;
}

export interface DownloadTask {
  modelId: string;
  progress: number;
  downloadedMB: number;
  totalMB: number;
  speedMBs: number;
  etaSec: number;
  status: "downloading" | "paused" | "done";
  startedAt: number;
  finishedAt?: number;
}

export interface LoadedModel {
  modelId: string;
  status: "loading" | "loaded";
  progress: number;
  gpuLayers: number;
  totalLayers: number;
  ctxLength: number;
  temperature: number;
  ramOffload: boolean;
  ssdOffload: boolean;
  vramGB: number;
  ramGB: number;
  ssdGB: number;
  loadedAt?: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  modelId?: string;
  modelLabel?: string;
  tps?: number;
  elapsed?: number;
  partial?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  provider: ProviderKind;
  localModelId: string | null;
  cloudModelId: string | null;
  apiProviderId: string | null;
  apiModelId: string | null;
  generating?: boolean;
  createdAt: number;
}

export interface ApiProviderConfig {
  id: string;
  name: string;
  kind: "openai" | "anthropic" | "custom";
  baseUrl: string;
  apiKey: string;
  models: string[];
}

export interface BenchmarkRun {
  id: string;
  modelId: string;
  date: number;
  maxTps: number;
  avgTps: number;
  ttftMs: number;
  ppTps: number;
  tokens: number;
  durationMs: number;
}

export interface BenchmarkState {
  status: "idle" | "running";
  phase: string;
  phaseIndex: number;
  progress: number;
  modelId: string | null;
  liveTps: number;
  tokens: number;
  elapsedMs: number;
  series: { t: number; tps: number }[];
  result: BenchmarkRun | null;
}

export interface AppSettings {
  autoLoadOnSelect: boolean;
  keepAliveMin: number;
  gpuAccel: boolean;
  maxVramGB: number;
  ramOffloadDefault: boolean;
  ssdOffload: boolean;
  accent: string;
}

/* ------------------------------- helpers -------------------------- */

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2, 10)}`;
}

const dlTimers = new Map<string, ReturnType<typeof setInterval>>();
const loadTimers = new Map<string, ReturnType<typeof setInterval>>();
const loadPromises = new Map<string, Promise<void>>();
const streamTimers = new Map<string, ReturnType<typeof setInterval>>();
let benchTimer: ReturnType<typeof setInterval> | null = null;

function tabTitle(type: ViewType): string {
  switch (type) {
    case "home":
      return "New Tab";
    case "chat":
      return "Chat";
    case "models":
      return "Models";
    case "downloads":
      return "Downloads";
    case "benchmark":
      return "Benchmark";
    case "settings":
      return "Settings";
  }
}

function deriveTitle(text: string): string {
  const words = text.trim().split(/\s+/).slice(0, 6).join(" ");
  const t = words.length > 30 ? words.slice(0, 30) + "…" : words;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function effectiveTps(session: ChatSession): number {
  if (session.provider === "cloud") {
    const cm = CLOUD_MODELS.find((c) => c.id === session.cloudModelId);
    return cm ? cm.tps : 70;
  }
  if (session.provider === "api") return 62;
  const m = getModel(session.localModelId ?? "");
  if (!m) return 40;
  return m.tps;
}

/* ------------------------------- state ---------------------------- */

interface AppState {
  tabs: Tab[];
  activeTabId: string;

  downloaded: string[];
  downloadedAt: Record<string, number>;
  downloads: Record<string, DownloadTask>;
  loadedModels: Record<string, LoadedModel>;

  sessions: Record<string, ChatSession>;

  apiProviders: ApiProviderConfig[];
  cloudConnected: boolean;
  cloudTesting: boolean;

  benchmark: BenchmarkState;
  benchmarkHistory: BenchmarkRun[];

  settings: AppSettings;
  sidebarCollapsed: boolean;

  /* tabs */
  newTab: () => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  navigate: (type: ViewType, opts?: { modelId?: string }) => void;

  /* downloads */
  startDownload: (modelId: string) => void;
  pauseDownload: (modelId: string) => void;
  resumeDownload: (modelId: string) => void;
  cancelDownload: (modelId: string) => void;
  removeDownloadRecord: (modelId: string) => void;

  /* models */
  loadModel: (modelId: string, opts?: { silent?: boolean }) => Promise<void>;
  unloadModel: (modelId: string, opts?: { silent?: boolean }) => void;
  updateLoadConfig: (
    modelId: string,
    patch: Partial<Pick<LoadedModel, "gpuLayers" | "ctxLength" | "temperature" | "ramOffload" | "ssdOffload">>,
  ) => void;

  /* chat */
  openChatTab: (modelId?: string, provider?: ProviderKind) => void;
  sendMessage: (sessionId: string, text: string) => void;
  stopGeneration: (sessionId: string) => void;
  regenerate: (sessionId: string) => void;
  setSessionProvider: (sessionId: string, provider: ProviderKind) => void;
  setSessionModel: (
    sessionId: string,
    provider: ProviderKind,
    modelId: string,
    apiProviderId?: string,
  ) => void;

  /* api providers */
  addApiProvider: (cfg: Omit<ApiProviderConfig, "id">) => void;
  removeApiProvider: (id: string) => void;

  /* cloud */
  testCloudConnection: () => void;

  /* benchmark */
  runBenchmark: (modelId: string) => void;
  stopBenchmark: () => void;

  /* misc */
  updateSettings: (patch: Partial<AppSettings>) => void;
  toggleSidebar: () => void;
}

/* ------------------------------ initial --------------------------- */

const now = Date.now();
const homeTab: Tab = { id: uid(), type: "home", title: "New Tab" };
const seedSessionId = uid();
const seedSession: ChatSession = {
  id: seedSessionId,
  title: "Ideas for the weekend",
  provider: "local",
  localModelId: "llama3.2:3b",
  cloudModelId: null,
  apiProviderId: null,
  apiModelId: null,
  messages: [
    {
      id: uid(),
      role: "user",
      content: "Give me three fun weekend project ideas for a local-LLM tinkerer",
    },
    {
      id: uid(),
      role: "assistant",
      modelId: "llama3.2:3b",
      modelLabel: "Llama 3.2 3B",
      content: `Sure — here are three that play to local models' strengths:\n\n1. **Semantic search over your notes** — embed everything with a small local model and query it offline\n2. **A voice journal** — whisper-style transcription feeding a summarizer\n3. **Speed-run leaderboards** — benchmark every model you download and track real tok/s\n\nWant a starter repo layout for any of these? 🚀`,
      tps: 76.4,
      elapsed: 4.2,
    },
  ],
  createdAt: now - 1000 * 60 * 42,
};
const chatTab: Tab = {
  id: uid(),
  type: "chat",
  title: seedSession.title,
  sessionId: seedSessionId,
};

const initialTabs: Tab[] = [
  homeTab,
  chatTab,
  { id: uid(), type: "models", title: "Models" },
  { id: uid(), type: "downloads", title: "Downloads" },
  { id: uid(), type: "benchmark", title: "Benchmark" },
  { id: uid(), type: "settings", title: "Settings" },
];

const seedBenchmarkHistory: BenchmarkRun[] = [
  {
    id: uid(),
    modelId: "llama3.2:3b",
    date: now - 1000 * 60 * 60 * 26,
    maxTps: 81.3,
    avgTps: 74.6,
    ttftMs: 48,
    ppTps: 1840,
    tokens: 768,
    durationMs: 10290,
  },
  {
    id: uid(),
    modelId: "deepseek-r1:8b",
    date: now - 1000 * 60 * 60 * 4,
    maxTps: 44.1,
    avgTps: 39.8,
    ttftMs: 96,
    ppTps: 1120,
    tokens: 768,
    durationMs: 19320,
  },
].sort((a, b) => b.date - a.date);

const initialLoaded: Record<string, LoadedModel> = {
  "llama3.2:3b": {
    modelId: "llama3.2:3b",
    status: "loaded",
    progress: 100,
    gpuLayers: 28,
    totalLayers: 28,
    ctxLength: 8192,
    temperature: 0.7,
    ramOffload: false,
    ssdOffload: false,
    vramGB: 2.9,
    ramGB: 0.5,
    ssdGB: 0,
    loadedAt: now - 1000 * 60 * 42,
  },
};

/* ------------------------------- store ---------------------------- */

export const useAppStore = create<AppState>()((set, get) => ({
  tabs: initialTabs,
  activeTabId: homeTab.id,

  downloaded: ["llama3.2:3b", "qwen2.5-coder:7b", "deepseek-r1:8b"],
  downloadedAt: {
    "llama3.2:3b": now - 1000 * 60 * 60 * 24 * 3,
    "qwen2.5-coder:7b": now - 1000 * 60 * 60 * 24,
    "deepseek-r1:8b": now - 1000 * 60 * 60 * 5,
  },
  downloads: {},
  loadedModels: initialLoaded,

  sessions: { [seedSessionId]: seedSession },

  apiProviders: [],
  cloudConnected: true,
  cloudTesting: false,

  benchmark: {
    status: "idle",
    phase: "",
    phaseIndex: 0,
    progress: 0,
    modelId: null,
    liveTps: 0,
    tokens: 0,
    elapsedMs: 0,
    series: [],
    result: null,
  },
  benchmarkHistory: seedBenchmarkHistory,

  settings: {
    autoLoadOnSelect: true,
    keepAliveMin: 10,
    gpuAccel: true,
    maxVramGB: 11.5,
    ramOffloadDefault: false,
    ssdOffload: false,
    accent: "orange",
  },
  sidebarCollapsed: false,

  /* ------------------------------ tabs ---------------------------- */

  newTab: () => {
    const { tabs, activeTabId } = get();
    const home = tabs.find((t) => t.type === "home");
    if (home) {
      set({ activeTabId: home.id });
      return;
    }
    const tab: Tab = { id: uid(), type: "home", title: tabTitle("home") };
    set({ tabs: [...tabs, tab], activeTabId: tab.id });
    void activeTabId;
  },

  closeTab: (id) => {
    const { tabs, activeTabId, sessions } = get();
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.type === "chat" && tab.sessionId) {
      streamTimers.delete(tab.sessionId);
      const next = { ...sessions };
      delete next[tab.sessionId];
      set({ sessions: next });
    }
    const idx = tabs.findIndex((t) => t.id === id);
    const nextTabs = tabs.filter((t) => t.id !== id);
    if (nextTabs.length === 0) {
      const fresh: Tab = { id: uid(), type: "home", title: tabTitle("home") };
      set({ tabs: [fresh], activeTabId: fresh.id });
      return;
    }
    const nextActive =
      activeTabId === id
        ? (tabs[idx + 1] ?? tabs[idx - 1]).id
        : activeTabId;
    set({ tabs: nextTabs, activeTabId: nextActive });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  navigate: (type, opts) => {
    if (type === "chat") {
      get().openChatTab(opts?.modelId);
      return;
    }
    const { tabs } = get();
    const existing = tabs.find((t) => t.type === type);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const tab: Tab = { id: uid(), type, title: tabTitle(type) };
    set({ tabs: [...tabs, tab], activeTabId: tab.id });
  },

  /* --------------------------- downloads -------------------------- */

  startDownload: (modelId) => {
    const { downloads } = get();
    if (downloads[modelId]) return;
    const m = getModel(modelId);
    if (!m) return;
    const totalMB = Math.round(m.sizeGB * 1000);
    const task: DownloadTask = {
      modelId,
      progress: 0,
      downloadedMB: 0,
      totalMB,
      speedMBs: 90 + Math.random() * 70,
      etaSec: totalMB / 110,
      status: "downloading",
      startedAt: Date.now(),
    };
    set({ downloads: { ...downloads, [modelId]: task } });

    const timer = setInterval(() => {
      const cur = get().downloads[modelId];
      if (!cur || cur.status !== "downloading") {
        clearInterval(timer);
        dlTimers.delete(modelId);
        return;
      }
      const speed = Math.min(
        185,
        Math.max(55, cur.speedMBs + (Math.random() - 0.5) * 26),
      );
      const downloadedMB = Math.min(
        cur.totalMB,
        cur.downloadedMB + speed * 0.22,
      );
      const progress = (downloadedMB / cur.totalMB) * 100;
      if (downloadedMB >= cur.totalMB) {
        clearInterval(timer);
        dlTimers.delete(modelId);
        const { downloaded, downloadedAt } = get();
        set({
          downloads: {
            ...get().downloads,
            [modelId]: {
              ...cur,
              downloadedMB: cur.totalMB,
              progress: 100,
              status: "done",
              finishedAt: Date.now(),
              etaSec: 0,
            },
          },
          downloaded: downloaded.includes(modelId)
            ? downloaded
            : [...downloaded, modelId],
          downloadedAt: {
            ...downloadedAt,
            [modelId]: Date.now(),
          },
        });
        toast({
          title: `${m.name} ${m.variant} downloaded`,
          description: `${m.sizeGB.toFixed(1)} GB · ready to load`,
        });
        return;
      }
      set({
        downloads: {
          ...get().downloads,
          [modelId]: {
            ...cur,
            downloadedMB,
            progress,
            speedMBs: speed,
            etaSec: (cur.totalMB - downloadedMB) / Math.max(speed, 0.5),
          },
        },
      });
    }, 220);
    dlTimers.set(modelId, timer);
  },

  pauseDownload: (modelId) => {
    const cur = get().downloads[modelId];
    if (!cur || cur.status !== "downloading") return;
    const timer = dlTimers.get(modelId);
    if (timer) clearInterval(timer);
    dlTimers.delete(modelId);
    set({
      downloads: { ...get().downloads, [modelId]: { ...cur, status: "paused" } },
    });
  },

  resumeDownload: (modelId) => {
    const cur = get().downloads[modelId];
    if (!cur || cur.status !== "paused") return;
    set({
      downloads: {
        ...get().downloads,
        [modelId]: { ...cur, status: "downloading" },
      },
    });
    const m = getModel(modelId);
    const timer = setInterval(() => {
      const c = get().downloads[modelId];
      if (!c || c.status !== "downloading") {
        clearInterval(timer);
        dlTimers.delete(modelId);
        return;
      }
      const speed = Math.min(
        185,
        Math.max(55, c.speedMBs + (Math.random() - 0.5) * 26),
      );
      const downloadedMB = Math.min(c.totalMB, c.downloadedMB + speed * 0.22);
      const progress = (downloadedMB / c.totalMB) * 100;
      if (downloadedMB >= c.totalMB) {
        clearInterval(timer);
        dlTimers.delete(modelId);
        const { downloaded, downloadedAt } = get();
        set({
          downloads: {
            ...get().downloads,
            [modelId]: {
              ...c,
              downloadedMB: c.totalMB,
              progress: 100,
              status: "done",
              finishedAt: Date.now(),
              etaSec: 0,
            },
          },
          downloaded: downloaded.includes(modelId)
            ? downloaded
            : [...downloaded, modelId],
          downloadedAt: { ...downloadedAt, [modelId]: Date.now() },
        });
        if (m)
          toast({
            title: `${m.name} ${m.variant} downloaded`,
            description: `${m.sizeGB.toFixed(1)} GB · ready to load`,
          });
        return;
      }
      set({
        downloads: {
          ...get().downloads,
          [modelId]: {
            ...c,
            downloadedMB,
            progress,
            speedMBs: speed,
            etaSec: (c.totalMB - downloadedMB) / Math.max(speed, 0.5),
          },
        },
      });
    }, 220);
    dlTimers.set(modelId, timer);
  },

  cancelDownload: (modelId) => {
    const timer = dlTimers.get(modelId);
    if (timer) clearInterval(timer);
    dlTimers.delete(modelId);
    const next = { ...get().downloads };
    delete next[modelId];
    set({ downloads: next });
  },

  removeDownloadRecord: (modelId) => {
    const cur = get().downloads[modelId];
    if (!cur || cur.status === "downloading" || cur.status === "paused") return;
    const next = { ...get().downloads };
    delete next[modelId];
    set({ downloads: next });
  },

  /* ----------------------------- models --------------------------- */

  loadModel: (modelId, opts) => {
    const existing = get().loadedModels[modelId];
    if (existing?.status === "loaded") return Promise.resolve();
    const pending = loadPromises.get(modelId);
    if (pending) return pending;

    const m = getModel(modelId);
    if (!m) return Promise.resolve();

    const promise = new Promise<void>((resolve) => {
      // placement: full GPU if it fits, otherwise partial + RAM offload
      const othersVram = Object.values(get().loadedModels)
        .filter((l) => l.modelId !== modelId)
        .reduce((a, l) => a + l.vramGB, 0);
      const available = Math.max(
        1.2,
        get().settings.maxVramGB - othersVram,
      );
      const fits = m.vramGB <= available;
      const gpuLayers = fits
        ? m.totalLayers
        : Math.max(
            4,
            Math.round((available / m.vramGB) * m.totalLayers),
          );
      const ramOffload = !fits || get().settings.ramOffloadDefault;
      const gpuFrac = gpuLayers / m.totalLayers;
      const vramGB = fits
        ? m.vramGB
        : Math.max(1, m.vramGB * gpuFrac);
      const ramGB = ramOffload
        ? Math.max(0.6, m.sizeGB * (1 - gpuFrac) * 0.85 + 0.6)
        : 0.5;

      set({
        loadedModels: {
          ...get().loadedModels,
          [modelId]: {
            modelId,
            status: "loading",
            progress: 0,
            gpuLayers,
            totalLayers: m.totalLayers,
            ctxLength: 8192,
            temperature: 0.7,
            ramOffload,
            ssdOffload: get().settings.ssdOffload,
            vramGB,
            ramGB,
            ssdGB: 0,
          },
        },
      });

      if (!fits && !opts?.silent) {
        toast({
          title: "Not enough free VRAM for full GPU load",
          description: `${m.totalLayers - gpuLayers} of ${m.totalLayers} layers offloaded to system RAM automatically.`,
        });
      }

      const timer = setInterval(() => {
        const cur = get().loadedModels[modelId];
        if (!cur || cur.status !== "loading") {
          clearInterval(timer);
          loadTimers.delete(modelId);
          resolve();
          return;
        }
        const progress = Math.min(100, cur.progress + 2.4 + Math.random() * 4.2);
        if (progress >= 100) {
          clearInterval(timer);
          loadTimers.delete(modelId);
          loadPromises.delete(modelId);
          set({
            loadedModels: {
              ...get().loadedModels,
              [modelId]: { ...cur, status: "loaded", progress: 100, loadedAt: Date.now() },
            },
          });
          if (!opts?.silent) {
            const frac = cur.gpuLayers / cur.totalLayers;
            toast({
              title: `${m.name} ${m.variant} loaded`,
              description: `${cur.gpuLayers}/${cur.totalLayers} layers on GPU · est ${
                frac < 1 ? Math.round(m.tps * (0.55 + 0.45 * frac)) : m.tps
              } tok/s`,
            });
          }
          resolve();
          return;
        }
        set({
          loadedModels: {
            ...get().loadedModels,
            [modelId]: { ...cur, progress },
          },
        });
      }, 90);
      loadTimers.set(modelId, timer);
    });
    loadPromises.set(modelId, promise);
    return promise;
  },

  unloadModel: (modelId, opts) => {
    const cur = get().loadedModels[modelId];
    if (!cur) return;
    const timer = loadTimers.get(modelId);
    if (timer) {
      clearInterval(timer);
      loadTimers.delete(modelId);
    }
    loadPromises.delete(modelId);
    const next = { ...get().loadedModels };
    delete next[modelId];
    set({ loadedModels: next });
    if (!opts?.silent) {
      const m = getModel(modelId);
      toast({
        title: m ? `${m.name} ${m.variant} unloaded` : "Model unloaded",
        description: "VRAM freed instantly.",
      });
    }
  },

  updateLoadConfig: (modelId, patch) => {
    const cur = get().loadedModels[modelId];
    if (!cur) return;
    const merged = { ...cur, ...patch };
    const m = getModel(modelId);
    if (!m) return;
    const gpuFrac = merged.gpuLayers / merged.totalLayers;
    const vramGB = Math.max(0.8, m.vramGB * Math.max(gpuFrac, 0.08));
    let ramGB = 0.5;
    let ssdGB = 0;
    const offloadedPart = m.sizeGB * (1 - gpuFrac);
    if (merged.ramOffload && merged.ssdOffload) {
      ramGB = offloadedPart * 0.45 + 0.6;
      ssdGB = offloadedPart * 0.5;
    } else if (merged.ramOffload) {
      ramGB = offloadedPart * 0.85 + 0.6;
    } else if (merged.ssdOffload) {
      ssdGB = offloadedPart * 0.85;
    }
    set({
      loadedModels: {
        ...get().loadedModels,
        [modelId]: { ...merged, vramGB, ramGB, ssdGB },
      },
    });
  },

  /* ------------------------------ chat ---------------------------- */

  openChatTab: (modelId, provider) => {
    const p = provider ?? "local";
    const session: ChatSession = {
      id: uid(),
      title: "New chat",
      messages: [],
      provider: p,
      localModelId: p === "local" ? (modelId ?? null) : null,
      cloudModelId: p === "cloud" ? (modelId ?? null) : null,
      apiProviderId: null,
      apiModelId: null,
      createdAt: Date.now(),
    };
    const tab: Tab = {
      id: uid(),
      type: "chat",
      title: "New chat",
      sessionId: session.id,
    };
    set({
      sessions: { ...get().sessions, [session.id]: session },
      tabs: [...get().tabs, tab],
      activeTabId: tab.id,
    });
    if (p === "local" && modelId && get().settings.autoLoadOnSelect) {
      void get().loadModel(modelId, { silent: true });
    }
  },

  setSessionProvider: (sessionId, provider) => {
    const s = get().sessions[sessionId];
    if (!s) return;
    set({ sessions: { ...get().sessions, [sessionId]: { ...s, provider } } });
  },

  setSessionModel: (sessionId, provider, modelId, apiProviderId) => {
    const s = get().sessions[sessionId];
    if (!s) return;
    const patch: Partial<ChatSession> = { provider };
    if (provider === "local") patch.localModelId = modelId;
    if (provider === "cloud") patch.cloudModelId = modelId;
    if (provider === "api") {
      patch.apiModelId = modelId;
      if (apiProviderId) patch.apiProviderId = apiProviderId;
    }
    set({
      sessions: { ...get().sessions, [sessionId]: { ...s, ...patch } },
    });
    if (
      provider === "local" &&
      modelId &&
      get().settings.autoLoadOnSelect &&
      get().downloaded.includes(modelId)
    ) {
      void get().loadModel(modelId, { silent: true });
    }
  },

  sendMessage: (sessionId, text) => {
    const s = get().sessions[sessionId];
    if (!s || s.generating) return;

    const provider = s.provider;
    if (provider === "local" && !s.localModelId) {
      toast({
        title: "No model selected",
        description: "Pick a model in the header to start chatting.",
      });
      return;
    }
    if (provider === "cloud" && !s.cloudModelId) {
      toast({
        title: "No cloud model selected",
        description: "Pick an InferencePort Cloud model to start.",
      });
      return;
    }
    if (provider === "api" && !s.apiModelId) {
      toast({
        title: "No API model selected",
        description: "Add a provider in Settings or pick a model.",
      });
      return;
    }

    const userMsg: ChatMessage = { id: uid(), role: "user", content: text };
    const isFirst = s.messages.filter((m) => m.role === "user").length === 0;
    set({
      sessions: {
        ...get().sessions,
        [sessionId]: {
          ...s,
          title: isFirst ? deriveTitle(text) : s.title,
          messages: [...s.messages, userMsg],
          generating: true,
        },
      },
    });
    // sync tab title
    const tab = get().tabs.find((t) => t.sessionId === sessionId);
    if (tab && isFirst) {
      set({
        tabs: get().tabs.map((t) =>
          t.id === tab.id ? { ...t, title: deriveTitle(text) } : t,
        ),
      });
    }

    const begin = () => startStream(sessionId, text);
    if (provider === "local" && s.localModelId) {
      const loaded = get().loadedModels[s.localModelId];
      if (!loaded) {
        void get().loadModel(s.localModelId).then(begin);
        return;
      }
    }
    begin();
  },

  stopGeneration: (sessionId) => {
    const timer = streamTimers.get(sessionId);
    if (!timer) return;
    clearInterval(timer);
    streamTimers.delete(sessionId);
    const s = get().sessions[sessionId];
    if (!s) return;
    const msgs = s.messages.map((m) =>
      m.streaming
        ? { ...m, streaming: false, partial: true }
        : m,
    );
    set({
      sessions: { ...get().sessions, [sessionId]: { ...s, messages: msgs, generating: false } },
    });
  },

  regenerate: (sessionId) => {
    const s = get().sessions[sessionId];
    if (!s || s.generating) return;
    const lastUser = [...s.messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const lastUserIdx = s.messages.findIndex((m) => m.id === lastUser.id);
    set({
      sessions: {
        ...get().sessions,
        [sessionId]: {
          ...s,
          messages: s.messages.slice(0, lastUserIdx + 1),
          generating: true,
        },
      },
    });
    startStream(sessionId, lastUser.content);
  },

  /* -------------------------- api providers ----------------------- */

  addApiProvider: (cfg) => {
    const provider: ApiProviderConfig = { ...cfg, id: uid() };
    set({ apiProviders: [...get().apiProviders, provider] });
    toast({
      title: `${provider.name} connected`,
      description: `${provider.models.length} models available in chat.`,
    });
  },

  removeApiProvider: (id) => {
    set({ apiProviders: get().apiProviders.filter((p) => p.id !== id) });
    toast({ title: "Provider removed" });
  },

  /* ------------------------------ cloud --------------------------- */

  testCloudConnection: () => {
    if (get().cloudTesting) return;
    set({ cloudTesting: true });
    setTimeout(() => {
      set({ cloudTesting: false, cloudConnected: true });
      toast({
        title: "Connected to InferencePort Cloud",
        description: "api.inferenceport.ai · 42 ms · key valid",
      });
    }, 1300);
  },

  /* ---------------------------- benchmark ------------------------- */

  runBenchmark: (modelId) => {
    const { benchmark } = get();
    if (benchmark.status === "running") return;
    const m = getModel(modelId);
    if (!m) return;
    const loaded = get().loadedModels[modelId];
    const gpuFrac = loaded ? loaded.gpuLayers / loaded.totalLayers : 1;
    const baseTps = m.tps * (gpuFrac < 1 ? 0.55 + 0.45 * gpuFrac : 1);

    set({
      benchmark: {
        status: "running",
        phase: "Warming up",
        phaseIndex: 0,
        progress: 0,
        modelId,
        liveTps: 0,
        tokens: 0,
        elapsedMs: 0,
        series: [],
        result: null,
      },
    });

    const t0 = Date.now();
    const phases = [
      { name: "Warming up", until: 700 },
      { name: "Processing prompt", until: 1900 },
      { name: "Generating tokens", until: 6900 },
      { name: "Analyzing", until: 7400 },
    ];
    let wobble = Math.random() * Math.PI * 2;

    benchTimer = setInterval(() => {
      const elapsed = Date.now() - t0;
      const phase =
        phases.find((p) => elapsed < p.until) ?? phases[phases.length - 1];
      const phaseIdx = phases.indexOf(phase);
      const progress = Math.min(1, elapsed / phases[3].until);

      const b = get().benchmark;
      if (b.status !== "running") {
        if (benchTimer) clearInterval(benchTimer);
        benchTimer = null;
        return;
      }

      if (phaseIdx >= 2 && elapsed < phases[2].until) {
        wobble += 0.35;
        const jitter =
          1 + Math.sin(wobble) * 0.06 + (Math.random() - 0.5) * 0.07;
        const liveTps = Math.max(2, baseTps * jitter);
        const series = [...b.series, { t: +(elapsed / 1000).toFixed(1), tps: +liveTps.toFixed(1) }];
        set({
          benchmark: {
            ...b,
            phase: phase.name,
            phaseIndex: phaseIdx,
            progress,
            elapsedMs: elapsed,
            liveTps,
            tokens: Math.round(b.tokens + liveTps * 0.1),
            series,
          },
        });
        return;
      }

      if (elapsed >= phases[3].until) {
        if (benchTimer) clearInterval(benchTimer);
        benchTimer = null;
        const gen = b.series;
        const maxTps = gen.length
          ? Math.max(...gen.map((p) => p.tps))
          : baseTps;
        const avgTps = gen.length
          ? gen.reduce((a, p) => a + p.tps, 0) / gen.length
          : baseTps;
        const run: BenchmarkRun = {
          id: uid(),
          modelId,
          date: Date.now(),
          maxTps: +maxTps.toFixed(1),
          avgTps: +avgTps.toFixed(1),
          ttftMs: Math.round(38 + Math.random() * 90),
          ppTps: Math.round(
            (m.params.includes("70B") ? 420 : 1800) + Math.random() * 600,
          ),
          tokens: b.tokens,
          durationMs: elapsed,
        };
        set({
          benchmark: {
            ...b,
            status: "idle",
            phase: "",
            progress: 1,
            result: run,
          },
          benchmarkHistory: [run, ...get().benchmarkHistory].slice(0, 10),
        });
        toast({
          title: `Benchmark complete — ${m.name} ${m.variant}`,
          description: `Max ${run.maxTps.toFixed(1)} tok/s · avg ${run.avgTps.toFixed(1)} tok/s`,
        });
        return;
      }

      set({
        benchmark: {
          ...b,
          phase: phase.name,
          phaseIndex: phaseIdx,
          progress,
          elapsedMs: elapsed,
        },
      });
    }, 100);
  },

  stopBenchmark: () => {
    if (benchTimer) clearInterval(benchTimer);
    benchTimer = null;
    const b = get().benchmark;
    set({
      benchmark: { ...b, status: "idle", phase: "", progress: 0 },
    });
    toast({ title: "Benchmark stopped" });
  },

  /* ------------------------------ misc ---------------------------- */

  updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),

  toggleSidebar: () =>
    set({ sidebarCollapsed: !get().sidebarCollapsed }),
}));

/* --------------------------- stream engine ------------------------ */

function modelLabelFor(session: ChatSession): string {
  if (session.provider === "cloud") {
    const cm = CLOUD_MODELS.find((c) => c.id === session.cloudModelId);
    return cm ? cm.label : "Cloud model";
  }
  if (session.provider === "api") {
    const p = useAppStore
      .getState()
      .apiProviders.find((x) => x.id === session.apiProviderId);
    return session.apiModelId
      ? `${p?.name ?? "API"} · ${session.apiModelId}`
      : "API model";
  }
  const m = getModel(session.localModelId ?? "");
  return m ? `${m.name} ${m.variant}` : "Local model";
}

function startStream(sessionId: string, promptText: string) {
  const st = useAppStore.getState();
  const s = st.sessions[sessionId];
  if (!s) return;

  const tps = effectiveTps(s);
  const label = modelLabelFor(s);
  const providerName = st.apiProviders.find(
    (p) => p.id === s.apiProviderId,
  )?.name;
  const turn = s.messages.filter((m) => m.role === "user").length;
  const reply = generateReply(
    promptText,
    {
      modelLabel: label,
      tps,
      location: s.provider === "local" ? "local" : s.provider === "cloud" ? "cloud" : "api",
      providerName,
    },
    turn,
  );

  const msgId = uid();
  const assistantMsg: ChatMessage = {
    id: msgId,
    role: "assistant",
    content: "",
    streaming: true,
    modelId: s.localModelId ?? s.cloudModelId ?? s.apiModelId ?? undefined,
    modelLabel: label,
  };
  useAppStore.setState({
    sessions: {
      ...useAppStore.getState().sessions,
      [sessionId]: {
        ...s,
        messages: [...s.messages, assistantMsg],
        generating: true,
      },
    },
  });

  const chunks = reply.match(/\s*\S+/g) ?? [reply];
  const tickMs = Math.max(24, Math.min(90, 1000 / tps));
  let i = 0;
  const t0 = Date.now();

  const finish = () => {
    const timer = streamTimers.get(sessionId);
    if (timer) clearInterval(timer);
    streamTimers.delete(sessionId);
    const elapsed = (Date.now() - t0) / 1000;
    const cur = useAppStore.getState().sessions[sessionId];
    if (!cur) return;
    useAppStore.setState({
      sessions: {
        ...useAppStore.getState().sessions,
        [sessionId]: {
          ...cur,
          generating: false,
          messages: cur.messages.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  streaming: false,
                  tps: +(i / Math.max(elapsed, 0.001)).toFixed(1),
                  elapsed: +elapsed.toFixed(1),
                }
              : m,
          ),
        },
      },
    });
  };

  const timer = setInterval(() => {
    const cur = useAppStore.getState().sessions[sessionId];
    if (!cur) {
      finish();
      return;
    }
    const take = 1 + (Math.random() < 0.4 ? 1 : 0);
    const next = chunks.slice(i, i + take).join("");
    i += take;
    useAppStore.setState({
      sessions: {
        ...useAppStore.getState().sessions,
        [sessionId]: {
          ...cur,
          messages: cur.messages.map((m) =>
            m.id === msgId ? { ...m, content: m.content + next } : m,
          ),
        },
      },
    });
    if (i >= chunks.length) finish();
  }, tickMs);
  streamTimers.set(sessionId, timer);
}

/* ---------------------------- selectors --------------------------- */

export function useSystemStats() {
  return useAppStore(
    useShallow((s) => {
      const loaded = Object.values(s.loadedModels);
      const vramUsed = loaded.reduce((a, l) => a + l.vramGB, 0);
      const ramUsed =
        HARDWARE.baseRamUsed + loaded.reduce((a, l) => a + l.ramGB, 0);
      return {
        loadedCount: loaded.filter((l) => l.status === "loaded").length,
        loadingCount: loaded.filter((l) => l.status === "loading").length,
        vramUsed: Math.min(vramUsed, HARDWARE.vramTotal),
        ramUsed: Math.min(ramUsed, HARDWARE.ramTotal),
        activeDownloads: Object.values(s.downloads).filter(
          (d) => d.status !== "done",
        ).length,
        downloadedCount: s.downloaded.length,
      };
    }),
  );
}

export function catalogModel(id: string): CatalogModel | undefined {
  return CATALOG.find((m) => m.id === id);
}
