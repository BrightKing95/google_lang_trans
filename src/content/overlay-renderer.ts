import type { TranslationState } from '../translation/types';
import { OVERLAY_STYLES } from './overlay-styles';

export interface OverlayActions {
  onCopy(text: string): void | Promise<void>;
  onSpeak(text: string, language: string): void;
  onPinChange(pinned: boolean): void;
  onRetry(): void;
  onClose(): void;
}

type MessageLookup = (key: string) => string;
type OverlayAnchor = DOMRect | (() => DOMRect | null);

export class OverlayRenderer {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private card: HTMLElement | null = null;
  private anchor: OverlayAnchor | null = null;
  private listening = false;
  private isPinned = false;

  constructor(
    private readonly doc: Document,
    private readonly actions: OverlayActions,
    private readonly message: MessageLookup,
  ) {}

  get pinned(): boolean {
    return this.isPinned;
  }

  render(state: TranslationState, anchor: OverlayAnchor): void {
    this.ensureMounted();
    this.anchor = anchor;
    this.card!.replaceChildren(this.renderState(state));
    this.positionCard();
    if (this.host) this.startViewportListeners();
  }

  setPinned(pinned: boolean): void {
    this.isPinned = pinned;
    const button = this.root?.querySelector<HTMLButtonElement>(
      '[data-action="pin"]',
    );
    if (button) {
      button.setAttribute('aria-pressed', String(pinned));
      button.title = this.message(pinned ? 'unpin' : 'pin');
      button.setAttribute('aria-label', button.title);
    }
  }

  containsEvent(event: Event): boolean {
    if (!this.host || !this.root) return false;
    const path = event.composedPath();
    if (path.includes(this.host) || path.includes(this.root)) return true;
    return event.target instanceof Node && this.root.contains(event.target);
  }

  close(): void {
    this.stopViewportListeners();
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.card = null;
    this.anchor = null;
    this.isPinned = false;
  }

  destroy(): void {
    this.close();
  }

  private ensureMounted(): void {
    if (this.host) return;

    const host = this.doc.createElement('div');
    host.dataset.quickTranslateHost = '';
    const root = host.attachShadow({ mode: 'closed' });
    const style = this.doc.createElement('style');
    style.textContent = OVERLAY_STYLES;
    const card = this.doc.createElement('section');
    card.className = 'card';
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    root.append(style, card);
    (this.doc.documentElement ?? this.doc.body).append(host);

    this.host = host;
    this.root = root;
    this.card = card;
  }

  private renderState(state: TranslationState): DocumentFragment {
    const fragment = this.doc.createDocumentFragment();
    switch (state.kind) {
      case 'preparing':
        this.renderPreparing(fragment, state.progress);
        return fragment;
      case 'activation-required':
        this.renderActivationRequired(fragment);
        return fragment;
      case 'translating':
        this.renderTranslating(fragment, state.sourceLanguage);
        return fragment;
      case 'success':
        this.renderSuccess(fragment, state);
        return fragment;
      case 'same-language':
        this.renderNotice(fragment, this.message('sameLanguage'));
        return fragment;
      case 'unsupported':
        this.renderError(fragment, this.message('unsupportedPair'), false);
        return fragment;
      case 'error':
        this.renderError(
          fragment,
          this.message('translationFailed'),
          state.retryable,
        );
        return fragment;
    }
  }

  private renderPreparing(
    fragment: DocumentFragment,
    progressValue?: number,
  ): void {
    const text = this.doc.createElement('p');
    text.className = 'text notice';
    text.textContent = this.message('statusPreparing');
    const progress = this.doc.createElement('progress');
    progress.max = 100;
    if (progressValue !== undefined) {
      progress.value = Math.round(progressValue * 100);
    }
    fragment.append(text, progress, this.createCloseActions());
  }

  private renderTranslating(
    fragment: DocumentFragment,
    sourceLanguage: string,
  ): void {
    const header = this.createHeader(sourceLanguage);
    const text = this.doc.createElement('p');
    text.className = 'text notice';
    text.textContent = this.message('translating');
    fragment.append(header, text, this.createCloseActions());
  }

  private renderActivationRequired(fragment: DocumentFragment): void {
    const text = this.doc.createElement('p');
    text.className = 'text notice';
    text.textContent = this.message('activationRequired');
    const actions = this.createActionRow();
    actions.append(
      this.createButton(
        'activate',
        this.message('prepareTranslation'),
        this.message('prepareTranslation'),
        () => this.actions.onRetry(),
      ),
      this.createSpacer(),
      this.createCloseButton(),
    );
    fragment.append(text, actions);
  }

