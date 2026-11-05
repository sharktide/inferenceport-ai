"use client";

/* Shared building blocks for the InferencePort UI concept */

import { useEffect, useState, type ReactNode } from "react";
import { motion, useSpring, useMotionValueEvent } from "framer-motion";
import { Brain, Code2, Eye, MessageSquare, Feather } from "lucide-react";
import { cn } from "@/lib/utils";

export function PublisherAvatar({
  name,
  family,
  size = "md",
}: {
  name: string;
  family: string;
  size?: "sm" | "md" | "lg";
}) {
  const palettes: Record<string, string> = {
    Llama: "bg-orange-500/15 text-orange-300 ring-orange-400/20",
    Qwen: "bg-violet-500/15 text-violet-300 ring-violet-400/20",
    DeepSeek: "bg-teal-500/15 text-teal-300 ring-teal-400/20",
    "gpt-oss": "bg-emerald-500/15 text-emerald-300 ring-emerald-400/20",
    Phi: "bg-cyan-600/15 text-cyan-300 ring-cyan-400/20",
    Gemma: "bg-rose-500/15 text-rose-300 ring-rose-400/20",
    Mistral: "bg-amber-500/15 text-amber-300 ring-amber-400/20",
    SmolLM: "bg-yellow-500/15 text-yellow-300 ring-yellow-400/20",
  };
  const cls = palettes[family] ?? "bg-stone-500/15 text-stone-300 ring-stone-400/20";
  const sizes = {
    sm: "h-7 w-7 text-[11px]",
    md: "h-9 w-9 text-xs",
    lg: "h-12 w-12 text-sm",
  };
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl font-semibold tracking-wide ring-1",
        cls,
        sizes[size],
      )}
      aria-hidden
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

export const CAP_META: Record<
  string,
  { label: string; icon: typeof Brain; className: string }
> = {
  chat: { label: "Chat", icon: MessageSquare, className: "text-orange-300 bg-orange-500/10 ring-orange-400/20" },
  vision: { label: "Vision", icon: Eye, className: "text-teal-300 bg-teal-500/10 ring-teal-400/20" },
  coding: { label: "Coding", icon: Code2, className: "text-emerald-300 bg-emerald-500/10 ring-emerald-400/20" },
  reasoning: { label: "Reasoning", icon: Brain, className: "text-violet-300 bg-violet-500/10 ring-violet-400/20" },
  small: { label: "Small", icon: Feather, className: "text-amber-300 bg-amber-500/10 ring-amber-400/20" },
};

export function CapChip({ cap }: { cap: string }) {
  const meta = CAP_META[cap];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1",
        meta.className,
      )}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

export function SectionHeader({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {sub ? (
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">{sub}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  sub,
  action,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/80 bg-card/40 px-8 py-16 text-center"
    >
      <div className="ip-float mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/70 text-muted-foreground ring-1 ring-border">
        {icon}
      </div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {sub ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          {sub}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </motion.div>
  );
}

export function MiniGauge({
  label,
  used,
  total,
  unit = "GB",
  icon,
  className,
}: {
  label: string;
  used: number;
  total: number;
  unit?: string;
  icon?: ReactNode;
  className?: string;
}) {
  const pct = Math.min(100, (used / total) * 100);
  const hot = pct > 85;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 truncate text-[11px] font-medium text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {used.toFixed(1)}/{total}
          {unit}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <motion.div
          className={cn(
            "h-full rounded-full",
            hot
              ? "bg-gradient-to-r from-orange-500 to-rose-400"
              : "bg-gradient-to-r from-orange-400 to-amber-300",
          )}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 80, damping: 20 }}
        />
      </div>
    </div>
  );
}

export function AnimatedNumber({
  value,
  decimals = 0,
  className,
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const spring = useSpring(value, { stiffness: 120, damping: 24 });
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);
  useMotionValueEvent(spring, "change", (v) => setDisplay(v as number));
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {display.toFixed(decimals)}
    </span>
  );
}

export function StatusDot({
  tone = "green",
  pulse,
}: {
  tone?: "green" | "orange" | "amber" | "muted";
  pulse?: boolean;
}) {
  const tones: Record<string, string> = {
    green: "bg-emerald-400",
    orange: "bg-orange-400",
    amber: "bg-amber-400",
    muted: "bg-stone-500",
  };
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        tones[tone],
        pulse && "ip-pulse-dot",
      )}
    />
  );
}
