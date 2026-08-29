import { message, type MessageKey } from '../shared/i18n';
import { loadSettings, watchSettings } from '../shared/settings';
import { chromeAiAdapter } from '../translation/chrome-ai-adapter';
import { TranslationEngine } from '../translation/translation-engine';
import { InteractionController } from './interaction-controller';
import { OverlayRenderer } from './overlay-renderer';
import {
  extractHoverCandidate,
  extractSelectionCandidate,
} from './text-extractor';

export interface ContentAppDependencies {
  loadSettings: typeof loadSettings;
  watchSettings: typeof watchSettings;
  createController(): InteractionController;
}

export async function startContentApp(
  dependencies: ContentAppDependencies,
): Promise<() => void> {
  const controller = dependencies.createController();
  const settings = await dependencies.loadSettings();
  controller.start(settings);
  const unsubscribe = dependencies.watchSettings(next => {
    controller.applySettings(next);
  });
  let stopped = false;

  return () => {
    if (stopped) return;
    stopped = true;
    unsubscribe();
    controller.stop();
  };
}

export async function copyText(
  text: string,
  doc: Document = document,
): Promise<void> {
  const clipboard = doc.defaultView?.navigator.clipboard ?? navigator.clipboard;
  if (clipboard) {
    try {
      await clipboard.writeText(text);
      return;
    } catch {
      // Clipboard permissions can be denied in page contexts; use the legacy
      // copy command only for this user-triggered action.
    }
  }

  const textarea = doc.createElement('textarea');
  textarea.dataset.quickTranslateCopy = '';
  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-10000px';
  textarea.style.top = '0';
  (doc.body ?? doc.documentElement).append(textarea);
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    const commandDocument = doc as Document & {
      execCommand?: (command: string) => boolean;
    };
    commandDocument.execCommand?.('copy');
  } finally {
    textarea.remove();
  }
}

export function speakText(
  text: string,
  language: string,
  synth: SpeechSynthesis = speechSynthesis,
): void {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  synth.speak(utterance);
}

export function createProductionController(): InteractionController {
  const engine = new TranslationEngine(chromeAiAdapter);
  let controller!: InteractionController;
  const overlay = new OverlayRenderer(
    document,
    {
      onCopy: text => copyText(text),
      onSpeak: (text, language) => speakText(text, language),
      onPinChange: () => undefined,
      onRetry: () => controller.retry(),
      onClose: () => controller.close(),
    },
    key => message(key as MessageKey),
  );
  controller = new InteractionController({
    document,
    engine,
    overlay,
    selectionExtractor: extractSelectionCandidate,
    hoverExtractor: extractHoverCandidate,
  });
  return controller;
}

if (
  typeof LanguageDetector !== 'undefined' &&
  typeof Translator !== 'undefined'
) {
  void startContentApp({
    loadSettings,
    watchSettings,
    createController: createProductionController,
  });
}
