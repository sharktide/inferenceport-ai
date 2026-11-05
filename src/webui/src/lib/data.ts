/* ------------------------------------------------------------------ */
/*  InferencePort AI — UI concept build · mock data layer              */
/*  (backend untouched — everything here simulates the local engine)   */
/* ------------------------------------------------------------------ */

export type Capability = "chat" | "vision" | "coding" | "reasoning" | "small";

export interface ModelVariant {
  quant: string;
  sizeGB: number;
}

export interface CatalogModel {
  id: string;
  name: string;
  variant: string;
  publisher: string;
  family: string;
  params: string;
  sizeGB: number;
  quant: string;
  ctx: string;
  caps: Capability[];
  downloads: string;
  likes: number;
  /** estimated generation speed on reference hardware (tok/s) */
  tps: number;
  /** VRAM footprint in GB when fully on GPU */
  vramGB: number;
  totalLayers: number;
  description: string;
  featured?: boolean;
  installedByDefault?: boolean;
  variants: ModelVariant[];
}

export const CATALOG: CatalogModel[] = [
  {
    id: "llama3.2:3b",
    name: "Llama 3.2",
    variant: "3B",
    publisher: "Meta",
    family: "Llama",
    params: "3.2B",
    sizeGB: 2.0,
    quant: "Q4_K_M",
    ctx: "128K",
    caps: ["chat", "small"],
    downloads: "38.4M",
    likes: 12840,
    tps: 78,
    vramGB: 2.9,
    totalLayers: 28,
    description:
      "Meta's lightweight multilingual model built for edge devices. Punchy instruction following with a long 128K context window — a perfect daily driver.",
    installedByDefault: true,
    variants: [
      { quant: "Q4_K_M", sizeGB: 2.0 },
      { quant: "Q8_0", sizeGB: 3.4 },
      { quant: "F16", sizeGB: 6.4 },
    ],
  },
  {
    id: "qwen2.5-coder:7b",
    name: "Qwen2.5 Coder",
    variant: "7B",
    publisher: "Alibaba",
    family: "Qwen",
    params: "7.6B",
    sizeGB: 4.7,
    quant: "Q4_K_M",
    ctx: "128K",
    caps: ["coding", "chat"],
    downloads: "12.1M",
    likes: 9420,
    tps: 46,
    vramGB: 5.6,
    totalLayers: 28,
    description:
      "Code-specific model trained on 92 programming languages with repository-level completion. Excellent autocomplete, refactoring and debugging companion.",
    installedByDefault: true,
    variants: [
      { quant: "Q4_K_M", sizeGB: 4.7 },
      { quant: "Q5_K_M", sizeGB: 5.4 },
      { quant: "Q8_0", sizeGB: 8.1 },
    ],
  },
  {
    id: "deepseek-r1:8b",
    name: "DeepSeek-R1",
    variant: "8B",
    publisher: "DeepSeek",
    family: "DeepSeek",
    params: "8.0B",
    sizeGB: 4.9,
    quant: "Q4_K_M",
    ctx: "128K",
    caps: ["reasoning", "chat"],
    downloads: "21.7M",
    likes: 15310,
    tps: 42,
    vramGB: 5.8,
    totalLayers: 32,
    description:
      "Distilled from the full DeepSeek-R1 reasoning model. Thinks step-by-step before answering — strong at math, logic and structured problems.",
    installedByDefault: true,
    variants: [
      { quant: "Q4_K_M", sizeGB: 4.9 },
      { quant: "Q8_0", sizeGB: 8.5 },
    ],
  },
  {
    id: "gpt-oss:20b",
    name: "gpt-oss",
    variant: "20B",
    publisher: "OpenAI",
    family: "gpt-oss",
    params: "20B · 3.6B active",
    sizeGB: 12.8,
    quant: "MXFP4",
    ctx: "128K",
    caps: ["reasoning", "chat"],
    downloads: "9.8M",
    likes: 11060,
    tps: 61,
    vramGB: 13.4,
    totalLayers: 36,
    description:
      "OpenAI's open-weight MoE model with ~3.6B active parameters per token. Reasoning-grade quality that still fits in a gaming GPU with offload.",
    featured: true,
    variants: [{ quant: "MXFP4", sizeGB: 12.8 }],
  },
  {
    id: "llama3.3:70b",
    name: "Llama 3.3",
    variant: "70B",
    publisher: "Meta",
    family: "Llama",
    params: "70B",
    sizeGB: 42.5,
    quant: "Q4_K_M",
    ctx: "128K",
    caps: ["chat", "reasoning"],
    downloads: "14.6M",
    likes: 18900,
    tps: 9.6,
    vramGB: 44.2,
    totalLayers: 80,
    description:
      "Meta's flagship open model — performance in the league of much larger 405B models. Needs RAM/SSD offloading on consumer hardware, but it's worth it.",
    featured: true,
    variants: [
      { quant: "Q4_K_M", sizeGB: 42.5 },
      { quant: "Q2_K", sizeGB: 26.4 },
    ],
  },
  {
    id: "qwen2.5:14b",
    name: "Qwen2.5",
    variant: "14B",
    publisher: "Alibaba",
    family: "Qwen",
    params: "14.8B",
    sizeGB: 9.0,
    quant: "Q4_K_M",
    ctx: "128K",
    caps: ["chat", "coding"],
    downloads: "11.2M",
    likes: 8340,
    tps: 31,
    vramGB: 9.9,
    totalLayers: 48,
    description:
      "The sweet spot of the Qwen2.5 family — great multilingual, math and coding skills while staying responsive on 12 GB GPUs.",
    featured: true,
    variants: [
      { quant: "Q4_K_M", sizeGB: 9.0 },
      { quant: "Q6_K", sizeGB: 12.1 },
    ],
  },
  {
    id: "phi4:14b",
    name: "Phi-4",
    variant: "14B",
    publisher: "Microsoft",
    family: "Phi",
    params: "14.7B",
    sizeGB: 9.1,
    quant: "Q4_K_M",
    ctx: "16K",
    caps: ["reasoning", "chat"],
    downloads: "7.9M",
    likes: 6980,
    tps: 29,
    vramGB: 10.1,
    totalLayers: 40,
    description:
      "Microsoft's small-but-mighty model trained heavily on synthetic data. Surprisingly strong reasoning and STEM performance for its size.",
    featured: true,
    variants: [
      { quant: "Q4_K_M", sizeGB: 9.1 },
      { quant: "Q8_0", sizeGB: 15.7 },
    ],
  },
  {
    id: "qwen3:8b",
    name: "Qwen3",
    variant: "8B",
    publisher: "Alibaba",
    family: "Qwen",
    params: "8.2B",
    sizeGB: 5.2,
    quant: "Q4_K_M",
    ctx: "128K",
    caps: ["chat", "reasoning"],
    downloads: "18.3M",
    likes: 12470,
    tps: 44,
    vramGB: 6.1,
    totalLayers: 36,
    description:
      "Hybrid thinking model — toggle deep step-by-step reasoning on or off in the same conversation. Great default for a bit of everything.",
    variants: [
      { quant: "Q4_K_M", sizeGB: 5.2 },
      { quant: "Q8_0", sizeGB: 8.8 },
    ],
  },
  {
    id: "gemma2:9b",
    name: "Gemma 2",
    variant: "9B",
    publisher: "Google",
    family: "Gemma",
    params: "9.2B",
    sizeGB: 5.4,
    quant: "Q4_K_M",
    ctx: "8K",
    caps: ["chat"],
    downloads: "15.8M",
    likes: 10230,
    tps: 38,
    vramGB: 6.4,
    totalLayers: 42,
    description:
      "Google's efficient open model with knowledge distillation from much bigger teachers. Natural, well-rounded conversationalist.",
    variants: [
      { quant: "Q4_K_M", sizeGB: 5.4 },
      { quant: "Q8_0", sizeGB: 9.2 },
    ],
  },
  {
    id: "mistral:7b",
    name: "Mistral",
    variant: "7B",
    publisher: "Mistral AI",
    family: "Mistral",
    params: "7.2B",
    sizeGB: 4.4,
    quant: "Q4_K_M",
    ctx: "32K",
    caps: ["chat", "coding"],
    downloads: "27.5M",
    likes: 11590,
    tps: 47,
    vramGB: 5.2,
    totalLayers: 32,
    description:
      "The classic dense transformer that started the local-LLM wave. Fast, dependable and easy on VRAM.",
    variants: [
      { quant: "Q4_K_M", sizeGB: 4.4 },
      { quant: "Q7_K_M", sizeGB: 7.1 },
    ],
  },
  {
    id: "llama3.2-vision:11b",
    name: "Llama 3.2 Vision",
    variant: "11B",
    publisher: "Meta",
    family: "Llama",
    params: "10.6B",
    sizeGB: 7.9,
    quant: "Q4_K_M",
    ctx: "128K",
    caps: ["vision", "chat"],
    downloads: "6.4M",
    likes: 5120,
    tps: 33,
    vramGB: 8.7,
    totalLayers: 32,
    description:
      "Image + text understanding from Meta. Describe screenshots, parse documents and reason about charts right inside chat.",
    variants: [{ quant: "Q4_K_M", sizeGB: 7.9 }],
  },
  {
    id: "qwen2.5vl:7b",
    name: "Qwen2.5-VL",
    variant: "7B",
    publisher: "Alibaba",
    family: "Qwen",
    params: "8.3B",
    sizeGB: 6.0,
    quant: "Q4_K_M",
    ctx: "32K",
    caps: ["vision", "chat"],
    downloads: "5.7M",
    likes: 4890,
    tps: 35,
    vramGB: 6.9,
    totalLayers: 28,
    description:
      "Sharp visual understanding — document parsing, OCR, chart reading and even GUI agents. A strong all-round vision model.",
    variants: [{ quant: "Q4_K_M", sizeGB: 6.0 }],
  },
  {
    id: "smollm2:1.7b",
    name: "SmolLM2",
    variant: "1.7B",
    publisher: "HuggingFace",
    family: "SmolLM",
    params: "1.7B",
    sizeGB: 1.8,
    quant: "Q4_K_M",
    ctx: "128K",
    caps: ["chat", "small"],
    downloads: "4.2M",
    likes: 3260,
    tps: 112,
    vramGB: 2.4,
    totalLayers: 24,
    description:
      "Tiny, quick and surprisingly coherent. Leaves your GPU almost entirely free for everything else.",
    variants: [
      { quant: "Q4_K_M", sizeGB: 1.8 },
      { quant: "Q8_0", sizeGB: 2.9 },
    ],
  },
];

