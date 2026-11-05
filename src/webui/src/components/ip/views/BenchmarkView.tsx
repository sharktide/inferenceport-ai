"use client";

/* Benchmark view: hardware test for loaded models — max tok/s etc. */

import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  CartesianGrid,
} from "recharts";
import {
  Cpu,
  Gauge,
  MemoryStick,
  Play,
  Square,
  Timer,
  Zap,
  TrendingUp,
  Activity,
  GaugeCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PublisherAvatar,
  SectionHeader,
  StatusDot,
  AnimatedNumber,
} from "@/components/ip/Shared";
import { CATALOG, HARDWARE, getModel } from "@/lib/data";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function PhaseSteps({ phaseIndex }: { phaseIndex: number }) {
  const phases = ["Warm-up", "Prompt", "Generate", "Report"];
  return (
    <div className="flex items-center gap-1.5">
      {phases.map((p, i) => (
        <div key={p} className="flex items-center gap-1.5">
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-colors",
              i < phaseIndex
                ? "bg-emerald-500/10 text-emerald-300"
                : i === phaseIndex
                  ? "bg-orange-500/15 text-orange-200"
                  : "bg-white/[0.04] text-muted-foreground/60",
            )}
          >
            {i < phaseIndex ? (
              <Zap className="h-3 w-3" />
            ) : i === phaseIndex ? (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
            )}
            {p}
          </span>
          {i < phases.length - 1 ? (
            <span className="h-px w-3 bg-white/10" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function BenchmarkView() {
  const benchmark = useAppStore((s) => s.benchmark);
  const history = useAppStore((s) => s.benchmarkHistory);
  const runBenchmark = useAppStore((s) => s.runBenchmark);
  const stopBenchmark = useAppStore((s) => s.stopBenchmark);
  const loadedModels = useAppStore((s) => s.loadedModels);
  const downloaded = useAppStore((s) => s.downloaded);

  const running = benchmark.status === "running";
  const loadedIds = Object.keys(loadedModels).filter(
    (id) => loadedModels[id].status === "loaded",
  );
  const benchable = CATALOG.filter(
    (m) => loadedIds.includes(m.id) || downloaded.includes(m.id),
  );
  const selectedModel = getModel(benchmark.modelId ?? "") ?? null;
  const resultModel = getModel(benchmark.result?.modelId ?? "") ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border/50 px-5 py-4 sm:px-7">
        <h1 className="text-[17px] font-semibold tracking-tight">Benchmark</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          Measure real generation speed (tok/s) on your hardware — time-to-first-token,
          prompt processing and max throughput.
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 px-5 py-6 sm:px-7 lg:grid-cols-[300px_1fr]">
          {/* left: control */}
          <div className="space-y-4">
            <div className="rounded-3xl bg-card/80 p-4 ring-1 ring-white/[0.06]">
              <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
                <Gauge className="h-3.5 w-3.5 text-teal-300" />
                Your hardware
              </h3>
              <div className="space-y-2 font-mono text-[11px] text-muted-foreground">
                <p className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Cpu className="h-3 w-3 shrink-0 text-orange-300/80" /> GPU
                  </span>
                  <span className="truncate text-foreground/80">{HARDWARE.gpu}</span>
                </p>
                <p className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <MemoryStick className="h-3 w-3 shrink-0 text-teal-300/80" /> VRAM
                  </span>
                  <span className="text-foreground/80">{HARDWARE.vramTotal} GB</span>
                </p>
                <p className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Activity className="h-3 w-3 shrink-0 text-amber-300/80" /> RAM
                  </span>
                  <span className="text-foreground/80">{HARDWARE.ramTotal} GB</span>
                </p>
                <p className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Cpu className="h-3 w-3 shrink-0" /> CPU
                  </span>
                  <span className="truncate text-foreground/80">{HARDWARE.cpu}</span>
                </p>
              </div>
            </div>

            <div className="rounded-3xl bg-card/80 p-4 ring-1 ring-white/[0.06]">
              <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
                <GaugeCircle className="h-3.5 w-3.5 text-orange-300" />
                Test a model
              </h3>
              {running ? (
                <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3">
                  <PublisherAvatar
                    name={selectedModel?.name ?? "?"}
                    family={selectedModel?.family ?? ""}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium">
                      {selectedModel?.name} {selectedModel?.variant}
                    </p>
                    <p className="text-[10.5px] text-orange-300">
                      {benchmark.phase}…
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl text-rose-300 hover:bg-rose-500/10"
                    onClick={stopBenchmark}
                    aria-label="Stop benchmark"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                  </Button>
                </div>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-10 w-full justify-start rounded-2xl border-white/[0.1] bg-white/[0.04] px-3 text-[12.5px] hover:bg-white/[0.07]"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-muted-foreground ring-1 ring-white/[0.08]">
                        <Gauge className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-left">
                        {selectedModel
                          ? `${selectedModel.name} ${selectedModel.variant}`
                          : "Choose a model…"}
                      </span>
                      <span className="text-muted-foreground">▾</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64 rounded-2xl border-white/10 bg-popover">
                    <DropdownMenuLabel className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                      Loaded & installed models
                    </DropdownMenuLabel>
                    {benchable.map((m) => {
                      const isLoaded = loadedIds.includes(m.id);
                      return (
                        <DropdownMenuItem
                          key={m.id}
                          className="gap-2.5 rounded-xl py-2"
                          onClick={() => runBenchmark(m.id)}
                        >
                          <PublisherAvatar name={m.name} family={m.family} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-medium">
                              {m.name} {m.variant}
                            </span>
                            <span className="block text-[10.5px] text-muted-foreground">
                              {isLoaded ? "in memory" : "will load first"}
                            </span>
                          </span>
                          {isLoaded ? <StatusDot tone="green" /> : null}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {!running ? (
                <Button
                  className="mt-3 h-10 w-full rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={!selectedModel}
                  onClick={() => selectedModel && runBenchmark(selectedModel.id)}
                >
                  <Play className="mr-1.5 h-4 w-4" /> Run benchmark
                </Button>
              ) : null}

              <p className="mt-2.5 text-[10.5px] leading-relaxed text-muted-foreground/70">
                Simulates a 512-token prompt + 768 generated tokens on your config —
                GPU layers, offload settings and context size all affect results.
              </p>
            </div>
          </div>

          {/* right: readout */}
          <div className="min-w-0 space-y-5">
            <div
              className="relative overflow-hidden rounded-3xl bg-card/80 p-5 ring-1 ring-white/[0.06]"
              style={{
                background: running
                  ? "radial-gradient(500px 200px at 70% -30%, oklch(0.72 0.17 50 / 10%), transparent), oklch(0.172 0.005 55)"
                  : undefined,
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {running ? "Live generation speed" : "Max generation speed"}
                  </p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-mono text-[52px] font-semibold leading-none tracking-tight text-foreground">
                      {running ? (
                        <AnimatedNumber value={benchmark.liveTps} decimals={1} />
                      ) : (
                        (benchmark.result?.maxTps ?? history[0]?.maxTps ?? 0).toFixed(1)
                      )}
                    </span>
                    <span className="text-[15px] font-medium text-muted-foreground">
                      tok/s
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                    {running
                      ? `${benchmark.tokens} tokens generated · ${(benchmark.elapsedMs / 1000).toFixed(1)}s elapsed`
                      : benchmark.result && resultModel
                        ? `${resultModel.name} ${resultModel.variant} · best of run`
                        : history[0]
                          ? `${getModel(history[0].modelId)?.name ?? ""} ${getModel(history[0].modelId)?.variant ?? ""} · last run`
                          : "Run a benchmark to see results"}
                  </p>
                </div>
                {running ? <PhaseSteps phaseIndex={benchmark.phaseIndex} /> : null}
              </div>

              {/* chart */}
              <div className="mt-4 h-40">
                {benchmark.series.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={benchmark.series} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                      <defs>
                        <linearGradient id="tpsFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fb923c" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#fb923c" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis
                        dataKey="t"
                        tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        unit="s"
                      />
                      <YAxis
                        tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        domain={["dataMin - 3", "dataMax + 3"]}
                      />
                      <ChartTooltip
                        contentStyle={{
                          background: "oklch(0.19 0.006 55)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "14px",
                          fontSize: "11px",
                        }}
                        labelFormatter={(l) => `${l}s`}
                        formatter={(v) => [`${v} tok/s`, "speed"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="tps"
                        stroke="#fb923c"
                        strokeWidth={2}
                        fill="url(#tpsFill)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/[0.07] text-[12px] text-muted-foreground/60">
                    {running ? "Waiting for generation phase…" : "No data yet — run a benchmark"}
                  </div>
                )}
              </div>
            </div>

            {/* result stats */}
            {benchmark.result ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-2 gap-3 sm:grid-cols-4"
              >
                {[
                  {
                    icon: TrendingUp,
                    label: "Max speed",
                    value: `${benchmark.result.maxTps.toFixed(1)} tok/s`,
                  },
                  {
                    icon: Activity,
                    label: "Average",
                    value: `${benchmark.result.avgTps.toFixed(1)} tok/s`,
                  },
                  {
                    icon: Timer,
                    label: "Time to 1st token",
                    value: `${benchmark.result.ttftMs} ms`,
                  },
                  {
                    icon: Zap,
                    label: "Prompt processing",
                    value: `${benchmark.result.ppTps} tok/s`,
                  },
                ].map((s, i) => (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="rounded-3xl bg-card/80 p-4 ring-1 ring-white/[0.06]"
                  >
                    <s.icon className="h-4 w-4 text-orange-300/80" />
                    <p className="mt-2 font-mono text-[17px] font-semibold text-foreground">
                      {s.value}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                      {s.label}
                    </p>
                  </motion.div>
                ))}
              </motion.div>
            ) : null}

            {/* history */}
            <div>
              <SectionHeader
                title="Run history"
                sub="Your last benchmark runs on this machine"
              />
              <div className="overflow-hidden rounded-3xl bg-card/80 ring-1 ring-white/[0.06]">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[10.5px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Model</th>
                      <th className="px-4 py-2.5 font-medium">Max tok/s</th>
                      <th className="px-4 py-2.5 font-medium">Avg tok/s</th>
                      <th className="hidden px-4 py-2.5 font-medium sm:table-cell">TTFT</th>
                      <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((r) => {
                      const m = getModel(r.modelId);
                      return (
                        <tr
                          key={r.id}
                          className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                        >
                          <td className="px-4 py-2.5">
                            <span className="flex items-center gap-2">
                              <PublisherAvatar
                                name={m?.name ?? "?"}
                                family={m?.family ?? ""}
                                size="sm"
                              />
                              <span className="font-medium">
                                {m?.name}{" "}
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {m?.variant}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-orange-300">
                            {r.maxTps.toFixed(1)}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-muted-foreground">
                            {r.avgTps.toFixed(1)}
                          </td>
                          <td className="hidden px-4 py-2.5 font-mono text-muted-foreground sm:table-cell">
                            {r.ttftMs} ms
                          </td>
                          <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                            {new Date(r.date).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                        </tr>
                      );
                    })}
                    {history.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                          No runs yet
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
