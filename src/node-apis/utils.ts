/*
Copyright 2025 Rihaan Meher

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import type { IpcMainInvokeEvent } from "electron";
import { createRequire } from 'node:module';

import fs from "fs";
import { constants } from "fs";
import path from "path";
import { shell, app, ipcMain, screen, desktopCapturer } from "electron";
import { initHardwareInfo, getHardwareRating } from "./helper/sysinfo.js";
import type { UUID } from "crypto";
import { getSession } from "./auth.js";
import { getStartupSettings } from "./startup.js";
const require = createRequire(import.meta.url);

const nativeAddons: NativeAddons = require(app.isPackaged ? "../lib/out/ipai-native-addons.node": path.join(
			process.resourcesPath,
			"lib",
			"ipai-native-addons.node",
		));

const dataDir: string = app.getPath("userData");
const chatStorageApiBase = "https://sharktide-chat.hf.space/api";

type SaveStreamOptions = {
	name?: string;
	mimeType?: string;
	kind?: "image" | "video" | "audio" | "file" | "text" | "rich_text";
	sessionId?: string | null;
};

type SnipTarget = {
	displayId: number;
	bounds: Electron.Rectangle;
	scaleFactor: number;
};

let snipTarget: SnipTarget | null = null;

export function setSnipTarget(target: SnipTarget | null): void {
	snipTarget = target;
}

export function is52458(url: string): boolean {
	try {
		const u = new URL(url);
		return u.port === "52458";
	} catch {
		return false;
	}
}

function inferFileExtensionFromMime(mimeType: string): string {
	const mime = String(mimeType || "").toLowerCase();
	if (mime === "image/png") return "png";
	if (mime === "image/jpeg") return "jpg";
	if (mime === "image/webp") return "webp";
	if (mime === "image/gif") return "gif";
	if (mime === "image/svg+xml") return "svg";
	if (mime === "video/mp4") return "mp4";
	if (mime === "video/webm") return "webm";
	if (mime === "audio/mpeg") return "mp3";
	if (mime === "audio/wav") return "wav";
	if (mime === "audio/ogg") return "ogg";
	if (!mime.includes("/")) return "bin";
	return mime.split("/")[1]?.trim() || "bin";
}

function inferKindFromMime(mimeType: string): SaveStreamOptions["kind"] {
	const mime = String(mimeType || "").toLowerCase();
	if (mime.startsWith("image/")) return "image";
	if (mime.startsWith("video/")) return "video";
	if (mime.startsWith("audio/")) return "audio";
	if (mime.startsWith("text/")) return "text";
	return "file";
}

function buildAssetName(
	mimeType: string,
	kind: SaveStreamOptions["kind"],
	explicitName?: string,
): string {
	if (explicitName && explicitName.trim()) return explicitName.trim();
	const ext = inferFileExtensionFromMime(mimeType);
	const prefix =
		kind === "image"
			? "generated-image"
			: kind === "video"
				? "generated-video"
				: kind === "audio"
					? "generated-audio"
					: "upload";
	return `${prefix}-${Date.now()}.${ext}`;
}

async function getSignedInAccessToken(): Promise<string | null> {
	try {
		const session = await getSession();
		return session?.access_token || null;
	} catch {
		return null;
	}
}

async function saveStreamToLocalDisk(response: Blob): Promise<UUID> {
	const asset_id = crypto.randomUUID();
	const assetsDir = path.join(dataDir, "assets");
	const file_path = path.join(assetsDir, `${asset_id}.blob`);

	await fs.promises.mkdir(assetsDir, { recursive: true });

	const fd = await fs.promises.open(
		file_path,
		constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
		0o600,
	);

	try {
		for await (const chunk of response.stream()) {
			await fd.write(chunk);
		}
	} catch (err) {
		await fd.close().catch(() => {});
		await fs.promises.unlink(file_path).catch(() => {});
		throw err;
	}

	await fd.close();
	return asset_id;
}

export async function save_stream(
	response: Blob,
	options: SaveStreamOptions = {},
): Promise<UUID> {
	const mimeType =
		options.mimeType?.trim() || response.type || "application/octet-stream";
	const kind = options.kind || inferKindFromMime(mimeType);
	const name = buildAssetName(mimeType, kind, options.name);
	const startupSettings = getStartupSettings();
	const canUseRemoteMediaStorage =
		startupSettings.mediaLibraryStorageEnabled !== false;
	const accessToken = await getSignedInAccessToken();

	if (accessToken && canUseRemoteMediaStorage) {
		try {
			const buffer = Buffer.from(await response.arrayBuffer());
			const payload: Record<string, unknown> = {
				name,
				mimeType,
				base64: buffer.toString("base64"),
				kind,
				source: "inferenceport_desktop",
			};
			if (options.sessionId && options.sessionId.trim()) {
				payload.sessionId = options.sessionId.trim();
			}

			const res = await fetch(`${chatStorageApiBase}/db/media/files`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					Accept: "application/json",
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			let body: any = null;
			try {
				body = await res.json();
			} catch {
				body = null;
			}

			if (res.ok && typeof body?.item?.id === "string") {
				return body.item.id;
			}
			const remoteError =
				typeof body?.message === "string"
					? body.message
					: typeof body?.error === "string"
						? body.error
						: `remote media save failed (${res.status})`;
			throw new Error(remoteError);
		} catch (err) {
			console.warn(
				"[media] Remote save failed, using local fallback:",
				err,
			);
		}
	}

	return await saveStreamToLocalDisk(response);
}

export async function load_blob(asset_id: UUID): Promise<Buffer> {
	const file_path = path.join(dataDir, "assets", `${asset_id}.blob`);
	try {
		return await fs.promises.readFile(file_path);
	} catch (err: Error | any) {
		if (err.code !== "ENOENT") throw err;
	}

	const accessToken = await getSignedInAccessToken();
	if (accessToken) {
		try {
			const res = await fetch(
				`${chatStorageApiBase}/db/media/${encodeURIComponent(String(asset_id))}/content`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${accessToken}`,
						Accept: "application/json",
					},
				},
			);

			if (res.ok) {
				const payload = (await res.json()) as {
					encoding?: string;
					content?: string;
				};
				if (
					payload?.encoding === "base64" &&
					typeof payload?.content === "string"
				) {
					return Buffer.from(payload.content, "base64");
				}
				if (typeof payload?.content === "string") {
					return Buffer.from(payload.content, "utf8");
				}
			}
		} catch (err) {
			console.warn(
				"[media] Remote read failed, trying local fallback:",
				err,
			);
		}
	}
	return await fs.promises.readFile(file_path);
}

export async function delete_blob(asset_id: UUID): Promise<void> {
	const file_path = path.join(dataDir, "assets", `${asset_id}.blob`);
	try {
		await fs.promises.unlink(file_path);
		return;
	} catch (err: Error | any) {
		if (err.code !== "ENOENT") throw err;
	}

	const accessToken = await getSignedInAccessToken();
	if (accessToken) {
		try {
			const res = await fetch(`${chatStorageApiBase}/db/media`, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					Accept: "application/json",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ ids: [String(asset_id)] }),
			});
			if (!res.ok && res.status !== 404) {
				const payload = await res.json().catch(() => null);
				console.warn(
					"[media] Remote delete failed:",
					payload?.error || payload?.message || res.status,
				);
			}
		} catch (err) {
			console.warn(
				"[media] Remote delete failed, trying local fallback:",
				err,
			);
		}
	}
}

export async function listAssets(): Promise<Array<string>> {
	const assetsDir = path.join(dataDir, "assets");

	try {
		const files = await fs.promises.readdir(assetsDir, {
			withFileTypes: true,
		});

		return files
			.filter((f) => f.isFile() && f.name.endsWith(".blob"))
			.map((f) => f.name.replace(/\.blob$/, ""));
	} catch (err: any) {
		if (err.code === "ENOENT") {
			return [];
		}
		throw err;
	}
}

const FIRST_RUN_FILE = "first-run-2.0.0.json";

function getFirstRunPath() {
	return path.join(app.getPath("userData"), FIRST_RUN_FILE);
}

function isFirstLaunch(): boolean {
	const markerPath = getFirstRunPath();

	try {
		const fd = fs.openSync(markerPath, "wx");
		fs.writeSync(
			fd,
			JSON.stringify({ firstRunCompleted: true }),
			undefined,
			"utf-8",
		);
		fs.closeSync(fd);
		return true;
	} catch (err: any) {
		if (err.code === "EEXIST") {
			return false;
		}
		throw err;
	}
}

function resetFirstLaunch(): void {
	const markerPath = getFirstRunPath();

	const base = app.getPath("userData");
	const resolved = path.resolve(markerPath);
	if (!resolved.startsWith(path.resolve(base) + path.sep)) {
		throw new Error("Invalid marker path");
	}

	try {
		fs.unlinkSync(resolved);
	} catch (err: any) {
		if (err.code !== "ENOENT") throw err;
	}
}

export default function register() {
	initHardwareInfo();
	ipcMain.handle("snip:get-target", () => snipTarget);
	ipcMain.handle(
		"snip:capture",
		async (
			_event: IpcMainInvokeEvent,
			target?: {
				displayId?: number;
				width?: number;
				height?: number;
				scaleFactor?: number;
			},
		) => {
			const resolved = target ?? undefined;
			const displayId = resolved?.displayId ?? snipTarget?.displayId;
			const display =
				(displayId != null
					? screen.getAllDisplays().find((d) => d.id === displayId)
					: null) ?? screen.getPrimaryDisplay();

			const scale = resolved?.scaleFactor ?? display.scaleFactor ?? 1;
			const width = Math.max(
				1,
				Math.round((resolved?.width ?? display.bounds.width) * scale),
			);
			const height = Math.max(
				1,
				Math.round((resolved?.height ?? display.bounds.height) * scale),
			);

			const sources = await desktopCapturer.getSources({
				types: ["screen"],
				thumbnailSize: { width, height },
			});

			if (!sources || sources.length === 0) {
				throw new Error(
					"No screen sources available. On macOS, enable Screen Recording in System Settings > Privacy & Security.",
				);
			}

			const source =
				(displayId != null
					? sources.find((s) => s.display_id === String(displayId))
					: null) ?? (displayId == null ? sources[0] : undefined);

			if (!source) {
				throw new Error("No screen sources available for snipping.");
			}

			if (displayId != null && !source) {
				throw new Error(
					`Screen source for displayId ${displayId} not found. ` +
						"Check that the requested monitor is available and that your app has the necessary permissions.",
				);
			}

			const finalSource = source ?? sources[0];

			const thumb = finalSource.thumbnail;
			return {
				dataUrl: thumb.toDataURL(),
				width: thumb.getSize().width,
				height: thumb.getSize().height,
				displayId,
				scaleFactor: scale,
			};
		},
	);
	ipcMain.handle(
		"utils:getAsset",
		async (_event: IpcMainInvokeEvent, assetId: UUID): Promise<Buffer> => {
			return await load_blob(assetId);
		},
	);
	ipcMain.handle(
		"utils:rmAsset",
		async (_event: IpcMainInvokeEvent, assetId: UUID): Promise<void> => {
			return await delete_blob(assetId);
		},
	);
	ipcMain.handle("utils:is-first-launch", () => {
		return isFirstLaunch();
	});
	ipcMain.handle("utils:listAssets", async (): Promise<Array<string>> => {
		return await listAssets();
	});

	ipcMain.handle("utils:reset-first-launch", () => {
		resetFirstLaunch();
		return true;
	});
	ipcMain.handle(
		"utils:sanitizeSVG",
		async (_event: IpcMainInvokeEvent, svg: string) => {
			try {
				return nativeAddons.HtmlRenderer.sanitizeSvg(svg);
				} catch (err) {
					throw new Error(
						`Error sanitizing SVG: ${
							err instanceof Error ? err.message : String(err)
						}`,
				);
			}
		},
	);
	ipcMain.handle(
		"utils:web_open",
		async (_event: IpcMainInvokeEvent, url: string) => {
			let session = null;
			try {
				session = await getSession();
			} catch (err) {
				void 0;
			}
			let parsedUrl: URL | null = null;
			try {
				parsedUrl = new URL(url);
			} catch {
				parsedUrl = null;
			}
			const allowedStripeHosts = ["buy.stripe.com"];
			if (parsedUrl && allowedStripeHosts.includes(parsedUrl.hostname)) {
				try {
					if (session && session.user && session.user.email) {
						const email = session.user.email;
						const separator = url.includes("?") ? "&" : "?";
						url += `${separator}locked_prefilled_email=${encodeURIComponent(email)}`;
					}
				} catch (err) {
					console.error(
						"Error occurred while fetching session:",
						err,
					);
				}
				shell.openExternal(url);
				return;
			} else if (url === "https://sharktide-lightning.hf.space/portal") {
				try {
					if (session && session.user && session.user.email) {
						const email = session.user.email;
						const url_res: Response = await fetch(
							"https://sharktide-lightning.hf.space/portal",
							{
								method: "POST",
								headers: {
									"Content-Type": "application/json",
								},
								body: JSON.stringify({ email: email }),
							},
						);
						if (url_res.ok) {
							const stripe_url = (await url_res.json())
								.redirect_url;
							if (stripe_url) {
								shell.openExternal(stripe_url);
							} else shell.openExternal(url);
						} else shell.openExternal(url);
					}
				} catch (err) {
					console.error(
						"Error occurred while fetching session:",
						err,
					);
				}
				return;
			}
			shell.openExternal(url);
			return;
		},
	);

	ipcMain.handle(
		"utils:markdown_parse_and_purify",
		(event: IpcMainInvokeEvent, markdown: string) => {
			try {
				const dirty = nativeAddons.HtmlRenderer.renderMdTex(markdown);
				const clean = nativeAddons.HtmlRenderer.sanitizeHtml(dirty);
				return clean;
			} catch (err) {
				throw new Error(
					`Error parsing markdown: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		},
	);

	ipcMain.handle(
		"utils:DOMPurify",
		async (_event: IpcMainInvokeEvent, html: string) => {
			try {
				const cleanHTML = nativeAddons.HtmlRenderer.sanitizeHtml(html);
				return cleanHTML;
			} catch (err) {
				throw new Error(
					`Error cleaning HTML: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		},
	);

	ipcMain.handle(
		"utils:saveFile",
		async (
			_event: IpcMainInvokeEvent,
			filePath: string,
			content: string,
		) => {
			const base = app.getPath("userData");
			const resolved = path.resolve(filePath);

			if (!resolved.startsWith(path.resolve(base) + path.sep)) {
				throw new Error("Path outside userData");
			}

			await fs.promises.mkdir(path.dirname(resolved), {
				recursive: true,
			});

			const tmp = resolved + ".tmp-" + String(process.pid);
			await fs.promises.writeFile(tmp, content, { mode: 0o600 });
			await fs.promises.rename(tmp, resolved);

			return true;
		},
	);

	const AppDataDir = app.getPath("userData");

	ipcMain.handle("utils:getPath", () => {
		return AppDataDir;
	});

	ipcMain.handle(
		"utils:get-hardware-performance-warning",
		async (
			_event: IpcMainInvokeEvent,
			modelSizeRaw: string,
			clientUrl?: string,
		) => {
			return getHardwareRating(modelSizeRaw, clientUrl);
		},
	);
}
