import {
  areEquivalentLanguages,
  normalizeSupportedLanguage,
  type SupportedLanguage,
} from '../shared/languages';
import type {
  BuiltInAiAdapter,
  DetectorPort,
  LanguagePair,
  TerminalTranslationState,
  TranslationOptions,
  TranslationState,
  TranslatorPort,
} from './types';

const RESULT_TTL_MS = 30_000;

interface CachedSource {
  expiresAt: number;
  normalized: SupportedLanguage;
  raw: string;
}

interface CachedResult {
  expiresAt: number;
  state: Extract<TerminalTranslationState, { kind: 'success' }>;
}

type StateListener = (state: TranslationState) => void;

class EngineDestroyedError extends Error {
  constructor() {
    super('Translation engine was destroyed');
    this.name = 'EngineDestroyedError';
  }
}

class ModelCreationError extends Error {
  constructor(
    readonly phase: 'detector' | 'translator',
    readonly cause: unknown,
    readonly pair?: LanguagePair,
  ) {
    super(`Failed to create ${phase}`);
    this.name = 'ModelCreationError';
  }
}

function errorName(error: unknown): string | undefined {
  return error instanceof Error
    ? error.name
    : typeof error === 'object' && error !== null && 'name' in error
      ? String(error.name)
      : undefined;
}

export class TranslationEngine {
  private detectorPromise?: Promise<DetectorPort>;
  private detectorModel?: DetectorPort;
  private readonly detectorProgressListeners = new Set<StateListener>();
  private readonly translatorPromises = new Map<string, Promise<TranslatorPort>>();
  private readonly translatorModels = new Map<string, TranslatorPort>();
  private readonly translatorProgressListeners = new Map<
    string,
    Set<StateListener>
  >();
  private readonly translatorNeedsActivation = new Set<string>();
  private readonly sourceCache = new Map<string, CachedSource>();
  private readonly resultCache = new Map<string, CachedResult>();
  private readonly resultPromises = new Map<string, Promise<string>>();
  private generation = 0;
  private destroyed = false;

  constructor(private readonly adapter: BuiltInAiAdapter) {}

