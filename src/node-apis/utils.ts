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

import sanitizeHtml from "sanitize-html";
import type { IpcMainInvokeEvent } from "electron";

import fs from "fs";
import { constants } from "fs";
import path from "path";
import { shell, app, ipcMain, screen, desktopCapturer } from "electron";
import { initHardwareInfo, getHardwareRating } from "./helper/sysinfo.js";
import MDIT from "markdown-it";
import mdTable from "markdown-it-multimd-table";
import type { UUID } from "crypto";
import { getSession } from "./auth.js";
import { getStartupSettings } from "./startup.js";

// @ts-expect-error - markdown-it-footnote doesn't have proper TS definitions
import mdFootnote from "markdown-it-footnote";

const CSS_SANITIZE_RE =
	/@import[^;]+;|expression\s*\([^)]*\)|url\s*\(\s*['"]?\s*javascript:[^)]*\)|url\s*\(\s*['"]?\s*(?!data:)[^'")]+['"]?\s*\)/gi;

function sanitizeCSS(css: string): string {
	return css.replace(CSS_SANITIZE_RE, "").trim();
}

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

function detailsBlock(md: any): void {
	md.block.ruler.before(
		"paragraph",
		"details_block",
		(
			state: any,
			startLine: number,
			endLine: number,
			silent: boolean,
		): boolean => {
			const start = state.bMarks[startLine!] + state.tShift[startLine!];
			const max = state.eMarks[startLine!];

			const line = state.src.slice(start, max);
			if (!line.startsWith("<details")) return false;

			let nextLine = startLine + 1;

			while (nextLine < endLine) {
				const pos = state.bMarks[nextLine!] + state.tShift[nextLine!];
				const text = state.src
					.slice(pos, state.eMarks[nextLine])
					.trim();
				if (text === "</details>") break;
				nextLine++;
			}

			if (nextLine >= endLine) return false;

			if (silent) return true;

			state.line = nextLine + 1;

			const content = state.getLines(startLine, nextLine + 1, 0, true);

			const token = state.push("html_block", "", 0);
			token.content = content;

			return true;
		},
	);
}

const mdit = MDIT({
	html: true,
	linkify: true,
	breaks: true,
	typographer: true,
});

// Add markdown-it plugins
mdit.use(mdTable as any);
mdit.use(mdFootnote as any);

function preserveMathDelimiters(md: any) {
	const escapeRE = /\\\(|\\\)|\\\[|\\\]|\\[a-zA-Z]+/g;

	md.inline.ruler.before("escape", "preserve_math", function (state: any) {
		state.src = state.src.replace(escapeRE, (match: string) => {
			return match.replace(/\\/g, "\uFFF0");
		});
		return false;
	});
	md.core.ruler.after("inline", "restore_math", function (state: any) {
		state.tokens.forEach((blockToken: any) => {
			if (blockToken.type !== "inline" || !blockToken.children) return;

			blockToken.children.forEach((token: any) => {
				if (
					token.type === "text" &&
					typeof token.content === "string"
				) {
					token.content = token.content.replace(/\uFFF0/g, "\\");
				}
			});
		});
	});
}

mdit.use(detailsBlock);
mdit.use(preserveMathDelimiters);

// Escape HTML inside fenced and indented code blocks so that tags like
// <div> render as literal text instead of being interpreted as HTML.
function escapeHtmlInCode(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

mdit.renderer.rules.fence = (tokens, idx, options, _env, self) => {
	const token = tokens[idx]!;
	const info = token.info ? token.info.trim() : "";
	const lang = info ? info.split(/\s+/)[0] : "";
	const escaped = escapeHtmlInCode(token.content);
	const langAttr = lang ? ` class="language-${escapeHtmlInCode(lang)}"` : "";
	return `<pre><code${langAttr}>${escaped}</code></pre>\n`;
};

mdit.renderer.rules.code_block = (tokens, idx) => {
	const escaped = escapeHtmlInCode(tokens[idx]!.content);
	return `<pre><code>${escaped}</code></pre>\n`;
};
const defaultLinkOpenRenderer =
	mdit.renderer.rules.link_open ||
	function (tokens, idx, options, env, self) {
		return self.renderToken(tokens, idx, options);
	};

mdit.renderer.rules.link_open = function (tokens, idx, options, env, self) {
	const originalHref = tokens[idx]!.attrGet("href");

	if (!originalHref) {
		return defaultLinkOpenRenderer(tokens, idx, options, env, self);
	}

	const encoded = encodeURIComponent(originalHref);
	const jsUrl = `javascript:window.utils.web_open('${encoded}')`;

	tokens[idx]!.attrSet("href", jsUrl);

	return defaultLinkOpenRenderer(tokens, idx, options, env, self);
};

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
				const cleanSVG = sanitizeHtml(svg, {
					allowedTags: [
						"svg",
						"g",
						"defs",
						"desc",
						"title",
						"symbol",
						"use",

						"path",
						"rect",
						"circle",
						"ellipse",
						"line",
						"polyline",
						"polygon",

						"text",
						"tspan",
						"textPath",

						"image",

						"linearGradient",
						"radialGradient",
						"stop",
						"pattern",
						"mask",
						"clipPath",

						"filter",
						"feBlend",
						"feColorMatrix",
						"feComponentTransfer",
						"feComposite",
						"feConvolveMatrix",
						"feDiffuseLighting",
						"feDisplacementMap",
						"feFlood",
						"feGaussianBlur",
						"feImage",
						"feMerge",
						"feMergeNode",
						"feMorphology",
						"feOffset",
						"feSpecularLighting",
						"feTile",
						"feTurbulence",

						"style",
					],

					allowedAttributes: {
						"*": [
							"id",
							"class",
							"style",
							"x",
							"y",
							"x1",
							"y1",
							"x2",
							"y2",
							"cx",
							"cy",
							"r",
							"rx",
							"ry",
							"width",
							"height",
							"viewBox",
							"d",
							"points",
							"transform",

							"fill",
							"stroke",
							"stroke-width",
							"stroke-linecap",
							"stroke-linejoin",
							"stroke-dasharray",
							"stroke-dashoffset",
							"opacity",
							"fill-opacity",
							"stroke-opacity",

							"offset",
							"stop-color",
							"stop-opacity",
							"gradientUnits",
							"gradientTransform",
							"fill-rule",
							"clip-rule",
							"stroke-miterlimit",
							"font-size",
							"font-family",
							"text-anchor",

							"href",
							"xlink:href",

							"preserveAspectRatio",
							"clip-path",
							"mask",
							"filter",
						],

						svg: ["xmlns", "viewbox", "width", "height"],
						use: ["href", "xlink:href"],
						image: ["href", "xlink:href", "width", "height"],
					},

					allowedSchemes: ["http", "https", "data"],

					transformTags: {
						"*": (tagName, attribs) => {
							const cleanAttribs: Record<string, string> = {};

							for (const [key, value] of Object.entries(
								attribs,
							)) {
								const lower = key.toLowerCase();

								if (lower.startsWith("on")) continue;

								if (
									typeof value === "string" &&
									["javascript:", "data:", "vbscript:"].some((scheme) =>
										value.trim().toLowerCase().startsWith(scheme),
									)
								)
									continue;

								cleanAttribs[key] = value;
							}

							return { tagName, attribs: cleanAttribs };
						},
					},

					textFilter: (text, tagName) => {
						if (tagName === "style") {
							return sanitizeCSS(text);
						}
						return text;
					},

					disallowedTagsMode: "discard",

					exclusiveFilter: (frame) => {
						const tag = frame.tag.toLowerCase();
						return (
							tag === "script" ||
							tag === "foreignobject" ||
							tag === "iframe"
						);
					},
				});
				console.log("ORIGINAL:", svg);
				console.log("CLEAN:", cleanSVG);
				const normalizeSVG = (svg: string) =>
				svg
					.replace(/viewbox=/g, "viewBox=")
					.replace(/preserveaspectratio=/g, "preserveAspectRatio=")
					.replace(/clip-path=/g, "clipPath=");

				return normalizeSVG(cleanSVG);
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
				const dirty = mdit.render(markdown);
				const SAFE_PREFIX = "javascript:window.utils.web_open('";

				const clean = sanitizeHtml(dirty, {
					allowedTags: sanitizeHtml.defaults.allowedTags.concat([
						"details",
						"summary",
						"table",
						"thead",
						"tbody",
						"tfoot",
						"tr",
						"th",
						"td",
						"blockquote",
						"hr",
						"br",
						"sub",
						"sup",
						"del",
						"s",
					]),

					allowedAttributes: {
						...sanitizeHtml.defaults.allowedAttributes,
						"*": [
							...(sanitizeHtml.defaults.allowedAttributes["*"] ||
								[]),
							"class",
							"id",
							"style",
							"data-color",
						],
						a: ["href"],
						details: ["open"],
						table: ["align"],
						tr: ["align"],
						th: ["align", "style", "data-color"],
						td: [
							"align",
							"style",
							"colspan",
							"rowspan",
							"data-color",
						],
						span: ["style", "data-color"],
						div: ["style", "data-color"],
						p: ["style", "data-color"],
					},

					allowedSchemesByTag: {
						a: ["http", "https", "mailto", "data", "javascript"],
					},

					transformTags: {
						a: (tagName, attribs) => {
							const href = attribs.href || "";

							if (
								href.startsWith(SAFE_PREFIX) &&
								href.endsWith("')")
							) {
								return { tagName, attribs };
							}

							const { href: _removed, ...rest } = attribs;
							return { tagName, attribs: rest };
						},
					},
				});

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
				const cleanHTML = sanitizeHtml(html, {
					allowedTags: sanitizeHtml.defaults.allowedTags.concat([
						"details",
						"summary",
						"table",
						"thead",
						"tbody",
						"tfoot",
						"tr",
						"th",
						"td",
						"blockquote",
						"hr",
						"br",
						"sub",
						"sup",
						"del",
						"s",
					]),
					allowedAttributes: Object.assign(
						{},
						sanitizeHtml.defaults.allowedAttributes,
						{
							"*": (
								sanitizeHtml.defaults.allowedAttributes["*"] ||
								[]
							).concat(["class", "id", "style"]),
							details: ["open"],
							table: ["align"],
							tr: ["align"],
							th: ["align", "style"],
							td: ["align", "style", "colspan", "rowspan"],
							span: ["style"],
							div: ["style"],
							p: ["style"],
						},
					),
					allowedSchemes: sanitizeHtml.defaults.allowedSchemes.concat(
						["data"],
					),
				});
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
