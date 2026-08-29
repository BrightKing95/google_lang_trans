import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  displayLanguageName,
  localizeDocument,
  message,
  MESSAGE_KEYS,
} from '../../src/shared/i18n';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('i18n helpers', () => {
  it('uses chrome.i18n messages and falls back to the key', () => {
    chrome.i18n.getMessage = vi.fn((key: string) =>
      key === 'modeSelection' ? 'Select text' : '',
    );

    expect(message('modeSelection')).toBe('Select text');
    expect(message('close')).toBe('close');
  });

  it('uses Intl.DisplayNames for localized language names', () => {
    expect(displayLanguageName('ja', 'en')).toMatch(/Japanese/i);
    expect(displayLanguageName('de', 'zh-CN')).toContain('德');
  });

  it('localizes marked elements and sets the document language', () => {
    chrome.i18n.getUILanguage = vi.fn(() => 'zh-CN');
    chrome.i18n.getMessage = vi.fn((key: string) =>
      key === 'enabled' ? '已启用' : key,
    );
    document.body.innerHTML = '<span data-i18n="enabled"></span>';

    localizeDocument(document);

    expect(document.querySelector('span')?.textContent).toBe('已启用');
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('keeps English and Chinese catalogs in exact key parity', () => {
    const en = JSON.parse(
      readFileSync('src/_locales/en/messages.json', 'utf8'),
    ) as Record<string, unknown>;
    const zh = JSON.parse(
      readFileSync('src/_locales/zh_CN/messages.json', 'utf8'),
    ) as Record<string, unknown>;
    const expected = [...MESSAGE_KEYS].sort();

    expect(Object.keys(en).sort()).toEqual(expected);
    expect(Object.keys(zh).sort()).toEqual(expected);
  });
});
