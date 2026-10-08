import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { verifyGuideAssets } from './verifyGuideVideos.mjs'

const guides = [{ video: '/guide-videos/example.mp4', poster: '/guide-videos/example.png' }]
// A small ISO BMFF packaging fixture. This is not a codec/decode test.
const mp4Header = Buffer.from('000000186674797069736f6d0000020069736f6d6d703432000000086d646174', 'hex')
const pngHeader = Buffer.from('89504e470d0a1a0a', 'hex')

async function fixture(t, video = mp4Header, poster = pngHeader) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'impbbms-guide-media-'))
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()))
  assert.ok(path.basename(directory).startsWith('impbbms-guide-media-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const mediaDirectory = path.join(directory, 'guide-videos')
  await mkdir(mediaDirectory)
  if (video !== null) await writeFile(path.join(mediaDirectory, 'example.mp4'), video)
  if (poster !== null) await writeFile(path.join(mediaDirectory, 'example.png'), poster)
  return verifyGuideAssets({ directory, guides })
}

test('accepts a downloaded MP4 header and packaged poster', async (t) => {
  const result = await fixture(t)
  assert.deepEqual(result.errors, [])
  assert.equal(result.videoCount, 1)
  assert.equal(result.posterCount, 1)
})

test('rejects an unresolved Git LFS pointer with an actionable diagnosis', async (t) => {
  const result = await fixture(t, `version https://git-lfs.github.com/spec/v1\noid sha256:${'a'.repeat(64)}\nsize 3878731\n`)
  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0], /Git LFS pointer/)
})

test('reports missing video and poster assets separately', async (t) => {
  const result = await fixture(t, null, null)
  assert.deepEqual(result.errors, ['/guide-videos/example.mp4 is missing.', '/guide-videos/example.png is missing.'])
})

test('rejects a short or truncated MP4 file-type box', async (t) => {
  assert.match((await fixture(t, mp4Header.subarray(0, 7))).errors[0], /incomplete MP4/)
  assert.match((await fixture(t, mp4Header.subarray(0, 20))).errors[0], /truncated/)
})

test('rejects an HTML response stored as an MP4 file', async (t) => {
  const result = await fixture(t, '<!doctype html><html><body>Not found</body></html>')
  assert.match(result.errors[0], /expected MP4/)
})

test('rejects an invalid MP4 file-type box size', async (t) => {
  const invalid = Buffer.from(mp4Header)
  invalid.writeUInt32BE(0, 0)
  assert.match((await fixture(t, invalid)).errors[0], /invalid MP4/)
})

test('checks the real guide catalog and downloaded assets', async () => {
  const result = await verifyGuideAssets()
  assert.ok(result.videoCount > 0)
  assert.equal(result.videoCount, result.posterCount)
  assert.deepEqual(result.errors, [])
})
