import type { SupportedLanguage } from './languages';

export const MESSAGE_KEYS = [
  'extensionName',
  'extensionDescription',
  'enabled',
  'modeLabel',
  'modeSelection',
  'modeHover',
  'targetLanguage',
  'statusReady',
  'statusPreparing',
  'statusUnsupported',
  'statusApiUnavailable',
  'settingsSaveFailed',
  'settingsLoadFailed',
  'activationRequired',
  'prepareTranslation',
  'detecting',
  'translating',
  'sameLanguage',
  'unsupportedPair',
  'translationFailed',
  'retry',
  'copy',
  'copied',
  'speak',
  'pin',
  'unpin',
  'close',
] as const;

export type MessageKey = (typeof MESSAGE_KEYS)[number];

export function message(
  key: MessageKey,
  substitutions?: string | string[],
): string {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

export function displayLanguageName(
  code: SupportedLanguage,
  locale = chrome.i18n.getUILanguage(),
): string {
  return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code;
}

export function localizeDocument(root: ParentNode = document): void {
  if (root instanceof Document) {
    root.documentElement.lang = chrome.i18n.getUILanguage();
    root.title = message('extensionName');
  }
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n as MessageKey;
    element.textContent = message(key);
  }
}
