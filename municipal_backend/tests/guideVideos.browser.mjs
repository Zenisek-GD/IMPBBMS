import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import puppeteer from 'puppeteer-core';
import { READY_GUIDES } from '../../municipal-frontend/src/pages/guides/guideCatalog.js';

// No application API or database is used: verify the packaged media itself.
test('all built guide videos support HTTP ranges, browser playback and seeking', { timeout: 180000 }, async t => {
  const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium']
    .find(file => file && fs.existsSync(file));
  assert.ok(executablePath, 'Set CHROME_PATH to a browser with MP4 playback support.');
  const dist = fileURLToPath(new URL('../../municipal-frontend/dist/', import.meta.url));
  const app = express();
  app.get('/__guide_media_probe', (_req, res) => res.type('html').send('<!doctype html><html><body><video muted playsinline></video></body></html>'));
  app.use(express.static(dist));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await puppeteer.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage(), origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin + '/__guide_media_probe');
  for (const guide of READY_GUIDES) {
    await t.test(guide.title, async () => {
      const file = path.join(dist, guide.video.slice(1));
      const range = await fetch(origin + guide.video, { headers: { Range: 'bytes=0-31' } });
      assert.equal(range.status, 206);
      assert.match(range.headers.get('content-type'), /^video\/mp4\b/);
      assert.equal(range.headers.get('content-range'), `bytes 0-31/${fs.statSync(file).size}`);
      const header = Buffer.from(await range.arrayBuffer());
      assert.equal(header.toString('ascii', 4, 8), 'ftyp');
      await page.$eval('video', (video, src) => { video.pause(); video.src = src; video.load(); }, guide.video);
      await page.waitForFunction(() => { const video = document.querySelector('video'); return Boolean(video.error) || video.readyState >= 2; }, { timeout: 10000 });
      const media = await page.$eval('video', video => ({ error: video.error?.code ?? null, duration: video.duration, width: video.videoWidth }));
      assert.equal(media.error, null);
      assert.ok(media.duration > 0 && media.width > 0, 'browser decoded the MP4');
      await page.$eval('video', async video => { video.muted = true; await video.play(); });
      await page.waitForFunction(() => document.querySelector('video').currentTime > 0, { timeout: 10000 });
      await page.$eval('video', video => { video.pause(); video.currentTime = video.duration / 2; });
      await page.waitForFunction(() => { const video = document.querySelector('video'); return !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - video.duration / 2) < 0.5; }, { timeout: 10000 });
      assert.equal(await page.$eval('video', video => video.error?.code ?? null), null);
    });
  }
});
