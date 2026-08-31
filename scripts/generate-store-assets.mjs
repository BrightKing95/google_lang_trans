import {
  copyFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { renderSvgWithFallback } from './asset-renderer.mjs';

const sips = [process.env.QUICK_TRANSLATE_SIPS_BIN, '/usr/bin/sips']
  .filter(Boolean)
  .find(candidate => existsSync(candidate));
const candidates = [
  process.env.QUICK_TRANSLATE_CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const chrome = candidates.find(candidate => existsSync(candidate));
if (!sips && !chrome) {
  throw new Error(
    'No SVG renderer found. Install Chrome/Chromium or set QUICK_TRANSLATE_CHROME_BIN.',
  );
}

function renderSvg(source, output, width, height, transparent = false) {
  renderSvgWithFallback({
    source,
    output,
    width,
    height,
    transparent,
    sips,
    chrome,
  });
}

for (const size of [16, 32, 48, 128]) {
  renderSvg('store-assets/source/icon.svg', `src/icons/icon-${size}.png`, size, size, true);
}
mkdirSync('store-assets/output', { recursive: true });
copyFileSync('src/icons/icon-128.png', 'store-assets/output/store-icon-128.png');
renderSvg(
  'store-assets/source/screenshot-en.svg',
  'store-assets/output/screenshot-en.png',
  1280,
  800,
);
renderSvg(
  'store-assets/source/screenshot-zh-CN.svg',
  'store-assets/output/screenshot-zh-CN.png',
  1280,
  800,
);
renderSvg(
  'store-assets/source/small-promo.svg',
  'store-assets/output/small-promo.png',
  440,
  280,
);

console.log('store assets generated');
