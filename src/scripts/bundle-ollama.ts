import { resolve, join, dirname } from "path";
import { readdir, rename, rm, unlink, lstat, rmdir, stat, mkdir, copyFile, access } from "fs/promises";
import { ElectronOllama } from "./bundler/index.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ALLOWED_VARIANTS = new Set([
    "cuda",
    "rocm",
    "jetpack5",
    "jetpack6",
]);

function sanitizeVariant(input?: string): string | undefined {
    if (!input) return undefined;

    const normalized = input.trim().toLowerCase();

    if (!ALLOWED_VARIANTS.has(normalized)) {
        console.warn(`Ignoring invalid OLLAMA_ACCELERATION: "${input}"`);
        return undefined;
    }

    return normalized;
}

async function rimrafLike(path: string) {
    const stats = await lstat(path);
    if (stats.isDirectory() && !stats.isSymbolicLink()) {
        const entries = await readdir(path);
        await Promise.all(entries.map(e => rimrafLike(join(path, e))));
        await rmdir(path);
    } else {
        await unlink(path);
    }
}

async function copyRecursive(src: string, dest: string) {
    const stats = await stat(src);
    if (stats.isDirectory()) {
        await mkdir(dest, { recursive: true });
        const entries = await readdir(src);
        for (const entry of entries) {
            await copyRecursive(join(src, entry), join(dest, entry));
        }
    } else {
        try {
            await access(dest);
        } catch {
            await copyFile(src, dest);
        }
    }
}

async function mergeOllamaLibs() {
    const vendorRoot = resolve(__dirname, "../vendor/electron-ollama");
    const target = join(vendorRoot, "lib/ollama");
    await mkdir(target, { recursive: true });

    const entries = await readdir(vendorRoot, { withFileTypes: true });
    const sources: string[] = [];

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const libPath = join(vendorRoot, entry.name, "lib/ollama");
        try {
            const s = await stat(libPath);
            if (s.isDirectory()) sources.push(libPath);
        } catch {}
    }

    sources.sort((a, b) => Number(a.includes("jetpack")) - Number(b.includes("jetpack")));

    for (const src of sources) {
        await copyRecursive(src, target);
        const parent = join(src, "..", "..");
        try {
            await rimrafLike(parent);
        } catch (err: any) {
            console.warn(`Failed to remove old folder ${parent}: ${err.message ?? err}`);
        }
    }

    console.log("✅ Merged all Ollama libs into:", target);
}

async function moveBinariesToRoot(version: string, os: string, arch: string, variant?: string) {
    const vendorRoot = resolve(__dirname, "../vendor/electron-ollama");
    const baseDir = join(vendorRoot, version, os, arch);

    async function moveFromDir(sourceDir: string) {
        try {
            const files = await readdir(sourceDir);
            for (const file of files) {
                const src = join(sourceDir, file);
                const dest = join(vendorRoot, file);
                try {
                    await rm(dest, { force: true, recursive: true });
                } catch {}
                await rename(src, dest);
            }
            console.log(`Moved binaries from ${sourceDir} to ${vendorRoot}`);
        } catch (err: any) {
            console.warn(`No files moved from ${sourceDir}: ${err.message ?? err}`);
        }
    }

    await moveFromDir(baseDir);

    if (variant) {
        const variantDir = join(baseDir, variant);
        await moveFromDir(variantDir);
    }
}

const createProgressBarLogger = () => {
    let lastLength = 0;
    return (percent: number, message: string) => {
        const barLength = 30;
        const filledLength = Math.round((percent / 100) * barLength);
        const emptyLength = barLength - filledLength;
        const bar = `[${"=".repeat(filledLength)}${" ".repeat(emptyLength)}]`;
        const line = `${bar} ${percent.toString().padStart(3)}% ${message}`;
        process.stdout.write("\r" + line + " ".repeat(Math.max(0, lastLength - line.length)));
        lastLength = line.length;
        if (percent === 100) process.stdout.write("\n");
    };
};

