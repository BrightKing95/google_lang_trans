import { describe, expect, it } from 'vitest';
import {
  areEquivalentLanguages,
  normalizeSupportedLanguage,
  resolveDefaultTargetLanguage,
} from '../../src/shared/languages';

describe('language normalization', () => {
  it.each([
    ['zh-CN', 'zh'],
    ['zh-SG', 'zh'],
    ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'],
    ['en-US', 'en'],
    ['pt-BR', 'pt'],
  ])('maps %s to %s', (input, expected) => {
    expect(normalizeSupportedLanguage(input)).toBe(expected);
  });

  it('falls back to English for an unsupported UI language', () => {
    expect(resolveDefaultTargetLanguage('xx-ZZ')).toBe('en');
  });

  it('recognizes regional variants without conflating Chinese scripts', () => {
    expect(areEquivalentLanguages('en-US', 'en')).toBe(true);
    expect(areEquivalentLanguages('zh', 'zh-Hant')).toBe(false);
  });
});
