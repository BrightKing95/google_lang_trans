import { readFileSync } from 'node:fs';

import { screen, waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initializePopup } from '../../src/popup/popup';
import type { ExtensionSettings } from '../../src/shared/settings';
import { resetChromeStorageFake } from '../setup';

const settingsMocks = vi.hoisted(() => ({
  loadSettings: vi.fn<() => Promise<ExtensionSettings>>(),
  updateSettings:
    vi.fn<(patch: Partial<ExtensionSettings>) => Promise<ExtensionSettings>>(),
  watchSettings: vi.fn<
    (listener: (settings: ExtensionSettings) => void) => () => void
  >(),
}));

vi.mock('../../src/shared/settings', () => settingsMocks);

const initial: ExtensionSettings = {
  enabled: true,
  mode: 'selection',
  targetLanguage: 'zh',
};

const popupBody = `
  <main id="app">
    <header><h1 data-i18n="extensionName"></h1><p id="status" role="status"></p></header>
    <label class="switch-row" for="enabled">
      <span data-i18n="enabled"></span><input id="enabled" type="checkbox">
    </label>
    <fieldset>
      <legend data-i18n="modeLabel"></legend>
      <div class="mode-options">
        <label><input type="radio" name="mode" value="selection"><span data-i18n="modeSelection"></span></label>
        <label><input type="radio" name="mode" value="hover"><span data-i18n="modeHover"></span></label>
      </div>
    </fieldset>
    <label for="target-language" data-i18n="targetLanguage"></label>
    <select id="target-language"></select>
  </main>`;

