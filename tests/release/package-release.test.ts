import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

it('packages extension files at the archive root without source maps', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'quick-translate-package-'));
  const fixture = join(temporary, 'dist');
  const output = join(temporary, 'release.zip');
  mkdirSync(join(fixture, 'icons'), { recursive: true });
  writeFileSync(join(fixture, 'manifest.json'), '{"manifest_version":3}');
  writeFileSync(join(fixture, 'content.js'), 'console.log("fixture")');
  writeFileSync(join(fixture, 'content.js.map'), '{}');
  writeFileSync(join(fixture, 'icons', 'icon-16.png'), 'fixture');

  try {
    execFileSync(
      process.execPath,
      ['scripts/package-release.mjs', fixture, output],
      { stdio: 'inherit' },
    );
    const entries = execFileSync('unzip', ['-Z1', output], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n');

    expect(entries).toContain('manifest.json');
    expect(entries).toContain('content.js');
    expect(entries).toContain('icons/icon-16.png');
    expect(entries).not.toContain('dist/manifest.json');
    expect(entries.some(entry => entry.endsWith('.map'))).toBe(false);
    expect(readFileSync(output).subarray(0, 2).toString('ascii')).toBe('PK');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

it('rejects an output archive inside the build directory', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'quick-translate-package-'));
  const fixture = join(temporary, 'dist');
  const output = join(fixture, 'release.zip');
  mkdirSync(fixture, { recursive: true });
  writeFileSync(join(fixture, 'manifest.json'), '{"manifest_version":3}');

  try {
    expect(() =>
      execFileSync(
        process.execPath,
        ['scripts/package-release.mjs', fixture, output],
        { stdio: 'pipe' },
      ),
    ).toThrow(/outside the build directory/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