  async translate(
    text: string,
    targetLanguage: SupportedLanguage,
    onState: (state: TranslationState) => void,
    options: TranslationOptions = {},
  ): Promise<TerminalTranslationState> {
    if (this.destroyed) {
      return this.finish({ kind: 'error', retryable: false }, onState);
    }

    const sourceKey = this.sourceKey(text, targetLanguage);
    const cachedSource = this.getCachedSource(sourceKey);
    let primedDetector: Promise<DetectorPort> | undefined;
    let primedTranslator: Promise<TranslatorPort> | undefined;

    // create() must run before the user-activation task yields. Prime only
    // model work whose identity is already known at method entry.
    if (options.userActivated) {
      if (!cachedSource && !this.detectorModel) {
        primedDetector = this.subscribeDetectorCreation(onState);
      } else if (cachedSource) {
        const pair = {
          sourceLanguage: cachedSource.normalized,
          targetLanguage,
        };
        const pairKey = this.pairKey(pair);
        if (
          this.translatorNeedsActivation.has(pairKey) &&
          !this.translatorModels.has(pairKey)
        ) {
          primedTranslator = this.subscribeTranslatorCreation(pair, onState);
        }
      }
    }

    try {
      return await this.translateInternal(
        text,
        targetLanguage,
        onState,
        cachedSource,
        primedDetector,
        primedTranslator,
      );
    } catch (error) {
      if (error instanceof EngineDestroyedError || this.destroyed) {
        return this.finish({ kind: 'error', retryable: false }, onState);
      }
      if (error instanceof ModelCreationError) {
        const name = errorName(error.cause);
        if (name === 'NotAllowedError') {
          if (error.phase === 'translator' && error.pair) {
            this.translatorNeedsActivation.add(this.pairKey(error.pair));
          }
          return this.finish(
            { kind: 'activation-required', phase: error.phase },
            onState,
          );
        }
        if (name === 'NotSupportedError') {
          return this.finish(
            {
              kind: 'unsupported',
              sourceLanguage: error.pair?.sourceLanguage,
              targetLanguage,
            },
            onState,
          );
        }
      }
      return this.finish({ kind: 'error', retryable: true }, onState);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    this.detectorModel?.destroy();
    for (const translator of this.translatorModels.values()) {
      translator.destroy();
    }
    this.detectorModel = undefined;
    this.detectorPromise = undefined;
    this.detectorProgressListeners.clear();
    this.translatorModels.clear();
    this.translatorPromises.clear();
    this.translatorProgressListeners.clear();
    this.translatorNeedsActivation.clear();
    this.sourceCache.clear();
    this.resultCache.clear();
    this.resultPromises.clear();
  }

  private async translateInternal(
    text: string,
    targetLanguage: SupportedLanguage,
    onState: (state: TranslationState) => void,
    initialSource: CachedSource | undefined,
    primedDetector: Promise<DetectorPort> | undefined,
    primedTranslator: Promise<TranslatorPort> | undefined,
  ): Promise<TerminalTranslationState> {
    let source = initialSource;
    if (!source) {
      const detectorResult = primedDetector
        ? { kind: 'ready' as const, detector: await primedDetector }
        : await this.getDetector(onState, targetLanguage);
      if (detectorResult.kind === 'terminal') {
        return this.finish(detectorResult.state, onState);
      }

      const detections = await detectorResult.detector.detect(text);
      this.assertAlive();
      const rawSource = detections
        .filter(item => item.detectedLanguage)
        .sort((a, b) => b.confidence - a.confidence)[0]?.detectedLanguage;
      if (!rawSource) throw new Error('Language detection returned no result');

      const normalized = normalizeSupportedLanguage(rawSource);
      if (!normalized) {
        return this.finish({ kind: 'unsupported', targetLanguage }, onState);
      }
      source = {
        raw: rawSource,
        normalized,
        expiresAt: Date.now() + RESULT_TTL_MS,
      };
      this.sourceCache.set(this.sourceKey(text, targetLanguage), source);
    }

    if (areEquivalentLanguages(source.normalized, targetLanguage)) {
      return this.finish(
        { kind: 'same-language', language: source.raw },
        onState,
      );
    }

    const resultKey = this.resultKey(text, source.normalized, targetLanguage);
    const cachedResult = this.resultCache.get(resultKey);
    if (cachedResult && cachedResult.expiresAt > Date.now()) {
      return this.finish(cachedResult.state, onState);
    }
    if (cachedResult) this.resultCache.delete(resultKey);

    const pair = {
      sourceLanguage: source.normalized,
      targetLanguage,
    };
    const translatorResult = primedTranslator
      ? { kind: 'ready' as const, translator: await primedTranslator }
      : await this.getTranslator(pair, onState);
    if (translatorResult.kind === 'terminal') {
      return this.finish(translatorResult.state, onState);
    }

    onState({ kind: 'translating', sourceLanguage: source.normalized });
    let resultPromise = this.resultPromises.get(resultKey);
    if (!resultPromise) {
      resultPromise = translatorResult.translator.translate(text);
      this.resultPromises.set(resultKey, resultPromise);
    }
    let translatedText: string;
    try {
      translatedText = await resultPromise;
    } finally {
      if (this.resultPromises.get(resultKey) === resultPromise) {
        this.resultPromises.delete(resultKey);
      }
    }
    this.assertAlive();
    const state = {
      kind: 'success',
      sourceLanguage: source.normalized,
      targetLanguage,
      translatedText,
    } as const;
    this.resultCache.set(resultKey, {
      state,
      expiresAt: Date.now() + RESULT_TTL_MS,
    });
    return this.finish(state, onState);
  }

  private async getDetector(
    onState: (state: TranslationState) => void,
    targetLanguage: SupportedLanguage,
  ): Promise<
    | { kind: 'ready'; detector: DetectorPort }
    | { kind: 'terminal'; state: TerminalTranslationState }
  > {
    if (this.detectorModel) {
      return { kind: 'ready', detector: this.detectorModel };
    }
    if (this.detectorPromise) {
      return {
        kind: 'ready',
        detector: await this.subscribeDetectorCreation(onState),
      };
    }

    const availability = await this.adapter.detectorAvailability();
    this.assertAlive();
    if (this.detectorModel) {
      return { kind: 'ready', detector: this.detectorModel };
    }
    if (this.detectorPromise) {
      return {
        kind: 'ready',
        detector: await this.subscribeDetectorCreation(onState),
      };
    }
    if (availability === 'unavailable') {
      return {
        kind: 'terminal',
        state: { kind: 'unsupported', targetLanguage },
      };
    }
    if (availability !== 'available') {
      return {
        kind: 'terminal',
        state: { kind: 'activation-required', phase: 'detector' },
      };
    }
    return {
      kind: 'ready',
      detector: await this.subscribeDetectorCreation(onState),
    };
  }

  private async getTranslator(
    pair: LanguagePair,
    onState: (state: TranslationState) => void,
  ): Promise<
    | { kind: 'ready'; translator: TranslatorPort }
    | { kind: 'terminal'; state: TerminalTranslationState }
  > {
    const key = this.pairKey(pair);
    const ready = this.translatorModels.get(key);
    if (ready) return { kind: 'ready', translator: ready };
    const existing = this.translatorPromises.get(key);
    if (existing) {
      return {
        kind: 'ready',
        translator: await this.subscribeTranslatorCreation(pair, onState),
      };
    }

    const availability = await this.adapter.translatorAvailability(pair);
    this.assertAlive();
    const readyAfterAvailability = this.translatorModels.get(key);
    if (readyAfterAvailability) {
      return { kind: 'ready', translator: readyAfterAvailability };
    }
    const concurrent = this.translatorPromises.get(key);
    if (concurrent) {
      return {
        kind: 'ready',
        translator: await this.subscribeTranslatorCreation(pair, onState),
      };
    }
    if (availability === 'unavailable') {
      return {
        kind: 'terminal',
        state: {
          kind: 'unsupported',
          sourceLanguage: pair.sourceLanguage,
          targetLanguage: pair.targetLanguage,
        },
      };
    }
    if (availability !== 'available') {
      this.translatorNeedsActivation.add(key);
      return {
        kind: 'terminal',
        state: { kind: 'activation-required', phase: 'translator' },
      };
    }
    return {
      kind: 'ready',
      translator: await this.subscribeTranslatorCreation(pair, onState),
    };
  }

  private subscribeDetectorCreation(
    onState: StateListener,
  ): Promise<DetectorPort> {
    if (this.detectorModel) return Promise.resolve(this.detectorModel);
    onState({ kind: 'preparing' });
    this.detectorProgressListeners.add(onState);
    try {
      const promise =
        this.detectorPromise ?? this.startDetectorCreation();
      return promise.finally(() => {
        this.detectorProgressListeners.delete(onState);
      });
    } catch (error) {
      this.detectorProgressListeners.delete(onState);
      throw error;
    }
  }

  private startDetectorCreation(): Promise<DetectorPort> {
    if (this.detectorPromise) return this.detectorPromise;
    this.assertAlive();
    const generation = this.generation;
    let tracked!: Promise<DetectorPort>;
    const created = this.adapter.createDetector(progress => {
      if (generation === this.generation) {
        for (const listener of this.detectorProgressListeners) {
          listener({ kind: 'preparing', progress });
        }
      }
    });
    tracked = created
      .then(detector => {
        if (generation !== this.generation || this.destroyed) {
          detector.destroy();
          throw new EngineDestroyedError();
        }
        this.detectorModel = detector;
        return detector;
      })
      .catch(error => {
        if (this.detectorPromise === tracked) this.detectorPromise = undefined;
        if (error instanceof EngineDestroyedError) throw error;
        throw new ModelCreationError('detector', error);
      });
    this.detectorPromise = tracked;
    return tracked;
  }

  private subscribeTranslatorCreation(
    pair: LanguagePair,
    onState: StateListener,
  ): Promise<TranslatorPort> {
    const key = this.pairKey(pair);
    const ready = this.translatorModels.get(key);
    if (ready) return Promise.resolve(ready);
    onState({ kind: 'preparing' });
    let listeners = this.translatorProgressListeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this.translatorProgressListeners.set(key, listeners);
    }
    listeners.add(onState);
    try {
      const promise =
        this.translatorPromises.get(key) ?? this.startTranslatorCreation(pair);
      return promise.finally(() => {
        const current = this.translatorProgressListeners.get(key);
        current?.delete(onState);
        if (current?.size === 0) {
          this.translatorProgressListeners.delete(key);
        }
      });
    } catch (error) {
      listeners.delete(onState);
      if (listeners.size === 0) {
        this.translatorProgressListeners.delete(key);
      }
      throw error;
    }
  }

