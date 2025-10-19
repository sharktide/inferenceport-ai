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

//@ts-nocheck
import { marked } from "marked";
const sanitizeHtml = require('sanitize-html');
import type { IpcMainEvent } from 'electron'
import fs from "fs";
import path from "path";
import { shell, app, ipcMain, BrowserWindow } from "electron";

function register() {
	ipcMain.handle(
		"utils:web_open",
		async (_event: IpcMainEvent, url: string) => {
			shell.openExternal(url);
		}
	);

	ipcMain.on("utils:markdown_parse", (event: IpcMainEvent, markdown: string) => {
	try {
		const dirty = marked.parse(markdown);
		const clean = sanitizeHtml(dirty);
		event.returnValue = clean;
	} catch (err) {
		event.returnValue = `<p>Error parsing markdown: ${err instanceof Error ? err.message : String(err)}</p>`;
	}
	});

	ipcMain.on("utils:DOMPurify", (event: IpcMainEvent, html: string) => {
		try {
			const cleanHTML = sanitizeHtml(html);
			event.returnValue = cleanHTML;
		} catch {
			event.returnValue = `<p>Error cleaning HTML: ${
				err instanceof Error ? error.message : String(err)
			}</p>`
		}
	})

	ipcMain.handle(
		"utils:saveFile",
		async (_event: IpcMainEvent, filePath: string, content: string) => {
			try {
				const dir = path.dirname(filePath);
				await fs.mkdirSync(dir, { recursive: true });
				await fs.writeFileSync(filePath, content);
			} catch (err) {
				console.error("Failed to save file:", err);
				throw err;
			}
		}
	);

	const AppDataDir = app.getPath("userData");

	ipcMain.handle("utils:getPath", () => {
		return AppDataDir;
	});
}

module.exports = {
	register,
};
