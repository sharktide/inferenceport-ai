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
import si from 'systeminformation';

function parseModelSize(modelSize: string): number {
  const lower = modelSize.toLowerCase();
  if (lower.endsWith('b')) return parseFloat(lower.replace('b', ''));
  if (lower.endsWith('m')) return parseFloat(lower.replace('m', '')) / 1000;
  if (lower.startsWith('e')) return parseFloat(lower.replace('e', ''));
  return parseFloat(lower);
}

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
	ipcMain.handle('utils:get-hardware-performance-warning', async (_event, modelSizeRaw: string) => {
		const modelSize = parseModelSize(modelSizeRaw); // in billions
		const cpu = await si.cpu();
		const flags = await si.cpuFlags();
		const mem = await si.mem();

		const ramGB = mem.total / 1e9;
		const hasAVX2 = flags.includes('avx2');
		const hasAVX512 = flags.includes('avx512f') || flags.includes('avx512');

		const score =
			(hasAVX2 ? 2 : 0) +
			(hasAVX512 ? 2 : 0) +
			(cpu.cores >= 8 ? 1 : 0) +
			(ramGB >= 16 ? 1 : 0) +
			(cpu.cache?.l3 ? cpu.cache.l3 / 10 : 0);

		let warning = '';
		if (modelSize > 65) {
			return {
				modelSizeRaw,
				modelSizeB: modelSize,
				cpu: cpu.brand,
				cores: cpu.cores,
				ramGB: ramGB.toFixed(1),
				avx2: hasAVX2,
				avx512: hasAVX512,
				warning: `🚫 ${modelSizeRaw} is too large for most consumer hardware. Use a smaller model.`,
			};
		}

		if (modelSize <= 1) {
			warning = `✅ Your system should handle ${modelSizeRaw} models easily.`;
		} else if (modelSize <= 3) {
			warning = score >= 4
			? `✅ ${modelSizeRaw} should run fine on your system.`
			: `⚠️ ${modelSizeRaw} may be slow (>30s) on your system.`;
		} else if (modelSize <= 7) {
			warning = score >= 5
			? `✅ ${modelSizeRaw} should run with reasonable performance.`
			: `⚠️ ${modelSizeRaw} may respond slowly or exceed memory limits.`;
		} else {
			warning = score >= 6
			? `🚫 ${modelSizeRaw} is likely too large for your system. Consider using a smaller model.`
			: `🚫 ${modelSizeRaw} is likely too large for your system. Consider using a smaller model.`;
		}

		return {
			modelSizeRaw,
			modelSizeB: modelSize,
			cpu: cpu.brand,
			cores: cpu.cores,
			ramGB: ramGB.toFixed(1),
			avx2: hasAVX2,
			avx512: hasAVX512,
			warning,
		};
	});
}

module.exports = {
	register,
};
