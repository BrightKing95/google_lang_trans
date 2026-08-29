import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '../shared/languages';
import {
  loadSettings,
  updateSettings,
  watchSettings,
  type ExtensionSettings,
  type TranslationMode,
} from '../shared/settings';
import {
  displayLanguageName,
  localizeDocument,
  message,
} from '../shared/i18n';

export async function initializePopup(): Promise<() => void> {
  localizeDocument(document);
  const enabled = document.querySelector<HTMLInputElement>('#enabled');
  const modes = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="mode"]'),
  );
  const target =
    document.querySelector<HTMLSelectElement>('#target-language');
  const status = document.querySelector<HTMLElement>('#status');
  if (!enabled || modes.length === 0 || !target || !status) {
    throw new Error('Popup markup is incomplete');
  }

  status.textContent = message('statusPreparing');
  target.replaceChildren();
  for (const code of SUPPORTED_LANGUAGES) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = displayLanguageName(code);
    target.append(option);
  }

  const render = (settings: ExtensionSettings): void => {
    enabled.checked = settings.enabled;
    for (const radio of modes) {
      radio.checked = radio.value === settings.mode;
    }
    target.value = settings.targetLanguage;
  };

  render(await loadSettings());
  const supported =
    typeof LanguageDetector !== 'undefined' &&
    typeof Translator !== 'undefined';
  status.dataset.state = supported ? 'ready' : 'unsupported';
  status.textContent = message(
    supported ? 'statusReady' : 'statusUnsupported',
  );
  for (const radio of modes) radio.disabled = !supported;

  enabled.addEventListener('change', () => {
    void updateSettings({ enabled: enabled.checked });
  });
  for (const radio of modes) {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        void updateSettings({ mode: radio.value as TranslationMode });
      }
    });
  }
  target.addEventListener('change', () => {
    void updateSettings({
      targetLanguage: target.value as SupportedLanguage,
    });
  });

  return watchSettings(render);
}
