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
    let cpu = globalcpu;
    let mem = globalmem;
    let flags = globalflags
    console.log(clientUrl)
    if (clientUrl) {
        if (is52458(clientUrl)) {
            console.log("got it")
            const res = await fetch(`${clientUrl}/sysinfo`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${await issueProxyToken()}`
                },
                body: JSON.stringify({ modelSizeRaw })
            })
            if (res.ok) {
                return await res.json()
            } else {
                void 0
            }
        }
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
