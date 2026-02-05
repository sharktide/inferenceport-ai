import * as path from 'path';
import * as fs from 'fs/promises';
import { createWriteStream } from 'fs';
import * as os from 'os';
import { githubFetch } from './github-fetch.js';
import { unzipFile } from './unzip.js';
import { untgzStream } from './untgz.js';
import { ElectronOllamaServer } from './server.js';
import { Transform, Readable } from 'stream';
import { pipeline } from 'stream/promises';
export { ElectronOllamaServer };
export class ElectronOllama {
    constructor(config) {
        this.server = null;
        this.config = {
            directory: 'electron-ollama',
            ...config,
        };
    }
    /**
     * Get the current platform configuration
     */
    currentPlatformConfig() {
        const platform = os.platform();
        const arch = os.arch();
        let osType;
        let architecture;
        // Map platform
        switch (platform) {
            case 'win32':
                osType = 'windows';
                break;
            case 'darwin':
                osType = 'darwin';
                break;
            case 'linux':
                osType = 'linux';
                break;
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }
        // Map architecture
        switch (arch) {
            case 'arm64':
                architecture = 'arm64';
                break;
            case 'x64':
                architecture = 'amd64';
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
    getAssetName(platformConfig) {
        const { os, arch: architecture } = platformConfig;
        switch (os) {
            case 'windows':
                return `ollama-windows-${architecture}.zip`;
            case 'darwin':
                return 'ollama-darwin.tgz';
            case 'linux':
                return `ollama-linux-${architecture}.tgz`;
        }
    }
    /**
     * Get metadata for a specific version ('latest' by default) and platform
     */
    async getMetadata(version = 'latest', platformConfig = this.currentPlatformConfig()) {
        const { os, arch: architecture } = platformConfig;
        const releaseUrlPath = version === 'latest' ? `latest` : `tags/${version}`;
        const gitHubResponse = await githubFetch(`https://api.github.com/repos/ollama/ollama/releases/${releaseUrlPath}`, this.config.githubToken);
        const releaseData = await gitHubResponse.json();
        const assetName = this.getAssetName(platformConfig);
        const asset = releaseData.assets.find((asset) => asset.name === assetName);
        if (!asset) {
            throw new Error(`${os}-${architecture} is not supported by Ollama ${releaseData.tag_name}`);
        }
        return {
            digest: asset.digest,
            size: asset.size,
            sizeMB: (asset.size / 1024 / 1024).toFixed(1),
            fileName: asset.name,
            contentType: asset.content_type,
            version: releaseData.tag_name,
            downloads: asset.download_count,
            downloadUrl: asset.browser_download_url,
            releaseUrl: releaseData.html_url,
            body: releaseData.body,
        };
    }
    /**
     * Download Ollama for the specified version ('latest' by default) and platform
     */
    async download(version = 'latest', platformConfig = this.currentPlatformConfig(), { log } = {}) {
        const metadata = await this.getMetadata(version, platformConfig);
        const versionDir = this.getBinPath(metadata.version, platformConfig);
        // 1. Create directory if it doesn't exist
        log?.(0, 'Creating directory');
        await fs.mkdir(versionDir, { recursive: true });
        // 2. Download the file
        log?.(0, `Downloading ${metadata.fileName} (${metadata.sizeMB}MB)`);
        const response = await fetch(metadata.downloadUrl);
        // Create a progress-tracking transform stream that works with Web API streams
        let downloadedBytes = 0;
        const totalBytes = metadata.size; // this is estimate from metadata
        let lastLoggedPercent = 0;
        const progressStream = new Transform({
            transform(chunk, _encoding, callback) {
                downloadedBytes += chunk.length;
                // Log progress in 1% increments
                const currentPercent = Math.floor((downloadedBytes / totalBytes) * 100);
                if (currentPercent > lastLoggedPercent) {
                    if (currentPercent < 100) {
                        log?.(currentPercent, `Downloading ${metadata.fileName} (${(downloadedBytes / 1024 / 1024).toFixed(1)}MB / ${metadata.sizeMB}MB) ${currentPercent}%`);
                    }
                    else {
                        log?.(100, `Extracting ${metadata.fileName} (${metadata.sizeMB}MB)`);
                    }
                    lastLoggedPercent = currentPercent;
                }
                // Pass the chunk through unchanged
                callback(null, chunk);
            }
        });
        // Convert Web API ReadableStream to Node.js stream using Readable.fromWeb()
        if (!response.body) {
            throw new Error('Response body is not readable');
        }
        //@ts-ignore
        const nodeStream = Readable.fromWeb(response.body);
        nodeStream.pipe(progressStream);
        // 3. Extract the archive
        if (metadata.contentType === 'application/zip') {
            // For zip files, stream directly to file then extract
            const filePath = path.join(versionDir, metadata.fileName);
            const writeStream = createWriteStream(filePath);
            // Use pipeline to handle the entire stream chain with automatic promise handling
            await pipeline(progressStream, writeStream);
            // Now extract the downloaded file
            await unzipFile(filePath, versionDir, true);
        }
        else if (['application/x-gtar', 'application/x-tar', 'application/x-gzip', 'application/tar', 'application/gzip', 'application/x-tgz'].includes(metadata.contentType)) {
            // For tar archives, stream directly to extraction
            await untgzStream(progressStream, versionDir);
        }
        else {
            throw new Error(`The Ollama asset type ${metadata.contentType} is not supported`);
        }
        log?.(100, `Extracted archive ${metadata.fileName}`);
        // 4. Verify checksum
    }
    /**
     * Check if a version is downloaded for the given platform configuration
     */
    async isDownloaded(version, platformConfig = this.currentPlatformConfig()) {
        const binPath = this.getBinPath(version, platformConfig);
        const executableName = this.getExecutableName(platformConfig);
        return fs.access(path.join(binPath, executableName)).then(() => true).catch(() => false);
    }
    /**
     * List all downloaded versions for the given platform configuration
     */
    async downloadedVersions(platformConfig = this.currentPlatformConfig()) {
        let versions = [];
        try {
            versions = await fs.readdir(path.join(this.config.basePath, this.config.directory));
        }
        catch {
            return []; // directory does not exist - nothing to list
        }
        const downloaded = await Promise.all(versions.map((version) => this.isDownloaded(version, platformConfig)));
        return versions.filter((_version, index) => downloaded[index]);
    }
    /**
     * Get the path to the directory for the given version and platform configuration
     */
    getBinPath(version, platformConfig = this.currentPlatformConfig()) {
        return path.join(this.config.basePath, this.config.directory, version, platformConfig.os, platformConfig.arch);
    }
    /**
     * Get the name of the executable for the given platform configuration
     */
    getExecutableName(platformConfig) {
        switch (platformConfig.os) {
            case 'windows':
                return 'ollama.exe';
            case 'darwin':
                return 'ollama';
            case 'linux':
                return 'bin/ollama';
        }
    }
    /**
     * Start serving Ollama with the specified version and wait until it is running
     */
    async serve(version, { serverLog, downloadLog, timeoutSec = 5 } = {}) {
        const platformConfig = this.currentPlatformConfig();
        const binPath = this.getBinPath(version, platformConfig);
        const intervalMs = 100;
        const intervalCount = Math.ceil(timeoutSec * 1000 / intervalMs);
        // Ensure the binary exists
        if (!await this.isDownloaded(version, platformConfig)) {
            await this.download(version, platformConfig, { log: downloadLog || (() => { }) });
        }
        this.server = new ElectronOllamaServer({
            binPath,
            log: serverLog || (() => { }),
        });
        this.server.start(this.getExecutableName(platformConfig));
        // Wait for the server to start in 100ms intervals
        for (let i = 0; i < intervalCount; i++) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
            if (await this.isRunning()) {
                return;
            }
        }
        throw new Error(`Ollama server failed to start in ${timeoutSec}s`);
    }
    /**
     * Get the server instance started by serve()
     */
    getServer() {
        return this.server || null;
    }
    /**
     * Check if Ollama is running
     */
    async isRunning() {
        try {
            const response = await fetch('http://localhost:11434');
            const text = await response.text();
            return text.includes('Ollama is running');
        }
        catch {
            return false;
        }
    }
}
// Export default instance
export default ElectronOllama;
//# sourceMappingURL=index.js.map