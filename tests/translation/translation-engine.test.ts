import { describe, expect, it, vi } from 'vitest';
import { TranslationEngine } from '../../src/translation/translation-engine';
import type {
  BuiltInAiAdapter,
  ModelAvailability,
  TranslationState,
} from '../../src/translation/types';

function createFakeAiAdapter(
  options: { detectedLanguage?: string; translation?: string } = {},
) {
  const detector = {
    detect: vi.fn(async () => [{
      detectedLanguage: options.detectedLanguage ?? 'en',
      confidence: 0.99,
    }]),
    destroy: vi.fn(),
  };
  const translator = {
    translate: vi.fn(async () => options.translation ?? 'translated'),
    destroy: vi.fn(),
  };
  const adapter = {
    detectorAvailability: vi.fn(async (): Promise<ModelAvailability> => 'downloadable'),
    createDetector: vi.fn(async (_onProgress: (loaded: number) => void) => detector),
    translatorAvailability: vi.fn(async (): Promise<ModelAvailability> => 'available'),
    createTranslator: vi.fn(async () => translator),
  } satisfies BuiltInAiAdapter;
  return { adapter, detector, translator };
}

describe('TranslationEngine', () => {
  it('detects, prepares, translates, and caches a language pair', async () => {
    const harness = createFakeAiAdapter({
      detectedLanguage: 'en',
      translation: '你好',
    });
    const engine = new TranslationEngine(harness.adapter);
    const states: TranslationState[] = [];

    const result = await engine.translate('hello', 'zh', state => states.push(state));

    expect(result).toEqual({
      kind: 'success',
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      translatedText: '你好',
    });
    expect(states.map(state => state.kind)).toEqual([
      'preparing',
      'translating',
      'success',
    ]);

    await engine.translate('hello again', 'zh', () => undefined);
    expect(harness.adapter.createTranslator).toHaveBeenCalledTimes(1);
  });

  it('does not create a translator for equivalent languages', async () => {
    const harness = createFakeAiAdapter({ detectedLanguage: 'en-US' });
    const engine = new TranslationEngine(harness.adapter);

    await expect(engine.translate('hello', 'en', () => undefined)).resolves.toEqual({
      kind: 'same-language',
      language: 'en-US',
    });
    expect(harness.adapter.createTranslator).not.toHaveBeenCalled();
  });

  it('reports an unavailable detector without creating a translator', async () => {
    const harness = createFakeAiAdapter();
    harness.adapter.detectorAvailability.mockResolvedValue('unavailable');
    const engine = new TranslationEngine(harness.adapter);

    await expect(engine.translate('hello', 'zh', () => undefined)).resolves.toEqual({
      kind: 'unsupported',
      targetLanguage: 'zh',
    });
    expect(harness.adapter.createDetector).not.toHaveBeenCalled();
    expect(harness.adapter.createTranslator).not.toHaveBeenCalled();
  });

  it('reports an unavailable language pair without creating its translator', async () => {
    const harness = createFakeAiAdapter();
    harness.adapter.translatorAvailability.mockResolvedValue('unavailable');
    const engine = new TranslationEngine(harness.adapter);

    await expect(engine.translate('hello', 'zh', () => undefined)).resolves.toEqual({
      kind: 'unsupported',
      sourceLanguage: 'en',
      targetLanguage: 'zh',
    });
    expect(harness.adapter.createTranslator).not.toHaveBeenCalled();
  });

  it('emits download progress and maps translation failure to a retryable error', async () => {
    const harness = createFakeAiAdapter();
    harness.adapter.createDetector.mockImplementation(async onProgress => {
      onProgress(0.5);
      return harness.detector;
    });
    harness.translator.translate.mockRejectedValue(new Error('offline'));
    const engine = new TranslationEngine(harness.adapter);
    const states: TranslationState[] = [];

    await expect(engine.translate('hello', 'zh', state => states.push(state))).resolves.toEqual({
      kind: 'error',
      retryable: true,
    });
    expect(states).toContainEqual({ kind: 'preparing', progress: 0.5 });
  });

  it('destroys the detector and cached translators exactly once', async () => {
    const harness = createFakeAiAdapter();
    const engine = new TranslationEngine(harness.adapter);
    await engine.translate('hello', 'zh', () => undefined);

    engine.destroy();
    engine.destroy();

    expect(harness.detector.destroy).toHaveBeenCalledOnce();
    expect(harness.translator.destroy).toHaveBeenCalledOnce();
  });
});
