import { resolve, join } from 'path'
import { readdir, rename, rm } from 'fs/promises'
import { ElectronOllama } from 'electron-ollama'

async function moveBinariesToRoot(version, os, arch) {
    const vendorRoot = resolve(__dirname, '../vendor/electron-ollama')
    const sourceDir = join(vendorRoot, version, os, arch)

    try {
        const files = await readdir(sourceDir)
        for (const file of files) {
            const src = join(sourceDir, file)
            const dest = join(vendorRoot, file)
            await rename(src, dest)
        }
        console.log(`Moved binaries from ${sourceDir} to ${vendorRoot}`)
    } catch (err) {
        console.error(`Error moving binaries: ${err.message}`)
    }
}

async function removeCudaFolders() {
    const vendorRoot = resolve(__dirname, '../vendor/electron-ollama')
    const cudaVersions = ['lib/ollama/cuda_v12', 'lib/ollama/cuda_v13']

    for (const version of cudaVersions) {
        const cudaPath = join(vendorRoot, version)
        try {
            await rm(cudaPath, { recursive: true, force: true })
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

    const eo = new ElectronOllama({ basePath: resolve(__dirname, '../vendor') })
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
