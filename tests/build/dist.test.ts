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
  ]) {
    expect(existsSync(`dist/${file}`), file).toBe(true);
  }

  const manifest = JSON.parse(
    readFileSync('dist/manifest.json', 'utf8'),
  ) as Record<string, unknown>;
  expect(manifest.background).toBeUndefined();
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.permissions).toEqual(['storage']);

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
