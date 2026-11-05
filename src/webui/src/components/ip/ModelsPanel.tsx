"use client";

/* Right-side panel in Chat: loaded models, load/unload, GPU/offload controls */

import { AnimatePresence, motion } from "framer-motion";
import {
  Cpu,
  Gauge,
  HardDrive,
  Layers,
  MemoryStick,
  Plus,
  Power,
  SlidersHorizontal,
  FlaskConical,
  ChevronDown,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MiniGauge, PublisherAvatar, StatusDot } from "@/components/ip/Shared";
import { CATALOG, HARDWARE, getModel } from "@/lib/data";
import { useAppStore, useSystemStats } from "@/lib/store";
import { cn } from "@/lib/utils";

const CTX_OPTIONS = [2048, 4096, 8192, 16384, 32768, 131072];

function LoadedModelCard({ modelId }: { modelId: string }) {
  const loaded = useAppStore((s) => s.loadedModels[modelId]);
  const update = useAppStore((s) => s.updateLoadConfig);
  const unload = useAppStore((s) => s.unloadModel);
  const m = getModel(modelId);
  if (!m || !loaded) return null;

  const isLoading = loaded.status === "loading";
  const gpuFrac = loaded.gpuLayers / loaded.totalLayers;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="rounded-3xl bg-card/70 p-3.5 ring-1 ring-white/[0.07]"
    >
      <div className="flex items-center gap-2.5">
        <PublisherAvatar name={m.name} family={m.family} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold">
            {m.name}{" "}
            <span className="font-mono text-[10px] font-normal text-muted-foreground">
              {m.variant}
            </span>
          </p>
          <p className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
            {isLoading ? (
              <span className="text-orange-300">loading… {Math.round(loaded.progress)}%</span>
            ) : (
              <>
                <StatusDot tone="green" />
                {loaded.gpuLayers}/{loaded.totalLayers} GPU layers
              </>
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-xl text-muted-foreground hover:bg-rose-500/10 hover:text-rose-300"
          onClick={() => unload(modelId)}
          aria-label={`Unload ${m.name}`}
          disabled={isLoading}
        >
          <Power className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isLoading ? <Progress value={loaded.progress} className="mt-3 h-1" /> : (
        <div className="mt-3.5 space-y-4">
          {/* GPU layers */}
          <div>
            <div className="mb-2 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                <Layers className="h-3 w-3" /> GPU layers
              </span>
              <span className="rounded-md bg-white/[0.06] px-1.5 py-px font-mono text-[10px] text-foreground/80">
                {loaded.gpuLayers}/{loaded.totalLayers}
              </span>
            </div>
            <Slider
              value={[loaded.gpuLayers]}
              min={0}
              max={loaded.totalLayers}
              step={1}
              onValueChange={([v]) => update(modelId, { gpuLayers: v })}
              className="cursor-pointer"
            />
            <div className="mt-1.5 flex items-center justify-between font-mono text-[9.5px] text-muted-foreground/70">
              <span>full offload</span>
              <span>{Math.round(gpuFrac * 100)}% on GPU</span>
            </div>
          </div>

          {/* offload toggles */}
          <div className="space-y-2 rounded-2xl bg-white/[0.03] p-2.5 ring-1 ring-white/[0.05]">
            <label className="flex cursor-pointer items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <MemoryStick className="h-3 w-3" /> RAM offload
              </span>
              <Switch
                checked={loaded.ramOffload}
                onCheckedChange={(v) => update(modelId, { ramOffload: v })}
                className="scale-90"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <HardDrive className="h-3 w-3" /> SSD offload
                <span className="rounded-full bg-violet-500/15 px-1.5 py-px text-[8.5px] font-semibold text-violet-300 ring-1 ring-violet-400/20">
                  BETA
                </span>
              </span>
              <Switch
                checked={loaded.ssdOffload}
                onCheckedChange={(v) => update(modelId, { ssdOffload: v })}
                className="scale-90"
              />
            </label>
          </div>

          {/* ctx + temp */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <p className="mb-1.5 text-[10.5px] font-medium text-muted-foreground">
                Context
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-8 w-full items-center justify-between rounded-xl bg-white/[0.04] px-2.5 font-mono text-[11px] text-foreground/85 ring-1 ring-white/[0.07] hover:bg-white/[0.07]">
                    {loaded.ctxLength >= 1024
                      ? `${Math.round(loaded.ctxLength / 1024)}K`
                      : loaded.ctxLength}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="rounded-2xl border-white/10 bg-popover">
                  {CTX_OPTIONS.map((c) => (
                    <DropdownMenuItem
                      key={c}
                      className="font-mono text-[11px]"
                      onClick={() => update(modelId, { ctxLength: c })}
                    >
                      {c >= 1024 ? `${c / 1024}K tokens` : `${c} tokens`}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div>
              <p className="mb-1.5 text-[10.5px] font-medium text-muted-foreground">
                Temp <span className="font-mono text-foreground/70">{loaded.temperature.toFixed(1)}</span>
              </p>
              <Slider
                value={[loaded.temperature]}
                min={0}
                max={2}
                step={0.1}
                onValueChange={([v]) => update(modelId, { temperature: v })}
                className="mt-2.5 cursor-pointer"
              />
            </div>
          </div>

          {/* memory footprint */}
          <div className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-3 py-2 font-mono text-[10px] text-muted-foreground ring-1 ring-white/[0.05]">
            <span className="flex items-center gap-1">
              <Cpu className="h-3 w-3 text-orange-300/80" /> {loaded.vramGB.toFixed(1)} VRAM
            </span>
            <span className="flex items-center gap-1">
              <MemoryStick className="h-3 w-3 text-teal-300/80" /> {loaded.ramGB.toFixed(1)} RAM
            </span>
            {loaded.ssdGB > 0.05 ? (
              <span className="flex items-center gap-1">
                <HardDrive className="h-3 w-3 text-violet-300/80" /> {loaded.ssdGB.toFixed(1)} SSD
              </span>
            ) : null}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export function ModelsPanel({
  onClose,
  isMobile = false,
}: {
  onClose?: () => void;
  isMobile?: boolean;
}) {
  const loadedModels = useAppStore((s) => s.loadedModels);
  const downloaded = useAppStore((s) => s.downloaded);
  const loadModel = useAppStore((s) => s.loadModel);
  const navigate = useAppStore((s) => s.navigate);
  const stats = useSystemStats();

  const loadedIds = Object.keys(loadedModels);
  const notLoaded = CATALOG.filter((m) => downloaded.includes(m.id) && !loadedModels[m.id]);

  return (
    <div className="flex h-full w-[296px] shrink-0 flex-col border-l border-border/50 bg-sidebar/95">
      <div className="shrink-0 space-y-3 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold">
            <SlidersHorizontal className="h-3.5 w-3.5 text-orange-300" />
            Loaded models
          </h3>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {stats.loadedCount}
            {stats.loadingCount > 0 ? ` (+${stats.loadingCount} loading)` : ""} loaded
          </span>
          {isMobile && onClose ? (
            <button
              onClick={onClose}
              className="grid h-7 w-7 place-items-center rounded-xl text-muted-foreground ring-1 ring-white/10 hover:text-foreground"
              aria-label="Close panel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="space-y-2.5 rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/[0.05]">
          <MiniGauge
            label="VRAM"
            icon={<Cpu className="h-3 w-3" />}
            used={stats.vramUsed}
            total={HARDWARE.vramTotal}
          />
          <MiniGauge
            label="RAM"
            icon={<MemoryStick className="h-3 w-3" />}
            used={stats.ramUsed}
            total={HARDWARE.ramTotal}
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 px-4 pb-4">
          <AnimatePresence mode="popLayout">
            {loadedIds.map((id) => (
              <LoadedModelCard key={id} modelId={id} />
            ))}
          </AnimatePresence>

          {loadedIds.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 p-5 text-center">
              <FlaskConical className="mx-auto h-6 w-6 text-muted-foreground/60" />
              <p className="mt-2 text-[12px] font-medium">Nothing loaded</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Load an installed model to start chatting offline.
              </p>
            </div>
          ) : null}

          {/* load more */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-9 w-full rounded-2xl border-dashed border-white/15 bg-transparent text-[12px] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Load a model
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 rounded-2xl border-white/10 bg-popover">
              <DropdownMenuLabel className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                Installed · not loaded
              </DropdownMenuLabel>
              {notLoaded.length === 0 ? (
                <DropdownMenuItem disabled className="text-[12px] text-muted-foreground">
                  All installed models are loaded
                </DropdownMenuItem>
              ) : (
                notLoaded.map((m) => (
                  <DropdownMenuItem
                    key={m.id}
                    className="gap-2.5 rounded-xl py-2"
                    onClick={() => void loadModel(m.id)}
                  >
                    <PublisherAvatar name={m.name} family={m.family} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium">
                        {m.name} {m.variant}
                      </span>
                      <span className="block text-[10.5px] text-muted-foreground">
                        {m.sizeGB.toFixed(1)} GB · ~{m.tps} tok/s
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator className="bg-white/[0.07]" />
              <DropdownMenuItem
                className="gap-2 rounded-xl text-[12px] text-muted-foreground"
                onClick={() => navigate("models")}
              >
                <Gauge className="h-3.5 w-3.5" />
                Browse catalog to download more
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={() => navigate("benchmark")}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-2xl bg-teal-500/10 px-3.5 py-3 text-left ring-1 ring-teal-400/20",
              "transition-colors hover:bg-teal-500/15 hover:ring-teal-400/35",
            )}
          >
            <Gauge className="h-4 w-4 shrink-0 text-teal-300" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-foreground">
                Benchmark hardware
              </span>
              <span className="block text-[10.5px] text-muted-foreground">
                Test max tok/s for loaded models
              </span>
            </span>
          </button>
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border/50 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
          <Trash2 className="h-2.5 w-2.5" />
          Unloading frees VRAM instantly
        </p>
      </div>
    </div>
  );
}
