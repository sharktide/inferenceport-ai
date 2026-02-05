declare class AuthManager {
    private static instance;
    constructor();
    resolveAuth(redirect?: boolean): string;
    resolveSettings(redirect?: boolean): string;
    private renderUserIndicator;
    static getInstance(): AuthManager;
}
export default AuthManager;
//# sourceMappingURL=AuthManager.d.ts.map