import si from "systeminformation";
import { app } from "electron";
import fs from "fs";
import path from "path";
import { getSession } from "../auth.js";
import { defaultSecure52458Fetch } from "./proxy52458Client.js";

import type { Systeminformation } from "systeminformation";

export let globalcpu: Systeminformation.CpuData | undefined;
export let globalflags: String | undefined;
export let globalmem: Systeminformation.MemData | undefined;
export let globalgpu: Systeminformation.GraphicsData | undefined;

let hardwareInfoPromise: Promise<void> | null = null;

export async function initHardwareInfo(): Promise<void> {
	if (!hardwareInfoPromise) {
		hardwareInfoPromise = (async () => {
			[globalcpu, globalmem, globalflags, globalgpu] = await Promise.all([
				si.cpu(),
				si.mem(),
				si.cpuFlags(),
				si.graphics().catch(() => undefined),
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
	dedicated: boolean;
}

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

		gpus.push({
			vendor,
			label: vendorRaw || model,
			model,
			vramGB,
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
		} catch {
			// GPU detection is best-effort
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

	const base = {
		modelSizeRaw,
		modelSizeB: modelSize,
		cpu: cpu?.brand ?? "Unknown",
		cores: cpu?.cores ?? 0,
		ramGB: formatMemoryGB(ramTotalGB),
		avx2: hasAVX2,
		avx512: hasAVX512,
		gpu: acceleratedGpu ? describeGpu(acceleratedGpu) : null,
		gpuVendor: acceleratedGpu ? acceleratedGpu.vendor : null,
		vramGB: acceleratedGpu?.vramGB ?? null,
		acceleration: backend,
	};

	if (!isFinite(modelSize) || modelSize <= 0) {
		return {
			...base,
			warning: `ℹ️ Could not estimate the requirements for ${modelSizeRaw}. Check the model's size before downloading.`,
		};
	}

	const estGB = estimateModelMemoryGB(modelSize);
	const dedicatedVramGB =
		acceleratedGpu?.dedicated && acceleratedGpu.vramGB
			? acceleratedGpu.vramGB
			: 0;
	const usableTotalGB = ramTotalGB * 0.95 + dedicatedVramGB;
	const usableNowGB = ramAvailGB + dedicatedVramGB;

	// Nothing can hold it, even by offloading to the GPU.
	if (modelSize > 90 || estGB > usableTotalGB) {
		const capacity =
			dedicatedVramGB > 0
				? `${formatMemoryGB(dedicatedVramGB)} GB VRAM + ${formatMemoryGB(ramTotalGB)} GB RAM`
				: `${formatMemoryGB(ramTotalGB)} GB RAM`;
		return {
			...base,
			warning: joinWarning(
				`🚫 ${modelSizeRaw} needs roughly ${formatMemoryGB(estGB)} GB of memory, but this PC only has ${capacity}. It will not fit. Try a smaller model.`,
				mismatch,
			),
		};
	}

	// It fits entirely in the GPU's dedicated VRAM - the best case.
	if (dedicatedVramGB > 0 && estGB <= dedicatedVramGB * 0.95) {
		return {
			...base,
			warning: joinWarning(
				`✅ ${modelSizeRaw} should fit entirely in your GPU (needs ~${formatMemoryGB(estGB)} GB; ~${formatMemoryGB(dedicatedVramGB)} GB VRAM). It should run fast.`,
				mismatch,
			),
		};
	}

	// Not enough free memory at the moment (but it would fit if idle).
	if (estGB > usableNowGB) {
		return {
			...base,
			warning: joinWarning(
				`⚠️ ${modelSizeRaw} needs roughly ${formatMemoryGB(estGB)} GB, but only ${formatMemoryGB(usableNowGB)} GB is free right now. It may load very slowly or fail. Close other apps or use a smaller model.`,
				mismatch,
			),
		};
	}

	// Bigger than VRAM: Ollama splits layers between GPU and RAM.
	if (dedicatedVramGB > 0) {
		return {
			...base,
			warning: joinWarning(
				`✅ ${modelSizeRaw} should fit by offloading layers between your GPU (~${formatMemoryGB(dedicatedVramGB)} GB VRAM) and system RAM (needs ~${formatMemoryGB(estGB)} GB). Expect good performance, a little slower than running fully on the GPU.`,
				mismatch,
			),
		};
	}

	// Shared-memory GPU (Apple Silicon / integrated) or unknown - accelerated.
	if (acceleratedGpu) {
		return {
			...base,
			warning: joinWarning(
				`✅ ${modelSizeRaw} should fit in system memory (needs ~${formatMemoryGB(estGB)} GB; ${formatMemoryGB(ramAvailGB)} GB free) and will use GPU acceleration (${describeGpu(acceleratedGpu)}) for faster inference.`,
				mismatch,
			),
		};
	}

	// CPU only.
	return {
		...base,
		warning: joinWarning(
			`✅ ${modelSizeRaw} should fit in system memory (needs ~${formatMemoryGB(estGB)} GB; ${formatMemoryGB(ramAvailGB)} GB free). It will run on CPU and should ${describeSpeed(modelSize, score)}`,
			mismatch,
		),
	};
}
