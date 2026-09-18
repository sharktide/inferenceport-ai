import si from "systeminformation";
import { app } from "electron";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { getSession } from "../auth.js";
import { defaultSecure52458Fetch } from "./proxy52458Client.js";

import type { Systeminformation } from "systeminformation";

export let globalcpu: Systeminformation.CpuData | undefined;
export let globalflags: String | undefined;
export let globalmem: Systeminformation.MemData | undefined;
export let globalgpu: Systeminformation.GraphicsData | undefined;

let hardwareInfoPromise: Promise<void> | null = null;
let gpuDetectionFailed = false;

export async function initHardwareInfo(): Promise<void> {
	if (!hardwareInfoPromise) {
		hardwareInfoPromise = (async () => {
			const gpuResult = await si.graphics().catch((err) => {
				console.warn("GPU detection failed:", err?.message ?? err);
				gpuDetectionFailed = true;
				return undefined;
			});
			[globalcpu, globalmem, globalflags, globalgpu] = await Promise.all([
				si.cpu(),
				si.mem(),
				si.cpuFlags(),
				Promise.resolve(gpuResult),
			]);
		})();
	}
	return hardwareInfoPromise;
}

async function issueProxyToken(): Promise<string> {
    console.log("Issuing Proxy Token");
    const session = await getSession();
    const jwt = session.access_token;

    const res = await fetch(
        "https://dpixehhdbtzsbckfektd.supabase.co/functions/v1/issue-token",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${jwt}`,
                "Content-Type": "application/json",
            },
        },
    );

    if (!res.ok) {
        throw new Error(`Token issue failed: ${res.statusText}`);
    }

    const { token } = await res.json();
    if (!token) throw new Error("No token returned");

    return token;
}

function parseModelSize(modelSize: string) {
	const lower = modelSize.toLowerCase();
	if (lower.endsWith("b")) return parseFloat(lower.replace("b", ""));
	if (lower.endsWith("m")) return parseFloat(lower.replace("m", "")) / 1000;
	if (lower.startsWith("e")) return parseFloat(lower.replace("e", ""));
	return parseFloat(lower);
}

function is52458(url: string): boolean {
	try {
		const u = new URL(url);
		return u.port === "52458";
	} catch {
		return false;
	}
}

function formatMemoryGB(num: number): string {
	if (!isFinite(num) || num <= 0) return "unknown";
	if (num >= 100) return num.toFixed(0);
	return num.toFixed(1);
}

function estimateModelMemoryGB(paramsB: number): number {
	if (!isFinite(paramsB) || paramsB <= 0) return 0;
	// Ollama's default quantization (Q4_K_M) uses ~4.8 bits per parameter,
	// so roughly 0.6 GB of weights per billion parameters. Add a small
	// slice for the KV cache / context window.
	const weightsGB = paramsB * 0.6;
	const kvCacheGB = Math.min(2, Math.max(0.5, paramsB * 0.25));
	return weightsGB + kvCacheGB;
}

function describeSpeed(paramsB: number, score: number): string {
	if (paramsB <= 1) return "run smoothly on this system.";
	if (paramsB <= 3)
		return score >= 3
			? "run well on this system."
			: "run fine, though not instantly.";
	if (paramsB <= 8)
		return score >= 5
			? "run with reasonable performance."
			: "run, but response times may be slow on this CPU.";
	if (paramsB <= 14)
		return score >= 6
			? "run with decent performance."
			: "be slow (over 30s per response) on this CPU.";
	if (paramsB <= 34)
		return score >= 8
			? "run, but expect slower generations."
			: "be too slow for comfortable interactive use on this CPU.";
	return "run, but expect slow generations on this CPU.";
}

type PerformanceTier = "excellent" | "good" | "fair" | "poor" | "critical";

interface PerformanceTierInfo {
	tier: PerformanceTier;
	stars: number;
	label: string;
}

function getPerformanceTier(
	paramsB: number,
	score: number,
	gpuTflops: number | null,
	dedicatedVramGB: number,
	estGB: number,
): PerformanceTierInfo {
	// GPU-heavy scoring: if model fits in VRAM, GPU TFLOPS dominate speed
	if (dedicatedVramGB > 0 && estGB <= dedicatedVramGB * 0.95) {
		if (gpuTflops !== null) {
			if (gpuTflops >= 40) return { tier: "excellent", stars: 5, label: "Excellent" };
			if (gpuTflops >= 25) return { tier: "good", stars: 4, label: "Good" };
			if (gpuTflops >= 12) return { tier: "fair", stars: 3, label: "Fair" };
			return { tier: "poor", stars: 2, label: "Slow" };
		}
		// GPU present but unknown TFLOPS - assume decent
		return { tier: "good", stars: 4, label: "Good" };
	}

	// CPU-bound scoring (no GPU or model too large for VRAM)
	let baseScore = score;

	// Apply GPU penalty: older/slower GPUs get penalized when partially offloaded
	if (dedicatedVramGB > 0 && gpuTflops !== null) {
		if (gpuTflops < 5) baseScore -= 2;
		else if (gpuTflops < 10) baseScore -= 1;
	}

	if (paramsB <= 1) return { tier: "excellent", stars: 5, label: "Excellent" };
	if (paramsB <= 3) {
		if (baseScore >= 5) return { tier: "excellent", stars: 5, label: "Excellent" };
		if (baseScore >= 3) return { tier: "good", stars: 4, label: "Good" };
		return { tier: "fair", stars: 3, label: "Fair" };
	}
	if (paramsB <= 8) {
		if (baseScore >= 7) return { tier: "good", stars: 4, label: "Good" };
		if (baseScore >= 5) return { tier: "fair", stars: 3, label: "Fair" };
		return { tier: "poor", stars: 2, label: "Slow" };
	}
	if (paramsB <= 14) {
		if (baseScore >= 8) return { tier: "fair", stars: 3, label: "Fair" };
		if (baseScore >= 6) return { tier: "poor", stars: 2, label: "Slow" };
		return { tier: "critical", stars: 1, label: "Very Slow" };
	}
	if (paramsB <= 34) {
		if (baseScore >= 10) return { tier: "poor", stars: 2, label: "Slow" };
		return { tier: "critical", stars: 1, label: "Very Slow" };
	}
	return { tier: "critical", stars: 1, label: "Very Slow" };
}

// ---------------------------------------------------------------------------
// GPU / acceleration detection
// ---------------------------------------------------------------------------

type AccelerationBackend = "cuda" | "rocm" | "metal" | "cpu" | "unknown";

type GpuVendor =
	| "nvidia"
	| "amd"
	| "intel"
	| "apple"
	| "qualcomm"
	| "other"
	| "none";

interface GpuSummary {
	vendor: GpuVendor;
	label: string;
	model: string;
	vramGB: number | null;
	vramFreeGB: number | null;
	dedicated: boolean;
}

// Approximate FP32 TFLOPS for known consumer GPU models.
// Used to estimate inference speed when VRAM capacity alone is insufficient.
const GPU_TFLOPS_DB: Record<string, number> = {
	// NVIDIA RTX 50-series
	"rtx 5090": 105, "rtx 5080": 56, "rtx 5070 ti": 44, "rtx 5070": 36,
	// NVIDIA RTX 40-series
	"rtx 4090": 82.6, "rtx 4080 super": 55.3, "rtx 4080": 52.1,
	"rtx 4070 ti super": 44.1, "rtx 4070 ti": 40.1, "rtx 4070 super": 35.5,
	"rtx 4070": 29.1, "rtx 4060 ti": 22.1, "rtx 4060": 15.1,
	// NVIDIA RTX 30-series
	"rtx 3090 ti": 40, "rtx 3090": 35.6, "rtx 3080 ti": 34.1, "rtx 3080": 29.8,
	"rtx 3070 ti": 21.8, "rtx 3070": 20.3, "rtx 3060 ti": 16.2, "rtx 3060": 12.7,
	// NVIDIA RTX 20-series
	"rtx 2080 ti": 13.4, "rtx 2080 super": 11.2, "rtx 2080": 10.1,
	"rtx 2070 super": 9.1, "rtx 2070": 7.5, "rtx 2060 super": 7.2, "rtx 2060": 6.5,
	// NVIDIA GTX 16-series
	"gtx 1660 ti": 5.5, "gtx 1660 super": 5.2, "gtx 1660": 5.0,
	// NVIDIA older
	"gtx 1080 ti": 11.3, "gtx 1080": 8.9, "gtx 1070 ti": 8.1, "gtx 1070": 6.5,
	"gtx 1060": 4.4,
	// AMD Radeon RX 7000-series
	"rx 7900 xtx": 61.4, "rx 7900 xt": 51.5, "rx 7900 gre": 38.5,
	"rx 7800 xt": 37.2, "rx 7700 xt": 34.6, "rx 7600": 22.1,
	// AMD Radeon RX 6000-series
	"rx 6950 xt": 23.4, "rx 6900 xt": 23.0, "rx 6800 xt": 20.7, "rx 6800": 16.8,
	"rx 6750 xt": 15.5, "rx 6700 xt": 13.3, "rx 6600 xt": 10.4, "rx 6600": 8.9,
};

const IGNORED_GPU =
	/(microsoft basic|virtual|citrix|vmware|parallels|parsec|remote|oray|meta)/i;

// Where the bundled Ollama (and its acceleration libraries) live.
const vendorRoot = !app.isPackaged
	? path.join("vendor", "electron-ollama")
	: path.join(process.resourcesPath, "vendor", "electron-ollama");

/**
 * Figure out which compute backend the bundled Ollama binary was compiled
 * for. Release builds strip the acceleration libraries that were not asked
 * for, so the presence of `lib/ollama/cuda*` or `lib/ollama/rocm` tells us
 * what this build can actually accelerate.
 */
function detectAccelerationBackend(): AccelerationBackend {
	if (process.platform === "darwin") return "metal";

	const libDir = path.join(vendorRoot, "lib", "ollama");
	let entries: string[];
	try {
		entries = fs.readdirSync(libDir);
	} catch {
		return "unknown";
	}

	const lower = entries.map((entry) => entry.toLowerCase());
	if (lower.some((entry) => entry.includes("rocm"))) return "rocm";
	if (lower.some((entry) => entry.includes("cuda"))) return "cuda";
	return "cpu";
}

function classifyGpuVendor(vendor: string, model: string): GpuVendor {
	const text = `${vendor} ${model}`.toLowerCase();
	if (!text.trim()) return "none";
	if (/(nvidia|geforce|quadro|rtx|gtx|tesla)/.test(text)) return "nvidia";
	if (/(amd|radeon|advanced micro devices|instinct|ati )/.test(text))
		return "amd";
	if (/(apple)/.test(text)) return "apple";
	if (/(intel|iris|uhd graphics|arc)/.test(text)) return "intel";
	if (/(qualcomm|adreno)/.test(text)) return "qualcomm";
	return "other";
}

function lookupGpuTflops(model: string): number | null {
	const lower = model.toLowerCase().replace(/\s+/g, " ").trim();
	for (const [key, tflops] of Object.entries(GPU_TFLOPS_DB)) {
		if (lower.includes(key)) return tflops;
	}
	return null;
}

/**
 * Try to query nvidia-smi for real-time free VRAM.
 * Returns free VRAM in MB, or null if unavailable.
 */
function queryNvidiaSmiFreeVram(): Promise<number | null> {
	return new Promise((resolve) => {
		if (process.platform !== "win32" && process.platform !== "linux") {
			resolve(null);
			return;
		}
		const cmd = process.platform === "win32" ? "nvidia-smi" : "/usr/bin/nvidia-smi";
		execFile(
			cmd,
			["--query-gpu=memory.free", "--format=csv,noheader,nounits"],
			{ timeout: 3000 },
			(err, stdout) => {
				if (err || !stdout) {
					resolve(null);
					return;
				}
				const val = parseInt(stdout.trim().split("\n")[0] ?? "", 10);
				resolve(isFinite(val) && val > 0 ? val : null);
			},
		);
	});
}

function summarizeGpus(): GpuSummary[] {
	const controllers = globalgpu?.controllers ?? [];
	const gpus: GpuSummary[] = [];

	for (const controller of controllers) {
		const model = (controller.model ?? "").trim();
		const vendorRaw = (controller.vendor ?? "").trim();
		if (IGNORED_GPU.test(`${vendorRaw} ${model}`)) continue;

		const vendor = classifyGpuVendor(vendorRaw, model);
		if (vendor === "none") continue;

		const rawVram = controller.vram ?? controller.memoryTotal ?? null;
		const vramGB = rawVram && rawVram > 0 ? rawVram / 1024 : null;
		const dedicated =
			vendor === "nvidia" || (vramGB !== null && vramGB >= 3);

		// Use memoryFree if available for a more accurate usable-VRAM picture.
		// memoryTotal is always the full capacity; memoryFree reflects what
		// is actually available right now (excludes other apps' usage).
		const freeHint = controller.memoryFree ?? null;
		const vramFreeGB =
			freeHint && freeHint > 0
				? freeHint / 1024
				: vramGB;

		gpus.push({
			vendor,
			label: vendorRaw || model,
			model,
			vramGB,
			vramFreeGB,
			dedicated,
		});
	}

	return gpus;
}

function describeGpu(gpu: GpuSummary): string {
	return gpu.model || gpu.label || gpu.vendor;
}

/** The GPU, if any, that the detected backend can actually use. */
function pickAcceleratedGpu(
	backend: AccelerationBackend,
	gpus: GpuSummary[],
): GpuSummary | null {
	switch (backend) {
		case "cuda":
			return gpus.find((gpu) => gpu.vendor === "nvidia") ?? null;
		case "rocm":
			return gpus.find((gpu) => gpu.vendor === "amd") ?? null;
		case "metal":
			return gpus.find((gpu) => gpu.vendor === "apple") ?? gpus[0] ?? null;
		default:
			return null;
	}
}

/**
 * Explain when the installed Ollama build does not match the GPU in the
 * machine, which is the difference between GPU-accelerated and CPU inference.
 */
function describeAccelerationMismatch(
	backend: AccelerationBackend,
	gpus: GpuSummary[],
): string {
	const discrete = gpus.filter(
		(gpu) => gpu.vendor !== "intel" && gpu.vendor !== "qualcomm",
	);

	switch (backend) {
		case "cuda":
			if (gpus.some((gpu) => gpu.vendor === "nvidia")) return "";
			if (discrete.length) {
				const gpu = discrete[0];
				if (gpu)
					return `This Ollama build is compiled for NVIDIA (CUDA), but the detected GPU (${describeGpu(gpu)}) is not CUDA-capable, so it will fall back to CPU.`;
			}
			return "This Ollama build is compiled for NVIDIA (CUDA), but no NVIDIA GPU was found, so it will run on CPU.";
		case "rocm":
			if (gpus.some((gpu) => gpu.vendor === "amd")) return "";
			if (gpus.some((gpu) => gpu.vendor === "nvidia"))
				return "This Ollama build is compiled for AMD (ROCm), but the detected NVIDIA GPU is not ROCm-compatible, so it will fall back to CPU.";
			return "This Ollama build is compiled for AMD (ROCm), but no AMD GPU was found, so it will run on CPU.";
		case "cpu":
			if (gpus.some((gpu) => gpu.dedicated))
				return "This Ollama build ships without GPU acceleration, so the detected GPU will not be used and inference will run on CPU.";
			return "";
		default:
			return "";
	}
}

function joinWarning(main: string, extra: string): string {
	return extra ? `${main} ${extra}` : main;
}

export async function getHardwareRating(modelSizeRaw: string, clientUrl?: string) {
	const modelSize = parseModelSize(modelSizeRaw);
    let cpu = globalcpu;
    let mem = globalmem;
    let flags = globalflags
    console.log(clientUrl)
    if (clientUrl) {
        if (is52458(clientUrl)) {
            console.log("got it")
            const res = await defaultSecure52458Fetch(`${clientUrl}/sysinfo`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ modelSizeRaw }),
            });
            if (res.ok) {
                return await res.json()
            } else {
                void 0
            }
        }
    }

	// Refresh hardware snapshots so memory and GPU state are current.
	try {
		mem = await si.mem();
	} catch {
		// fall back to the cached snapshot
	}
	if (!globalgpu) {
		try {
			globalgpu = await si.graphics();
		} catch (err) {
			gpuDetectionFailed = true;
		}
	}

	const ramTotalGB = mem?.total ? mem.total / 1024 ** 3 : 0;
	const ramAvailGB = mem?.available ? mem.available / 1024 ** 3 : ramTotalGB;
	const hasAVX2 = !!flags && flags.includes("avx2");
	const hasAVX512 =
		!!flags && (flags.includes("avx512f") || flags.includes("avx512"));

	const score =
		(hasAVX2 ? 2 : 0) +
		(hasAVX512 ? 2 : 0) +
		(!!cpu && cpu.cores >= 8 ? 1 : 0) +
		(ramTotalGB >= 16 ? 1 : 0) +
		(cpu?.cache?.l3 ? cpu.cache.l3 / 10 : 0);

	const gpus = summarizeGpus();
	const backend = detectAccelerationBackend();
	const acceleratedGpu = pickAcceleratedGpu(backend, gpus);
	const mismatch = describeAccelerationMismatch(backend, gpus);

	// Look up GPU TFLOPS for performance scoring
	const gpuTflops = acceleratedGpu
		? lookupGpuTflops(acceleratedGpu.model)
		: null;

	// Try nvidia-smi for real-time free VRAM (best-effort, fast)
	let effectiveVramGB = acceleratedGpu?.vramGB ?? null;
	let effectiveVramFreeGB = acceleratedGpu?.vramFreeGB ?? null;
	if (acceleratedGpu?.dedicated && acceleratedGpu.vendor === "nvidia") {
		const freeVramMB = await queryNvidiaSmiFreeVram();
		if (freeVramMB !== null) {
			effectiveVramFreeGB = freeVramMB / 1024;
		}
	}

	const base = {
		modelSizeRaw,
		modelSizeB: modelSize,
		cpu: cpu?.brand ?? "Unknown",
		cores: cpu?.cores ?? 0,
		ramGB: formatMemoryGB(ramTotalGB),
		ramAvailGB: formatMemoryGB(ramAvailGB),
		avx2: hasAVX2,
		avx512: hasAVX512,
		gpu: acceleratedGpu ? describeGpu(acceleratedGpu) : null,
		gpuVendor: acceleratedGpu ? acceleratedGpu.vendor : null,
		vramGB: effectiveVramGB,
		vramFreeGB: effectiveVramFreeGB,
		gpuTflops,
		acceleration: backend,
		gpuDetectionError: gpuDetectionFailed,
		performance: null as PerformanceTierInfo | null,
	};

	if (!isFinite(modelSize) || modelSize <= 0) {
		return {
			...base,
			warning: `Could not estimate the requirements for ${modelSizeRaw}. Check the model's size before downloading.`,
		};
	}

	const estGB = estimateModelMemoryGB(modelSize);

	// Use free VRAM if available, fall back to total VRAM.
	// total VRAM is always safe as an upper bound; free VRAM gives
	// a more accurate picture when other apps are using the GPU.
	const dedicatedVramGB =
		acceleratedGpu?.dedicated && effectiveVramFreeGB
			? effectiveVramFreeGB
			: acceleratedGpu?.dedicated && effectiveVramGB
				? effectiveVramGB
				: 0;
	const usableTotalGB = ramTotalGB * 0.95 + dedicatedVramGB;
	const usableNowGB = ramAvailGB + dedicatedVramGB;

	const perfTier = getPerformanceTier(
		modelSize,
		score,
		gpuTflops,
		dedicatedVramGB,
		estGB,
	);

	// Nothing can hold it, even by offloading to the GPU.
	if (modelSize > 90 || estGB > usableTotalGB) {
		const capacity =
			dedicatedVramGB > 0
				? `${formatMemoryGB(dedicatedVramGB)} GB VRAM + ${formatMemoryGB(ramTotalGB)} GB RAM`
				: `${formatMemoryGB(ramTotalGB)} GB RAM`;
		return {
			...base,
			performance: perfTier,
			warning: joinWarning(
				`${modelSizeRaw} needs roughly ${formatMemoryGB(estGB)} GB of memory, but this PC only has ${capacity}. It will not fit. Try a smaller model.`,
				mismatch,
			),
		};
	}

	// It fits entirely in the GPU's dedicated VRAM - the best case.
	if (dedicatedVramGB > 0 && estGB <= dedicatedVramGB * 0.95) {
		const tflopsNote = gpuTflops
			? ` (~${gpuTflops} TFLOPS)`
			: "";
		return {
			...base,
			performance: perfTier,
			warning: joinWarning(
				`${modelSizeRaw} should fit entirely in your GPU (needs ~${formatMemoryGB(estGB)} GB; ~${formatMemoryGB(dedicatedVramGB)} GB VRAM)${tflopsNote}. It should run fast.`,
				mismatch,
			),
		};
	}

	// Not enough free memory at the moment (but it would fit if idle).
	if (estGB > usableNowGB) {
		return {
			...base,
			performance: perfTier,
			warning: joinWarning(
				`${modelSizeRaw} needs roughly ${formatMemoryGB(estGB)} GB, but only ${formatMemoryGB(usableNowGB)} GB is free right now. It may load very slowly or fail. Close other apps or use a smaller model.`,
				mismatch,
			),
		};
	}

	// Bigger than VRAM: Ollama splits layers between GPU and RAM.
	if (dedicatedVramGB > 0) {
		const tflopsNote = gpuTflops
			? ` (~${gpuTflops} TFLOPS)`
			: "";
		return {
			...base,
			performance: perfTier,
			warning: joinWarning(
				`${modelSizeRaw} should fit by offloading layers between your GPU (~${formatMemoryGB(dedicatedVramGB)} GB VRAM)${tflopsNote} and system RAM (needs ~${formatMemoryGB(estGB)} GB). Expect good performance, a little slower than running fully on the GPU.`,
				mismatch,
			),
		};
	}

	// Shared-memory GPU (Apple Silicon / integrated) or unknown - accelerated.
	if (acceleratedGpu) {
		return {
			...base,
			performance: perfTier,
			warning: joinWarning(
				`${modelSizeRaw} should fit in system memory (needs ~${formatMemoryGB(estGB)} GB; ${formatMemoryGB(ramAvailGB)} GB free) and will use GPU acceleration (${describeGpu(acceleratedGpu)}) for faster inference.`,
				mismatch,
			),
		};
	}

	// CPU only.
	return {
		...base,
		performance: perfTier,
		warning: joinWarning(
			`${modelSizeRaw} should fit in system memory (needs ~${formatMemoryGB(estGB)} GB; ${formatMemoryGB(ramAvailGB)} GB free). It will run on CPU and should ${describeSpeed(modelSize, score)}`,
			mismatch,
		),
	};
}
