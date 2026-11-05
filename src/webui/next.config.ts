import type { NextConfig } from "next";

const isElectronExport = process.env.ELECTRON_EXPORT !== "0";

const nextConfig: NextConfig = {
	// Static export so the output can be loaded by Electron via file://
	// (synced to ../public/bionic by scripts/sync-bionic.mjs).
	// Set ELECTRON_EXPORT=0 to build a normal server deployment instead.
	...(isElectronExport
		? {
				output: "export" as const,
				assetPrefix: "./",
				images: { unoptimized: true },
			}
		: {}),
	typescript: {
		ignoreBuildErrors: false,
	},
	reactStrictMode: false,
};

export default nextConfig;
