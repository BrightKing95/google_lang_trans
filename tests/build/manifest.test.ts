import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('manifest', () => {
  it('uses MV3, Chrome 138, minimal permissions, and no background worker', () => {
    const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe('138');
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest.background).toBeUndefined();
    expect(manifest.icons).toEqual({
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    });
    expect(manifest.action.default_icon).toEqual(manifest.icons);
    expect(manifest.content_scripts[0]).toMatchObject({
      matches: ['http://*/*', 'https://*/*'],
      all_frames: false,
      js: ['content.js'],
    });
  });
});
