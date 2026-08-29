import {
  normalizeSupportedLanguage,
  resolveDefaultTargetLanguage,
  type SupportedLanguage,
} from './languages';

export type TranslationMode = 'selection' | 'hover';

export interface ExtensionSettings {
  enabled: boolean;
  mode: TranslationMode;
  targetLanguage: SupportedLanguage;
}

export const SETTINGS_KEY = 'settings';
export const DEFAULT_MODE: TranslationMode = 'selection';
let updateQueue: Promise<void> = Promise.resolve();

function defaultSettings(): ExtensionSettings {
  return {
    enabled: true,
    mode: DEFAULT_MODE,
    targetLanguage: resolveDefaultTargetLanguage(chrome.i18n.getUILanguage()),
  };
}

function sanitizeSettings(value: unknown): ExtensionSettings {
  const defaults = defaultSettings();
  if (!value || typeof value !== 'object') return defaults;

  const candidate = value as Partial<Record<keyof ExtensionSettings, unknown>>;
  const language = typeof candidate.targetLanguage === 'string'
    ? normalizeSupportedLanguage(candidate.targetLanguage)
    : null;

  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : defaults.enabled,
    mode: candidate.mode === 'hover' || candidate.mode === 'selection'
      ? candidate.mode
      : defaults.mode,
    targetLanguage: language ?? defaults.targetLanguage,
  };
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return sanitizeSettings(stored[SETTINGS_KEY]);
}

async function applySettingsUpdate(
  patch: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const current = await loadSettings();
  const normalizedLanguage = typeof patch.targetLanguage === 'string'
    ? normalizeSupportedLanguage(patch.targetLanguage)
    : null;
  const next: ExtensionSettings = {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
    mode: patch.mode === 'hover' || patch.mode === 'selection' ? patch.mode : current.mode,
    targetLanguage: normalizedLanguage ?? current.targetLanguage,
  };

  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export function updateSettings(
  patch: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const operation = updateQueue.then(() => applySettingsUpdate(patch));
  updateQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

export function watchSettings(
  listener: (settings: ExtensionSettings) => void,
): () => void {
  const onChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local') return;
    const next = changes[SETTINGS_KEY]?.newValue;
    if (next === undefined) return;
    listener(sanitizeSettings(next));
  };

  chrome.storage.onChanged.addListener(onChanged);
  return () => chrome.storage.onChanged.removeListener(onChanged);
}
