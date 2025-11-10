const path = require('path')
const fs = require('fs')
const fsp = require('fs/promises')
const { ElectronOllama } = require('electron-ollama')

async function moveBinariesToRoot(version, os, arch) {
    const vendorRoot = path.resolve(__dirname, '../vendor/electron-ollama')
    const sourceDir = path.join(vendorRoot, version, os, arch)

    try {
        const files = await fsp.readdir(sourceDir)
        for (const file of files) {
            const src = path.join(sourceDir, file)
            const dest = path.join(vendorRoot, file)
            await fsp.rename(src, dest)
        }
        console.log(`Moved binaries from ${sourceDir} to ${vendorRoot}`)
    } catch (err) {
        console.error(`Error moving binaries: ${err.message}`)
    }
}

async function removeCudaFolders() {
    const vendorRoot = path.resolve(__dirname, '../vendor/electron-ollama')
    const cudaVersions = ['lib/ollama/cuda_v12', 'lib/ollama/cuda_v13']

    for (const version of cudaVersions) {
        const cudaPath = path.join(vendorRoot, version)
        try {
            await fsp.rm(cudaPath, { recursive: true, force: true })
            console.log(`Removed ${version} folder from ${vendorRoot}`)
        } catch (err) {
            console.warn(`Could not remove ${version}: ${err.message}`)
        }
    }
}
async function bundleOllama() {
    const platformMap = { win32: 'windows', darwin: 'darwin' }
    const archMap = { x64: 'amd64', arm64: 'arm64' }

    const os = platformMap[process.platform]
    const arch = archMap[process.arch]

    if (!os || !arch) {
        console.error(`Unsupported platform: ${process.platform} ${process.arch}`)
        process.exit(1)
    }

    const eo = new ElectronOllama({ basePath: path.resolve(__dirname, '../vendor') })
    const metadata = await eo.getMetadata('latest')
    await eo.download(metadata.version, { os, arch })

    await moveBinariesToRoot(metadata.version, os, arch)

    if (process.env.GPU_ONLY === 'true') {
        console.log('GPU_ONLY build detected — keeping CUDA binaries, zip-only packaging')
    } else {
        await removeCudaFolders()
    }

    console.log(`Bundled Ollama ${metadata.version} for ${os}-${arch}`)
}


bundleOllama()