async function removeCudaFolders() {
    const vendorRoot = resolve(__dirname, "../vendor/electron-ollama");
    const cudaVersions = ["lib/ollama/cuda_v12", "lib/ollama/cuda_v13", "lib/ollama/mlx_cuda_v13"];
    for (const version of cudaVersions) {
        const cudaPath = join(vendorRoot, version);
        try {
            await rimrafLike(cudaPath);
            console.log(`Removed ${version} folder from ${vendorRoot}`);
        } catch (err: any) {
            console.warn(`Could not remove ${version}: ${err.message}`);
        }
    }
}

async function bundleOllama() {
    const platformMap = { win32: "windows", darwin: "darwin", linux: "linux" };
    const archMap = { x64: "amd64", arm64: "arm64" };
    //@ts-expect-error
    const os = platformMap[process.platform];
    //@ts-expect-error
    const arch = archMap[process.arch];
    if (!os || !arch) {
        console.error(`Unsupported platform: ${process.platform} ${process.arch}`);
        process.exit(1);
    }

    const eo = new ElectronOllama({ basePath: resolve(__dirname, "../vendor"), githubToken: process.env.GH_TOKEN });

    const envVariant = sanitizeVariant(process.env.OLLAMA_ACCELERATION);

    const platformConfig = envVariant ? { os, arch, variant: envVariant } : { os, arch };
    const metadata = await eo.getMetadata("latest", platformConfig);

    if (envVariant === "rocm" || (envVariant?.includes("jetpack"))) {
        const baseConfig = { os, arch };
        const baseMeta = await eo.getMetadata(metadata.version, baseConfig);
        console.log("BASE VERSION:", baseMeta.version);
        console.log("ROCM VERSION:", rocmMeta.version);

        await eo.download(baseMeta.version, baseConfig, { log: createProgressBarLogger() });

        if (envVariant === "rocm") {
            const rocmConfig = { os, arch, variant: "rocm" };
            const rocmMeta = await eo.getMetadata(baseMeta.version, rocmConfig).catch(() => eo.getMetadata("latest", rocmConfig));
            await eo.download(rocmMeta.version, rocmConfig, { log: createProgressBarLogger() });
            console.log("Downloaded ROCm")
            await moveBinariesToRoot(baseMeta.version, os, arch, "rocm");
            consols.log("Moved Binaries")
            try { await removeCudaFolders(); } catch {}
            console.log("Removed CUDA")
        } else if (envVariant?.includes("jetpack")) {
            const jetpackConfig = { os, arch, variant: envVariant };
            const jetpackMeta = await eo.getMetadata(baseMeta.version, jetpackConfig);
            await eo.download(jetpackMeta.version, jetpackConfig, { log: createProgressBarLogger() });
            if (envVariant === "jetpack5") {
                await moveBinariesToRoot(baseMeta.version, os, arch, "jetpack5");
            } else if (envVariant === "jetpack6") {
                await moveBinariesToRoot(baseMeta.version, os, arch, "jetpack6");
            } else {
                console.warn(`Unknown jetpack variant: ${envVariant}, skipping move`);
            }
            await removeCudaFolders()
        }
    } else {
        await eo.download(metadata.version, platformConfig, { log: createProgressBarLogger() });
        await moveBinariesToRoot(metadata.version, os, arch, envVariant);
        const accel = process.env.OLLAMA_ACCELERATION?.toLowerCase();

        if (accel !== "cuda") {
            try { await removeCudaFolders(); } catch {}
        }
    }

    await mergeOllamaLibs();

    try {
        await rm(`${resolve(__dirname, "../vendor/electron-ollama")}/ollama-linux-${arch}.tar.zst`, { recursive: true, force: true });
    } catch {}
    console.log(`Bundled Ollama ${metadata.version} for ${os}-${arch}`);
    console.log("==== FINAL VENDOR TREE ====");
    console.log(await readdir(vendorRoot, { withFileTypes: true }));
}

bundleOllama();

