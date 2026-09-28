/**
 * Visual inspection of the hero objects: the heart from several angles, hover,
 * heartbeat, then the gift room (orbit, hover, opening) and the finale.
 *
 *   npm run qa:visual -- --url=http://localhost:4173/ [--size=1440x900] [--mobile] [--only=heart]
 *
 * Screenshots land in qa-output/visual-<size>/. Uses the real GPU when available
 * (--gpu) so materials look like they will for her; falls back to SwiftShader.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const url = args.url ?? 'http://localhost:4173/';
const [w, h] = String(args.size ?? '1440x900').split('x').map(Number);
const mobile = !!args.mobile;
const only = args.only;
const out = `qa-output/visual-${w}x${h}${mobile ? '-touch' : ''}`;
mkdirSync(out, { recursive: true });
const password = /birthdayPassword:\s*'([^']+)'/.exec(readFileSync('src/config/birthday.ts', 'utf8'))?.[1] ?? '01/01/2000';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({
  executablePath: exe,
  args: args.gpu
    ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=default']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({
  viewport: { width: w, height: h },
  deviceScaleFactor: mobile ? 2 : 1,
  isMobile: mobile,
  hasTouch: mobile,
});
const page = await context.newPage();
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

let n = 0;
const snap = async (name) => {
  const file = `${out}/${String(++n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  console.log('• shot', file);
};
const tap = (x, y) => (mobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
/** A slow drag that stops before release (no fling), so the pose stays put for the shot. */
const drag = async (x, y, dx, dy, steps = 24) => {
  if (mobile) {
    const cdp = await context.newCDPSession(page);
    const pt = (px, py) => [{ x: px, y: py }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y) });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x + (dx * i) / steps, y + (dy * i) / steps) });
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(150);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return;
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(150);
  await page.mouse.up();
};

try {
  await page.goto(`${url}?reset`, { waitUntil: 'networkidle' });
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  console.log('• renderer:', renderer);
  await page.waitForTimeout(3500);
  await snap('heart-front');

  // turn the heart: ~0.006 rad per px
  await drag(w / 2 - 130, h / 2 + 200, 262, 0);
  await page.waitForTimeout(900);
  await snap('heart-90');
  await drag(w / 2 - 130, h / 2 + 200, 262, 0);
  await page.waitForTimeout(900);
  await snap('heart-180');
  await drag(w / 2, h / 2 + 200, 0, -160);
  await page.waitForTimeout(900);
  await snap('heart-top');
  // let it drift home
  await page.waitForTimeout(7000);
  await snap('heart-home');

  if (!mobile) {
    await page.mouse.move(w / 2 - 60, h / 2 - 40, { steps: 12 });
    await page.waitForTimeout(1200);
    await snap('heart-hover-left');
    await page.mouse.move(w / 2 + 70, h / 2 + 10, { steps: 12 });
    await page.waitForTimeout(1200);
    await snap('heart-hover-right');
  }
  await tap(w / 2, h / 2);
  await page.waitForTimeout(300);
  await snap('heart-beat-peak');
  await page.waitForTimeout(900);
  await snap('heart-after-beat');
  if (only === 'heart') throw 'done';

  await tap(w / 2, h / 2);
  await page.waitForTimeout(900);
  await tap(w / 2, h / 2);
  await page.locator('#bday').waitFor({ timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.locator('#bday').pressSequentially(password.replace(/\D/g, ''), { delay: 20 });
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Step inside' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(5500);
  await page.getByRole('button', { name: 'Step inside' }).click();
  await page.waitForTimeout(2200);
  await snap('room-arrive');
  await page.waitForTimeout(1800);
  await snap('room');
  await drag(w * 0.85, h * 0.3, -w * 0.45, 0);
  await page.waitForTimeout(1200);
  await snap('room-orbit-left');
  await drag(w * 0.85, h * 0.3, -w * 0.45, 60);
  await page.waitForTimeout(1200);
  await snap('room-orbit-more');
  await page.waitForTimeout(6000);
  await snap('room-settled');
  const label = page.locator('.gift-label').first();
  const box = await label.boundingBox();
  if (box && !mobile) {
    await page.mouse.move(box.x + box.width / 2, box.y - 35, { steps: 10 });
    await page.waitForTimeout(1200);
    await snap('gift-hover');
  }
  if (box) await tap(box.x + box.width / 2, box.y - 35);
  await page.waitForTimeout(450);
  await snap('gift-opening-1');
  await page.waitForTimeout(450);
  await snap('gift-opening-2');
  await page.locator('.sheet').waitFor({ timeout: 8000 });
  await page.waitForTimeout(1200);
  await snap('memory');
} catch (e) {
  if (e !== 'done') problems.push(`step failed: ${String(e.message ?? e).split('\n')[0]}`);
}
await browser.close();
if (problems.length) {
  console.log(`✗ ${problems.length} problem(s):`);
  problems.forEach((p) => console.log('  -', p));
  process.exit(1);
}
console.log('✓ visual pass done');
