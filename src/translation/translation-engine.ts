import {
  areEquivalentLanguages,
  type SupportedLanguage,
} from '../shared/languages';
import type {
  BuiltInAiAdapter,
  DetectorPort,
  TerminalTranslationState,
  TranslationState,
  TranslatorPort,
} from './types';

export class TranslationEngine {
  private detector?: DetectorPort;
  private readonly translators = new Map<string, TranslatorPort>();

  constructor(private readonly adapter: BuiltInAiAdapter) {}

  async translate(
    text: string,
    targetLanguage: SupportedLanguage,
    onState: (state: TranslationState) => void,
  ): Promise<TerminalTranslationState> {
    try {
      return await this.translateInternal(text, targetLanguage, onState);
    } catch {
      return this.finish({ kind: 'error', retryable: true }, onState);
    }
  }

  destroy(): void {
    this.detector?.destroy();
    for (const translator of this.translators.values()) {
      translator.destroy();
    }
    this.detector = undefined;
    this.translators.clear();
  }

  private async translateInternal(
    text: string,
    targetLanguage: SupportedLanguage,
    onState: (state: TranslationState) => void,
  ): Promise<TerminalTranslationState> {
    const detectorAvailability = await this.adapter.detectorAvailability();
    if (detectorAvailability === 'unavailable') {
      return this.finish({ kind: 'unsupported', targetLanguage }, onState);
    }
    if (detectorAvailability !== 'available') {
      onState({ kind: 'preparing' });
    }

    this.detector ??= await this.adapter.createDetector(progress => {
      onState({ kind: 'preparing', progress });
    });
    const detections = await this.detector.detect(text);
    const sourceLanguage = detections
      .filter(item => item.detectedLanguage)
      .sort((a, b) => b.confidence - a.confidence)[0]?.detectedLanguage;

    if (!sourceLanguage) {
      throw new Error('Language detection returned no result');
    }

    if (areEquivalentLanguages(sourceLanguage, targetLanguage)) {
      return this.finish({ kind: 'same-language', language: sourceLanguage }, onState);
    }

    const pair = { sourceLanguage, targetLanguage };
    const translatorAvailability = await this.adapter.translatorAvailability(pair);
    if (translatorAvailability === 'unavailable') {
      return this.finish({
        kind: 'unsupported',
        sourceLanguage,
        targetLanguage,
      }, onState);
    }
    if (translatorAvailability !== 'available') {
      onState({ kind: 'preparing' });
    }

    const key = `${sourceLanguage}→${targetLanguage}`;
    let translator = this.translators.get(key);
    if (!translator) {
      translator = await this.adapter.createTranslator(pair, progress => {
        onState({ kind: 'preparing', progress });
      });
      this.translators.set(key, translator);
    }

    onState({ kind: 'translating', sourceLanguage });
    const translatedText = await translator.translate(text);
    return this.finish({
      kind: 'success',
      sourceLanguage,
      targetLanguage,
      translatedText,
    }, onState);
  }

  private finish<T extends TerminalTranslationState>(
    state: T,
    onState: (state: TranslationState) => void,
  ): T {
    onState(state);
    return state;
  }
}
