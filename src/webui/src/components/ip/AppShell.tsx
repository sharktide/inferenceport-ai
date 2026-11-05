"use client";

/* App shell: vertical tab strip + animated view container */

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TabStrip } from "@/components/ip/TabStrip";
import { HomeView } from "@/components/ip/views/HomeView";
import { ChatView } from "@/components/ip/views/ChatView";
import { ModelsView } from "@/components/ip/views/ModelsView";
import { DownloadsView } from "@/components/ip/views/DownloadsView";
import { BenchmarkView } from "@/components/ip/views/BenchmarkView";
import { SettingsView } from "@/components/ip/views/SettingsView";
import { useAppStore, type Tab } from "@/lib/store";

function renderView(tab: Tab) {
  switch (tab.type) {
    case "home":
      return <HomeView />;
    case "chat":
      return <ChatView key={tab.sessionId} sessionId={tab.sessionId!} />;
    case "models":
      return <ModelsView />;
    case "downloads":
      return <DownloadsView />;
    case "benchmark":
      return <BenchmarkView />;
    case "settings":
      return <SettingsView />;
  }
}

export function AppShell() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const newTab = useAppStore((s) => s.newTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const stopGeneration = useAppStore((s) => s.stopGeneration);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  /* browser-ish keyboard shortcuts */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "t") {
        e.preventDefault();
        newTab();
      } else if (mod && e.key.toLowerCase() === "w") {
        e.preventDefault();
        if (activeTab.type === "chat") closeTab(activeTab.id);
      } else if (e.key === "Escape" && activeTab.type === "chat" && activeTab.sessionId) {
        const s = useAppStore.getState().sessions[activeTab.sessionId];
        if (s?.generating) stopGeneration(activeTab.sessionId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTab, newTab, closeTab, stopGeneration]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <TooltipProvider delayDuration={300}>
        <TabStrip />
        <main className="relative min-w-0 flex-1 overflow-hidden">
          {/* subtle top glow */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-black/25 to-transparent" />
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab.id}
              className="absolute inset-0"
              initial={{ opacity: 0, y: 16, scale: 0.996 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.996 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              {renderView(activeTab)}
            </motion.div>
          </AnimatePresence>
        </main>
      </TooltipProvider>
    </div>
  );
}
