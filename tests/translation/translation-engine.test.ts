import { afterEach, describe, expect, it, vi } from 'vitest';
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
    detectorAvailability: vi.fn(async (): Promise<ModelAvailability> => 'available'),
    createDetector: vi.fn(async (_onProgress: (loaded: number) => void) => detector),
    translatorAvailability: vi.fn(async (): Promise<ModelAvailability> => 'available'),
    createTranslator: vi.fn(async () => translator),
  } satisfies BuiltInAiAdapter;
  return { adapter, detector, translator };
}

describe('TranslationEngine', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('detects, prepares, translates, and caches a language pair', async () => {
    const harness = createFakeAiAdapter({
      detectedLanguage: 'en',
      translation: '你好',
    });
    const engine = new TranslationEngine(harness.adapter);
    const states: TranslationState[] = [];

    harness.adapter.detectorAvailability.mockResolvedValue('downloadable');
    const result = await engine.translate(
      'hello',
      'zh',
      state => states.push(state),
      { userActivated: true },
    );

    expect(result).toEqual({
      kind: 'success',
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      translatedText: '你好',
    });
    expect(states.map(state => state.kind)).toEqual([
      'preparing',
      'preparing',
      'translating',
      'success',
    ]);

    await engine.translate('hello again', 'zh', () => undefined);
    expect(harness.adapter.createTranslator).toHaveBeenCalledTimes(1);
  });

  it('reuses ready models without reporting another preparation phase', async () => {
    const harness = createFakeAiAdapter();
    const engine = new TranslationEngine(harness.adapter);
    await engine.translate('first', 'zh', () => undefined);
    const states: TranslationState[] = [];

    await engine.translate('second', 'zh', state => states.push(state));

    expect(states.map(state => state.kind)).toEqual(['translating', 'success']);
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

  it('requires an explicit activation before creating a downloadable detector', async () => {
    const harness = createFakeAiAdapter();
    harness.adapter.detectorAvailability.mockResolvedValue('downloadable');
    const engine = new TranslationEngine(harness.adapter);

    await expect(
      engine.translate('hello', 'zh', () => undefined),
    ).resolves.toEqual({
      kind: 'activation-required',
      phase: 'detector',
    });
    expect(harness.adapter.createDetector).not.toHaveBeenCalled();
  });

  it('starts detector creation synchronously inside a user activation', async () => {
    const harness = createFakeAiAdapter();
    let active = true;
    harness.adapter.createDetector.mockImplementation(async () => {
      expect(active).toBe(true);
      return harness.detector;
    });
    const engine = new TranslationEngine(harness.adapter);

    const result = engine.translate('hello', 'zh', () => undefined, {
      userActivated: true,
    });
    active = false;

    await expect(result).resolves.toMatchObject({ kind: 'success' });
  });

  it('prepares downloadable detector and translator with separate activations', async () => {
    const harness = createFakeAiAdapter({ translation: '你好' });
    harness.adapter.detectorAvailability.mockResolvedValue('downloadable');
    harness.adapter.translatorAvailability.mockResolvedValue('downloadable');
    const engine = new TranslationEngine(harness.adapter);

    await expect(engine.translate('hello', 'zh', () => undefined)).resolves.toEqual({
      kind: 'activation-required',
      phase: 'detector',
    });
    await expect(
      engine.translate('hello', 'zh', () => undefined, { userActivated: true }),
    ).resolves.toEqual({
      kind: 'activation-required',
      phase: 'translator',
    });
    expect(harness.adapter.createDetector).toHaveBeenCalledOnce();
    expect(harness.adapter.createTranslator).not.toHaveBeenCalled();

    let active = true;
    harness.adapter.createTranslator.mockImplementation(async () => {
      expect(active).toBe(true);
      return harness.translator;
    });
    const translated = engine.translate(
      'hello',
      'zh',
      () => undefined,
      { userActivated: true },
    );
    active = false;

    await expect(translated).resolves.toMatchObject({
      kind: 'success',
      translatedText: '你好',
    });
    expect(harness.adapter.createTranslator).toHaveBeenCalledOnce();
  });

  it('maps a user-activation rejection back to the activation prompt', async () => {
    const harness = createFakeAiAdapter();
    const notAllowed = Object.assign(new Error('activation required'), {
      name: 'NotAllowedError',
    });
    harness.adapter.createDetector.mockRejectedValueOnce(notAllowed);
    const engine = new TranslationEngine(harness.adapter);

    await expect(
      engine.translate('hello', 'zh', () => undefined, { userActivated: true }),
    ).resolves.toEqual({
      kind: 'activation-required',
      phase: 'detector',
    });

    await expect(
      engine.translate('hello', 'zh', () => undefined, { userActivated: true }),
    ).resolves.toMatchObject({ kind: 'success' });
    expect(harness.adapter.createDetector).toHaveBeenCalledTimes(2);
  });

  it('normalizes a detected regional source tag before creating a translator', async () => {
    const harness = createFakeAiAdapter({ detectedLanguage: 'en-US' });
    const engine = new TranslationEngine(harness.adapter);

    await expect(
      engine.translate('hello', 'zh', () => undefined),
    ).resolves.toMatchObject({ kind: 'success', sourceLanguage: 'en' });
    expect(harness.adapter.translatorAvailability).toHaveBeenCalledWith({
      sourceLanguage: 'en',
      targetLanguage: 'zh',
    });
  });

  it('reports an unsupported detected language instead of passing its raw tag', async () => {
    const harness = createFakeAiAdapter({ detectedLanguage: 'xx-Unknown' });
    const engine = new TranslationEngine(harness.adapter);

    await expect(
      engine.translate('hello', 'zh', () => undefined),
    ).resolves.toEqual({ kind: 'unsupported', targetLanguage: 'zh' });
    expect(harness.adapter.translatorAvailability).not.toHaveBeenCalled();
  });

  it('deduplicates identical text and language results for 30 seconds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T00:00:00Z'));
    const harness = createFakeAiAdapter({ translation: '你好' });
    const engine = new TranslationEngine(harness.adapter);

    await engine.translate('hello', 'zh', () => undefined);
    await engine.translate('hello', 'zh', () => undefined);
    expect(harness.translator.translate).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(30_001);
    await engine.translate('hello', 'zh', () => undefined);
    expect(harness.translator.translate).toHaveBeenCalledTimes(2);
  });

  it('shares detector creation across concurrent translations', async () => {
    const harness = createFakeAiAdapter();
    let resolveDetector!: (detector: typeof harness.detector) => void;
    harness.adapter.createDetector.mockImplementation(
      () => new Promise(resolve => {
        resolveDetector = resolve;
      }),
    );
    const engine = new TranslationEngine(harness.adapter);

    const first = engine.translate('first', 'zh', () => undefined);
    const second = engine.translate('second', 'zh', () => undefined);
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.adapter.createDetector).toHaveBeenCalledOnce();
    resolveDetector(harness.detector);

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it('shares translator creation across concurrent translations for one pair', async () => {
    const harness = createFakeAiAdapter();
    let resolveTranslator!: (translator: typeof harness.translator) => void;
    harness.adapter.createTranslator.mockImplementation(
      () => new Promise(resolve => {
        resolveTranslator = resolve;
      }),
    );
    const engine = new TranslationEngine(harness.adapter);

    const first = engine.translate('first', 'zh', () => undefined);
    const second = engine.translate('second', 'zh', () => undefined);
    await vi.waitFor(() => {
      expect(harness.adapter.createTranslator).toHaveBeenCalledOnce();
    });
    resolveTranslator(harness.translator);

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(harness.adapter.createTranslator).toHaveBeenCalledOnce();
  });

  it('shares an in-flight identical translation result', async () => {
    const harness = createFakeAiAdapter();
    let resolveTranslation!: (value: string) => void;
    harness.translator.translate.mockImplementation(
      () => new Promise(resolve => {
        resolveTranslation = resolve;
      }),
    );
    const engine = new TranslationEngine(harness.adapter);

    const first = engine.translate('same', 'zh', () => undefined);
    const second = engine.translate('same', 'zh', () => undefined);
    await vi.waitFor(() => {
      expect(harness.translator.translate).toHaveBeenCalledOnce();
    });
    resolveTranslation('相同');

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ kind: 'success', translatedText: '相同' }),
      expect.objectContaining({ kind: 'success', translatedText: '相同' }),
    ]);
    expect(harness.translator.translate).toHaveBeenCalledOnce();
  });

  it('destroys a detector that resolves after the engine is destroyed', async () => {
    const harness = createFakeAiAdapter();
    let resolveDetector!: (detector: typeof harness.detector) => void;
    harness.adapter.createDetector.mockImplementation(
      () => new Promise(resolve => {
        resolveDetector = resolve;
      }),
    );
    const engine = new TranslationEngine(harness.adapter);

    const result = engine.translate('hello', 'zh', () => undefined, {
      userActivated: true,
    });
    engine.destroy();
    resolveDetector(harness.detector);

    await expect(result).resolves.toEqual({ kind: 'error', retryable: false });
    expect(harness.detector.destroy).toHaveBeenCalledOnce();
    expect(harness.detector.detect).not.toHaveBeenCalled();
  });

  it('destroys a translator that resolves after the engine is destroyed', async () => {
    const harness = createFakeAiAdapter();
    harness.adapter.translatorAvailability.mockResolvedValue('downloadable');
    const engine = new TranslationEngine(harness.adapter);
    await engine.translate('hello', 'zh', () => undefined);
    let resolveTranslator!: (translator: typeof harness.translator) => void;
    harness.adapter.createTranslator.mockImplementation(
      () => new Promise(resolve => {
        resolveTranslator = resolve;
      }),
    );

    const result = engine.translate('hello', 'zh', () => undefined, {
      userActivated: true,
    });
    engine.destroy();
    resolveTranslator(harness.translator);

    await expect(result).resolves.toEqual({ kind: 'error', retryable: false });
    expect(harness.translator.destroy).toHaveBeenCalledOnce();
    expect(harness.translator.translate).not.toHaveBeenCalled();
  });
});