export function getModel(id: string): CatalogModel | undefined {
  return CATALOG.find((m) => m.id === id);
}

/* ------------------------------------------------------------------ */
/*  InferencePort cloud (playground-style hosted models)               */
/* ------------------------------------------------------------------ */

export interface CloudModel {
  id: string;
  label: string;
  params: string;
  ctx: string;
  speed: "Fast" | "Balanced" | "Flagship";
  tps: number;
  description: string;
}

export const CLOUD_MODELS: CloudModel[] = [
  {
    id: "inferenceport/deepseek-v3",
    label: "DeepSeek V3",
    params: "685B MoE",
    ctx: "64K",
    speed: "Flagship",
    tps: 72,
    description: "Frontier open-weight flagship.",
  },
  {
    id: "inferenceport/gpt-oss-120b",
    label: "gpt-oss 120B",
    params: "120B · 5.1B active",
    ctx: "128K",
    speed: "Fast",
    tps: 96,
    description: "OpenAI's open-weight MoE, hosted.",
  },
  {
    id: "inferenceport/llama-3.3-70b",
    label: "Llama 3.3 70B",
    params: "70B",
    ctx: "128K",
    speed: "Balanced",
    tps: 84,
    description: "Meta's flagship, zero setup.",
  },
  {
    id: "inferenceport/qwen-2.5-72b",
    label: "Qwen2.5 72B",
    params: "72B",
    ctx: "128K",
    speed: "Balanced",
    tps: 81,
    description: "Multilingual workhorse.",
  },
  {
    id: "inferenceport/phi-4-14b",
    label: "Phi-4 14B",
    params: "14B",
    ctx: "16K",
    speed: "Fast",
    tps: 120,
    description: "Microsoft's reasoning SLM.",
  },
];

