import * as path from "path";
import * as fs from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import * as os from "os";
import { githubFetch } from "./github-fetch.js";
import { unzipFile } from "./unzip.js";
import { untgzStream } from "./untgz.js";
import type {
	ElectronOllamaConfig,
	OllamaServerConfig,
	PlatformConfig,
	OllamaAssetMetadata,
	GitHubRelease,
	SpecificVersion,
	Version,
} from "./types.js";
import { ElectronOllamaServer } from "./server.js";
import { Transform, Readable } from "stream";
import { pipeline } from "stream/promises";
import { spawn } from "child_process";

export type {
	ElectronOllamaConfig,
	OllamaServerConfig,
	PlatformConfig,
	OllamaAssetMetadata,
	SpecificVersion,
	Version,
};
export { ElectronOllamaServer };

export class ElectronOllama {
	private config: ElectronOllamaConfig;
	private server: ElectronOllamaServer | null = null;

	constructor(config: ElectronOllamaConfig) {
		this.config = {
			directory: "electron-ollama",
			...config,
		};
	}

	/**
	 * Get the current platform configuration
	 */
	public currentPlatformConfig(): PlatformConfig {
		const platform = os.platform();
		const arch = os.arch();

		let osType: "windows" | "darwin" | "linux";
		let architecture: "arm64" | "amd64";

		// Map platform
		switch (platform) {
			case "win32":
				osType = "windows";
				break;
			case "darwin":
				osType = "darwin";
				break;
			case "linux":
				osType = "linux";
				break;
			default:
				throw new Error(`Unsupported platform: ${platform}`);
		}

		// Map architecture
		switch (arch) {
			case "arm64":
				architecture = "arm64";
				break;
			case "x64":
				architecture = "amd64";
				break;
			default:
				throw new Error(`Unsupported architecture: ${arch}`);
		}

		return {
			os: osType,
			arch: architecture,
		};
	}

	/**
	 * Get the name of the asset for the given platform configuration (e.g. "ollama-windows-amd64.zip" or "ollama-darwin.tgz")
	 */
	public getAssetName(platformConfig: PlatformConfig): string {
		const { os, arch: architecture, variant } = platformConfig as PlatformConfig & {
			variant?: "rocm" | "cuda" | "jetpack5" | "jetpack6";
		};

		const v = variant ? variant.toString().toLowerCase() : undefined;

		switch (os) {
			case "windows":
				if (v === "rocm") return `ollama-windows-${architecture}-rocm.zip`;
				return `ollama-windows-${architecture}.zip`;
			case "darwin":
				return "ollama-darwin.tgz";
			case "linux":
				if (v === "rocm") return `ollama-linux-${architecture}-rocm.tar.zst`;
				if (v && v.startsWith("jetpack"))
					return `ollama-linux-${architecture}-${v}.tar.zst`;
				return `ollama-linux-${architecture}.tar.zst`;
		}
	}

	/**
	 * Get metadata for a specific version ('latest' by default) and platform
	 */
	public async getMetadata(
		version: Version = "latest",
		platformConfig: PlatformConfig = this.currentPlatformConfig(),
	): Promise<OllamaAssetMetadata> {
		const { os, arch: architecture } = platformConfig;

		const releaseUrlPath =
			version === "latest" ? `latest` : `tags/${version}`;
		console.log(
			`Fetching Ollama release info from GitHub: ${releaseUrlPath}`,
		);
		const gitHubResponse = await githubFetch(
			`https://api.github.com/repos/ollama/ollama/releases/${releaseUrlPath}`,
			this.config.githubToken,
		);
		const releaseData = (await gitHubResponse.json()) as GitHubRelease;
		const assetName = this.getAssetName(platformConfig);
		const asset = releaseData.assets.find(
			(asset) => asset.name === assetName,
		);

		if (!asset) {
			throw new Error(
				`${os}-${architecture} is not supported by Ollama ${releaseData.tag_name}`,
			);
		}

		return {
			digest: asset.digest,
			size: asset.size,
			sizeMB: (asset.size / 1024 / 1024).toFixed(1),
			fileName: asset.name,
			contentType: asset.content_type,
			version: releaseData.tag_name as SpecificVersion,
			downloads: asset.download_count,
			downloadUrl: asset.browser_download_url,
			releaseUrl: releaseData.html_url,
			body: releaseData.body,
		};
	}

