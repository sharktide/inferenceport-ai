import http from "http";
export declare function startProxyServer(port?: number, allowedUsers?: {
    email: string;
    role: string;
}[]): {
    server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
    destroy: typeof stopProxyServer;
};
export declare function stopProxyServer(): void;
export declare function startLogStreaming(event: Electron.IpcMainInvokeEvent): void;
export declare function stopLogStreaming(): void;
export declare function getServerLogs(): Promise<string>;
//# sourceMappingURL=server.d.ts.map