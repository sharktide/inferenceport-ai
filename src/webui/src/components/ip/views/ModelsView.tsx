"use client";

/* Models view: catalog discovery + installed management + download UX */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Download,
  MessageSquare,
  Layers,
  Gauge,
  Boxes,
  ArrowDownUp,
  ChevronDown,
  Check,
  Rocket,
  CircleCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PublisherAvatar,
  CapChip,
  SectionHeader,
  EmptyState,
  StatusDot,
} from "@/components/ip/Shared";
import { CATALOG, type CatalogModel } from "@/lib/data";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type SortKey = "popular" | "fastest" | "smallest";
type FilterKey = "all" | "chat" | "coding" | "reasoning" | "vision";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "popular", label: "Most popular" },
  { key: "fastest", label: "Fastest" },
  { key: "smallest", label: "Smallest" },
];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "chat", label: "Chat" },
  { key: "coding", label: "Coding" },
  { key: "reasoning", label: "Reasoning" },
  { key: "vision", label: "Vision" },
];

function parseDownloads(d: string): number {
  const mult = d.endsWith("M") ? 1e6 : d.endsWith("K") ? 1e3 : 1;
  return parseFloat(d) * mult;
}

function ModelCard({ m, onOpen }: { m: CatalogModel; onOpen: () => void }) {
  const downloaded = useAppStore((s) => s.downloaded.includes(m.id));
  const task = useAppStore((s) => s.downloads[m.id]);
  const loaded = useAppStore((s) => s.loadedModels[m.id]);
  const openChatTab = useAppStore((s) => s.openChatTab);

  const isDownloading = task?.status === "downloading";
  const isPaused = task?.status === "paused";
  const isLoading = loaded?.status === "loading";
  const isLoaded = loaded?.status === "loaded";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 140, damping: 20 }}
      whileHover={{ y: -3 }}
      className="group flex flex-col rounded-3xl bg-card/80 p-4 ring-1 ring-white/[0.06] transition-shadow hover:shadow-[0_12px_36px_-16px_rgba(0,0,0,0.6)] hover:ring-white/[0.13]"
    >
      <button className="flex items-start gap-3 text-left" onClick={onOpen}>
        <PublisherAvatar name={m.name} family={m.family} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[14px] font-semibold leading-tight">
              {m.name}
            </p>
            {downloaded ? (
              <span className="shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-px text-[9.5px] font-semibold text-emerald-300 ring-1 ring-emerald-400/20">
                INSTALLED
              </span>
            ) : null}
            {m.featured ? (
              <span className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-px text-[9.5px] font-semibold text-amber-300 ring-1 ring-amber-400/20">
                <Rocket className="mr-0.5 inline h-2.5 w-2.5" />
                PICK
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            {m.publisher} · {m.params} · {m.quant}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {m.caps.map((c) => (
              <CapChip key={c} cap={c} />
            ))}
          </div>
        </div>
      </button>

      <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
        {m.description}
      </p>

      <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Layers className="h-3 w-3" /> {m.sizeGB.toFixed(1)} GB
        </span>
        <span className="flex items-center gap-1">
          <Gauge className="h-3 w-3" /> ~{m.tps} tok/s
        </span>
        <span className="flex items-center gap-1">
          <Download className="h-3 w-3" /> {m.downloads}
        </span>
      </div>

      <div className="mt-3 border-t border-white/[0.05] pt-3">
        {isDownloading || isPaused ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className={isPaused ? "text-amber-300" : "text-orange-300"}>
                {isPaused ? "Paused" : "Downloading"} · {task.progress.toFixed(0)}%
              </span>
              <span className="font-mono text-muted-foreground">
                {(task.downloadedMB / 1000).toFixed(1)}/{(task.totalMB / 1000).toFixed(1)} GB
              </span>
            </div>
            <Progress value={task.progress} className="h-1.5" />
          </div>
        ) : isLoading ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-orange-300">Loading into memory…</span>
              <span className="font-mono text-muted-foreground">
                {Math.round(loaded!.progress)}%
              </span>
            </div>
            <Progress value={loaded!.progress} className="h-1.5" />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {downloaded ? (
              <>
                <Button
                  size="sm"
                  className="h-8 flex-1 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => openChatTab(m.id)}
                >
                  <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Chat
                </Button>
                <span className="flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-400/20">
                  {isLoaded ? (
                    <>
                      <StatusDot tone="green" /> Loaded
                    </>
                  ) : (
                    <>
                      <CircleCheck className="h-3.5 w-3.5" /> Ready
                    </>
                  )}
                </span>
              </>
            ) : (
              <Button
                size="sm"
                className="h-8 flex-1 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={onOpen}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> Get {m.variant}
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ModelDetailDialog({
  model,
  open,
  onOpenChange,
}: {
  model: CatalogModel | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const downloaded = useAppStore((s) => s.downloaded);
  const startDownload = useAppStore((s) => s.startDownload);
  const openChatTab = useAppStore((s) => s.openChatTab);
  const navigate = useAppStore((s) => s.navigate);
  const [quant, setQuant] = useState<string | null>(null);

  const m = model;
  const isInstalled = m ? downloaded.includes(m.id) : false;
  const selectedVariant =
    m?.variants.find((v) => v.quant === (quant ?? m.quant)) ?? m?.variants[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden rounded-3xl border-white/10 bg-popover p-0">
        {m ? (
          <>
            <div
              className="relative px-6 pb-5 pt-6"
              style={{
                background:
                  "radial-gradient(400px 120px at 20% -40%, oklch(0.72 0.17 50 / 16%), transparent)",
              }}
            >
              <div className="flex items-start gap-4">
                <PublisherAvatar name={m.name} family={m.family} size="lg" />
                <div className="min-w-0 flex-1">
                  <DialogHeader className="space-y-0 text-left">
                    <DialogTitle className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
                      {m.name}
                      <span className="rounded-md bg-white/[0.07] px-1.5 py-px font-mono text-[11px] font-normal text-muted-foreground">
                        {m.variant}
                      </span>
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-[12px]">
                      by {m.publisher} · {m.params} params · {m.ctx} context
                    </DialogDescription>
                  </DialogHeader>
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {m.caps.map((c) => (
                      <CapChip key={c} cap={c} />
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-[12.5px] leading-relaxed text-muted-foreground">
                {m.description}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-px bg-white/[0.06] text-center">
              {[
                { label: "Size", value: `${selectedVariant?.sizeGB.toFixed(1)} GB` },
                { label: "Est. speed", value: `~${m.tps} tok/s` },
                { label: "Downloads", value: m.downloads },
              ].map((s) => (
                <div key={s.label} className="bg-popover px-2 py-3">
                  <p className="font-mono text-[15px] font-semibold text-foreground">
                    {s.value}
                  </p>
                  <p className="mt-0.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>

            <div className="p-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Quantization
              </p>
              <div className="flex flex-wrap gap-2">
                {m.variants.map((v) => {
                  const active = v.quant === (quant ?? m.quant);
                  return (
                    <button
                      key={v.quant}
                      onClick={() => setQuant(v.quant)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-2xl px-3 py-2 text-left ring-1 transition-all",
                        active
                          ? "bg-primary/15 text-primary ring-primary/40"
                          : "bg-white/[0.04] text-muted-foreground ring-white/[0.07] hover:text-foreground",
                      )}
                    >
                      {active ? (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      ) : null}
                      <span>
                        <span className="block font-mono text-[12px] font-semibold">
                          {v.quant}
                        </span>
                        <span className="block text-[10.5px] opacity-70">
                          {v.sizeGB.toFixed(1)} GB
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 flex gap-2">
                {isInstalled ? (
                  <Button
                    className="h-10 flex-1 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => {
                      onOpenChange(false);
                      openChatTab(m.id);
                    }}
                  >
                    <MessageSquare className="mr-1.5 h-4 w-4" /> Chat with {m.name}
                  </Button>
                ) : (
                  <Button
                    className="h-10 flex-1 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => {
                      startDownload(m.id);
                      onOpenChange(false);
                      navigate("downloads");
                    }}
                  >
                    <Download className="mr-1.5 h-4 w-4" /> Download{" "}
                    {selectedVariant?.sizeGB.toFixed(1)} GB
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="h-10 rounded-2xl px-3.5"
                  onClick={() => {
                    onOpenChange(false);
                    navigate("benchmark");
                  }}
                >
                  <Gauge className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function ModelsView() {
  const [tab, setTab] = useState<"discover" | "installed">("discover");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("popular");
  const [sortOpen, setSortOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [detail, setDetail] = useState<CatalogModel | null>(null);

  const downloaded = useAppStore((s) => s.downloaded);

  const list = useMemo(() => {
    let arr = tab === "installed" ? CATALOG.filter((m) => downloaded.includes(m.id)) : [...CATALOG];
    const q = query.trim().toLowerCase();
    if (q) {
      arr = arr.filter((m) =>
        [m.name, m.publisher, m.family, m.params, m.variant, ...m.caps]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    if (filter !== "all" && tab === "discover") {
      arr = arr.filter((m) => m.caps.includes(filter));
    }
    if (tab === "discover") {
      if (sort === "popular") arr.sort((a, b) => parseDownloads(b.downloads) - parseDownloads(a.downloads));
      if (sort === "fastest") arr.sort((a, b) => b.tps - a.tps);
      if (sort === "smallest") arr.sort((a, b) => a.sizeGB - b.sizeGB);
    }
    return arr;
  }, [tab, query, filter, sort, downloaded]);

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="shrink-0 border-b border-border/50 px-5 py-4 sm:px-7">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models, families, capabilities…"
              className="h-10 rounded-2xl border-white/[0.08] bg-white/[0.04] pl-9 text-[13px] placeholder:text-muted-foreground/70 focus-visible:ring-primary/40"
            />
          </div>

          <div className="flex items-center rounded-2xl bg-white/[0.04] p-1 ring-1 ring-white/[0.06]">
            {(["discover", "installed"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="relative rounded-xl px-3.5 py-1.5 text-[12.5px] font-medium capitalize transition-colors"
              >
                {tab === t ? (
                  <motion.span
                    layoutId="models-tab-pill"
                    className="absolute inset-0 rounded-xl bg-card shadow-sm ring-1 ring-white/10"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                ) : null}
                <span className={cn("relative z-10", tab === t ? "text-foreground" : "text-muted-foreground")}>
                  {t === "installed" ? `Installed · ${downloaded.length}` : "Discover"}
                </span>
              </button>
            ))}
          </div>

          {tab === "discover" ? (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-2xl border-white/[0.08] bg-white/[0.04] px-3 text-[12px] hover:bg-white/[0.07]"
                onClick={() => setSortOpen((v) => !v)}
              >
                <ArrowDownUp className="mr-1.5 h-3.5 w-3.5" />
                {SORTS.find((s) => s.key === sort)?.label}
                <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
              </Button>
              <AnimatePresence>
                {sortOpen ? (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.14 }}
                      className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-2xl border border-white/10 bg-popover p-1 shadow-2xl"
                    >
                      {SORTS.map((s) => (
                        <button
                          key={s.key}
                          className={cn(
                            "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[12px] transition-colors",
                            sort === s.key
                              ? "bg-primary/15 text-primary"
                              : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
                          )}
                          onClick={() => {
                            setSort(s.key);
                            setSortOpen(false);
                          }}
                        >
                          {s.label}
                          {sort === s.key ? <Check className="h-3.5 w-3.5" /> : null}
                        </button>
                      ))}
                    </motion.div>
                  </>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}
        </div>

        {tab === "discover" ? (
          <div className="ip-no-bar mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-[11.5px] font-medium ring-1 transition-all",
                  filter === f.key
                    ? "bg-primary/15 text-primary ring-primary/35"
                    : "bg-white/[0.04] text-muted-foreground ring-white/[0.06] hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* list */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-5 py-5 sm:px-7">
          {list.length === 0 ? (
            <EmptyState
              icon={<Boxes className="h-7 w-7" />}
              title={tab === "installed" ? "No models installed yet" : "No models match"}
              sub={
                tab === "installed"
                  ? "Head to Discover to download your first model — small ones load in seconds."
                  : "Try a different search or clear the filters."
              }
              action={
                <Button
                  className="rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => {
                    setTab("discover");
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Browse catalog
                </Button>
              }
            />
          ) : (
            <>
              <SectionHeader
                title={
                  tab === "installed"
                    ? "Installed models"
                    : filter === "all"
                      ? "Model catalog"
                      : `${FILTERS.find((f) => f.key === filter)?.label} models`
                }
                sub={
                  tab === "installed"
                    ? "Load models into memory, or start a chat right away"
                    : "Curated GGUF builds · runs fully local with Ollama"
                }
              />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {list.map((m) => (
                    <ModelCard key={m.id} m={m} onOpen={() => setDetail(m)} />
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      <ModelDetailDialog
        key={detail?.id ?? "none"}
        model={detail}
        open={detail !== null}
        onOpenChange={(v) => !v && setDetail(null)}
      />
    </div>
  );
}
