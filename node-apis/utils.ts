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

const sanitizeHtml = require("sanitize-html");
//@ts-ignore
import type { IpcMainEvent } from 'electron';

const fs = require("fs");
const path = require("path");
const { shell, app, ipcMain } = require("electron");
const si = require("systeminformation");
const MDIT =  require("markdown-it");

import type { Systeminformation } from 'systeminformation';


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
        const text = state.src.slice(pos, state.eMarks[nextLine]).trim();
        if (text === "</details>") break;
        nextLine++;
      }

      if (nextLine >= endLine) return false;

      if (silent) return true;

      state.line = nextLine + 1;

      const content = state.getLines(
        startLine,
        nextLine + 1,
        0,
        true
      );

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

let cpu: Systeminformation.CpuData | undefined;
let flags: String | undefined;
let mem: Systeminformation.MemData | undefined;
let hardwareInfoPromise: Promise<void> | null = null;

const FIRST_RUN_FILE = "first-run.json";

function getFirstRunPath() {
  return path.join(app.getPath("userData"), FIRST_RUN_FILE);
}

function isFirstLaunch(): boolean {
  const markerPath = getFirstRunPath();

  if (!fs.existsSync(markerPath)) {
    fs.writeFileSync(
      markerPath,
      JSON.stringify({ firstRunCompleted: true }),
      "utf-8"
    );
    return true;
  }

  return false;
}

function resetFirstLaunch(): void {
  const markerPath = getFirstRunPath();

  if (fs.existsSync(markerPath)) {
    fs.unlinkSync(markerPath);
  }
}

function initHardwareInfo() {
  if (!hardwareInfoPromise) {
    hardwareInfoPromise = (async () => {
      [cpu, mem, flags] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.cpuFlags()
      ]);
    })();
  }
  return hardwareInfoPromise;
}

initHardwareInfo();


function parseModelSize(modelSize: string) {
  const lower = modelSize.toLowerCase();
  if (lower.endsWith("b")) return parseFloat(lower.replace("b", ""));
  if (lower.endsWith("m")) return parseFloat(lower.replace("m", "")) / 1000;
  if (lower.startsWith("e")) return parseFloat(lower.replace("e", ""));
  return parseFloat(lower);
}

function register() {
	ipcMain.handle("utils:is-first-launch", () => {
		return isFirstLaunch();
	});

	ipcMain.handle("utils:reset-first-launch", () => {
		resetFirstLaunch();
		return true;
	});

	ipcMain.handle(
		"utils:web_open",
		async (_event: IpcMainEvent, url: string) => {
		shell.openExternal(url);
		}
	);

	ipcMain.on("utils:markdown_parse", (event: IpcMainEvent, markdown: string) => {
		try {
			const dirty = mdit.render(markdown);
			const clean = sanitizeHtml(dirty, {
				allowedTags: sanitizeHtml.defaults.allowedTags.concat(["details", "summary"]),
				allowedAttributes: Object.assign({}, sanitizeHtml.defaults.allowedAttributes, {
					'*': (sanitizeHtml.defaults.allowedAttributes['*'] || []).concat(['class', 'id']),
					'details': ['open']
				}),
				allowedSchemes: sanitizeHtml.defaults.allowedSchemes.concat(['data'])
			});
			event.returnValue = clean;
		} catch (err) {
			event.returnValue = `<p>Error parsing markdown: ${err instanceof Error ? err.message : String(err)}</p>`;
		}
	});

	ipcMain.on("utils:DOMPurify", (event: IpcMainEvent, html: string) => {
		try {
			const cleanHTML = sanitizeHtml(html, {
				allowedTags: sanitizeHtml.defaults.allowedTags.concat(["details", "summary"]),
				allowedAttributes: Object.assign({}, sanitizeHtml.defaults.allowedAttributes, {
					'*': (sanitizeHtml.defaults.allowedAttributes['*'] || []).concat(['class', 'id']),
					'details': ['open']
				}),
				allowedSchemes: sanitizeHtml.defaults.allowedSchemes.concat(['data'])
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

	ipcMain.handle(
		"utils:get-hardware-performance-warning",
		async (_event: IpcMainEvent, modelSizeRaw: string) => {
		const modelSize = parseModelSize(modelSizeRaw);
		await initHardwareInfo();

		const ramGB = mem!.total / 1e9;
		const hasAVX2 = flags!.includes("avx2");
		const hasAVX512 = flags!.includes("avx512f") || flags!.includes("avx512");

		const score =
			(hasAVX2 ? 2 : 0) +
			(hasAVX512 ? 2 : 0) +
			(cpu!.cores >= 8 ? 1 : 0) +
			(ramGB >= 16 ? 1 : 0) +
			(cpu!.cache?.l3 ? cpu!.cache.l3 / 10 : 0);

		let warning = "";
		if (modelSize > 65) {
			return {
			modelSizeRaw,
			modelSizeB: modelSize,
			cpu: cpu!.brand,
			cores: cpu!.cores,
			ramGB: ramGB.toFixed(1),
			avx2: hasAVX2,
			avx512: hasAVX512,
			warning: `🚫 ${modelSizeRaw} is too large for most consumer hardware. Use a smaller model.`,
			};
		}

		if (modelSize <= 1) {
			warning = `✅ Your system should handle ${modelSizeRaw} models easily.`;
		} else if (modelSize <= 3) {
			warning =
			score >= 4
				? `✅ ${modelSizeRaw} should run fine on your system.`
				: `⚠️ ${modelSizeRaw} may be slow (>30s) on your system.`;
		} else if (modelSize <= 7) {
			warning =
			score >= 5
				? `✅ ${modelSizeRaw} should run with reasonable performance.`
				: `⚠️ ${modelSizeRaw} may respond slowly or exceed memory limits.`;
		} else {
			warning = `🚫 ${modelSizeRaw} is likely too large for your system. Consider using a smaller model.`;
		}

		return {
			modelSizeRaw,
			modelSizeB: modelSize,
			cpu: cpu!.brand,
			cores: cpu!.cores,
			ramGB: ramGB.toFixed(1),
			avx2: hasAVX2,
			avx512: hasAVX512,
			warning,
		};
		}
	);
}

module.exports = {
  register,
};
