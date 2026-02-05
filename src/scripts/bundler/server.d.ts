import type { OllamaServerConfig } from './types.js';
export declare class ElectronOllamaServer {
    private process;
    private binPath;
    private log;
    constructor(config: OllamaServerConfig);
    start(executableName: string): void;
    /**
     * Stop the Ollama server
     */
    stop(): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map