  private startTranslatorCreation(
    pair: LanguagePair,
  ): Promise<TranslatorPort> {
    const key = this.pairKey(pair);
    const existing = this.translatorPromises.get(key);
    if (existing) return existing;
    this.assertAlive();
    const generation = this.generation;
    let tracked!: Promise<TranslatorPort>;
    const created = this.adapter.createTranslator(pair, progress => {
      if (generation === this.generation) {
        for (const listener of
          this.translatorProgressListeners.get(key) ?? []) {
          listener({ kind: 'preparing', progress });
        }
      }
    });
    tracked = created
      .then(translator => {
        if (generation !== this.generation || this.destroyed) {
          translator.destroy();
          throw new EngineDestroyedError();
        }
        this.translatorNeedsActivation.delete(key);
        this.translatorModels.set(key, translator);
        return translator;
      })
      .catch(error => {
        if (this.translatorPromises.get(key) === tracked) {
          this.translatorPromises.delete(key);
        }
        if (error instanceof EngineDestroyedError) throw error;
        throw new ModelCreationError('translator', error, pair);
      });
    this.translatorPromises.set(key, tracked);
    return tracked;
  }

  private getCachedSource(key: string): CachedSource | undefined {
    const cached = this.sourceCache.get(key);
    if (!cached) return undefined;
    if (cached.expiresAt > Date.now()) return cached;
    this.sourceCache.delete(key);
    return undefined;
  }

  private assertAlive(): void {
    if (this.destroyed) throw new EngineDestroyedError();
  }

  private sourceKey(text: string, targetLanguage: SupportedLanguage): string {
    return `${targetLanguage}\u0000${text}`;
  }

  private resultKey(
    text: string,
    sourceLanguage: SupportedLanguage,
    targetLanguage: SupportedLanguage,
  ): string {
    return `${sourceLanguage}\u0000${targetLanguage}\u0000${text}`;
  }

  private pairKey(pair: LanguagePair): string {
    return `${pair.sourceLanguage}→${pair.targetLanguage}`;
  }

  private finish<T extends TerminalTranslationState>(
    state: T,
    onState: (state: TranslationState) => void,
  ): T {
    onState(state);
    return state;
  }
}
