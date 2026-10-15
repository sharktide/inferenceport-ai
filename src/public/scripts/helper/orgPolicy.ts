/** Helpers for showing organization-policy results in the renderer. */

/** Electron wraps errors thrown in the main process as "Error invoking remote method 'x': Error: message". */
export function cleanIpcError(err: unknown): string {
	const raw = err instanceof Error ? err.message : String(err ?? "");
	return raw.replace(/^Error invoking remote method '[^']*':\s*/i, "").replace(/^(OrgPolicyError|Error):\s*/i, "");
}

let policyPromise: Promise<OrgPolicyView | null> | null = null;

/** Current organization policy, or null when the bridge is unavailable (web fallback without org support). */
export function loadOrgPolicy(refresh = false): Promise<OrgPolicyView | null> {
	if (!policyPromise || refresh) {
		policyPromise = (window.org?.getPolicy?.() ?? Promise.resolve(null)).catch(() => null);
	}
	return policyPromise;
}

export function onOrgPolicyChange(callback: (view: OrgPolicyView) => void): void {
	try {
		window.org?.onPolicyChange?.((view) => {
			policyPromise = Promise.resolve(view);
			callback(view);
		});
	} catch {
		void 0;
	}
}
