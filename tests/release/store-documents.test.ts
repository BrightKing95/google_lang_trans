import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

it('accepts the complete submission document set', () => {
  expect(() =>
    execFileSync(process.execPath, ['scripts/validate-store-listing.mjs'], {
      stdio: 'pipe',
    }),
  ).not.toThrow();
});

it('rejects inconsistent privacy policy URLs between localizations', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'quick-translate-listing-'));
  const fixture = join(temporary, 'store-listing');
  cpSync('store-listing', fixture, { recursive: true });
  const chineseListing = join(fixture, 'zh-CN.md');
  writeFileSync(
    chineseListing,
    readFileSync(chineseListing, 'utf8').replace(
      'https://github.com/favowang/google_lang_trans/blob/main/store-listing/privacy-policy.md',
      'https://example.com/different-privacy-policy.md',
    ),
  );

  try {
    expect(() =>
      execFileSync(
        process.execPath,
        ['scripts/validate-store-listing.mjs', fixture],
        { stdio: 'pipe' },
      ),
    ).toThrow(/privacy policy URLs must match/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

it('accepts a public HTTPS privacy policy URL without a Markdown suffix', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'quick-translate-listing-'));
  const fixture = join(temporary, 'store-listing');
  cpSync('store-listing', fixture, { recursive: true });
  const currentUrl =
    'https://github.com/favowang/google_lang_trans/blob/main/store-listing/privacy-policy.md';
  const hostedUrl = 'https://favowang.github.io/google_lang_trans/privacy';

  for (const relative of ['en.md', 'zh-CN.md', 'privacy-practices.md']) {
    const file = join(fixture, relative);
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(currentUrl, hostedUrl),
    );
  }

  try {
    expect(() =>
      execFileSync(
        process.execPath,
        ['scripts/validate-store-listing.mjs', fixture],
        { stdio: 'pipe' },
      ),
    ).not.toThrow();
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
