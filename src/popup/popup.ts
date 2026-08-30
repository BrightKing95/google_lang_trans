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
  type MessageKey,
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

  let currentSettings: ExtensionSettings;
  try {
    currentSettings = await loadSettings();
    render(currentSettings);
  } catch {
    status.dataset.state = 'error';
    status.textContent = message('settingsLoadFailed');
    enabled.disabled = true;
    for (const radio of modes) radio.disabled = true;
    target.disabled = true;
    return () => undefined;
  }

  let supported = false;
  let capabilityMessage: MessageKey = 'statusUnsupported';
  const apiPresent =
    typeof LanguageDetector !== 'undefined' &&
    typeof Translator !== 'undefined';
  if (apiPresent) {
    try {
      supported = (await LanguageDetector.availability()) !== 'unavailable';
      capabilityMessage = supported
        ? 'statusReady'
        : 'statusApiUnavailable';
    } catch {
      capabilityMessage = 'statusApiUnavailable';
    }
  }
  const renderCapability = (): void => {
    status.dataset.state = supported ? 'ready' : 'unsupported';
    status.textContent = message(capabilityMessage);
  };
  renderCapability();
  for (const radio of modes) radio.disabled = !supported;

  const persist = async (
    patch: Partial<ExtensionSettings>,
  ): Promise<void> => {
    const previous = currentSettings;
    render({ ...previous, ...patch });
    try {
      currentSettings = await updateSettings(patch);
      render(currentSettings);
      renderCapability();
    } catch {
      render(currentSettings);
      status.dataset.state = 'error';
      status.textContent = message('settingsSaveFailed');
    }
  };

  enabled.addEventListener('change', () => {
    void persist({ enabled: enabled.checked });
  });
  for (const radio of modes) {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        void persist({ mode: radio.value as TranslationMode });
      }
    });
  }
  target.addEventListener('change', () => {
    void persist({
      targetLanguage: target.value as SupportedLanguage,
    });
  });

  return watchSettings(next => {
    currentSettings = next;
    render(next);
    renderCapability();
  });
}
