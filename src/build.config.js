/** @type {import('electron-builder').Configuration} */
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
    "!**/._*"
  ],

  extraResources: [
    {
      from: "vendor/electron-ollama",
      to: "vendor/electron-ollama",
      filter: ["!**/._*"]
    }
  ],

  publish: {
    provider: "github",
    owner: "sharktide",
    repo: "InferencePort-AI",
    releaseType: "release"
  },

  fileAssociations: [
    {
      ext: "import",
      name: "InferencePortAI Metadata File",
      role: "Editor"
    }
  ],

  directories: {
    output: "dist"
  },

  win: {
    target: ["appx", "zip", "msi", "nsis"],
    appId: "RihaanMeher.InferencePortAI_jgdzt0f3vt2yc",
    artifactName: "${productName}-Setup-${version}-${arch}.${ext}"
  },

  mac: {
    target: ["dmg", "zip", "pkg"],
    notarize: true
  },

  linux: {
    target: ["AppImage", "deb", "tar.xz"],
    artifactName: "${productName}-LinuxSetup-${version}-${arch}.${ext}",
    category: "Utility",
    maintainer: "Rihaan Meher <sharktidedev@gmail.com>"
  },

  nsis: {
    perMachine: true
  },

  appx: {
    customManifestPath: "build/AppxManifest.xml"
  }
};
