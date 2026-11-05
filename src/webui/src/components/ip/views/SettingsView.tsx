"use client";

/* Settings: cloud connection, API keys, engine & offload options */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cloud,
  KeyRound,
  Plug,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Cpu,
  MemoryStick,
  HardDrive,
  Heart,
  ShieldCheck,
  FlaskConical,
  Github,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionHeader, StatusDot } from "@/components/ip/Shared";
import { HARDWARE, PROVIDER_PRESETS, DONATE_URL, GITHUB_URL } from "@/lib/data";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function ToggleRow({
  icon,
  title,
  desc,
  checked,
  onCheckedChange,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl bg-white/[0.03] p-3.5 ring-1 ring-white/[0.05]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-white/[0.05] text-muted-foreground ring-1 ring-white/[0.07]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[13px] font-medium">
          {title}
          {badge ? (
            <span className="rounded-full bg-violet-500/15 px-1.5 py-px text-[9px] font-semibold text-violet-300 ring-1 ring-violet-400/20">
              {badge}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
          {desc}
        </p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function AddProviderForm({ onDone }: { onDone: () => void }) {
  const addApiProvider = useAppStore((s) => s.addApiProvider);
  const [presetKind, setPresetKind] = useState<string>("openai");
  const [name, setName] = useState("OpenAI");
  const [baseUrl, setBaseUrl] = useState(PROVIDER_PRESETS[0].baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const preset = PROVIDER_PRESETS.find((p) => p.kind === presetKind) ?? PROVIDER_PRESETS[0];

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="space-y-4 rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-[11.5px] text-muted-foreground">Preset</Label>
            <Select
              value={presetKind}
              onValueChange={(v) => {
                setPresetKind(v);
                const p = PROVIDER_PRESETS.find((x) => x.kind === v);
                if (p) {
                  setBaseUrl(p.baseUrl);
                  setName(p.label);
                }
              }}
            >
              <SelectTrigger className="mt-1.5 h-10 rounded-2xl border-white/[0.08] bg-white/[0.04] text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-white/10 bg-popover">
                {PROVIDER_PRESETS.map((p) => (
                  <SelectItem key={p.kind} value={p.kind} className="text-[12.5px]">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11.5px] text-muted-foreground">Display name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 h-10 rounded-2xl border-white/[0.08] bg-white/[0.04] text-[12.5px]"
            />
          </div>
        </div>

        <div>
          <Label className="text-[11.5px] text-muted-foreground">Base URL</Label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            className="mt-1.5 h-10 rounded-2xl border-white/[0.08] bg-white/[0.04] font-mono text-[12px]"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground/70">{preset.hint}</p>
        </div>

        <div>
          <Label className="text-[11.5px] text-muted-foreground">API key</Label>
          <div className="relative mt-1.5">
            <Input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type={showKey ? "text" : "password"}
              placeholder="sk-…"
              className="h-10 rounded-2xl border-white/[0.08] bg-white/[0.04] pr-10 font-mono text-[12px]"
            />
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground/70">
            <ShieldCheck className="h-3 w-3" />
            Stored locally on this device — used only for direct calls from the app.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" className="rounded-2xl text-[12.5px]" onClick={onDone}>
            Cancel
          </Button>
          <Button
            className="rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!name.trim() || !baseUrl.trim() || !apiKey.trim()}
            onClick={() => {
              addApiProvider({
                name: name.trim(),
                kind: preset.kind,
                baseUrl: baseUrl.trim(),
                apiKey: apiKey.trim(),
                models: [...preset.models],
              });
              onDone();
            }}
          >
            <Plug className="mr-1.5 h-3.5 w-3.5" /> Connect provider
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export function SettingsView() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const apiProviders = useAppStore((s) => s.apiProviders);
  const removeApiProvider = useAppStore((s) => s.removeApiProvider);
  const cloudConnected = useAppStore((s) => s.cloudConnected);
  const cloudTesting = useAppStore((s) => s.cloudTesting);
  const testCloud = useAppStore((s) => s.testCloudConnection);
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border/50 px-5 py-4 sm:px-7">
        <h1 className="text-[17px] font-semibold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          Connections, API keys, engine behaviour and offloading.
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-3xl space-y-10 px-5 py-7 sm:px-7">
          {/* connection */}
          <section>
            <SectionHeader
              title="InferencePort Cloud"
              sub="Use hosted frontier models — same interface as the playground"
            />
            <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-card/80 p-4 ring-1 ring-white/[0.06]">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-500/12 text-teal-300 ring-1 ring-teal-400/20">
                <Cloud className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[13.5px] font-semibold">
                  api.inferenceport.ai
                  <span
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
                      cloudConnected
                        ? "bg-emerald-500/10 text-emerald-300 ring-emerald-400/20"
                        : "bg-amber-500/10 text-amber-300 ring-amber-400/20",
                    )}
                  >
                    <StatusDot tone={cloudConnected ? "green" : "amber"} pulse={cloudConnected} />
                    {cloudConnected ? "Connected · 42 ms" : "Not connected"}
                  </span>
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  Signed in as demo@inferenceport.ai · Pro plan
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-2xl border-white/[0.1] bg-white/[0.04] px-3.5 text-[12px] hover:bg-white/[0.07]"
                onClick={testCloud}
                disabled={cloudTesting}
              >
                {cloudTesting ? (
                  <span className="mr-1.5 h-3.5 w-3.5 animate-spin rounded-full border-2 border-teal-400/30 border-t-teal-400" />
                ) : (
                  <Plug className="mr-1.5 h-3.5 w-3.5" />
                )}
                {cloudTesting ? "Testing…" : "Test connection"}
              </Button>
            </div>
          </section>

          {/* api providers */}
          <section>
            <SectionHeader
              title="API keys"
              sub="Bring your own OpenAI, Anthropic or any OpenAI-compatible endpoint"
              action={
                !adding ? (
                  <Button
                    size="sm"
                    className="h-8 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => setAdding(true)}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add provider
                  </Button>
                ) : null
              }
            />

            <AnimatePresence initial={false}>
              {adding ? (
                <AddProviderForm key="add" onDone={() => setAdding(false)} />
              ) : null}
            </AnimatePresence>

            <div className={cn("space-y-2.5", adding && "mt-3")}>
              {apiProviders.length === 0 && !adding ? (
                <div className="rounded-3xl border border-dashed border-white/10 p-6 text-center">
                  <KeyRound className="mx-auto h-6 w-6 text-muted-foreground/60" />
                  <p className="mt-2 text-[13px] font-medium">No custom providers</p>
                  <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-relaxed text-muted-foreground">
                    Add an OpenAI or Anthropic key — or point to OpenRouter, Groq, Together,
                    or your own LM Studio server. Models appear in chat under “API keys”.
                  </p>
                </div>
              ) : null}

              {apiProviders.map((p) => (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="flex items-center gap-3.5 rounded-3xl bg-card/80 p-4 ring-1 ring-white/[0.06]"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-500/12 text-violet-300 ring-1 ring-violet-400/20">
                    <KeyRound className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold">{p.name}</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                      {p.baseUrl} · key ••••{p.apiKey.slice(-4)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.models.slice(0, 3).map((mm) => (
                        <span
                          key={mm}
                          className="rounded-md bg-white/[0.05] px-1.5 py-px font-mono text-[9.5px] text-muted-foreground"
                        >
                          {mm}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-2xl text-muted-foreground hover:bg-rose-500/10 hover:text-rose-300"
                    onClick={() => removeApiProvider(p.id)}
                    aria-label="Remove provider"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </motion.div>
              ))}
            </div>
          </section>

          {/* engine */}
          <section>
            <SectionHeader
              title="Engine & memory"
              sub="Defaults used when loading models in chat"
            />
            <div className="space-y-2.5">
              <ToggleRow
                icon={<Cpu className="h-4 w-4 text-orange-300" />}
                title="GPU acceleration"
                desc={`Use ${HARDWARE.gpu} for layer offload when available`}
                checked={settings.gpuAccel}
                onCheckedChange={(v) => update({ gpuAccel: v })}
              />
              <ToggleRow
                icon={<FlaskConical className="h-4 w-4 text-teal-300" />}
                title="Auto-load on select"
                desc="Load a model into memory as soon as it's picked in chat"
                checked={settings.autoLoadOnSelect}
                onCheckedChange={(v) => update({ autoLoadOnSelect: v })}
              />
              <ToggleRow
                icon={<MemoryStick className="h-4 w-4 text-amber-300" />}
                title="RAM offload by default"
                desc="Spill excess layers to system RAM when VRAM runs out"
                checked={settings.ramOffloadDefault}
                onCheckedChange={(v) => update({ ramOffloadDefault: v })}
              />
              <ToggleRow
                icon={<HardDrive className="h-4 w-4 text-violet-300" />}
                title="SSD offload"
                desc="Stream the least-used layers from NVMe for very large models"
                badge="BETA"
                checked={settings.ssdOffload}
                onCheckedChange={(v) => update({ ssdOffload: v })}
              />

              <div className="space-y-4 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
                <div>
                  <div className="mb-2 flex items-center justify-between text-[12px]">
                    <span className="font-medium">Max VRAM per model stack</span>
                    <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-foreground/80">
                      {settings.maxVramGB.toFixed(1)} / {HARDWARE.vramTotal} GB
                    </span>
                  </div>
                  <Slider
                    value={[settings.maxVramGB]}
                    min={2}
                    max={HARDWARE.vramTotal}
                    step={0.5}
                    onValueChange={([v]) => update({ maxVramGB: v })}
                  />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-[12px]">
                    <span className="font-medium">Keep models warm for</span>
                    <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-foreground/80">
                      {settings.keepAliveMin} min
                    </span>
                  </div>
                  <Slider
                    value={[settings.keepAliveMin]}
                    min={0}
                    max={60}
                    step={5}
                    onValueChange={([v]) => update({ keepAliveMin: v })}
                  />
                  <p className="mt-1.5 text-[10.5px] text-muted-foreground/70">
                    Loaded models stay in VRAM for this long after last use.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* about */}
          <section>
            <SectionHeader title="About" sub="InferencePort AI · UI concept build" />
            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-2xl bg-white/[0.04] px-3.5 py-2 text-[12px] font-medium ring-1 ring-white/[0.07] transition-colors hover:bg-white/[0.08]"
              >
                <Github className="h-3.5 w-3.5" /> GitHub
              </a>
              <a
                href="https://inferenceport.ai"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-2xl bg-white/[0.04] px-3.5 py-2 text-[12px] font-medium ring-1 ring-white/[0.07] transition-colors hover:bg-white/[0.08]"
              >
                <Globe className="h-3.5 w-3.5" /> Website
              </a>
              <a
                href={DONATE_URL}
                target="_blank"
                rel="noreferrer"
                className="ip-brand-gradient flex items-center gap-2 rounded-2xl px-4 py-2 text-[12px] font-semibold text-[#241205] shadow-[0_4px_16px_-6px_rgba(251,146,60,0.55)] transition-transform hover:scale-[1.02]"
              >
                <Heart className="h-3.5 w-3.5" /> Donate me
              </a>
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground/70">
              Apache-2.0 · This is a front-end concept build: all engine behaviour
              (downloads, loading, streaming, benchmarks) is simulated locally in the
              browser. No backend calls are made.
            </p>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
