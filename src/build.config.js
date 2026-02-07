/** @type {import('electron-builder').Configuration} */

const isGpuOnly = process.env.GPU_ONLY === "true";
const isStoreOnly = process.env.STORE_ONLY === "true";

export default {
	appId: "com.sharktide.inferenceport",
	productName: "InferencePort AI",

	files: [
		"public/**/*",
		"node-apis/**",
		"main.js",
		"preload.cjs",
		"package.json",
		"!./scripts/*",
		"LICENSE",
		"third_party_licenses",
		"!**/._*",
	],

	extraResources: [
		{
			from: "vendor/electron-ollama",
			to: "vendor/electron-ollama",
			filter: ["!**/._*"],
		},
	],

	publish: {
		provider: "github",
		owner: "sharktide",
		repo: "InferencePort-AI",
		releaseType: "release",
	},

	fileAssociations: [
		{
			ext: "import",
			name: "InferencePortAI Metadata File",
			role: "Editor",
		},
	],

	directories: {
		output: "dist",
	},

	win: {
        target: isGpuOnly
            ? ["appx", "zip"]
            : ["nsis", "appx", "zip", "msi"],
        appId: "RihaanMeher.InferencePortAI_jgdzt0f3vt2yc",
		artifactName: isGpuOnly
            ? "${productName}_GPU-Setup-${version}-${arch}.${ext}"
            : "${productName}-Setup-${version}-${arch}.${ext}",
        compression: isStoreOnly ? "store" : "normal",
	},

	mac: {
		target: ["dmg", "zip", "pkg"],
		notarize: true,
	},

	linux: {
		target: ["AppImage", "deb", "tar.xz"],
		artifactName: isGpuOnly
            ? "${productName}_GPU-LinuxSetup-${version}-${arch}.${ext}"
            : "${productName}-LinuxSetup-${version}-${arch}.${ext}",
		category: "Utility",
		maintainer: "Rihaan Meher <sharktidedev@gmail.com>",
	},

	nsis: {
		perMachine: true,
	},

	appx: {
		customManifestPath: "build/AppxManifest.xml",
	},
};
