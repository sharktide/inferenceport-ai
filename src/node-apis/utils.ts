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
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";

import fs from "fs";
import path from "path";
import { shell, app, ipcMain } from "electron";
import { initHardwareInfo, getHardwareRating } from "./helper/sysinfo.js";
import MDIT from "markdown-it";

function is52458(url: string): boolean {
	try {
		const u = new URL(url);
		return u.port === "52458";
	} catch {
		return false;
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
			silent: boolean
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
		}
	);
}

const mdit = MDIT({
	html: false,
	linkify: true,
	breaks: false,
});

mdit.use(detailsBlock);

const FIRST_RUN_FILE = "first-run.json";

function getFirstRunPath() {
	return path.join(app.getPath("userData"), FIRST_RUN_FILE);
}

function isFirstLaunch(): boolean {
	const markerPath = getFirstRunPath();

	try {
		const fd = fs.openSync(markerPath, "wx");
		fs.writeSync(fd, JSON.stringify({ firstRunCompleted: true }), undefined, "utf-8");
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

	ipcMain.handle("utils:is-first-launch", () => {
		return isFirstLaunch();
	});

	ipcMain.handle("utils:reset-first-launch", () => {
		resetFirstLaunch();
		return true;
	});

	ipcMain.handle(
		"utils:web_open",
		async (_event: IpcMainInvokeEvent, url: string) => {
			shell.openExternal(url);
		}
	);

	ipcMain.on(
		"utils:markdown_parse_and_purify",
		(event: IpcMainEvent, markdown: string) => {
			try {
				const dirty = mdit.render(markdown);
				const clean = sanitizeHtml(dirty, {
					allowedTags: sanitizeHtml.defaults.allowedTags.concat([
						"details",
						"summary",
					]),
					allowedAttributes: Object.assign(
						{},
						sanitizeHtml.defaults.allowedAttributes,
						{
							"*": (
								sanitizeHtml.defaults.allowedAttributes["*"] ||
								[]
							).concat(["class", "id"]),
							details: ["open"],
						}
					),
					allowedSchemes: sanitizeHtml.defaults.allowedSchemes.concat(
						["data"]
					),
				});
				event.returnValue = clean;
			} catch (err) {
				event.returnValue = `<p>Error parsing markdown: ${
					err instanceof Error ? err.message : String(err)
				}</p>`;
			}
		}
	);

	ipcMain.on("utils:DOMPurify", (event: IpcMainEvent, html: string) => {
		try {
			const cleanHTML = sanitizeHtml(html, {
				allowedTags: sanitizeHtml.defaults.allowedTags.concat([
					"details",
					"summary",
				]),
				allowedAttributes: Object.assign(
					{},
					sanitizeHtml.defaults.allowedAttributes,
					{
						"*": (
							sanitizeHtml.defaults.allowedAttributes["*"] || []
						).concat(["class", "id"]),
						details: ["open"],
					}
				),
				allowedSchemes: sanitizeHtml.defaults.allowedSchemes.concat([
					"data",
				]),
			});
			event.returnValue = cleanHTML;
		} catch (err) {
			event.returnValue = `<p>Error cleaning HTML: ${
				err instanceof Error ? err.message : String(err)
			}</p>`;
		}
	});

	ipcMain.handle(
		"utils:saveFile",
		async (_event: IpcMainInvokeEvent, filePath: string, content: string) => {
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
		}
	);

	const AppDataDir = app.getPath("userData");

	ipcMain.handle("utils:getPath", () => {
		return AppDataDir;
	});

	ipcMain.handle(
		"utils:get-hardware-performance-warning",
		async (_event: IpcMainInvokeEvent, modelSizeRaw: string, clientUrl?: string) => {
			return getHardwareRating(modelSizeRaw, clientUrl)
		}
	);
}
