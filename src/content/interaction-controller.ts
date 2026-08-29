import type { SupportedLanguage } from '../shared/languages';
import type { ExtensionSettings } from '../shared/settings';
import type {
  TerminalTranslationState,
  TranslationOptions,
  TranslationState,
} from '../translation/types';
import type { TextCandidate } from './text-extractor';

const HOVER_OPEN_DELAY = 500;
const HOVER_CLOSE_DELAY = 250;
const SAME_LANGUAGE_DURATION = 1200;

export interface TranslationPort {
  translate(
    text: string,
    target: SupportedLanguage,
    onState: (state: TranslationState) => void,
    options?: TranslationOptions,
  ): Promise<TerminalTranslationState>;
  destroy(): void;
}

export interface OverlayPort {
  readonly pinned: boolean;
  render(
    state: TranslationState,
    anchor: DOMRect | (() => DOMRect | null),
  ): void;
  containsEvent(event: Event): boolean;
  close(): void;
  destroy(): void;
}

export interface InteractionControllerDependencies {
  document: Document;
  engine: TranslationPort;
  overlay: OverlayPort;
  selectionExtractor(selection: Selection | null): TextCandidate | null;
  hoverExtractor(target: EventTarget | null): TextCandidate | null;
}

export class InteractionController {
  private settings: ExtensionSettings | null = null;
  private requestId = 0;
  private lastCandidate: TextCandidate | null = null;
  private activeHoverElement: Element | null = null;
  private pendingHoverCandidate: TextCandidate | null = null;
  private hoverOpenTimer: number | null = null;
  private hoverCloseTimer: number | null = null;
  private sameLanguageTimer: number | null = null;
  private started = false;
  private stopped = false;

  private readonly doc: Document;
  private readonly engine: TranslationPort;
  private readonly overlay: OverlayPort;
  private readonly selectionExtractor: InteractionControllerDependencies['selectionExtractor'];
  private readonly hoverExtractor: InteractionControllerDependencies['hoverExtractor'];

  constructor(dependencies: InteractionControllerDependencies) {
    this.doc = dependencies.document;
    this.engine = dependencies.engine;
    this.overlay = dependencies.overlay;
    this.selectionExtractor = dependencies.selectionExtractor;
    this.hoverExtractor = dependencies.hoverExtractor;
  }

  start(settings: ExtensionSettings): void {
    if (this.stopped) return;
    if (this.started) {
      this.applySettings(settings);
      return;
    }

    this.started = true;
    this.doc.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.doc.addEventListener('keydown', this.onDocumentKeyDown, true);
    this.settings = settings;
    this.addModeListeners();
  }

  applySettings(settings: ExtensionSettings): void {
    if (this.stopped) return;
    if (!this.started) {
      this.start(settings);
      return;
    }

    const previous = this.settings;
    const interactionChanged =
      !previous ||
      previous.enabled !== settings.enabled ||
      previous.mode !== settings.mode ||
      previous.targetLanguage !== settings.targetLanguage;

    this.removeModeListeners();
    this.clearHoverTimers();
    this.settings = settings;
    if (interactionChanged) this.close();
    this.addModeListeners();
  }

  retry(): void {
    if (!this.lastCandidate) return;
    this.runCandidate(this.lastCandidate, true);
  }

  close(): void {
    this.requestId += 1;
    this.clearHoverTimers();
    this.clearSameLanguageTimer();
    this.activeHoverElement = null;
    this.overlay.close();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.removeModeListeners();
    this.doc.removeEventListener(
      'pointerdown',
      this.onDocumentPointerDown,
      true,
    );
    this.doc.removeEventListener('keydown', this.onDocumentKeyDown, true);
    this.close();
    this.overlay.destroy();
    this.engine.destroy();
  }

  private addModeListeners(): void {
    if (!this.settings?.enabled) return;
    if (this.settings.mode === 'selection') {
      this.doc.addEventListener('mouseup', this.onSelectionMouseUp, true);
      this.doc.addEventListener('keyup', this.onSelectionKeyUp, true);
      return;
    }

    this.doc.addEventListener('pointerover', this.onHoverOver, true);
    this.doc.addEventListener('pointerout', this.onHoverOut, true);
  }

  private removeModeListeners(): void {
    this.doc.removeEventListener('mouseup', this.onSelectionMouseUp, true);
    this.doc.removeEventListener('keyup', this.onSelectionKeyUp, true);
    this.doc.removeEventListener('pointerover', this.onHoverOver, true);
    this.doc.removeEventListener('pointerout', this.onHoverOut, true);
  }

