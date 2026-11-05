"use client";

/* Downloads view: active queue + history */

import { motion } from "framer-motion";
import {
  Download,
  Pause,
  Play,
  Trash2,
  Clock,
  ArrowRight,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PublisherAvatar,
  EmptyState,
  SectionHeader,
  AnimatedNumber,
} from "@/components/ip/Shared";
import { getModel } from "@/lib/data";
import { useAppStore } from "@/lib/store";
import { formatEta } from "@/lib/data";
import { cn } from "@/lib/utils";

function DownloadRow({ modelId }: { modelId: string }) {
  const task = useAppStore((s) => s.downloads[modelId]);
  const pause = useAppStore((s) => s.pauseDownload);
  const resume = useAppStore((s) => s.resumeDownload);
  const cancel = useAppStore((s) => s.cancelDownload);
  const removeRecord = useAppStore((s) => s.removeDownloadRecord);
  const loadModel = useAppStore((s) => s.loadModel);
  const openChatTab = useAppStore((s) => s.openChatTab);
  const navigate = useAppStore((s) => s.navigate);

  const m = getModel(modelId);
  if (!task || !m) return null;
  const done = task.status === "done";
  const paused = task.status === "paused";
  const downloading = task.status === "downloading";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 160, damping: 22 }}
      className={cn(
        "rounded-3xl bg-card/80 p-4 ring-1 transition-colors",
        done ? "ring-white/[0.05]" : "ring-white/[0.08] hover:ring-white/[0.14]",
      )}
    >
      <div className="flex items-center gap-3.5">
        <PublisherAvatar name={m.name} family={m.family} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13.5px] font-semibold">
              {m.name}
              <span className="ml-1.5 font-mono text-[11px] font-normal text-muted-foreground">
                {m.variant} · {m.quant}
              </span>
            </p>
            {done ? (
              <span className="shrink-0 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/20">
                COMPLETED
              </span>
            ) : null}
          </div>
          {done ? (
            <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {task.finishedAt
                ? new Date(task.finishedAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}{" "}
              · {(task.totalMB / 1000).toFixed(1)} GB
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              <Progress value={task.progress} className="h-2" />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
                <span className="text-orange-300">
                  {task.progress.toFixed(0)}%
                </span>
                <span>
                  {(task.downloadedMB / 1000).toFixed(2)} /{" "}
                  {(task.totalMB / 1000).toFixed(1)} GB
                </span>
                {downloading ? (
                  <>
                    <span className="flex items-center gap-1">
                      <Download className="h-3 w-3" />
                      <AnimatedNumber value={task.speedMBs} decimals={1} /> MB/s
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatEta(task.etaSec)} left
                    </span>
                  </>
                ) : (
                  <span className="text-amber-300">Paused</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {done ? (
            <>
              <Button
                size="sm"
                className="h-9 rounded-2xl bg-primary px-3.5 text-[12px] text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  void loadModel(modelId);
                  openChatTab(modelId);
                }}
              >
                Load & chat <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-2xl text-muted-foreground hover:text-foreground"
                onClick={() => removeRecord(modelId)}
                aria-label="Clear from history"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => (paused ? resume(modelId) : pause(modelId))}
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-2xl ring-1 transition-colors",
                  paused
                    ? "bg-primary/15 text-primary ring-primary/30 hover:bg-primary/25"
                    : "bg-white/[0.05] text-muted-foreground ring-white/[0.08] hover:text-foreground",
                )}
                aria-label={paused ? "Resume download" : "Pause download"}
              >
                {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => cancel(modelId)}
                className="grid h-9 w-9 place-items-center rounded-2xl bg-white/[0.05] text-muted-foreground ring-1 ring-white/[0.08] transition-colors hover:bg-rose-500/15 hover:text-rose-300 hover:ring-rose-400/30"
                aria-label="Cancel download"
              >
                <Trash2 className="h-4 w-4" />
              </motion.button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function DownloadsView() {
  const downloads = useAppStore((s) => s.downloads);
  const navigate = useAppStore((s) => s.navigate);

  const all = Object.values(downloads).sort((a, b) => b.startedAt - a.startedAt);
  const active = all.filter((d) => d.status !== "done");
  const completed = all.filter((d) => d.status === "done");

  const totalSpeed = active.reduce((a, d) => a + (d.status === "downloading" ? d.speedMBs : 0), 0);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border/50 px-5 py-4 sm:px-7">
        <h1 className="text-[17px] font-semibold tracking-tight">Downloads</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          {active.length > 0
            ? `${active.length} active · ${totalSpeed.toFixed(1)} MB/s total`
            : "Your download queue is clear"}
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-3xl space-y-8 px-5 py-6 sm:px-7">
          {all.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-7 w-7" />}
              title="Nothing here yet"
              sub="Models you download from the catalog appear here with live progress, pause/resume and cancel."
              action={
                <Button
                  className="rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => navigate("models")}
                >
                  Browse models
                </Button>
              }
            />
          ) : null}

          {active.length > 0 ? (
            <section>
              <SectionHeader title="In progress" sub="You can pause, resume or cancel any time" />
              <div className="space-y-3">
                {active.map((d) => (
                  <DownloadRow key={d.modelId} modelId={d.modelId} />
                ))}
              </div>
            </section>
          ) : null}

          {completed.length > 0 ? (
            <section>
              <SectionHeader title="Completed" sub="Recently finished downloads" />
              <div className="space-y-3">
                {completed.map((d) => (
                  <DownloadRow key={d.modelId} modelId={d.modelId} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
