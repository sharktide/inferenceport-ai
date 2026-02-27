import type { IpcMainInvokeEvent } from "electron";
import type {
	PullSection,
	PullChunk,
	PullProgress,
	ModelInfo,
} from "../types/index.types.js";
import { BrowserWindow } from "electron";
import { issueProxyToken } from "../auth.js";
import { is52458 } from "../utils.js";

function renderBar(completed = 0, total = 0, width = 20): string {
	if (!total) return "[                  ]";
	const ratio = Math.min(completed / total, 1);
	const filled = Math.round(ratio * width);
	return `[${"█".repeat(filled)}${" ".repeat(width - filled)}]`;
}

export function formatBytes(bytes?: number): string {
    if (typeof bytes !== "number" || Number.isNaN(bytes)) {
        return "0B";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let n = bytes;

    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }
    if (units[i] === "GB") return `${n.toFixed(1)} ${units[i]}`;
    else return `${n.toFixed(0)} ${units[i]}`;
}

export function timeAgo(dateString: string | Date | undefined): string {
    if (!dateString) return "Unknown";

    const date =
        typeof dateString === "string" ? new Date(dateString) : dateString;
    if (isNaN(date.getTime())) return "Unknown";

    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);

    const intervals = [
        { label: "year", seconds: 31536000 },
        { label: "month", seconds: 2592000 },
        { label: "week", seconds: 604800 },
        { label: "day", seconds: 86400 },
        { label: "hour", seconds: 3600 },
        { label: "minute", seconds: 60 },
        { label: "second", seconds: 1 },
    ];

    for (const { label, seconds: sec } of intervals) {
        const count = Math.floor(seconds / sec);
        if (count > 0) return `${count} ${label}${count > 1 ? "s" : ""} ago`;
    }

    return "just now";
}

function renderProgress(sections: Map<string, PullSection>): string {
	const lines: string[] = [];

	for (const section of sections.values()) {
		const total = section.total;
		const completed = section.completed ?? 0;

		if (!total) {
			lines.push(section.label);
			continue;
		}

		const bar = renderBar(completed, total);
		const pct = Math.floor((completed / total) * 100);

		lines.push(`${bar} ${pct}%`);
	}

	return lines.join("\n");
}
export function pullModel(
	_event: IpcMainInvokeEvent,
	modelName: string,
	clientUrl?: string,
): Promise<string> {
	const sections = new Map<string, PullSection>();
	if (!clientUrl) {
		clientUrl = "http://localhost:11434";
	}

	return new Promise(async (resolve, reject) => {
		try {
			const base = clientUrl.replace(/\/$/, "");
			let res: Response;
			if (clientUrl === "http://localhost:11434") {
				res = await fetch(`${base}/api/pull`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ name: modelName }),
				});
			} else {
				res = await fetch(`${base}/api/pull`, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${await issueProxyToken()}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ name: modelName }),
				});
			}
			if (res.status === 401 || res.status === 403) {
				const err: any = new Error("unauthorized");
				err.code = "UNAUTHORIZED";
				reject(err);
				return;
			}

			if (!res.ok) {
				const err: any = new Error(res.statusText);
				err.code = "REMOTE_PULL_FAILED";
				reject(err);
				return;
			}

			if (res.body) {
				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				const win = BrowserWindow.getAllWindows()[0];

				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;

						const chunk = decoder.decode(value, {
							stream: true,
						});
						const lines = chunk.split("\n");

						for (const line of lines) {
							if (!line.trim()) continue;

							let parsed: PullChunk;
							try {
								parsed = JSON.parse(line);
							} catch {
								continue;
							}

							if (parsed.status && !parsed.digest) {
								sections.set(parsed.status, {
									label: parsed.status,
								});
							}

							if (parsed.digest) {
								const key = parsed.digest.slice(0, 12);

								const section =
									sections.get(key) ??
									sections
										.set(key, {
											label: `pulling ${key}`,
											completed: 0,
										})
										.get(key)!;

								if (section && parsed.total !== undefined) {
									section.total = parsed.total;
								}
								if (section && parsed.completed !== undefined) {
									section.completed = parsed.completed;
								}
							}

							const payload: PullProgress = {
								model: modelName,
								output: renderProgress(sections),
							};

							if (win) {
								win.webContents.send(
									"ollama:pull-progress",
									payload,
								);
							}
						}
					}
				} catch (e) {
					reject(e);
					return;
				}
			}

			resolve(`${modelName} pulled from remote`);
		} catch (err) {
			reject(err);
		}
		return;
	});
}

export async function deleteModel(
	_event: IpcMainInvokeEvent,
	modelName: string,
	clientUrl?: string,
): Promise<string> {
	let useToken = false;
	if (!clientUrl) {
		clientUrl = "http://localhost:11434";
	} else if (is52458(clientUrl)) {
		useToken = true;
	}
	const base = clientUrl.replace(/\/$/, "");
	console.log(base);
	console.log(JSON.stringify({ model: modelName }));
	const res = await fetch(`${base}/api/delete`, {
		method: "DELETE",
		headers: {
			Authorization: `Bearer ${useToken ? await issueProxyToken() : ""}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ model: modelName }),
	});

	if (res.status === 401 || res.status === 403) {
		const err: any = new Error("unauthorized");
		err.code = "UNAUTHORIZED";
		throw err;
	}

	if (!res.ok) {
		const err: any = new Error(res.statusText);
		err.code = useToken ? "REMOTE_DELETE_FAILED" : "DELETE_FAILED";
		throw err;
	}

	return `${modelName} deleted${useToken ? " from remote" : ""}`;
}

export async function listModels(clientUrl?: string): Promise<Array<ModelInfo>> {
	let useToken: boolean = false;
	if (!clientUrl) {
		clientUrl = "http://localhost:11434";
	} else {
		if (is52458(clientUrl)) {
			useToken = true;
		}
	}
	const base = clientUrl.replace(/\/$/, "");
	const res = await fetch(`${base}/api/tags`, {
		headers: {
			Authorization: `Bearer ${useToken ? await issueProxyToken() : ""}`,
		},
	});

	if (res.status === 401 || res.status === 403) {
		const err: any = new Error("unauthorized");
		err.code = "UNAUTHORIZED";
		throw err;
	}

	if (!res.ok) {
		const err: any = new Error(res.statusText);
		err.code = "REMOTE_LIST_FAILED";
		throw err;
	}

	const data = await res.json();
	return (data.models || []).map((m: any) => ({
		name: m.name,
		id: m.digest ?? "remote",
		size: formatBytes(m.size ?? 0) ?? "Unknown",
		modified: timeAgo(m.modified_at) ?? "Unknown",
	}));
}
