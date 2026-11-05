"use client";

/* Chat view: provider switcher, model picker, streaming messages, composer */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  ChevronDown,
  Cloud,
  HardDrive,
  KeyRound,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Power,
  Copy,
  RotateCcw,
  Check,
  Sparkles,
  Square,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CATALOG,
  CLOUD_MODELS,
  getModel,
  type CatalogModel,
} from "@/lib/data";
import {
  useAppStore,
  type ChatMessage,
  type ProviderKind,
} from "@/lib/store";
import { PublisherAvatar, StatusDot, EmptyState } from "@/components/ip/Shared";
import { Markdown } from "@/components/ip/Markdown";
import { ModelsPanel } from "@/components/ip/ModelsPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/* --------------------------- provider pill ------------------------ */

const PROVIDERS: { key: ProviderKind; label: string; icon: typeof Cloud }[] = [
  { key: "local", label: "Local", icon: Cpu },
  { key: "cloud", label: "Cloud", icon: Cloud },
  { key: "api", label: "API keys", icon: KeyRound },
];

function ProviderPills({
  value,
  onChange,
}: {
  value: ProviderKind;
  onChange: (p: ProviderKind) => void;
}) {
  return (
    <div className="flex items-center rounded-2xl bg-white/[0.04] p-1 ring-1 ring-white/[0.06]">
      {PROVIDERS.map((p) => {
        const active = value === p.key;
        return (
          <button
            key={p.key}
            onClick={() => onChange(p.key)}
            className="relative rounded-xl px-3 py-1.5"
          >
            {active ? (
              <motion.span
                layoutId="provider-pill"
                className="absolute inset-0 rounded-xl bg-card shadow-sm ring-1 ring-white/10"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex items-center gap-1.5 text-[12px] font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <p.icon className={cn("h-3.5 w-3.5", active && "text-orange-300")} />
              <span className="hidden sm:inline">{p.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------- model picker ------------------------ */

function ModelPicker({ sessionId }: { sessionId: string }) {
  const session = useAppStore((s) => s.sessions[sessionId]);
  const downloaded = useAppStore((s) => s.downloaded);
  const loadedModels = useAppStore((s) => s.loadedModels);
  const apiProviders = useAppStore((s) => s.apiProviders);
  const setSessionModel = useAppStore((s) => s.setSessionModel);
  const navigate = useAppStore((s) => s.navigate);

  if (!session) return null;
  const provider = session.provider;

  const currentModel: { label: string; sub: string } | null =
    provider === "local"
      ? (() => {
          const m = getModel(session.localModelId ?? "");
          const loaded = session.localModelId
            ? loadedModels[session.localModelId]
            : undefined;
          return m
            ? {
                label: `${m.name} ${m.variant}`,
                sub:
                  loaded?.status === "loaded"
                    ? "loaded · streaming locally"
                    : loaded?.status === "loading"
                      ? "loading…"
                      : "not loaded",
              }
            : null;
        })()
      : provider === "cloud"
        ? (() => {
            const cm = CLOUD_MODELS.find((c) => c.id === session.cloudModelId);
            return cm
              ? { label: cm.label, sub: `InferencePort Cloud · ${cm.speed}` }
              : null;
          })()
        : (() => {
            const p = apiProviders.find((x) => x.id === session.apiProviderId);
            return session.apiModelId && p
              ? { label: session.apiModelId, sub: `${p.name} · ${p.baseUrl.replace(/^https?:\/\//, "")}` }
              : null;
          })();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "group flex h-9 min-w-0 items-center gap-2 rounded-2xl px-3 text-left ring-1 transition-colors",
            currentModel
              ? "bg-white/[0.05] ring-white/[0.09] hover:bg-white/[0.08]"
              : "bg-orange-500/12 ring-orange-400/25 hover:bg-orange-500/18",
          )}
        >
          <span
            className={cn(
              "grid h-5 w-5 shrink-0 place-items-center rounded-lg",
              provider === "local"
                ? "bg-orange-500/15 text-orange-300"
                : provider === "cloud"
                  ? "bg-teal-500/15 text-teal-300"
                  : "bg-violet-500/15 text-violet-300",
            )}
          >
            {provider === "local" ? (
              <Cpu className="h-3 w-3" />
            ) : provider === "cloud" ? (
              <Cloud className="h-3 w-3" />
            ) : (
              <KeyRound className="h-3 w-3" />
            )}
          </span>
          <span className="min-w-0">
            {currentModel ? (
              <>
                <span className="block max-w-44 truncate text-[12.5px] font-semibold leading-tight">
                  {currentModel.label}
                </span>
                <span className="block max-w-44 truncate text-[10px] leading-tight text-muted-foreground">
                  {currentModel.sub}
                </span>
              </>
            ) : (
              <span className="block truncate text-[12.5px] font-semibold text-orange-200">
                Select a model
              </span>
            )}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 rounded-2xl border-white/10 bg-popover p-1.5">
        {provider === "local" ? (
          <>
            <DropdownMenuLabel className="px-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Installed models
            </DropdownMenuLabel>
            {CATALOG.filter((m) => downloaded.includes(m.id)).map((m) => {
              const loaded = loadedModels[m.id];
              return (
                <DropdownMenuItem
                  key={m.id}
                  className="gap-2.5 rounded-xl py-2"
                  onClick={() => setSessionModel(sessionId, "local", m.id)}
                >
                  <PublisherAvatar name={m.name} family={m.family} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">
                      {m.name} {m.variant}
                    </span>
                    <span className="block text-[10.5px] text-muted-foreground">
                      {loaded?.status === "loaded"
                        ? "loaded in memory"
                        : loaded?.status === "loading"
                          ? "loading…"
                          : "will auto-load on send"}
                    </span>
                  </span>
                  {loaded?.status === "loaded" ? (
                    <StatusDot tone="green" />
                  ) : null}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator className="bg-white/[0.07]" />
            <DropdownMenuItem
              className="gap-2 rounded-xl text-[12px] text-muted-foreground"
              onClick={() => navigate("models")}
            >
              <HardDrive className="h-3.5 w-3.5" />
              Download more models
            </DropdownMenuItem>
          </>
        ) : null}

        {provider === "cloud" ? (
          <>
            <DropdownMenuLabel className="flex items-center justify-between px-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              InferencePort Cloud
              <span className="flex items-center gap-1 normal-case text-emerald-300">
                <StatusDot tone="green" pulse /> connected
              </span>
            </DropdownMenuLabel>
            {CLOUD_MODELS.map((cm) => (
              <DropdownMenuItem
                key={cm.id}
                className="gap-2.5 rounded-xl py-2"
                onClick={() => setSessionModel(sessionId, "cloud", cm.id)}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-teal-500/12 text-teal-300 ring-1 ring-teal-400/20">
                  <Cloud className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium">
                    {cm.label}
                  </span>
                  <span className="block text-[10.5px] text-muted-foreground">
                    {cm.params} · {cm.ctx} ctx · ~{cm.tps} tok/s
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}

        {provider === "api" ? (
          apiProviders.length === 0 ? (
            <div className="p-3">
              <p className="text-[12.5px] font-medium">No API providers yet</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Add an OpenAI, Anthropic or custom OpenAI-compatible key — stored
                locally, used directly by the app.
              </p>
              <Button
                size="sm"
                className="mt-3 w-full rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => navigate("settings")}
              >
                <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Add API key
              </Button>
            </div>
          ) : (
            apiProviders.map((p) => (
              <div key={p.id}>
                <DropdownMenuLabel className="px-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  {p.name}
                </DropdownMenuLabel>
                {p.models.map((mid) => (
                  <DropdownMenuItem
                    key={mid}
                    className="gap-2.5 rounded-xl py-2"
                    onClick={() => setSessionModel(sessionId, "api", mid, p.id)}
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-violet-500/12 text-violet-300 ring-1 ring-violet-400/20">
                      <KeyRound className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[11.5px] font-medium">
                        {mid}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="bg-white/[0.07]" />
              </div>
            ))
          )
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------ messages -------------------------- */

function AssistantMessage({
  msg,
  isLast,
  onRegenerate,
  generating,
}: {
  msg: ChatMessage;
  isLast: boolean;
  onRegenerate: () => void;
  generating: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(msg.content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="group/msg flex gap-3">
      <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-500/25 to-amber-500/15 text-orange-200 ring-1 ring-orange-400/25">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[12px] font-semibold text-foreground/90">
            {msg.modelLabel ?? "Assistant"}
          </span>
          {msg.streaming ? (
            <span className="flex items-center gap-1 text-[10.5px] text-orange-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
              generating…
            </span>
          ) : msg.tps ? (
            <span className="rounded-md bg-white/[0.05] px-1.5 py-px font-mono text-[9.5px] text-muted-foreground">
              {msg.tps} tok/s · {msg.elapsed}s
            </span>
          ) : null}
          {msg.partial ? (
            <span className="rounded-md bg-amber-500/10 px-1.5 py-px text-[9.5px] text-amber-300">
              stopped
            </span>
          ) : null}
        </div>
        <Markdown content={msg.content} />
        {msg.streaming ? <span className="ip-caret" /> : null}
        {!msg.streaming && msg.content ? (
          <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100">
            <button
              onClick={copy}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
            {isLast ? (
              <button
                onClick={onRegenerate}
                disabled={generating}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-40"
              >
                <RotateCcw className="h-3 w-3" /> Regenerate
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------- view ----------------------------- */

export function ChatView({ sessionId }: { sessionId: string }) {
  const session = useAppStore((s) => s.sessions[sessionId]);
  const loadedModels = useAppStore((s) => s.loadedModels);
  const downloaded = useAppStore((s) => s.downloaded);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const stopGeneration = useAppStore((s) => s.stopGeneration);
  const regenerate = useAppStore((s) => s.regenerate);
  const setSessionProvider = useAppStore((s) => s.setSessionProvider);
  const openChatTab = useAppStore((s) => s.openChatTab);
  const loadModel = useAppStore((s) => s.loadModel);

  const isMobile = useIsMobile();
  const [input, setInput] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);

  /* open the model panel by default on desktop after mount */
  useEffect(() => {
    if (window.innerWidth >= 768) {
      const t = setTimeout(() => setPanelOpen(true), 60);
      return () => clearTimeout(t);
    }
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const messages = session?.messages ?? [];
  const generating = session?.generating ?? false;

  /* auto-scroll when streaming */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 220;
    if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  if (!session) return null;

  /* model loading indicator for local models */
  const localModel = session.localModelId ? getModel(session.localModelId) : undefined;
  const localLoaded = session.localModelId ? loadedModels[session.localModelId] : undefined;
  const showLoading =
    session.provider === "local" &&
    localLoaded?.status === "loading";

  const hasModel =
    session.provider === "local"
      ? Boolean(session.localModelId)
      : session.provider === "cloud"
        ? Boolean(session.cloudModelId)
        : Boolean(session.apiModelId);

  const send = () => {
    const text = input.trim();
    if (!text || !hasModel || generating) return;
    sendMessage(sessionId, text);
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
  };

  return (
    <div className="flex h-full min-w-0">
      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-4 py-3 sm:px-5">
          <ProviderPills
            value={session.provider}
            onChange={(p) => setSessionProvider(sessionId, p)}
          />
          <ModelPicker sessionId={sessionId} />
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-2xl px-3 text-[12px] text-muted-foreground hover:text-foreground"
              onClick={() => openChatTab()}
            >
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
              <span className="hidden sm:inline">New chat</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-2xl text-muted-foreground hover:text-foreground"
              onClick={() => setPanelOpen((v) => !v)}
              aria-label="Toggle model panel"
            >
              {panelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* messages */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-7 sm:px-6">
            {messages.length === 0 ? (
              <div className="pt-8">
                <EmptyState
                  icon={<Sparkles className="h-7 w-7 text-orange-300" />}
                  title="Start your conversation"
                  sub="Pick a provider above and a model — local models run fully offline on your hardware."
                />
                {session.provider === "local" && downloaded.length > 0 ? (
                  <div className="mx-auto mt-4 flex max-w-lg flex-wrap justify-center gap-2">
                    {CATALOG.filter((m) => downloaded.includes(m.id)).map(
                      (m: CatalogModel) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            useAppStore
                              .getState()
                              .setSessionModel(sessionId, "local", m.id);
                            void loadModel(m.id);
                          }}
                          className="flex items-center gap-2 rounded-2xl bg-white/[0.04] px-3 py-2 text-[12px] font-medium ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.08] hover:ring-white/[0.16]"
                        >
                          <PublisherAvatar name={m.name} family={m.family} size="sm" />
                          {m.name}
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {m.variant}
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              messages.map((msg, i) =>
                msg.role === "user" ? (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-end"
                  >
                    <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-primary/15 px-4 py-2.5 text-[13.5px] leading-relaxed text-foreground ring-1 ring-primary/20">
                      {msg.content}
                    </div>
                  </motion.div>
                ) : (
                  <AssistantMessage
                    key={msg.id}
                    msg={msg}
                    isLast={i === messages.length - 1}
                    generating={generating}
                    onRegenerate={() => regenerate(sessionId)}
                  />
                ),
              )
            )}

            {showLoading ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-2xl bg-orange-500/[0.07] px-4 py-3 ring-1 ring-orange-400/15"
              >
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-orange-400/30 border-t-orange-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-orange-200">
                    Loading {localModel?.name} {localModel?.variant} into memory…
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {Math.round(localLoaded?.progress ?? 0)}% ·{" "}
                    {localLoaded
                      ? `${localLoaded.gpuLayers}/${localLoaded.totalLayers} GPU layers${
                          localLoaded.ramOffload ? " + RAM offload" : ""
                        }`
                      : ""}
                  </p>
                </div>
              </motion.div>
            ) : null}
          </div>
        </div>

        {/* composer */}
        <div className="shrink-0 px-4 pb-4 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-3xl bg-card/90 p-2 ring-1 ring-white/[0.09] transition-shadow focus-within:shadow-[0_0_0_1px_rgba(251,146,60,0.35),0_12px_40px_-16px_rgba(0,0,0,0.7)]">
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                disabled={!hasModel}
                placeholder={
                  hasModel
                    ? generating
                      ? "Model is responding… (Esc to stop)"
                      : "Ask anything — runs privately on your machine"
                    : "Select a model first…"
                }
                className="max-h-40 w-full resize-none bg-transparent px-3 pb-1 pt-2 text-[13.5px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none disabled:cursor-not-allowed"
              />
              <div className="flex items-center justify-between px-1.5 pb-0.5 pt-1">
                <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground/70">
                  <Power className="h-3 w-3" />
                  {session.provider === "local"
                    ? "local · private"
                    : session.provider === "cloud"
                      ? "InferencePort Cloud · encrypted"
                      : "your API key · direct"}
                  <span className="ml-1 hidden sm:inline">
                    · Enter to send · Shift+Enter for newline
                  </span>
                </div>
                {generating ? (
                  <motion.button
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => stopGeneration(sessionId)}
                    className="grid h-9 w-9 place-items-center rounded-2xl bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/25 transition-colors hover:bg-rose-500/25"
                    aria-label="Stop generating"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={input.trim() && hasModel ? { scale: 1.06 } : undefined}
                    whileTap={{ scale: 0.9 }}
                    onClick={send}
                    disabled={!input.trim() || !hasModel}
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-2xl transition-colors",
                      input.trim() && hasModel
                        ? "ip-brand-gradient text-[#241205] shadow-[0_4px_18px_-6px_rgba(251,146,60,0.6)]"
                        : "bg-white/[0.06] text-muted-foreground/50",
                    )}
                    aria-label="Send message"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </motion.button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* right panel */}
      <AnimatePresence initial={false}>
        {panelOpen ? (
          <motion.div
            key="panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: isMobile ? 300 : 296, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className={cn(
              "h-full overflow-hidden",
              isMobile &&
                "absolute right-0 top-0 z-40 shadow-[0_0_60px_rgba(0,0,0,0.55)]",
            )}
          >
            <ModelsPanel onClose={() => setPanelOpen(false)} isMobile={isMobile} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
