import type {
  BuiltInAiAdapter,
  DetectedLanguage,
  DetectorPort,
  LanguagePair,
  ModelAvailability,
  TranslatorPort,
} from './types';

function progressMonitor(onProgress: (loaded: number) => void): CreateMonitorCallback {
  return monitor => {
    monitor.addEventListener('downloadprogress', event => {
      onProgress(event.loaded);
    });
  };
}

export const chromeAiAdapter: BuiltInAiAdapter = {
  async detectorAvailability(): Promise<ModelAvailability> {
    if (typeof LanguageDetector === 'undefined') return 'unavailable';
    return LanguageDetector.availability();
  },

  async createDetector(onProgress: (loaded: number) => void): Promise<DetectorPort> {
    if (typeof LanguageDetector === 'undefined') {
      throw new Error('Language Detector API is unavailable');
    }
    const detector = await LanguageDetector.create({
      monitor: progressMonitor(onProgress),
    });
    return {
      async detect(text: string): Promise<DetectedLanguage[]> {
        const results = await detector.detect(text);
        return results
          .filter(result => Boolean(result.detectedLanguage))
          .map(result => ({
            detectedLanguage: result.detectedLanguage!,
            confidence: result.confidence ?? 0,
          }));
      },
      destroy: () => detector.destroy(),
    };
  },

  async translatorAvailability(pair: LanguagePair): Promise<ModelAvailability> {
    if (typeof Translator === 'undefined') return 'unavailable';
    return Translator.availability(pair);
  },

  async createTranslator(
    pair: LanguagePair,
    onProgress: (loaded: number) => void,
  ): Promise<TranslatorPort> {
    if (typeof Translator === 'undefined') {
      throw new Error('Translator API is unavailable');
    }
    const translator = await Translator.create({
      ...pair,
      monitor: progressMonitor(onProgress),
    });
    return {
      translate: text => translator.translate(text),
      destroy: () => translator.destroy(),
    };
  },
};