beforeEach(() => {
  vi.unstubAllGlobals();
  resetChromeStorageFake();
  settingsMocks.loadSettings.mockReset().mockResolvedValue(initial);
  settingsMocks.updateSettings
    .mockReset()
    .mockImplementation(async patch => ({ ...initial, ...patch }));
  settingsMocks.watchSettings.mockReset().mockReturnValue(vi.fn());
  const messages: Record<string, string> = {
    extensionName: 'Quick Translate',
    enabled: 'Enabled',
    modeLabel: 'Translation mode',
    modeSelection: 'Select text',
    modeHover: 'Mouse capture',
    targetLanguage: 'Target language',
    statusPreparing: 'Preparing translation…',
    statusReady: 'Ready',
    statusUnsupported: 'Chrome 138 or later is required',
    statusApiUnavailable: 'Built-in translation is unavailable',
    settingsSaveFailed: 'Settings could not be saved',
    settingsLoadFailed: 'Settings could not be loaded',
  };
  chrome.i18n.getMessage = vi.fn((key: string) => messages[key] ?? key);
  chrome.i18n.getUILanguage = vi.fn(() => 'en');
  vi.stubGlobal('LanguageDetector', { availability: vi.fn() });
  vi.stubGlobal('Translator', { availability: vi.fn() });
  document.body.innerHTML = popupBody;
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('initializePopup', () => {
  it('loads settings and keeps the two modes mutually exclusive', async () => {
    const user = userEvent.setup();
    await initializePopup();

    expect(
      (screen.getByRole('radio', { name: 'Select text' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    await user.click(screen.getByRole('radio', { name: 'Mouse capture' }));

    expect(settingsMocks.updateSettings).toHaveBeenCalledWith({ mode: 'hover' });
    expect(
      (screen.getByRole('radio', { name: 'Select text' }) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });

  it('writes only changed fields and renders external settings updates', async () => {
    const user = userEvent.setup();
    await initializePopup();

    await user.click(screen.getByRole('checkbox', { name: 'Enabled' }));
    expect(settingsMocks.updateSettings).toHaveBeenCalledWith({ enabled: false });

    const subscriber = settingsMocks.watchSettings.mock.calls[0]![0];
    subscriber({ enabled: true, mode: 'hover', targetLanguage: 'ja' });
    expect(
      (screen.getByRole('radio', { name: 'Mouse capture' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      screen.getByRole('combobox', {
        name: 'Target language',
      }) as HTMLSelectElement,
    ).toHaveProperty('value', 'ja');
  });

  it('localizes language options and persists a target language change', async () => {
    const user = userEvent.setup();
    await initializePopup();
    const target = screen.getByRole('combobox', {
      name: 'Target language',
    }) as HTMLSelectElement;

    expect(target.options.length).toBeGreaterThan(30);
    expect(target.selectedOptions[0]?.textContent).toMatch(/Chinese/i);
    await user.selectOptions(target, 'ja');
    expect(settingsMocks.updateSettings).toHaveBeenCalledWith({
      targetLanguage: 'ja',
    });
  });

  it('shows unsupported status and disables modes without hiding target language', async () => {
    vi.stubGlobal('LanguageDetector', undefined);
    vi.stubGlobal('Translator', undefined);

    await initializePopup();

    expect(screen.getByRole('status').textContent).toBe(
      'Chrome 138 or later is required',
    );
    for (const radio of screen.getAllByRole('radio')) {
      expect((radio as HTMLInputElement).disabled).toBe(true);
    }
    expect(
      screen.getByRole('combobox', { name: 'Target language' }),
    ).not.toBeNull();
  });

  it('reports unsupported when the detector API is present but unavailable', async () => {
    vi.mocked(LanguageDetector.availability).mockResolvedValue('unavailable');

    await initializePopup();

    expect(screen.getByRole('status').textContent).toBe(
      'Built-in translation is unavailable',
    );
    expect(
      (screen.getByRole('radio', { name: 'Select text' }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });

  it('reverts controls and reports a settings write failure', async () => {
    const user = userEvent.setup();
    settingsMocks.updateSettings.mockRejectedValueOnce(new Error('storage'));
    await initializePopup();
    const checkbox = screen.getByRole('checkbox', {
      name: 'Enabled',
    }) as HTMLInputElement;

    await user.click(checkbox);

    await waitFor(() => {
      expect(checkbox.checked).toBe(true);
      expect(screen.getByRole('status').textContent).toBe(
        'Settings could not be saved',
      );
    });
  });

  it('keeps the last confirmed settings when a later overlapping write fails', async () => {
    const user = userEvent.setup();
    let resolveFirst!: (settings: ExtensionSettings) => void;
    let rejectSecond!: (error: Error) => void;
    settingsMocks.updateSettings
      .mockImplementationOnce(
        () => new Promise(resolve => {
          resolveFirst = resolve;
        }),
      )
      .mockImplementationOnce(
        () => new Promise((_resolve, reject) => {
          rejectSecond = reject;
        }),
      );
    await initializePopup();
    const checkbox = screen.getByRole('checkbox', {
      name: 'Enabled',
    }) as HTMLInputElement;
    const target = screen.getByRole('combobox', {
      name: 'Target language',
    }) as HTMLSelectElement;

    await user.click(checkbox);
    await user.selectOptions(target, 'ja');
    resolveFirst({ ...initial, enabled: false });
    await waitFor(() => expect(checkbox.checked).toBe(false));
    rejectSecond(new Error('storage'));

    await waitFor(() => {
      expect(checkbox.checked).toBe(false);
      expect(target.value).toBe('zh');
      expect(screen.getByRole('status').textContent).toBe(
        'Settings could not be saved',
      );
    });
  });

  it('shows an inert error state when settings cannot be loaded', async () => {
    settingsMocks.loadSettings.mockRejectedValueOnce(new Error('storage'));

    await expect(initializePopup()).resolves.toEqual(expect.any(Function));

    expect(screen.getByRole('status').textContent).toBe(
      'Settings could not be loaded',
    );
    expect(
      (screen.getByRole('checkbox', { name: 'Enabled' }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('combobox', {
        name: 'Target language',
      }) as HTMLSelectElement).disabled,
    ).toBe(true);
  });

  it('returns the settings unsubscriber', async () => {
    const unsubscribe = vi.fn();
    settingsMocks.watchSettings.mockReturnValue(unsubscribe);

    const cleanup = await initializePopup();
    cleanup();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

it('keeps scripts external and exposes the branded accessible structure', () => {
  const html = readFileSync('src/popup/index.html', 'utf8');
  expect(html).not.toMatch(/<script[^>]*>\s*[^<]/i);
  const parsed = new DOMParser().parseFromString(html, 'text/html');

  expect(parsed.querySelector('.brand-mark')?.textContent).toBe('译');
  for (const key of [
    'extensionTagline',
    'modeSelectionDescription',
    'modeHoverDescription',
    'privacyNotice',
  ]) {
    expect(parsed.querySelector(`[data-i18n="${key}"]`)).not.toBeNull();
  }

  for (const control of parsed.querySelectorAll('input,select')) {
    const id = control.getAttribute('id');
    const wrapped = control.closest('label');
    const explicit = id ? parsed.querySelector(`label[for="${id}"]`) : null;
    expect(wrapped ?? explicit).not.toBeNull();
  }

  expect(
    parsed.querySelector('#mode-selection')?.getAttribute('aria-describedby'),
  ).toBe('mode-selection-description');
  expect(
    parsed.querySelector('#mode-hover')?.getAttribute('aria-describedby'),
  ).toBe('mode-hover-description');
});