  private readonly onSelectionMouseUp = (event: MouseEvent): void => {
    if (this.overlay.containsEvent(event)) return;
    this.runSelection();
  };

  private readonly onSelectionKeyUp = (event: KeyboardEvent): void => {
    if (!event.shiftKey || !event.key.startsWith('Arrow')) return;
    this.runSelection();
  };

  private runSelection(): void {
    const candidate = this.selectionExtractor(this.doc.getSelection());
    if (candidate) this.runCandidate(candidate, true);
  }

  private readonly onHoverOver = (event: PointerEvent): void => {
    if (this.overlay.containsEvent(event)) {
      this.cancelPendingHover();
      this.clearHoverCloseTimer();
      return;
    }
    if (this.overlay.pinned) return;

    const candidate = this.hoverExtractor(event.target);
    if (!candidate) {
      this.cancelPendingHover();
      return;
    }
    if (this.activeHoverElement === candidate.element) {
      this.clearHoverCloseTimer();
      return;
    }
    if (this.pendingHoverCandidate?.element === candidate.element) return;

    this.cancelPendingHover();
    this.pendingHoverCandidate = candidate;
    this.hoverOpenTimer = this.view.setTimeout(() => {
      this.hoverOpenTimer = null;
      const pending = this.pendingHoverCandidate;
      this.pendingHoverCandidate = null;
      if (!pending) return;
      this.activeHoverElement = pending.element;
      this.runCandidate(pending, false);
    }, HOVER_OPEN_DELAY);
  };

  private readonly onHoverOut = (event: PointerEvent): void => {
    if (this.overlay.containsEvent(event)) {
      if (!this.overlay.pinned) this.scheduleHoverClose();
      return;
    }
    const from = this.hoverExtractor(event.target);
    const to = this.hoverExtractor(event.relatedTarget);
    if (from && to && from.element === to.element) return;
    if (from && this.pendingHoverCandidate?.element === from.element) {
      this.cancelPendingHover();
    }
    if (this.overlay.pinned) return;
    this.scheduleHoverClose();
  };

  private readonly onDocumentPointerDown = (event: PointerEvent): void => {
    if (this.overlay.pinned || this.overlay.containsEvent(event)) return;
    this.close();
  };

  private readonly onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.close();
  };

  private runCandidate(
    candidate: TextCandidate,
    userActivated: boolean,
  ): void {
    const settings = this.settings;
    if (!settings?.enabled || this.overlay.pinned) return;

    this.lastCandidate = candidate;
    this.clearSameLanguageTimer();
    const requestId = ++this.requestId;
    void this.engine
      .translate(
        candidate.text,
        settings.targetLanguage,
        state => {
          if (requestId !== this.requestId) return;
          this.overlay.render(state, candidate.getAnchorRect);
          if (state.kind === 'same-language') {
            this.clearSameLanguageTimer();
            this.sameLanguageTimer = this.view.setTimeout(
              () => this.close(),
              SAME_LANGUAGE_DURATION,
            );
          }
        },
        { userActivated },
      )
      .catch(() => {
        if (requestId !== this.requestId) return;
        this.overlay.render(
          { kind: 'error', retryable: true },
          candidate.getAnchorRect,
        );
      });
  }

  private scheduleHoverClose(): void {
    this.clearHoverCloseTimer();
    this.hoverCloseTimer = this.view.setTimeout(() => {
      this.hoverCloseTimer = null;
      this.closeForHoverTransition();
    }, HOVER_CLOSE_DELAY);
  }

  private closeForHoverTransition(): void {
    this.requestId += 1;
    this.clearSameLanguageTimer();
    this.activeHoverElement = null;
    this.overlay.close();
  }

  private clearHoverTimers(): void {
    this.cancelPendingHover();
    this.clearHoverCloseTimer();
  }

  private cancelPendingHover(): void {
    this.clearHoverOpenTimer();
    this.pendingHoverCandidate = null;
  }

  private clearHoverOpenTimer(): void {
    if (this.hoverOpenTimer === null) return;
    this.view.clearTimeout(this.hoverOpenTimer);
    this.hoverOpenTimer = null;
  }

  private clearHoverCloseTimer(): void {
    if (this.hoverCloseTimer === null) return;
    this.view.clearTimeout(this.hoverCloseTimer);
    this.hoverCloseTimer = null;
  }

  private clearSameLanguageTimer(): void {
    if (this.sameLanguageTimer === null) return;
    this.view.clearTimeout(this.sameLanguageTimer);
    this.sameLanguageTimer = null;
  }

  private get view(): Window {
    return this.doc.defaultView ?? window;
  }
}
