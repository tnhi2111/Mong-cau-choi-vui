/**
 * Renders qr.html, rasterises the QR card like a phone camera would see it,
 * and decodes it — proving the heart frame doesn't break scanning and the
 * code points at birthdayConfig.siteUrl.
 *   npm run qa:qr -- --url=http://localhost:4173/
 */
import { chromium } from 'playwright-core';
import jsQR from 'jsqr';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const base = args.url ?? 'http://localhost:4173/';
const expected = /siteUrl:\s*'([^']+)'/.exec(readFileSync('src/config/birthday.ts', 'utf8'))?.[1];
mkdirSync('qa-output/qr', { recursive: true });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
let failed = false;

for (const [w, h] of [[1280, 900], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(new URL('qr.html', base).href, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `qa-output/qr/qr-${w}.png` });
  // decode the real screenshot pixels of the card — exactly what a camera would see
  const png = (await page.locator('.qr__art').screenshot()).toString('base64');
  const decoded = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    return { w: c.width, h: c.height, data: Array.from(d.data) };
  }, png);
  const res = jsQR(Uint8ClampedArray.from(decoded.data), decoded.w, decoded.h);
  const ok = res?.data === expected;
  console.log(`${ok ? '✓' : '✗'} ${w}px: QR decodes to ${JSON.stringify(res?.data)} (expected ${JSON.stringify(expected)}) at ${decoded.w}px wide`);
  if (!ok || errors.length) failed = true;
  if (errors.length) console.log('  page errors:', errors);
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
