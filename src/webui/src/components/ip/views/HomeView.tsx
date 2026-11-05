"use client";

/* New Tab / Home view */

import { motion } from "framer-motion";
import {
  ArrowRight,
  Boxes,
  Gauge,
  MessageSquare,
  Sparkles,
  Cpu,
  HardDrive,
  MemoryStick,
  Zap,
  Download,
  Rocket,
  Cloud,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  MiniGauge,
  PublisherAvatar,
  CapChip,
  StatusDot,
} from "@/components/ip/Shared";
import { useAppStore, useSystemStats } from "@/lib/store";
import { CATALOG, HARDWARE, getModel } from "@/lib/data";

const rise = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.05 * i, type: "spring" as const, stiffness: 120, damping: 18 },
  }),
};

export function HomeView() {
  const navigate = useAppStore((s) => s.navigate);
  const openChatTab = useAppStore((s) => s.openChatTab);
  const downloaded = useAppStore((s) => s.downloaded);
  const downloadedAt = useAppStore((s) => s.downloadedAt);
  const loadedModels = useAppStore((s) => s.loadedModels);
  const downloads = useAppStore((s) => s.downloads);
  const stats = useSystemStats();

  const installedModels = downloaded
    .map((id) => getModel(id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  const featured = CATALOG.filter((m) => m.featured);
  const activeDls = Object.values(downloads).filter((d) => d.status !== "done");

  const quickActions = [
    {
      label: "Chat",
      desc: "Talk to any loaded model",
      icon: MessageSquare,
      onClick: () => openChatTab(),
      iconCls: "bg-orange-500/15 text-orange-300 ring-orange-400/25",
    },
    {
      label: "Models",
      desc: "Discover & download",
      icon: Boxes,
      onClick: () => navigate("models"),
      iconCls: "bg-violet-500/15 text-violet-300 ring-violet-400/25",
    },
    {
      label: "Benchmark",
      desc: "Measure max tok/s",
      icon: Gauge,
      onClick: () => navigate("benchmark"),
      iconCls: "bg-teal-500/15 text-teal-300 ring-teal-400/25",
    },
    {
      label: "Downloads",
      desc: activeDls.length ? `${activeDls.length} in progress` : "All finished",
      icon: Download,
      onClick: () => navigate("downloads"),
      iconCls: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/25",
    },
  ];

  return (
    <div className="ip-no-bar h-full overflow-y-auto">
      {/* hero */}
      <div className="relative px-6 pb-2 pt-10 sm:px-10">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[340px] opacity-70"
          style={{
            background:
              "radial-gradient(600px 180px at 30% -20%, oklch(0.72 0.17 50 / 14%), transparent), radial-gradient(500px 160px at 75% -30%, oklch(0.8 0.13 85 / 9%), transparent)",
          }}
        />
        <motion.div variants={rise} custom={0} initial="hidden" animate="show" className="relative">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-white/[0.07]">
            <Sparkles className="h-3 w-3 text-orange-300" />
            UI concept build · everything here is a live simulation
          </div>
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.03em] sm:text-[42px]">
            <span className="ip-gradient-text">Welcome to InferencePort</span>
          </h1>
          <p className="mt-2 max-w-lg text-[13.5px] leading-relaxed text-muted-foreground">
            Run powerful language models locally, privately, or on the cloud —
            all from one smooth place.
          </p>
        </motion.div>

        {/* quick actions */}
        <div className="relative mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {quickActions.map((a, i) => (
            <motion.button
              key={a.label}
              variants={rise}
              custom={1 + i}
              initial="hidden"
              animate="show"
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.97 }}
              onClick={a.onClick}
              className="group flex items-center gap-3 rounded-3xl bg-card/80 p-3.5 text-left ring-1 ring-white/[0.06] backdrop-blur-sm transition-colors hover:ring-white/[0.14]"
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ring-1 ${a.iconCls}`}>
                <a.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-[13px] font-semibold text-foreground">
                  {a.label}
                  <ArrowRight className="h-3 w-3 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-60" />
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {a.desc}
                </span>
              </span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* content grid */}
      <div className="grid grid-cols-1 gap-5 px-6 pb-10 pt-6 sm:px-10 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-9">
          {/* installed models */}
          <section>
            <motion.div variants={rise} custom={5} initial="hidden" animate="show" className="mb-3.5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                <Boxes className="h-4 w-4 text-orange-300" />
                Your models
                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                  {installedModels.length}
                </span>
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-xl px-2.5 text-[12px] text-muted-foreground hover:text-foreground"
                onClick={() => navigate("models")}
              >
                Browse catalog <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </motion.div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {installedModels.map((m, i) => {
                const loaded = loadedModels[m.id];
                const isLoading = loaded?.status === "loading";
                const isLoaded = loaded?.status === "loaded";
                return (
                  <motion.div
                    key={m.id}
                    variants={rise}
                    custom={6 + i}
                    initial="hidden"
                    animate="show"
                    whileHover={{ y: -2 }}
                    className="group cursor-pointer rounded-3xl bg-card/80 p-4 ring-1 ring-white/[0.06] transition-colors hover:ring-white/[0.13]"
                    onClick={() => openChatTab(m.id)}
                  >
                    <div className="flex items-start gap-3">
                      <PublisherAvatar name={m.name} family={m.family} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-[13px] font-semibold leading-tight">
                            {m.name}
                          </p>
                          <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                            {m.variant}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {m.sizeGB.toFixed(1)} GB · {m.quant} · {m.ctx} ctx
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {m.caps.slice(0, 3).map((c) => (
                            <CapChip key={c} cap={c} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-2.5">
                      {isLoading ? (
                        <span className="flex items-center gap-1.5 text-[11px] text-orange-300">
                          <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-orange-400/30 border-t-orange-400" />
                          Loading {Math.round(loaded!.progress)}%
                        </span>
                      ) : isLoaded ? (
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-300">
                          <StatusDot tone="green" />
                          Loaded · {loaded!.gpuLayers}/{loaded!.totalLayers} GPU layers
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <StatusDot tone="muted" />
                          Ready to load
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                        <MessageSquare className="h-3 w-3" /> Chat
                      </span>
                    </div>
                    {isLoading ? (
                      <Progress value={loaded!.progress} className="mt-2 h-1" />
                    ) : null}
                  </motion.div>
                );
              })}
            </div>
          </section>

          {/* recommended */}
          <section>
            <motion.div variants={rise} custom={9} initial="hidden" animate="show" className="mb-3.5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                <Rocket className="h-4 w-4 text-amber-300" />
                Recommended for you
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-xl px-2.5 text-[12px] text-muted-foreground hover:text-foreground"
                onClick={() => navigate("models")}
              >
                See all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </motion.div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {featured.map((m, i) => (
                <motion.button
                  key={m.id}
                  variants={rise}
                  custom={10 + i}
                  initial="hidden"
                  animate="show"
                  whileHover={{ y: -2 }}
                  onClick={() => navigate("models")}
                  className="group flex items-center gap-3 rounded-3xl bg-card/60 p-3.5 text-left ring-1 ring-white/[0.05] transition-colors hover:bg-card hover:ring-white/[0.12]"
                >
                  <PublisherAvatar name={m.name} family={m.family} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">
                      {m.name}{" "}
                      <span className="font-mono text-[10.5px] font-normal text-muted-foreground">
                        {m.variant}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {m.publisher} · {m.sizeGB.toFixed(1)} GB · ~{m.tps} tok/s
                    </p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
                </motion.button>
              ))}
            </div>
          </section>
        </div>

        {/* right column */}
        <div className="space-y-5">
          {/* system status */}
          <motion.div
            variants={rise}
            custom={7}
            initial="hidden"
            animate="show"
            className="rounded-3xl bg-card/80 p-4 ring-1 ring-white/[0.06]"
          >
            <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
              <Zap className="h-3.5 w-3.5 text-orange-300" />
              System
            </h3>
            <p className="mb-3 truncate font-mono text-[10.5px] text-muted-foreground">
              {HARDWARE.gpu} · {HARDWARE.cpu}
            </p>
            <div className="space-y-3">
              <MiniGauge
                label="VRAM"
                icon={<MemoryStick className="h-3 w-3" />}
                used={stats.vramUsed}
                total={HARDWARE.vramTotal}
              />
              <MiniGauge
                label="RAM"
                icon={<Cpu className="h-3 w-3" />}
                used={stats.ramUsed}
                total={HARDWARE.ramTotal}
              />
              <MiniGauge
                label="SSD cache"
                icon={<HardDrive className="h-3 w-3" />}
                used={2.4}
                total={100}
                unit=" GB"
              />
            </div>
            <div className="mt-3.5 flex items-center justify-between rounded-2xl bg-white/[0.04] px-3 py-2 text-[11px] ring-1 ring-white/[0.05]">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <StatusDot tone="green" pulse />
                Engine running
              </span>
              <span className="font-mono text-muted-foreground">
                {stats.loadedCount} loaded
              </span>
            </div>
          </motion.div>

          {/* recent downloads */}
          <motion.div
            variants={rise}
            custom={8}
            initial="hidden"
            animate="show"
            className="rounded-3xl bg-card/80 p-4 ring-1 ring-white/[0.06]"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold">
                <Download className="h-3.5 w-3.5 text-emerald-300" />
                Recent downloads
              </h3>
              <button
                className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => navigate("downloads")}
              >
                View all
              </button>
            </div>
            <div className="space-y-2.5">
              {installedModels.slice(0, 3).map((m) => (
                <div key={m.id} className="flex items-center gap-2.5">
                  <PublisherAvatar name={m.name} family={m.family} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium">
                      {m.name}{" "}
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {m.variant}
                      </span>
                    </p>
                    <p className="text-[10.5px] text-muted-foreground">
                      {downloadedAt[m.id]
                        ? new Date(downloadedAt[m.id]).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </p>
                  </div>
                </div>
              ))}
              {installedModels.length === 0 ? (
                <p className="py-2 text-[12px] text-muted-foreground">
                  Nothing downloaded yet — grab one from the catalog.
                </p>
              ) : null}
            </div>
          </motion.div>

          {/* cloud teaser */}
          <motion.button
            variants={rise}
            custom={9}
            initial="hidden"
            animate="show"
            whileHover={{ y: -2 }}
            onClick={() => openChatTab(undefined, "cloud")}
            className="flex w-full items-center gap-3 rounded-3xl bg-gradient-to-br from-orange-500/15 via-amber-500/10 to-transparent p-4 text-left ring-1 ring-orange-400/20 transition-colors hover:ring-orange-400/35"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-orange-500/20 text-orange-200 ring-1 ring-orange-400/30">
              <Cloud className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-foreground">
                InferencePort Cloud
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                Frontier models, zero setup — like the playground
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-orange-300/70" />
          </motion.button>
        </div>
      </div>

      {/* footer */}
      <footer className="border-t border-border/50 px-6 py-5 sm:px-10">
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-[11.5px] text-muted-foreground">
            InferencePort AI · UI concept build · Apache-2.0
          </p>
          <div className="flex items-center gap-2">
            <motion.a
              href="https://github.com/sharktide/inferenceport-ai"
              target="_blank"
              rel="noreferrer"
              whileHover={{ y: -1 }}
              className="rounded-xl px-3 py-1.5 text-[12px] font-medium text-muted-foreground ring-1 ring-white/[0.08] transition-colors hover:text-foreground hover:ring-white/[0.16]"
            >
              GitHub
            </motion.a>
            <motion.a
              href="https://buy.stripe.com/bJedR93gk4xw7EFeyabbG08"
              target="_blank"
              rel="noreferrer"
              whileHover={{ y: -1, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="ip-brand-gradient flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12px] font-semibold text-[#241205] shadow-[0_4px_16px_-6px_rgba(251,146,60,0.55)]"
            >
              <Heart className="h-3.5 w-3.5" />
              Donate me
            </motion.a>
          </div>
        </div>
      </footer>
    </div>
  );
}
