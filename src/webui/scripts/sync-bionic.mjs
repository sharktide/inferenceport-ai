/*
Copies the Next.js static export (out/) into the Electron renderer
location (../public/bionic) so the pre-built bundle ships with the app.
*/

import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, "../out");
const dest = path.resolve(__dirname, "../../public/bionic");

if (!existsSync(src)) {
	console.error(
		"No build output found at src/webui/out. Run `npm run build` first.",
	);
	process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log("Synced src/webui/out -> src/public/bionic");
