/**
 * Performance guard for the moment that must never stutter: entering the gift room.
 *
 *   npm run qa:perf -- --url=http://localhost:4173/ [--gpu] [--budget=400]
 *
 * Fails if entering the room blocks the main thread for long (a sign the shaders
 * were not pre-compiled), or if new lit shader programs had to be built there.
 */
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const url = args.url ?? 'http://localhost:4173/';
const budget = Number(args.budget ?? 400);
const password = /birthdayPassword:\s*'([^']+)'/.exec(readFileSync('src/config/birthday.ts', 'utf8'))?.[1] ?? '01/01/2000';
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.CHROME_PATH].find((p) => p && existsSync(p));
const browser = await chromium.launch({
  executablePath: exe,
  args: args.gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  window.__long = [];
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push([e.startTime, e.duration]))).observe({ entryTypes: ['longtask'] });
});
const problems = [];
try {
  await page.goto(`${url}?reset&debug`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(720, 450);
    await page.waitForTimeout(900);
  }
  await page.locator('#bday').waitFor({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.locator('#bday').pressSequentially(password.replace(/\D/g, ''));
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Step inside' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(5500);
  const programs = () => page.evaluate(() => window.__gl?.info.programs.filter((p) => /^physical/.test(p.cacheKey)).length ?? -1);
  const before = await programs();
  const t0 = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: 'Step inside' }).click();
  await page.waitForTimeout(5000);
  const after = await programs();
  const longs = (await page.evaluate(() => window.__long)).filter(([s]) => s > t0);
  const worst = Math.round(Math.max(0, ...longs.map(([, d]) => d)));
  console.log(`• lit shader programs: ${before} before the room, ${after} in it`);
  console.log(`• longest main-thread block entering the room: ${worst} ms (budget ${budget} ms)`);
  if (before < 0) problems.push('renderer stats unavailable (is ?debug honoured?)');
  if (after > before) problems.push(`${after - before} lit shader(s) compiled on entering the room`);
  if (worst > budget) problems.push(`main thread blocked ${worst} ms entering the room`);
} catch (e) {
  problems.push(`step failed: ${e.message.split('\n')[0]}`);
}
await browser.close();
if (problems.length) {
  console.log('✗ ' + problems.join('\n✗ '));
  process.exit(1);
}
console.log('✓ performance guard passed');