	public async download(
		version: Version = "latest",
		platformConfig: PlatformConfig = this.currentPlatformConfig(),
		{
			log,
		}: {
			log?: (percent: number, message: string) => void;
		} = {},
	): Promise<void> {
		const metadata = await this.getMetadata(version, platformConfig);
		const versionDir = this.getBinPath(metadata.version, platformConfig);

		log?.(0, "Creating directory");
		await fs.mkdir(versionDir, { recursive: true });

		log?.(0, `Downloading ${metadata.fileName} (${metadata.sizeMB}MB)`);

		const response = await fetch(metadata.downloadUrl);
		if (!response.body) {
			throw new Error("Response body is not readable");
		}

		// ----- progress tracking -----
		let downloadedBytes = 0;
		const totalBytes =
			Number(response.headers.get("content-length")) || metadata.size;
		let lastPercent = 0;

		const progressStream = new Transform({
			transform(chunk, _enc, cb) {
				downloadedBytes += chunk.length;

				const percent = Math.floor(
					(downloadedBytes / totalBytes) * 100,
				);
				if (percent > lastPercent) {
					if (percent < 100) {
						log?.(
							percent,
							`Downloading ${metadata.fileName} (${(downloadedBytes / 1024 / 1024).toFixed(1)}MB / ${metadata.sizeMB}MB)`,
						);
					} else {
						log?.(100, `Extracting ${metadata.fileName}`);
					}
					lastPercent = percent;
				}

				cb(null, chunk);
			},
		});

		// Web → Node stream
		// @ts-ignore
		const nodeStream = Readable.fromWeb(response.body);

		const filePath = path.join(versionDir, metadata.fileName);
		const fileName = metadata.fileName;

		const isZip = fileName.endsWith(".zip");
		const isTgz = fileName.endsWith(".tgz") || fileName.endsWith(".tar.gz");
		const isTarZst = fileName.endsWith(".tar.zst");

		// ----- always download to disk first -----
		await pipeline(nodeStream, progressStream, createWriteStream(filePath));

		// ----- extraction -----
		if (isZip) {
			await unzipFile(filePath, versionDir, true);
		} else if (isTgz) {
			await untgzStream(createReadStream(filePath), versionDir);
		} else if (isTarZst) {
			await this.extractTarZst(filePath, versionDir);
		} else {
			throw new Error(`Unsupported archive format: ${fileName}`);
		}

		// Linux permissions fix
		if (platformConfig.os === "linux") {
			try {
				await fs.chmod(path.join(versionDir, "ollama"), 0o755);
			} catch {}
		}

		log?.(100, `Extracted archive ${metadata.fileName}`);
	}

	public async extractTarZst(file: string, outDir: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const proc = spawn("tar", ["-xvf", file, "-C", outDir]);

			proc.on("error", reject);
			proc.on("close", (code) => {
				if (code === 0) resolve();
				else reject(new Error(`tar exited with ${code}`));
			});
		});
	}

	/**
	 * Check if a version is downloaded for the given platform configuration
	 */
	public async isDownloaded(
		version: SpecificVersion,
		platformConfig: PlatformConfig = this.currentPlatformConfig(),
	): Promise<boolean> {
		const binPath = this.getBinPath(version, platformConfig);
		const executableName = this.getExecutableName(platformConfig);
		return fs
			.access(path.join(binPath, executableName))
			.then(() => true)
			.catch(() => false);
	}

	/**
	 * List all downloaded versions for the given platform configuration
	 */
	public async downloadedVersions(
		platformConfig: PlatformConfig = this.currentPlatformConfig(),
	): Promise<string[]> {
		let versions: string[] = [];
		try {
			versions = await fs.readdir(
				path.join(this.config.basePath, this.config.directory!),
			);
		} catch {
			return []; // directory does not exist - nothing to list
		}

		const downloaded = await Promise.all(
			versions.map((version) =>
				this.isDownloaded(version as SpecificVersion, platformConfig),
			),
		);
		return versions.filter((_version, index) => downloaded[index]);
	}

	/**
	 * Get the path to the directory for the given version and platform configuration
	 */
	public getBinPath(
		version: SpecificVersion,
		platformConfig: PlatformConfig = this.currentPlatformConfig(),
	): string {
		const parts: string[] = [
			this.config.basePath,
			this.config.directory!,
			version,
			platformConfig.os,
			platformConfig.arch,
		];

		if ((platformConfig as PlatformConfig & { variant?: string }).variant) {
			parts.push((platformConfig as PlatformConfig & { variant?: string }).variant!);
		}

		return path.join(...parts);
	}

	/**
	 * Get the name of the executable for the given platform configuration
	 */
	public getExecutableName(platformConfig: PlatformConfig): string {
		switch (platformConfig.os) {
			case "windows":
				return "ollama.exe";
			case "darwin":
				return "ollama";
			case "linux":
				return "bin/ollama";
		}
	}

	/**
	 * Start serving Ollama with the specified version and wait until it is running
	 */
	public async serve(
		version: SpecificVersion,
		{
			serverLog,
			downloadLog,
			timeoutSec = 5,
		}: {
			serverLog?: (message: string) => void;
			downloadLog?: (percent: number, message: string) => void;
			timeoutSec?: number;
		} = {},
	): Promise<void> {
		const platformConfig = this.currentPlatformConfig();
		const binPath = this.getBinPath(version, platformConfig);

		const intervalMs = 100;
		const intervalCount = Math.ceil((timeoutSec * 1000) / intervalMs);

		// Ensure the binary exists
		if (!(await this.isDownloaded(version, platformConfig))) {
			await this.download(version, platformConfig, {
				log: downloadLog || (() => {}),
			});
		}

		this.server = new ElectronOllamaServer({
			binPath,
			log: serverLog || (() => {}),
		});
		this.server.start(this.getExecutableName(platformConfig));

		// Wait for the server to start in 100ms intervals
		for (let i = 0; i < intervalCount; i++) {
			await new Promise((resolve) => setTimeout(resolve, intervalMs));

			if (await this.isRunning()) {
				return;
			}
		}

		throw new Error(`Ollama server failed to start in ${timeoutSec}s`);
	}

	/**
	 * Get the server instance started by serve()
	 */
	public getServer(): ElectronOllamaServer | null {
		return this.server || null;
	}

	/**
	 * Check if Ollama is running
	 */
	public async isRunning(): Promise<boolean> {
		try {
			const response = await fetch("http://localhost:11434");
			const text = await response.text();
			return text.includes("Ollama is running");
		} catch {
			return false;
		}
	}
}

// Export default instance
export default ElectronOllama;
