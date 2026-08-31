import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, expect, it } from 'vitest';

function readPngDimensions(file: string): { width: number; height: number } {
  const png = readFileSync(file);
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

beforeAll(() => {
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
});

it('builds an installable extension without remote code or a worker', () => {
  for (const file of [
    'manifest.json',
    'content.js',
    'popup.html',
    'popup.js',
    'popup.css',
    '_locales/en/messages.json',
    '_locales/zh_CN/messages.json',
    'icons/icon-16.png',
    'icons/icon-32.png',
    'icons/icon-48.png',
    'icons/icon-128.png',
  ]) {
    expect(existsSync(`dist/${file}`), file).toBe(true);
  }

  const manifest = JSON.parse(
    readFileSync('dist/manifest.json', 'utf8'),
  ) as Record<string, unknown>;
  expect(manifest.background).toBeUndefined();
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.permissions).toEqual(['storage']);
  expect(manifest.action).toMatchObject({
    default_popup: 'popup.html',
    default_icon: manifest.icons,
  });

  for (const size of [16, 32, 48, 128]) {
    expect(readPngDimensions(`dist/icons/icon-${size}.png`)).toEqual({
      width: size,
      height: size,
    });
  }

  const scripts =
    readFileSync('dist/content.js', 'utf8') +
    readFileSync('dist/popup.js', 'utf8');
  expect(scripts).not.toMatch(/https?:\/\//);
  expect(scripts).not.toMatch(/\beval\s*\(/);
  expect(scripts).not.toMatch(/\bnew\s+Function\b/);
});

it('rejects a remote asset inserted into built HTML', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'quick-translate-dist-'));
  const fixture = join(temporary, 'dist');
  cpSync('dist', fixture, { recursive: true });
  writeFileSync(
    join(fixture, 'popup.html'),
    '<!doctype html><script src="https://example.com/remote.js"></script>',
  );

  try {
    expect(() =>
      execFileSync(
        process.execPath,
        ['scripts/validate-dist.mjs', fixture],
        { stdio: 'pipe' },
      ),
    ).toThrow(/forbidden remote URL/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

it('rejects a protocol-relative asset inserted into built HTML', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'quick-translate-dist-'));
  const fixture = join(temporary, 'dist');
  cpSync('dist', fixture, { recursive: true });
  writeFileSync(
    join(fixture, 'popup.html'),
    '<!doctype html><script src="//example.com/remote.js"></script>',
  );

  try {
    expect(() =>
      execFileSync(
        process.execPath,
        ['scripts/validate-dist.mjs', fixture],
        { stdio: 'pipe' },
      ),
    ).toThrow(/forbidden protocol-relative URL/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

it.each([
  [
    'popup.html',
    '<!doctype html><img srcset="//example.com/image.png 1x">',
  ],
  ['popup.js', 'import("//example.com/module.js")'],
  ['popup.js', 'new URL("//example.com/data.json")'],
])('rejects protocol-relative URLs in %s regardless of sink', (relative, source) => {
  const temporary = mkdtempSync(join(tmpdir(), 'quick-translate-dist-'));
  const fixture = join(temporary, 'dist');
  cpSync('dist', fixture, { recursive: true });
  writeFileSync(join(fixture, relative), source);

  try {
    expect(() =>
      execFileSync(
        process.execPath,
        ['scripts/validate-dist.mjs', fixture],
        { stdio: 'pipe' },
      ),
    ).toThrow(/forbidden protocol-relative URL/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