/* ------------------------------------------------------------------ */
/*  Bring-your-own API key presets                                     */
/* ------------------------------------------------------------------ */

export interface ProviderPreset {
  kind: "openai" | "anthropic" | "custom";
  label: string;
  baseUrl: string;
  models: string[];
  hint: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    kind: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini", "o4-mini"],
    hint: "Uses the standard OpenAI chat completions API.",
  },
  {
    kind: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    models: ["claude-sonnet-4-5", "claude-haiku-4-5"],
    hint: "Anthropic Messages API with anthropic-compatible headers.",
  },
  {
    kind: "custom",
    label: "Custom · OpenAI-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["meta-llama/llama-3.3-70b-instruct", "qwen/qwen-2.5-72b-instruct"],
    hint: "Any OpenAI-compatible endpoint: OpenRouter, Groq, Together, LM Studio server…",
  },
];

/* ------------------------------------------------------------------ */
/*  Simulated replies (streaming demo)                                 */
/* ------------------------------------------------------------------ */

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

interface ReplyCtx {
  modelLabel: string;
  tps: number;
  location: "local" | "cloud" | "api";
  providerName?: string;
}

export function generateReply(input: string, ctx: ReplyCtx, turn: number): string {
  const seed = hashStr(input) + turn * 7;
  const q = input.toLowerCase();
  const where =
    ctx.location === "local"
      ? `running **locally** on your hardware at ~${Math.round(ctx.tps)} tok/s`
      : ctx.location === "cloud"
        ? `streaming from **InferencePort Cloud** at ~${Math.round(ctx.tps)} tok/s`
        : `via your **${ctx.providerName ?? "API"}** key`;

  if (/\b(hello|hi|hey|yo|good (morning|evening|afternoon))\b/.test(q)) {
    return pick(
      [
        `Hey! 👋 I'm **${ctx.modelLabel}**, ${where}. Ask me anything — code, ideas, summaries, or just chat.\n\n- Fully private when local: nothing leaves this machine\n- You can load or unload me anytime from the model panel\n- Try the **Benchmark** tab to measure my real throughput`,
        `Hi there! **${ctx.modelLabel}** here, ${where}. What are we building today?\n\nI'm good at:\n1. Writing & reviewing code\n2. Explaining tricky concepts\n3. Drafting documents and emails\n\nWhere do we start?`,
      ],
      seed,
    );
  }

  if (/\b(who are you|what are you|which model|your name)\b/.test(q)) {
    return `I'm **${ctx.modelLabel}** — ${where}.\n\n| | |\n|---|---|\n| Context | long-range, streamed token-by-token |\n| Privacy | ${ctx.location === "local" ? "100% on-device" : "encrypted in transit"} |\n| Speed | ~${Math.round(ctx.tps)} tok/s |\n\n> Swap me any time from the model picker — loaded models stay warm in VRAM until you unload them.`;
  }

  if (/\b(code|function|python|typescript|javascript|react|bug|script|sql|regex)\b/.test(q)) {
    return `Sure — here's a clean way to do it with **${ctx.modelLabel}**:\n\n\`\`\`python\nfrom dataclasses import dataclass\nfrom typing import Iterable\n\n@dataclass\nclass Token:\n    text: str\n    kind: str = "word"\n\ndef tokenize(stream: Iterable[str], sep: str = " ") -> list[Token]:\n    """Split a text stream into simple tokens, tracking kinds."""\n    tokens: list[Token] = []\n    for chunk in stream:\n        for part in chunk.split(sep):\n            if part.strip():\n                kind = "num" if part.strip().isdigit() else "word"\n                tokens.append(Token(part.strip(), kind))\n    return tokens\n\nif __name__ == "__main__":\n    print(len(tokenize(["inference port ", "rocks 2026"])))  # -> 4\n\`\`\`\n\n**Why this shape**\n\n- Dataclass keeps \`Token\` immutable and printable by default\n- \`Iterable[str]\` accepts generators, files, or chat streams\n- Kind detection is a placeholder — swap in your tokenizer of choice\n\nWant a TypeScript version or tests for this?`;
  }

  if (/\b(benchmark|speed|fast|slow|token|tok\/s|tps|performance)\b/.test(q)) {
    return `Good question — on this machine I stream at roughly **${Math.round(ctx.tps)} tok/s**, but real numbers depend on your setup:\n\n1. **Prompt processing** is compute-bound — big prompts take a moment before the first token\n2. **Generation speed** depends on model size, quantization and how many layers sit on the GPU\n3. **Offloading** to RAM/SSD trades a little speed for capacity\n\nOpen the **Benchmark** tab and hit *Run benchmark* — it measures time-to-first-token, prompt processing and max generation speed on your actual hardware.`;
  }

  if (/\b(inferenceport|this app|inference port)\b/.test(q)) {
    return `**InferencePort AI** is a desktop app for running language models locally, privately, or on the cloud.\n\n- **Local models** — download & load GGUF models, chat fully offline\n- **InferencePort Cloud** — hosted frontier models, zero setup\n- **Your API keys** — bring OpenAI, Anthropic or any compatible endpoint\n- **Benchmarks** — measure real tok/s on your hardware\n\nEverything in this chat ${ctx.location === "local" ? "stays on your machine" : "streams over an encrypted connection"}. 💙`;
  }

  const generic = [
    `Great question. Here's how I'd think about it as **${ctx.modelLabel}** ${where}:\n\n**The short answer** — it depends on what you're optimizing for, but there's a sensible default for most cases.\n\n**A few angles worth considering**\n\n1. *Start simple.* The boring solution usually wins until proven otherwise.\n2. *Measure, then optimize.* Intuition is a bad profiler.\n3. *Keep an exit.* Prefer choices you can reverse cheaply.\n\n> Want me to go deeper on any of these — or draft a concrete plan?`,
    `Here's my take:\n\n**What's likely going on**\n\n- There are usually two or three real variables hiding inside a question like this\n- Most of the value comes from picking which one matters *right now*\n\n**A practical approach**\n\n1. Write down the outcome you want in one sentence\n2. List what you'd need to believe for that to happen\n3. Test the cheapest assumption first\n\nIf you share a bit more context, I can turn this into a concrete checklist. 🚀`,
    `Happy to dig in. Structured quickly:\n\n**Core idea** — treat this as a small system with inputs, constraints, and one target metric.\n\n| Piece | What to check |\n|---|---|\n| Inputs | quality, freshness, volume |\n| Constraints | time, budget, VRAM 😄 |\n| Target | the single number that says "better" |\n\n**Next step** — pick the row you control most easily and improve it by 10% this week.\n\nWant examples, or should we go straight to a plan?`,
  ];
  return pick(generic, seed);
}

/* ------------------------------------------------------------------ */
/*  Misc helpers                                                       */
/* ------------------------------------------------------------------ */

export const HARDWARE = {
  gpu: "NVIDIA GeForce RTX 4070",
  vramTotal: 12,
  ramTotal: 32,
  cpu: "AMD Ryzen 7 7800X3D",
  baseRamUsed: 6.4,
};

export const DONATE_URL = "https://buy.stripe.com/bJedR93gk4xw7EFeyabbG08";
export const GITHUB_URL = "https://github.com/sharktide/inferenceport-ai";
export const SITE_URL = "https://inferenceport.ai";

export function formatEta(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

export function formatGB(gb: number): string {
  return gb >= 10 ? gb.toFixed(0) : gb.toFixed(1);
}
