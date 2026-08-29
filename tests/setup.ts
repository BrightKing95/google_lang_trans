import { vi } from 'vitest';

type ChangeListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void;

let stored: Record<string, unknown> = {};
const listeners = new Set<ChangeListener>();

export function resetChromeStorageFake(): void {
  stored = {};
  listeners.clear();
  vi.stubGlobal('chrome', {
    i18n: {
      getUILanguage: vi.fn(() => 'en'),
      getMessage: vi.fn((key: string) => key),
    },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [key, newValue] of Object.entries(items)) {
            const oldValue = stored[key];
            stored[key] = newValue;
            for (const listener of listeners) {
              listener({ [key]: { oldValue, newValue } }, 'local');
            }
          }
        }),
      },
      onChanged: {
        addListener: vi.fn((listener: ChangeListener) => listeners.add(listener)),
        removeListener: vi.fn((listener: ChangeListener) => listeners.delete(listener)),
      },
    },
  });
}

resetChromeStorageFake();
