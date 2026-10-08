import { open, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { READY_GUIDES } from '../src/pages/guides/guideCatalog.js'

const frontendDirectory = fileURLToPath(new URL('../', import.meta.url))
const lfsSignature = 'version https://git-lfs.github.com/spec/v1'

async function inspectVideo(filename) {
  const file = await open(filename, 'r')
  try {
    const metadata = await file.stat()
    if (!metadata.isFile()) return 'is not a regular file'

    // Read only a small prefix: a Git checkout can contain a short LFS pointer
    // named .mp4, which Vite otherwise copies into dist without complaint.
    const buffer = Buffer.alloc(512)
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
    const prefix = buffer.subarray(0, bytesRead)
    if (prefix.toString('utf8').trimStart().startsWith(lfsSignature)) {
      return 'is a Git LFS pointer, not the downloaded video'
    }
    if (bytesRead < 16) return 'has an incomplete MP4 file-type header'
    if (prefix.toString('ascii', 4, 8) !== 'ftyp') return 'does not have the expected MP4 file-type header'

    const size32 = prefix.readUInt32BE(0)
    let fileTypeBoxSize = BigInt(size32)
    let minimumBoxSize = 16n
    if (size32 === 1) {
      if (bytesRead < 24) return 'has an incomplete extended MP4 file-type header'
      fileTypeBoxSize = prefix.readBigUInt64BE(8)
      minimumBoxSize = 24n
    }
    if (fileTypeBoxSize < minimumBoxSize) return 'has an invalid MP4 file-type header size'
    if (fileTypeBoxSize + 8n > BigInt(metadata.size)) return 'is truncated after its MP4 file-type header'
    return null
  } finally {
    await file.close()
  }
}

function describeReadError(error) {
  return error.code === 'ENOENT' ? 'is missing' : `could not be read (${error.code ?? error.message})`
}

/** Packaging check only; it does not decode media or verify browser codecs. */
export async function verifyGuideAssets({
  directory = path.join(frontendDirectory, 'public'),
  guides = READY_GUIDES,
} = {}) {
  const errors = []
  const videos = new Set(guides.map((guide) => guide.video).filter(Boolean))
  const posters = new Set(guides.map((guide) => guide.poster).filter(Boolean))
  const localPath = (asset) => path.join(directory, asset.replace(/^\/+/, ''))

  for (const asset of videos) {
    try {
      const problem = await inspectVideo(localPath(asset))
      if (problem) errors.push(`${asset} ${problem}.`)
    } catch (error) {
      errors.push(`${asset} ${describeReadError(error)}.`)
    }
  }
  for (const asset of posters) {
    try {
      const metadata = await stat(localPath(asset))
      if (!metadata.isFile() || metadata.size === 0) errors.push(`${asset} is not a nonempty poster file.`)
    } catch (error) {
      errors.push(`${asset} ${describeReadError(error)}.`)
    }
  }
  return { directory, videoCount: videos.size, posterCount: posters.size, errors }
}

async function main() {
  const { values } = parseArgs({
    options: { dist: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
    allowPositionals: false,
  })
  if (values.help) {
    console.log('Usage: node scripts/verifyGuideVideos.mjs [--dist]\nChecks guide video headers and poster files in public, or in dist with --dist.')
    return
  }
  const result = await verifyGuideAssets({ directory: path.join(frontendDirectory, values.dist ? 'dist' : 'public') })
  if (result.errors.length) {
    console.error(`Guide media verification failed in ${result.directory}:\n${result.errors.map((error) => `- ${error}`).join('\n')}`)
    console.error('Check that this checkout includes municipal-frontend/public/guide-videos, then rebuild with "npm run build --prefix municipal-frontend" and deploy the complete dist directory. Current releases track MP4s directly in Git; older releases containing LFS pointers also need "git lfs pull origin" from the repository root.')
    process.exitCode = 1
    return
  }
  console.log(`Verified ${result.videoCount} guide video headers and ${result.posterCount} posters in ${result.directory}.`)
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(`Guide media verification failed: ${error.message}`)
    process.exitCode = 1
  })
}
