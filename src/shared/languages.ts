export const SUPPORTED_LANGUAGES = [
  'ar',
  'bg',
  'bn',
  'cs',
  'da',
  'de',
  'el',
  'en',
  'es',
  'fi',
  'fr',
  'he',
  'hi',
  'hr',
  'hu',
  'id',
  'it',
  'ja',
  'kn',
  'ko',
  'lt',
  'mr',
  'nl',
  'no',
  'pl',
  'pt',
  'ro',
  'ru',
  'sk',
  'sl',
  'sv',
  'ta',
  'te',
  'th',
  'tr',
  'uk',
  'vi',
  'zh',
  'zh-Hant',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const supportedLanguages = new Set<string>(SUPPORTED_LANGUAGES);

export function normalizeSupportedLanguage(tag: string): SupportedLanguage | null {
  const normalized = tag.trim().replaceAll('_', '-');
  const lower = normalized.toLowerCase();

  if (
    lower === 'zh-tw'
    || lower === 'zh-hk'
    || lower === 'zh-mo'
    || lower.startsWith('zh-hant')
  ) {
    return 'zh-Hant';
  }

  if (
    lower === 'zh-cn'
    || lower === 'zh-sg'
    || lower === 'zh'
    || lower.startsWith('zh-hans')
  ) {
    return 'zh';
  }

  const exact = SUPPORTED_LANGUAGES.find(code => code.toLowerCase() === lower);
  if (exact) return exact;

  const primary = lower.split('-')[0]!;
  return supportedLanguages.has(primary) ? primary as SupportedLanguage : null;
}

export function resolveDefaultTargetLanguage(uiLanguage: string): SupportedLanguage {
  return normalizeSupportedLanguage(uiLanguage) ?? 'en';
}

export function areEquivalentLanguages(a: string, b: string): boolean {
  const normalizedA = normalizeSupportedLanguage(a);
  const normalizedB = normalizeSupportedLanguage(b);
  return normalizedA !== null && normalizedA === normalizedB;
}