  private renderSuccess(
    fragment: DocumentFragment,
    state: Extract<TranslationState, { kind: 'success' }>,
  ): void {
    const header = this.createHeader(
      `${state.sourceLanguage} → ${state.targetLanguage}`,
    );
    const text = this.doc.createElement('p');
    text.className = 'text';
    text.textContent = state.translatedText;

    const actions = this.createActionRow();
    actions.append(
      this.createButton('copy', this.message('copy'), '⧉', () => {
        void this.actions.onCopy(state.translatedText);
      }),
      this.createButton('speak', this.message('speak'), '🔊', () => {
        this.actions.onSpeak(state.translatedText, state.targetLanguage);
      }),
      this.createSpacer(),
      this.createPinButton(),
      this.createCloseButton(),
    );
    fragment.append(header, text, actions);
  }

  private renderNotice(fragment: DocumentFragment, value: string): void {
    const text = this.doc.createElement('p');
    text.className = 'text notice';
    text.textContent = value;
    fragment.append(text, this.createCloseActions());
  }

  private renderError(
    fragment: DocumentFragment,
    value: string,
    retryable: boolean,
  ): void {
    const text = this.doc.createElement('p');
    text.className = 'text error';
    text.textContent = value;
    const actions = this.createActionRow();
    if (retryable) {
      actions.append(
        this.createButton('retry', this.message('retry'), this.message('retry'), () =>
          this.actions.onRetry(),
        ),
      );
    }
    actions.append(this.createSpacer(), this.createCloseButton());
    fragment.append(text, actions);
  }

  private createHeader(label: string): HTMLElement {
    const header = this.doc.createElement('div');
    header.className = 'header';
    const language = this.doc.createElement('span');
    language.className = 'language';
    language.textContent = label;
    header.append(language);
    return header;
  }

  private createActionRow(): HTMLElement {
    const row = this.doc.createElement('div');
    row.className = 'actions';
    return row;
  }

  private createCloseActions(): HTMLElement {
    const row = this.createActionRow();
    row.append(this.createSpacer(), this.createCloseButton());
    return row;
  }

  private createSpacer(): HTMLElement {
    const spacer = this.doc.createElement('span');
    spacer.className = 'spacer';
    spacer.setAttribute('aria-hidden', 'true');
    return spacer;
  }

  private createPinButton(): HTMLButtonElement {
    const button = this.createButton('pin', this.message('pin'), '⌖', () => {
      this.setPinned(!this.isPinned);
      this.actions.onPinChange(this.isPinned);
    });
    button.setAttribute('aria-pressed', String(this.isPinned));
    return button;
  }

  private createCloseButton(): HTMLButtonElement {
    const button = this.createButton(
      'close',
      this.message('close'),
      '×',
      () => this.actions.onClose(),
    );
    button.classList.add('close');
    return button;
  }

  private createButton(
    action: string,
    label: string,
    content: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = this.doc.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.textContent = content;
    button.addEventListener('click', onClick);
    return button;
  }

  private positionCard = (): void => {
    if (!this.card || !this.anchor) return;
    const anchorRect =
      typeof this.anchor === 'function' ? this.anchor() : this.anchor;
    if (!anchorRect) {
      this.close();
      this.actions.onClose();
      return;
    }
    const overlayRect = this.card.getBoundingClientRect();
    const { left, top } = this.position(anchorRect, overlayRect);
    this.card.style.left = `${left}px`;
    this.card.style.top = `${top}px`;
  };

  private position(
    anchor: DOMRect,
    overlay: DOMRect,
  ): { left: number; top: number } {
    const margin = 8;
    const view = this.doc.defaultView ?? window;
    const below = anchor.bottom + margin;
    const top =
      below + overlay.height <= view.innerHeight
        ? below
        : Math.max(margin, anchor.top - overlay.height - margin);
    const left = Math.min(
      Math.max(margin, anchor.left),
      Math.max(margin, view.innerWidth - overlay.width - margin),
    );
    return { left, top };
  }

  private startViewportListeners(): void {
    if (this.listening) return;
    const view = this.doc.defaultView ?? window;
    view.addEventListener('scroll', this.positionCard, true);
    view.addEventListener('resize', this.positionCard);
    this.listening = true;
  }

  private stopViewportListeners(): void {
    if (!this.listening) return;
    const view = this.doc.defaultView ?? window;
    view.removeEventListener('scroll', this.positionCard, true);
    view.removeEventListener('resize', this.positionCard);
    this.listening = false;
  }
}
