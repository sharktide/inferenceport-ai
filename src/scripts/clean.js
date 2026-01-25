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

import { glob } from "glob";
import { unlink, readFile, writeFile } from "fs/promises";
import { resolve, basename } from "path";

(async () => {
	const gitignorePath = resolve("../.gitignore");
	const tsFiles = await glob("**/*.ts", { ignore: ["node_modules/**"] });

	const generatedFiles = [];

	for (const tsFile of tsFiles) {
		const base = tsFile.replace(/\.ts$/, "");
		for (const ext of [".js", ".js.map", ".d.ts", ".d.ts.map"]) {
			const target = `${base}${ext}`;
			generatedFiles.push(target);
			try {
				await unlink(target);
			} catch (err) {
				if (err.code !== "ENOENT") {
					console.error(`Failed to delete ${target}:`, err);
				}
			}
		}
	}

	const mtsFiles = await glob("**/*.mts", { ignore: ["node_modules/**"] });

	for (const mtsFile of mtsFiles) {
		const base = mtsFile.replace(/\.mts$/, "");
		for (const ext of [".mjs", ".mjs.map", ".d.mts", ".d.mts.map"]) {
			const target = `${base}${ext}`;
			generatedFiles.push(target);
			try {
				await unlink(target);
			} catch (err) {
				if (err.code !== "ENOENT") {
					console.error(`Failed to delete ${target}:`, err);
				}
			}
		}
	}

	const ctsFiles = await glob("**/*.cts", { ignore: ["node_modules/**"] });

	for (const ctsFile of ctsFiles) {
		const base = ctsFile.replace(/\.cts$/, "");
		for (const ext of [".cjs", ".cjs.map", ".d.cts", ".d.cts.map"]) {
			const target = `${base}${ext}`;
			generatedFiles.push(target);
			try {
				await unlink(target);
			} catch (err) {
				if (err.code !== "ENOENT") {
					console.error(`Failed to delete ${target}:`, err);
				}
			}
		}
	}

	try {
		const existing = await readFile(gitignorePath, "utf-8");
		const lines = new Set(existing.split(/\r?\n/).map((line) => line.trim()));
		let updated = false;
		for (const file of generatedFiles) {
			if (basename(file).includes(".types.")) continue;

			if (!lines.has(file)) {
				lines.add(file);
				updated = true;
			}
		}

		if (updated) {
			const sorted = Array.from(lines).filter(Boolean).sort();
			await writeFile(gitignorePath, sorted.join("\n") + "\n", "utf-8");
			console.log(".gitignore updated with generated files.");
		}
	} catch (err) {
		console.error("Failed to update .gitignore:", err);
	}
})();
