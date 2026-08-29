import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OverlayRenderer } from '../../src/content/overlay-renderer';

const rect = (x: number, y: number, width = 80, height = 20) =>
  new DOMRect(x, y, width, height);

const createActions = () => ({
  onCopy: vi.fn(),
  onSpeak: vi.fn(),
  onPinChange: vi.fn(),
  onRetry: vi.fn(),
  onClose: vi.fn(),
});

const message = (key: string) => key;
const originalAttachShadow = HTMLElement.prototype.attachShadow;
let capturedRoot: ShadowRoot;

beforeEach(() => {
  document.body.replaceChildren();
  document
    .querySelectorAll('[data-quick-translate-host]')
    .forEach(element => element.remove());
  vi.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(
    function (this: HTMLElement, init) {
      expect(init.mode).toBe('closed');
      capturedRoot = originalAttachShadow.call(this, init);
      return capturedRoot;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document
    .querySelectorAll('[data-quick-translate-host]')
    .forEach(element => element.remove());
  document.body.replaceChildren();
});

describe('OverlayRenderer', () => {
  it('attaches a closed shadow root and renders dynamic text without parsing HTML', () => {
    const overlay = new OverlayRenderer(document, createActions(), message);

    overlay.render(
      {
        kind: 'success',
        sourceLanguage: 'en',
        targetLanguage: 'zh',
        translatedText: '<img src=x onerror=alert(1)>',
      },
      rect(10, 10),
    );

    expect(capturedRoot.querySelector('img')).toBeNull();
    expect(capturedRoot.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(
      document.querySelector<HTMLElement>('[data-quick-translate-host]')
        ?.shadowRoot,
    ).toBeNull();
  });

  it('renders preparation, translation, notice, unsupported, and error states', () => {
    const overlay = new OverlayRenderer(document, createActions(), message);
    const anchor = rect(10, 10);

    overlay.render({ kind: 'preparing', progress: 0.42 }, anchor);
    expect(capturedRoot.textContent).toContain('statusPreparing');
    expect(
      capturedRoot.querySelector<HTMLProgressElement>('progress')?.value,
    ).toBe(42);

    overlay.render({ kind: 'translating', sourceLanguage: 'en' }, anchor);
    expect(capturedRoot.textContent).toContain('translating');

    overlay.render(
      { kind: 'activation-required', phase: 'detector' },
      anchor,
    );
    expect(capturedRoot.textContent).toContain('activationRequired');
    expect(capturedRoot.textContent).toContain('prepareTranslation');

    overlay.render({ kind: 'same-language', language: 'en' }, anchor);
    expect(capturedRoot.textContent).toContain('sameLanguage');

    overlay.render(
      { kind: 'unsupported', sourceLanguage: 'en', targetLanguage: 'zh' },
      anchor,
    );
    expect(capturedRoot.textContent).toContain('unsupportedPair');

    overlay.render({ kind: 'error', retryable: false }, anchor);
    expect(capturedRoot.textContent).toContain('translationFailed');
    expect(capturedRoot.querySelector('[data-action="retry"]')).toBeNull();

    overlay.render({ kind: 'error', retryable: true }, anchor);
    expect(capturedRoot.querySelector('[data-action="retry"]')).not.toBeNull();
  });

  it('wires success actions and pin state', () => {
    const actions = createActions();
    const overlay = new OverlayRenderer(document, actions, message);
    overlay.render(
      {
        kind: 'success',
        sourceLanguage: 'en',
        targetLanguage: 'zh',
        translatedText: '你好',
      },
      rect(10, 10),
    );

    capturedRoot
      .querySelector<HTMLButtonElement>('[data-action="copy"]')!
      .click();
    capturedRoot
      .querySelector<HTMLButtonElement>('[data-action="speak"]')!
      .click();
    capturedRoot
      .querySelector<HTMLButtonElement>('[data-action="pin"]')!
      .click();

    expect(actions.onCopy).toHaveBeenCalledWith('你好');
    expect(actions.onSpeak).toHaveBeenCalledWith('你好', 'zh');
    expect(actions.onPinChange).toHaveBeenCalledWith(true);
    expect(overlay.pinned).toBe(true);
    expect(
      capturedRoot.querySelector('[data-action="pin"]')?.getAttribute(
        'aria-pressed',
      ),
    ).toBe('true');
  });

  it('invokes retry and close actions from buttons', () => {
    const actions = createActions();
    const overlay = new OverlayRenderer(document, actions, message);
    overlay.render({ kind: 'error', retryable: true }, rect(10, 10));

    capturedRoot
      .querySelector<HTMLButtonElement>('[data-action="retry"]')!
      .click();
    capturedRoot
      .querySelector<HTMLButtonElement>('[data-action="close"]')!
      .click();

    expect(actions.onRetry).toHaveBeenCalledOnce();
    expect(actions.onClose).toHaveBeenCalledOnce();
  });

  it('continues model preparation only from an explicit action button', () => {
    const actions = createActions();
    const overlay = new OverlayRenderer(document, actions, message);
    overlay.render(
      { kind: 'activation-required', phase: 'translator' },
      rect(10, 10),
    );

    capturedRoot
      .querySelector<HTMLButtonElement>('[data-action="activate"]')!
      .click();

    expect(actions.onRetry).toHaveBeenCalledOnce();
  });

  it('keeps the card inside the viewport and flips above near the bottom', () => {
    vi.stubGlobal('innerWidth', 320);
    vi.stubGlobal('innerHeight', 240);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      rect(0, 0, 290, 120),
    );
    const overlay = new OverlayRenderer(document, createActions(), message);

    overlay.render(
      { kind: 'translating', sourceLanguage: 'en' },
      rect(300, 210, 20, 20),
    );

    const card = capturedRoot.querySelector<HTMLElement>('[role="status"]')!;
    expect(card.style.left).toBe('22px');
    expect(card.style.top).toBe('82px');
  });

  it('re-reads a live anchor when the viewport changes', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      rect(0, 0, 120, 60),
    );
    let anchor = rect(10, 20, 80, 20);
    const overlay = new OverlayRenderer(document, createActions(), message);
    overlay.render(
      { kind: 'translating', sourceLanguage: 'en' },
      () => anchor,
    );
    const card = capturedRoot.querySelector<HTMLElement>('[role="status"]')!;
    expect(card.style.left).toBe('10px');
    expect(card.style.top).toBe('48px');

    anchor = rect(100, 120, 80, 20);
    window.dispatchEvent(new Event('scroll'));
    expect(card.style.left).toBe('100px');
    expect(card.style.top).toBe('148px');
  });

  it('requests closure when a live anchor is no longer available', () => {
    const actions = createActions();
    let connected = true;
    const overlay = new OverlayRenderer(document, actions, message);
    overlay.render(
      { kind: 'translating', sourceLanguage: 'en' },
      () => (connected ? rect(10, 20) : null),
    );

    connected = false;
    window.dispatchEvent(new Event('resize'));

    expect(actions.onClose).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-quick-translate-host]')).toBeNull();
  });

  it('detects owned events and removes viewport listeners and host on close', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const overlay = new OverlayRenderer(document, createActions(), message);
    overlay.render(
      { kind: 'translating', sourceLanguage: 'en' },
      rect(10, 10),
    );
    const button = capturedRoot.querySelector<HTMLButtonElement>(
      '[data-action="close"]',
    )!;
    const event = new MouseEvent('click', { bubbles: true, composed: true });
    const host = document.querySelector('[data-quick-translate-host]')!;
    vi.spyOn(event, 'composedPath').mockReturnValue([
      button,
      capturedRoot,
      host,
      document,
      window,
    ]);

    expect(overlay.containsEvent(event)).toBe(true);

    overlay.close();
    const scrollListener = add.mock.calls.find(([type]) => type === 'scroll')?.[1];
    const resizeListener = add.mock.calls.find(([type]) => type === 'resize')?.[1];
    expect(remove).toHaveBeenCalledWith('scroll', scrollListener, true);
    expect(remove).toHaveBeenCalledWith('resize', resizeListener);
    expect(document.querySelector('[data-quick-translate-host]')).toBeNull();
  });
});
