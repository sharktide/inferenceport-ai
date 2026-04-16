import si from "systeminformation";
import { getSession } from "../auth.js";

import type { Systeminformation } from "systeminformation";

export let globalcpu: Systeminformation.CpuData | undefined;
export let globalflags: String | undefined;
export let globalmem: Systeminformation.MemData | undefined;

let hardwareInfoPromise: Promise<void> | null = null;

export async function initHardwareInfo(): Promise<void> {
	if (!hardwareInfoPromise) {
		hardwareInfoPromise = (async () => {
			[globalcpu, globalmem, globalflags] = await Promise.all([
				si.cpu(),
				si.mem(),
				si.cpuFlags(),
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

export async function getHardwareRating(modelSizeRaw: string, clientUrl?: string) {
	const modelSize = parseModelSize(modelSizeRaw);
	if (clientUrl && is52458(clientUrl)) {
		try {
			const res = await fetch(`${clientUrl}/sysinfo`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${await issueProxyToken()}`,
				},
				body: JSON.stringify({ modelSizeRaw }),
			});
			if (res.ok) {
				return await res.json();
			}
		} catch {
			void 0;
		}
	}

	try {
		await initHardwareInfo();
	} catch (err) {
		return {
			modelSizeRaw,
			modelSizeB: Number.isFinite(modelSize) ? modelSize : null,
			cpu: "unknown",
			cores: null,
			ramGB: null,
			avx2: false,
			avx512: false,
			warning:
				"⚠️ Unable to read system hardware info. Performance guidance may be inaccurate.",
			error: String((err as Error)?.message || err),
		};
	}

	const cpu = globalcpu;
	const mem = globalmem;
	const flags = globalflags;
	if (!cpu || !mem || !flags) {
		return {
			modelSizeRaw,
			modelSizeB: Number.isFinite(modelSize) ? modelSize : null,
			cpu: "unknown",
			cores: null,
			ramGB: null,
			avx2: false,
			avx512: false,
			warning:
				"⚠️ System hardware info is not available yet. Try again in a moment.",
		};
	}

	const ramGB = mem!.total / 1e9;
	const hasAVX2 = flags!.includes("avx2");
	const hasAVX512 = flags!.includes("avx512f") || flags!.includes("avx512");

	const score =
		(hasAVX2 ? 2 : 0) +
		(hasAVX512 ? 2 : 0) +
		(cpu!.cores >= 8 ? 1 : 0) +
		(ramGB >= 16 ? 1 : 0) +
		(cpu!.cache?.l3 ? cpu!.cache.l3 / 10 : 0);

	let warning = "";
	if (modelSize > 65) {
		return {
			modelSizeRaw,
			modelSizeB: modelSize,
			cpu: cpu!.brand,
			cores: cpu!.cores,
			ramGB: ramGB.toFixed(1),
			avx2: hasAVX2,
			avx512: hasAVX512,
			warning: `🚫 ${modelSizeRaw} is too large for most consumer hardware. Use a smaller model.`,
		};
	}

	if (modelSize <= 1) {
		warning = `✅ Your system should handle ${modelSizeRaw} models easily.`;
	} else if (modelSize <= 3) {
		warning =
			score >= 4
				? `✅ ${modelSizeRaw} should run fine on your system.`
				: `⚠️ ${modelSizeRaw} may be slow (>30s) on your system.`;
	} else if (modelSize <= 7) {
		warning =
			score >= 5
				? `✅ ${modelSizeRaw} should run with reasonable performance.`
				: `⚠️ ${modelSizeRaw} may respond slowly or exceed memory limits.`;
	} else {
		warning = `🚫 ${modelSizeRaw} is likely too large for your system. Consider using a smaller model.`;
	}

	return {
		modelSizeRaw,
		modelSizeB: modelSize,
		cpu: cpu!.brand,
		cores: cpu!.cores,
		ramGB: ramGB.toFixed(1),
		avx2: hasAVX2,
		avx512: hasAVX512,
		warning,
	};
}
