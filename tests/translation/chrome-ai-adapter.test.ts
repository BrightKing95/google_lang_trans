import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromeAiAdapter } from '../../src/translation/chrome-ai-adapter';

describe('chromeAiAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports unavailable when built-in AI globals are missing', async () => {
    vi.stubGlobal('LanguageDetector', undefined);
    vi.stubGlobal('Translator', undefined);

    await expect(chromeAiAdapter.detectorAvailability()).resolves.toBe('unavailable');
    await expect(chromeAiAdapter.translatorAvailability({
      sourceLanguage: 'en',
      targetLanguage: 'zh',
    })).resolves.toBe('unavailable');
  });

  it('forwards detector download progress', async () => {
    const detector = {
      detect: vi.fn(async () => [{ detectedLanguage: 'en', confidence: 0.9 }]),
      destroy: vi.fn(),
    };
    const create = vi.fn(async (options: {
      monitor(monitor: {
        addEventListener(
          type: 'downloadprogress',
          listener: (event: { loaded: number }) => void,
        ): void;
      }): void;
    }) => {
      options.monitor({
        addEventListener: (_type, listener) => listener({ loaded: 0.4 }),
      });
      return detector;
    });
    vi.stubGlobal('LanguageDetector', {
      availability: vi.fn(async () => 'downloadable'),
      create,
    });
    const progress = vi.fn();

    const port = await chromeAiAdapter.createDetector(progress);
    await expect(port.detect('hello')).resolves.toEqual([
      { detectedLanguage: 'en', confidence: 0.9 },
    ]);
    expect(progress).toHaveBeenCalledWith(0.4);
    port.destroy();
    expect(detector.destroy).toHaveBeenCalledOnce();
  });

  it('forwards translator options and download progress', async () => {
    const translator = {
      translate: vi.fn(async () => '你好'),
      destroy: vi.fn(),
    };
    const create = vi.fn(async (options: {
      sourceLanguage: string;
      targetLanguage: string;
      monitor(monitor: {
        addEventListener(
          type: 'downloadprogress',
          listener: (event: { loaded: number }) => void,
        ): void;
      }): void;
    }) => {
      options.monitor({
        addEventListener: (_type, listener) => listener({ loaded: 0.7 }),
      });
      return translator;
    });
    vi.stubGlobal('Translator', {
      availability: vi.fn(async () => 'downloadable'),
      create,
    });
    const progress = vi.fn();

    const port = await chromeAiAdapter.createTranslator({
      sourceLanguage: 'en',
      targetLanguage: 'zh',
    }, progress);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      sourceLanguage: 'en',
      targetLanguage: 'zh',
    }));
    await expect(port.translate('hello')).resolves.toBe('你好');
    expect(progress).toHaveBeenCalledWith(0.7);
  });
});
