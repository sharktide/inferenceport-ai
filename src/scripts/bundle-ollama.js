import { resolve, join, dirname } from "path";
import { readdir, rename, rm, unlink, lstat, rmdir } from "fs/promises";
import { ElectronOllama } from "./bundler/index.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function rimrafLike(path) {
	const stat = await lstat(path);
	if (stat.isDirectory() && !stat.isSymbolicLink()) {
		const entries = await readdir(path);
		await Promise.all(entries.map((e) => rimrafLike(join(path, e))));
		await rmdir(path);
	} else {
		await unlink(path); // handles files & symlinks
	}
}

async function moveBinariesToRoot(version, os, arch) {
	const vendorRoot = resolve(__dirname, "../vendor/electron-ollama");
	const sourceDir = join(vendorRoot, version, os, arch);

	try {
		const files = await readdir(sourceDir);
		for (const file of files) {
			const src = join(sourceDir, file);
			const dest = join(vendorRoot, file);
			await rename(src, dest);
		}
		console.log(`Moved binaries from ${sourceDir} to ${vendorRoot}`);
	} catch (err) {
		console.error(`Error moving binaries: ${err.message}`);
	}
}
const createProgressBarLogger = () => {
	let lastLength = 0;

	return (percent, message) => {
		const barLength = 30; // characters
		const filledLength = Math.round((percent / 100) * barLength);
		const emptyLength = barLength - filledLength;

		const bar = `[${"=".repeat(filledLength)}${" ".repeat(emptyLength)}]`;
		const line = `${bar} ${percent.toString().padStart(3)}% ${message}`;

		process.stdout.write(
			"\r" + line + " ".repeat(Math.max(0, lastLength - line.length)),
		);
		lastLength = line.length;

		if (percent === 100) process.stdout.write("\n");
	};
};
async function removeCudaFolders() {
	const vendorRoot = resolve(__dirname, "../vendor/electron-ollama");
	const cudaVersions = [
		"lib/ollama/cuda_v12",
		"lib/ollama/cuda_v13",
		"lib/ollama/mix_cuda_v13",
	];

	for (const version of cudaVersions) {
		const cudaPath = join(vendorRoot, version);
		try {
			await rimrafLike(cudaPath);
			console.log(`Removed ${version} folder from ${vendorRoot}`);
		} catch (err) {
			console.warn(`Could not remove ${version}: ${err.message}`);
		}
	}
}

async function bundleOllama() {
	const platformMap = { win32: "windows", darwin: "darwin", linux: "linux" };
	const archMap = { x64: "amd64", arm64: "arm64" };

	const os = platformMap["linux"];
	const arch = archMap[process.arch];

	if (!os || !arch) {
		console.error(
			`Unsupported platform: ${process.platform} ${process.arch}`,
		);
		process.exit(1);
	}

	const eo = new ElectronOllama({
		basePath: resolve(__dirname, "../vendor"),
		githubToken: process.env.GH_TOKEN,
	});
	const metadata = await eo.getMetadata("latest");
	await eo.download(
		metadata.version,
		{ os, arch },
		{ log: createProgressBarLogger() },
	);

	await moveBinariesToRoot(metadata.version, os, arch);

	if (process.env.GPU_ONLY === "true") {
		console.log(
			"GPU_ONLY build detected — keeping CUDA binaries, zip-only packaging",
		);
	} else {
		await removeCudaFolders();
	}

	try {
		await rm(
			`${resolve(__dirname, `../vendor/electron-ollama`)}/ollama-linux-${arch}.tar.zst`,
			{ recursive: true, force: true },
		);
		console.log(
			`Cleaned up versioned folder for ${metadata.version} after moving binaries`,
		);
	} catch {
		void 0;
	}

	console.log(`Bundled Ollama ${metadata.version} for ${os}-${arch}`);
}

bundleOllama();
