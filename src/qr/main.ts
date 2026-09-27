/**
 * The QR card — open /qr.html, then print it or download the PNG/SVG.
 * The URL comes ONLY from birthdayConfig.siteUrl.
 *
 * Scannability rules we keep: dark modules on a light background, a real
 * quiet zone, error correction "H", and nothing drawn on top of the code.
 * The heart is a frame around the code, never over it.
 */
import QRCode from 'qrcode';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/be-vietnam-pro/400.css';
import './qr.css';
import { birthdayConfig } from '../config/birthday';

const INK = '#2a1118';
const PAPER = '#fffaf6';

const HEART =
  'M200 368C84 292 22 226 22 150 22 90 66 44 124 44 158 44 186 62 200 90 214 62 242 44 276 44 334 44 378 90 378 150 378 226 316 292 200 368Z';

async function render() {
  const url = birthdayConfig.siteUrl;
  const root = document.getElementById('qr-root')!;

  const qrSvg = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 2,
    color: { dark: INK, light: PAPER },
  });
  const inner = qrSvg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const viewBox = /viewBox="([^"]+)"/.exec(qrSvg)?.[1] ?? '0 0 33 33';

  // Heart frame: 400×400 artboard, QR card sits inside the heart's body.
  const card = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 440" width="400" height="440" role="img" aria-label="QR code in a heart frame">
  <defs>
    <radialGradient id="h" cx="40%" cy="30%" r="80%">
      <stop offset="0" stop-color="#f6d6db"/>
      <stop offset=".55" stop-color="#d49aa5"/>
      <stop offset="1" stop-color="#9c4a5e"/>
    </radialGradient>
  </defs>
  <path d="${HEART}" fill="url(#h)"/>
  <path d="${HEART}" fill="none" stroke="#fff4f1" stroke-opacity=".5" stroke-width="1.5" transform="translate(200 206) scale(.95) translate(-200 -206)"/>
  <rect x="118" y="108" width="164" height="164" rx="12" fill="${PAPER}"/>
  <svg x="124" y="114" width="152" height="152" viewBox="${viewBox}" shape-rendering="crispEdges">${inner}</svg>
  <text x="200" y="420" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-style="italic" font-size="26" fill="#f1d3d6">Scan me ❤</text>
</svg>`;

  root.innerHTML = `
    <section class="qr">
      <p class="qr__eyebrow">for you — and only you</p>
      <div class="qr__art">${card}</div>
      <p class="qr__line">Something special is waiting for you…</p>
      <div class="qr__actions no-print">
        <button type="button" data-act="png">Download PNG</button>
        <button type="button" data-act="svg">Download SVG</button>
        <button type="button" data-act="print">Print</button>
      </div>
      <p class="qr__url no-print">Points to: <code></code><br/><small>Change it in <code>src/config/birthday.ts → siteUrl</code></small></p>
    </section>`;
  root.querySelector('.qr__url code')!.textContent = url;

  const svgText = card.trim();
  const download = (href: string, name: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    a.click();
  };

  root.querySelector('[data-act="svg"]')!.addEventListener('click', () => {
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const href = URL.createObjectURL(blob);
    download(href, 'scan-me.svg');
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  });

  root.querySelector('[data-act="png"]')!.addEventListener('click', async () => {
    await document.fonts.ready;
    const img = new Image();
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const href = URL.createObjectURL(blob);
    img.onload = () => {
      const scale = 4; // 1600×1760 — plenty for print
      const c = document.createElement('canvas');
      c.width = 400 * scale;
      c.height = 440 * scale;
      const g = c.getContext('2d')!;
      g.fillStyle = '#0b0608';
      g.fillRect(0, 0, c.width, c.height);
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 0, 0, c.width, c.height);
      download(c.toDataURL('image/png'), 'scan-me.png');
      URL.revokeObjectURL(href);
    };
    img.src = href;
  });

  root.querySelector('[data-act="print"]')!.addEventListener('click', () => window.print());
}

void render();
