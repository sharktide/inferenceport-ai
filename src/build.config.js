/** @type {import('electron-builder').Configuration} */

const acceleration =
	process.env.OLLAMA_ACCELERATION?.toLowerCase() || "cpu";

const buildChannel =
	process.env.BUILD_CHANNEL?.toLowerCase() || "standard";

const isGpuBuild = acceleration !== "cpu";
const isStoreBuild = buildChannel === "store";

const accelLabel =
	acceleration === "cpu"
		? "CPU"
		: acceleration.toUpperCase();

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
		target: isGpuBuild
			? ["appx", "zip"]
			: ["nsis", "appx", "zip", "msi"],

		appId: "RihaanMeher.InferencePortAI_jgdzt0f3vt2yc",

		artifactName: isGpuBuild
			? `${"${productName}"}-Windows-${accelLabel}-${"${version}"}-${"${arch}"}.${"${ext}"}`
			: `${"${productName}"}-Windows-${"${version}"}-${"${arch}"}.${"${ext}"}`,

		compression: isStoreBuild ? "store" : "normal",
	},

	mac: {
		target: ["dmg", "zip", "pkg"],
		notarize: true,
		artifactName:
			"${productName}-MacOS-${version}-${arch}.${ext}",
	},

	linux: {
		target: isGpuBuild
			? ["AppImage", "tar.xz"]
			: ["AppImage", "deb", "tar.xz"],

		artifactName: isGpuBuild
			? `${"${productName}"}-Linux-${accelLabel}-${"${version}"}-${"${arch}"}.${"${ext}"}`
			: `${"${productName}"}-Linux-${"${version}"}-${"${arch}"}.${"${ext}"}`,

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
