"use client";

/* Vertical browser-style tab strip (Arc-inspired) */

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftRight,
  Gauge,
  Boxes,
  Compass,
  Download,
  Heart,
  MessageSquare,
  Plus,
  Settings,
  X,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAppStore, type Tab } from "@/lib/store";

const TAB_ICON = {
  home: Compass,
  chat: MessageSquare,
  models: Boxes,
  downloads: Download,
  benchmark: Gauge,
  settings: Settings,
} as const;

function TabFavicon({ tab }: { tab: Tab }) {
  const Icon = TAB_ICON[tab.type];
  return (
    <span className="relative grid h-6 w-6 shrink-0 place-items-center">
      <Icon className="h-4 w-4 text-foreground/80" />
    </span>
  );
}

function TabRow({ tab }: { tab: Tab }) {
  const active = useAppStore((s) => s.activeTabId === tab.id);
  const setActive = useAppStore((s) => s.setActiveTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const loadingCount = useAppStore(
    (s) =>
      tab.type === "chat"
        ? Object.values(s.loadedModels).filter((l) => l.status === "loading").length
        : 0,
  );

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, scale: 0.92, x: -8 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.9, x: -10 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="group/tab relative"
    >
      <button
        onClick={() => setActive(tab.id)}
        className={cn(
          "relative flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-2 text-left transition-colors duration-200",
          active
            ? "bg-card text-card-foreground shadow-[0_2px_10px_-4px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
            : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground/90",
        )}
        aria-current={active ? "page" : undefined}
      >
        <TabFavicon tab={tab} />
        <span
          className={cn(
            "hidden min-w-0 flex-1 truncate text-[12.5px] font-medium sm:block",
            active && "text-foreground",
          )}
          title={tab.title}
        >
          {tab.title}
        </span>
        {loadingCount > 0 && tab.type === "chat" ? (
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-orange-400/40 border-t-orange-400" />
        ) : null}
        <span
          className={cn(
            "hidden h-5 w-5 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-all duration-150 group-hover/tab:opacity-100 sm:grid",
            active && "opacity-70",
            "hover:bg-white/10 hover:text-foreground",
          )}
        >
          <X
            className="h-3 w-3"
            onMouseDown={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </span>
      </button>
    </motion.div>
  );
}

export function TabStrip() {
  const tabs = useAppStore((s) => s.tabs);
  const newTab = useAppStore((s) => s.newTab);
  const navigate = useAppStore((s) => s.navigate);
  const activeDownloads = useAppStore(
    (s) => Object.values(s.downloads).filter((d) => d.status === "downloading").length,
  );

  const pinned = tabs.filter((t) => t.type === "chat");
  const others = tabs.filter((t) => t.type !== "chat");

  return (
    <div className="flex h-full w-[64px] shrink-0 flex-col border-r border-border/60 bg-sidebar/60 sm:w-[228px]">
      {/* window drag area + traffic lights */}
      <div className="app-drag-region flex h-11 items-center px-4">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57] ring-1 ring-black/20" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e] ring-1 ring-black/20" />
          <span className="h-3 w-3 rounded-full bg-[#28c840] ring-1 ring-black/20" />
        </div>
      </div>

      {/* new tab */}
      <div className="px-2 pb-1 sm:px-3">
        <motion.button
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.97 }}
          onClick={newTab}
          className="group flex w-full items-center justify-center gap-2.5 rounded-2xl bg-white/[0.04] px-2 py-2.5 text-left ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08] hover:ring-white/[0.12] sm:justify-start sm:px-3"
        >
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-orange-500/15 text-orange-300 ring-1 ring-orange-400/25">
            <Plus className="h-3.5 w-3.5" />
          </span>
          <span className="hidden flex-1 text-[12.5px] font-semibold text-foreground/90 sm:block">
            New Tab
          </span>
          <kbd className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            ⌘T
          </kbd>
        </motion.button>
      </div>

      {/* tabs */}
      <TooltipProvider delayDuration={350}>
        <div className="ip-no-bar mt-2 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
          {pinned.length > 0 ? (
            <p className="hidden px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60 sm:block">
              Chats
            </p>
          ) : null}
          <AnimatePresence initial={false} mode="popLayout">
            {pinned.map((tab) => (
              <TabRow key={tab.id} tab={tab} />
            ))}
          </AnimatePresence>

          {others.length > 0 ? (
            <p className="hidden px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60 sm:block">
              Workspace
            </p>
          ) : null}
          <AnimatePresence initial={false} mode="popLayout">
            {others.map((tab) => (
              <TabRow key={tab.id} tab={tab} />
            ))}
          </AnimatePresence>

          {activeDownloads > 0 ? (
            <button
              onClick={() => navigate("downloads")}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500/10 px-2 py-2 ring-1 ring-orange-400/25 transition-colors hover:bg-orange-500/15 sm:px-3"
            >
              <span className="grid h-6 w-6 place-items-center">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-orange-400/40 border-t-orange-400" />
              </span>
              <span className="hidden flex-1 text-left text-[12px] font-medium text-orange-200 sm:block">
                {activeDownloads} active {activeDownloads === 1 ? "download" : "downloads"}
              </span>
              <ArrowLeftRight className="hidden h-3.5 w-3.5 text-orange-300/70 sm:block" />
            </button>
          ) : null}
        </div>
      </TooltipProvider>

      {/* footer: quick nav + donate */}
      <div className="space-y-2 border-t border-border/50 px-2 py-2.5 sm:px-3">
        <TooltipProvider delayDuration={300}>
          <div className="flex items-center justify-between px-1">
            {(["models", "downloads", "benchmark", "settings"] as const).map((t) => {
              const Icon = TAB_ICON[t];
              return (
                <Tooltip key={t}>
                  <TooltipTrigger asChild>
                    <motion.button
                      whileHover={{ scale: 1.12, y: -1 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={() => navigate(t)}
                      className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground"
                      aria-label={t}
                    >
                      <span className="relative">
                        <Icon className="h-4 w-4" />
                        {t === "downloads" && activeDownloads > 0 ? (
                          <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-orange-400 ip-pulse-dot" />
                        ) : null}
                      </span>
                    </motion.button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-[11px]">
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
        <motion.a
          href="https://buy.stripe.com/bJedR93gk4xw7EFeyabbG08"
          target="_blank"
          rel="noreferrer"
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.97 }}
          className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500/15 to-amber-500/15 px-3 py-2 text-[12px] font-semibold text-orange-200 ring-1 ring-orange-400/25 transition-colors hover:from-orange-500/25 hover:to-amber-500/25 hover:ring-orange-400/40"
        >
          <Heart className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
          <span className="hidden sm:inline">Donate me</span>
        </motion.a>
      </div>
    </div>
  );
}
