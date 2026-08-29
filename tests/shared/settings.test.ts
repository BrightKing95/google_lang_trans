import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadSettings,
  updateSettings,
  watchSettings,
} from '../../src/shared/settings';
import { resetChromeStorageFake } from '../setup';

describe('settings', () => {
  beforeEach(() => {
    resetChromeStorageFake();
  });

  it('merges defaults from the browser UI language', async () => {
    chrome.i18n.getUILanguage = vi.fn(() => 'zh-CN');

    await expect(loadSettings()).resolves.toEqual({
      enabled: true,
      mode: 'selection',
      targetLanguage: 'zh',
    });
  });

  it('validates updates and notifies subscribers', async () => {
    const listener = vi.fn();
    const unsubscribe = watchSettings(listener);

    await updateSettings({ mode: 'hover', targetLanguage: 'ja' });

    expect(listener).toHaveBeenCalledWith({
      enabled: true,
      mode: 'hover',
      targetLanguage: 'ja',
    });
    unsubscribe();
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledOnce();
  });

  it('retains current values when an update is invalid', async () => {
    await updateSettings({ mode: 'hover', targetLanguage: 'ja' });

    await expect(updateSettings({
      mode: 'invalid' as never,
      targetLanguage: 'xx-ZZ' as never,
    })).resolves.toEqual({
      enabled: true,
      mode: 'hover',
      targetLanguage: 'ja',
    });
  });

  it('serializes concurrent partial updates without losing fields', async () => {
    await Promise.all([
      updateSettings({ enabled: false }),
      updateSettings({ mode: 'hover' }),
      updateSettings({ targetLanguage: 'ja' }),
    ]);

    await expect(loadSettings()).resolves.toEqual({
      enabled: false,
      mode: 'hover',
      targetLanguage: 'ja',
    });
  });
});
