export type ModelAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable';

export interface DetectedLanguage {
  detectedLanguage: string;
  confidence: number;
}

export interface DetectorPort {
  detect(text: string): Promise<DetectedLanguage[]>;
  destroy(): void;
}

export interface TranslatorPort {
  translate(text: string): Promise<string>;
  destroy(): void;
}

export interface LanguagePair {
  sourceLanguage: string;
  targetLanguage: string;
}

export interface BuiltInAiAdapter {
  detectorAvailability(): Promise<ModelAvailability>;
  createDetector(onProgress: (loaded: number) => void): Promise<DetectorPort>;
  translatorAvailability(pair: LanguagePair): Promise<ModelAvailability>;
  createTranslator(
    pair: LanguagePair,
    onProgress: (loaded: number) => void,
  ): Promise<TranslatorPort>;
}

export type TranslationState =
  | { kind: 'preparing'; progress?: number }
  | { kind: 'activation-required'; phase: 'detector' | 'translator' }
  | { kind: 'translating'; sourceLanguage: string }
  | {
    kind: 'success';
    sourceLanguage: string;
    targetLanguage: string;
    translatedText: string;
  }
  | { kind: 'same-language'; language: string }
  | { kind: 'unsupported'; sourceLanguage?: string; targetLanguage: string }
  | { kind: 'error'; retryable: boolean };

export type TerminalTranslationState = Exclude<
  TranslationState,
  { kind: 'preparing' | 'translating' }
>;

export interface TranslationOptions {
  userActivated?: boolean;
}
