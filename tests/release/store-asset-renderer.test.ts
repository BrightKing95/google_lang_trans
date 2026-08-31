import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

// @ts-expect-error Release scripts are plain Node ESM and are not compiled by TypeScript.
import { renderSvgWithFallback } from '../../scripts/asset-renderer.mjs';

it('falls back to Chrome when sips cannot render an SVG', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'quick-translate-renderer-'));
  const output = join(temporary, 'icon.png');
  const commands: string[] = [];

  try {
    renderSvgWithFallback({
      source: 'store-assets/source/icon.svg',
      output,
      width: 16,
      height: 16,
      transparent: true,
      sips: '/fake/sips',
      chrome: '/fake/chrome',
      runCommand(command: string) {
        commands.push(command);
        if (command === '/fake/sips') throw new Error('SVG unsupported');
        copyFileSync('src/icons/icon-16.png', output);
      },
    });

    const png = readFileSync(output);
    expect(commands).toEqual(['/fake/sips', '/fake/chrome']);
    expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({
      width: 16,
      height: 16,
    });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
