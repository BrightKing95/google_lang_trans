import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

function readPngDimensions(file: string): { width: number; height: number } {
  const png = readFileSync(file);
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

it.each([
  ['store-assets/output/store-icon-128.png', 128, 128],
  ['store-assets/output/screenshot-en.png', 1280, 800],
  ['store-assets/output/screenshot-zh-CN.png', 1280, 800],
  ['store-assets/output/small-promo.png', 440, 280],
] as const)('provides %s at the required dimensions', (file, width, height) => {
  expect(readPngDimensions(file)).toEqual({ width, height });
});
