import type { ElectronOllamaConfig, OllamaServerConfig, PlatformConfig, OllamaAssetMetadata, SpecificVersion, Version } from './types.js';
import { ElectronOllamaServer } from './server.js';
export type { ElectronOllamaConfig, OllamaServerConfig, PlatformConfig, OllamaAssetMetadata, SpecificVersion, Version };
export { ElectronOllamaServer };
export declare class ElectronOllama {
    private config;
    private server;
    constructor(config: ElectronOllamaConfig);
    /**
     * Get the current platform configuration
     */
    currentPlatformConfig(): PlatformConfig;
    /**
     * Get the name of the asset for the given platform configuration (e.g. "ollama-windows-amd64.zip" or "ollama-darwin.tgz")
     */
    getAssetName(platformConfig: PlatformConfig): string;
    /**
     * Get metadata for a specific version ('latest' by default) and platform
     */
    getMetadata(version?: Version, platformConfig?: PlatformConfig): Promise<OllamaAssetMetadata>;
    /**
     * Download Ollama for the specified version ('latest' by default) and platform
     */
    download(version?: Version, platformConfig?: PlatformConfig, { log }?: {
        log?: (percent: number, message: string) => void;
    }): Promise<void>;
    /**
     * Check if a version is downloaded for the given platform configuration
     */
    isDownloaded(version: SpecificVersion, platformConfig?: PlatformConfig): Promise<boolean>;
    /**
     * List all downloaded versions for the given platform configuration
     */
    downloadedVersions(platformConfig?: PlatformConfig): Promise<string[]>;
    /**
     * Get the path to the directory for the given version and platform configuration
     */
    getBinPath(version: SpecificVersion, platformConfig?: PlatformConfig): string;
    /**
     * Get the name of the executable for the given platform configuration
     */
    getExecutableName(platformConfig: PlatformConfig): string;
    /**
     * Start serving Ollama with the specified version and wait until it is running
     */
    serve(version: SpecificVersion, { serverLog, downloadLog, timeoutSec }?: {
        serverLog?: (message: string) => void;
        downloadLog?: (percent: number, message: string) => void;
        timeoutSec?: number;
    }): Promise<void>;
    /**
     * Get the server instance started by serve()
     */
    getServer(): ElectronOllamaServer | null;
    /**
     * Check if Ollama is running
     */
    isRunning(): Promise<boolean>;
}
export default ElectronOllama;
//# sourceMappingURL=index.d.ts.map