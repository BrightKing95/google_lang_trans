import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  copyText,
  installContentApp,
  speakText,
  startContentApp,
  type ContentAppDependencies,
} from '../../src/content/index';
import type { InteractionController } from '../../src/content/interaction-controller';
import type { ExtensionSettings } from '../../src/shared/settings';
import { resetChromeStorageFake } from '../setup';

class FakeUtterance {
  lang = '';

  constructor(public readonly text: string) {}
}

beforeEach(() => {
  resetChromeStorageFake();
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function createContentAppHarness() {
  const initial = {
    enabled: true,
    mode: 'selection',
    targetLanguage: 'en',
  } as const;
  const controller = {
    start: vi.fn(),
    applySettings: vi.fn(),
    stop: vi.fn(),
  };
  const unsubscribe = vi.fn();
  let subscriber: ((settings: ExtensionSettings) => void) | undefined;
  const dependencies: ContentAppDependencies = {
    loadSettings: vi.fn(async () => initial),
    watchSettings: vi.fn(listener => {
      subscriber = listener;
      return unsubscribe;
    }),
    createController: vi.fn(
      () => controller as unknown as InteractionController,
    ),
  };
  return {
    dependencies,
    controller,
    unsubscribe,
    emitSettings(settings: ExtensionSettings) {
      subscriber!(settings);
    },
  };
}

describe('content app composition', () => {
  it('loads settings, starts once, applies storage changes, and cleans up once', async () => {
    const harness = createContentAppHarness();

    const stop = await startContentApp(harness.dependencies);
    expect(harness.controller.start).toHaveBeenCalledWith({
      enabled: true,
      mode: 'selection',
      targetLanguage: 'en',
    });
    harness.emitSettings({
      enabled: true,
      mode: 'hover',
      targetLanguage: 'ja',
    });
    expect(harness.controller.applySettings).toHaveBeenCalledWith({
      enabled: true,
      mode: 'hover',
      targetLanguage: 'ja',
    });

    stop();
    stop();
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    expect(harness.controller.stop).toHaveBeenCalledOnce();
  });

  it('cleans up models and listeners on a non-BFCache pagehide', async () => {
    const harness = createContentAppHarness();
    const cleanup = await installContentApp(harness.dependencies, window);
    const pagehide = new Event('pagehide');
    Object.defineProperty(pagehide, 'persisted', { value: false });

    window.dispatchEvent(pagehide);

    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    expect(harness.controller.stop).toHaveBeenCalledOnce();
    cleanup();
    expect(harness.controller.stop).toHaveBeenCalledOnce();
  });
});

describe('translation actions', () => {
  it('copies with the Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    await copyText('你好', document);

    expect(writeText).toHaveBeenCalledWith('你好');
    expect(document.querySelector('textarea[data-quick-translate-copy]')).toBeNull();
  });

  it('falls back to a temporary readonly textarea when clipboard access fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const exec = vi.fn(() => {
      const host = document.querySelector<HTMLElement>(
        '[data-quick-translate-copy-host]',
      );
      expect(host).not.toBeNull();
      expect(host?.shadowRoot).toBeNull();
      expect(document.querySelector('textarea')).toBeNull();
      return true;
    });
    Object.defineProperty(document, 'execCommand', {
      value: exec,
      configurable: true,
    });

    await copyText('你好', document);

    expect(writeText).toHaveBeenCalledWith('你好');
    expect(exec).toHaveBeenCalledWith('copy');
    expect(
      document.querySelector('[data-quick-translate-copy-host]'),
    ).toBeNull();
    expect(document.querySelector('textarea[data-quick-translate-copy]')).toBeNull();
  });

  it('speaks translated text in its target language without persisting content', () => {
    const speak = vi.fn();
    const synth = { speak } as unknown as SpeechSynthesis;

    speakText('你好', 'zh', synth);

    const utterance = speak.mock.calls[0]![0] as SpeechSynthesisUtterance;
    expect(utterance.text).toBe('你好');
    expect(utterance.lang).toBe('zh');
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect((chrome as { runtime?: unknown }).runtime).toBeUndefined();
  });
});
