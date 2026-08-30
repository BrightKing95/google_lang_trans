import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InteractionController } from '../../src/content/interaction-controller';
import type { SupportedLanguage } from '../../src/shared/languages';
import type { ExtensionSettings } from '../../src/shared/settings';
import type {
  TerminalTranslationState,
  TranslationOptions,
  TranslationState,
} from '../../src/translation/types';

const controllers: InteractionController[] = [];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.stop();
  vi.useRealTimers();
  document.body.replaceChildren();
});

function createControllerHarness(overrides: Partial<ExtensionSettings> = {}) {
  document.body.innerHTML = '<p id="target">Hello world</p>';
  const target = document.querySelector('#target')!;
  const candidate = {
    text: 'Hello world',
    anchorRect: new DOMRect(10, 10, 80, 20),
    element: target,
    getAnchorRect: vi.fn(() => new DOMRect(10, 10, 80, 20)),
  };
  const selectionExtractor = vi.fn((_selection?: Selection | null) => candidate);
  const hoverExtractor = vi.fn((_target?: EventTarget | null) =>
    _target ? candidate : null,
  );
  const success = {
    kind: 'success',
    sourceLanguage: 'en',
    targetLanguage: 'zh',
    translatedText: '你好',
  } as const;
  const engine = {
    translate: vi.fn(
      async (
        _text: string,
        _target: SupportedLanguage,
        onState: (state: TranslationState) => void,
        _options?: TranslationOptions,
      ): Promise<TerminalTranslationState> => {
        onState(success);
        return success;
      },
    ),
    destroy: vi.fn(),
  };
  const overlay = {
    pinned: false,
    render: vi.fn(),
    containsEvent: vi.fn(() => false),
    close: vi.fn(),
    destroy: vi.fn(),
  };
  const settings = {
    enabled: true,
    mode: 'selection',
    targetLanguage: 'zh',
    ...overrides,
  } as ExtensionSettings;
  const controller = new InteractionController({
    document,
    engine,
    overlay,
    selectionExtractor,
    hoverExtractor,
  });
  controllers.push(controller);
  return {
    controller,
    candidate,
    target,
    engine,
    overlay,
    settings,
    selectionExtractor,
    hoverExtractor,
  };
}

describe('InteractionController', () => {
  it('translates mouse and keyboard selections in selection mode', () => {
    const harness = createControllerHarness();
    harness.controller.start(harness.settings);

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    document.dispatchEvent(
      new KeyboardEvent('keyup', {
        key: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
      }),
    );

    expect(harness.selectionExtractor).toHaveBeenCalledTimes(2);
    expect(harness.engine.translate).toHaveBeenCalledTimes(2);
    expect(harness.engine.translate).toHaveBeenLastCalledWith(
      'Hello world',
      'zh',
      expect.any(Function),
      { userActivated: true },
    );
  });

  it('activates hover only after 500ms and closes 250ms after leaving', async () => {
    const harness = createControllerHarness({ mode: 'hover' });
    harness.controller.start(harness.settings);
    harness.target.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true }),
    );

    await vi.advanceTimersByTimeAsync(499);
    expect(harness.engine.translate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.engine.translate).toHaveBeenCalledTimes(1);
    expect(harness.engine.translate).toHaveBeenCalledWith(
      'Hello world',
      'zh',
      expect.any(Function),
      { userActivated: false },
    );

    harness.target.dispatchEvent(
      new PointerEvent('pointerout', { bubbles: true }),
    );
    await vi.advanceTimersByTimeAsync(249);
    expect(harness.overlay.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.overlay.close).toHaveBeenCalledTimes(1);
  });

  it('switches modes without retaining old listeners', async () => {
    const harness = createControllerHarness();
    harness.controller.start(harness.settings);
    harness.controller.applySettings({ ...harness.settings, mode: 'hover' });

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(harness.selectionExtractor).not.toHaveBeenCalled();

    harness.target.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true }),
    );
    await vi.advanceTimersByTimeAsync(500);
    expect(harness.hoverExtractor).toHaveBeenCalledOnce();
  });

  it('keeps one 500ms dwell while moving across descendants of the same block', async () => {
    const harness = createControllerHarness({ mode: 'hover' });
    harness.target.innerHTML = '<span id="first">Hello</span> <span id="second">world</span>';
    harness.controller.start(harness.settings);

    document.querySelector('#first')!.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true }),
    );
    await vi.advanceTimersByTimeAsync(250);
    document.querySelector('#second')!.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true }),
    );
    await vi.advanceTimersByTimeAsync(250);

    expect(harness.engine.translate).toHaveBeenCalledOnce();
  });

  it('closes the old candidate after 250ms without cancelling the new dwell', async () => {
    const harness = createControllerHarness({ mode: 'hover' });
    const second = document.createElement('p');
    second.textContent = 'Second block';
    document.body.append(second);
    const firstCandidate = harness.selectionExtractor();
    const secondCandidate = {
      text: 'Second block',
      anchorRect: new DOMRect(20, 30, 90, 20),
      element: second,
      getAnchorRect: vi.fn(() => new DOMRect(20, 30, 90, 20)),
    };
    harness.hoverExtractor.mockImplementation(target =>
      target === second ? secondCandidate : firstCandidate,
    );
    harness.controller.start(harness.settings);

    harness.target.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true }),
    );
    await vi.advanceTimersByTimeAsync(500);
    harness.target.dispatchEvent(
      new PointerEvent('pointerout', { bubbles: true, relatedTarget: second }),
    );
    second.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        relatedTarget: harness.target,
      }),
    );

    await vi.advanceTimersByTimeAsync(250);
    expect(harness.overlay.close).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.engine.translate).toHaveBeenCalledTimes(2);
  });

  it('registers no automatic interaction when disabled', () => {
    const harness = createControllerHarness({ enabled: false });
    harness.controller.start(harness.settings);

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    harness.target.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true }),
    );

    expect(harness.selectionExtractor).not.toHaveBeenCalled();
    expect(harness.hoverExtractor).not.toHaveBeenCalled();
    expect(harness.engine.translate).not.toHaveBeenCalled();
  });

  it('drops an older translation update after a newer request starts', () => {
    const harness = createControllerHarness();
    const callbacks: Array<(state: TranslationState) => void> = [];
    harness.engine.translate.mockImplementation(
      async (_text, _target, onState) => {
        callbacks.push(onState);
        return {
          kind: 'success',
          sourceLanguage: 'en',
          targetLanguage: 'zh',
          translatedText: 'done',
        };
      },
    );
    harness.controller.start(harness.settings);

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    callbacks[1]!({
      kind: 'success',
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      translatedText: 'new',
    });
    callbacks[0]!({
      kind: 'success',
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      translatedText: 'old',
    });

    expect(harness.overlay.render).toHaveBeenCalledTimes(1);
    expect(harness.overlay.render).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'success', translatedText: 'new' }),
      harness.candidate,
    );
  });

  it('pauses while pinned, ignores outside clicks, and always closes on Escape', () => {
    const harness = createControllerHarness();
    harness.overlay.pinned = true;
    harness.controller.start(harness.settings);

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    );
    expect(harness.engine.translate).not.toHaveBeenCalled();
    expect(harness.overlay.close).not.toHaveBeenCalled();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(harness.overlay.close).toHaveBeenCalledOnce();
  });

  it('keeps an unpinned overlay open for owned clicks and closes for outside clicks', () => {
    const harness = createControllerHarness();
    harness.controller.start(harness.settings);
    harness.overlay.containsEvent.mockReturnValueOnce(true);

    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    );
    expect(harness.overlay.close).not.toHaveBeenCalled();

    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    );
    expect(harness.overlay.close).toHaveBeenCalledOnce();
  });

  it('manual close invalidates an in-flight translation', () => {
    const harness = createControllerHarness();
    let callback!: (state: TranslationState) => void;
    harness.engine.translate.mockImplementation(
      async (_text, _target, onState) => {
        callback = onState;
        return {
          kind: 'success',
          sourceLanguage: 'en',
          targetLanguage: 'zh',
          translatedText: 'late',
        };
      },
    );
    harness.controller.start(harness.settings);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    harness.controller.close();
    callback({
      kind: 'success',
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      translatedText: 'late',
    });

    expect(harness.overlay.render).not.toHaveBeenCalled();
  });

  it('uses a compact activation state for passive hover', async () => {
    const harness = createControllerHarness({ mode: 'hover' });
    harness.engine.translate.mockImplementation(
      async (_text, _target, onState) => {
        const state = {
          kind: 'activation-required',
          phase: 'detector',
        } as const;
        onState(state);
        return state;
      },
    );
    harness.controller.start(harness.settings);
    harness.target.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true }),
    );
    await vi.advanceTimersByTimeAsync(500);

    expect(harness.overlay.render).toHaveBeenCalledWith(
      { kind: 'activation-available' },
      harness.candidate,
    );
    expect(harness.overlay.render).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'activation-required' }),
      expect.anything(),
    );
  });

  it('keeps full activation prompts for explicit selection and retry', async () => {
    const hover = createControllerHarness({ mode: 'hover' });
    hover.engine.translate.mockImplementation(
      async (_text, _target, onState, options) => {
        const state = {
          kind: 'activation-required',
          phase: options?.userActivated ? 'translator' : 'detector',
        } as const;
        onState(state);
        return state;
      },
    );
    hover.controller.start(hover.settings);
    hover.target.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true }),
    );
    await vi.advanceTimersByTimeAsync(500);

    hover.controller.retry();

    expect(hover.engine.translate).toHaveBeenLastCalledWith(
      'Hello world',
      'zh',
      expect.any(Function),
      { userActivated: true },
    );
    expect(hover.overlay.render).toHaveBeenLastCalledWith(
      { kind: 'activation-required', phase: 'translator' },
      hover.candidate,
    );

    const selection = createControllerHarness({ mode: 'selection' });
    selection.engine.translate.mockImplementation(
      async (_text, _target, onState) => {
        const state = {
          kind: 'activation-required',
          phase: 'detector',
        } as const;
        onState(state);
        return state;
      },
    );
    selection.controller.start(selection.settings);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(selection.overlay.render).toHaveBeenLastCalledWith(
      { kind: 'activation-required', phase: 'detector' },
      selection.candidate,
    );
  });

  it('closes a same-language notice at exactly 1200ms and fully stops', async () => {
    const harness = createControllerHarness();
    harness.engine.translate.mockImplementation(
      async (_text, _target, onState) => {
        const state = { kind: 'same-language', language: 'zh' } as const;
        onState(state);
        return state;
      },
    );
    harness.controller.start(harness.settings);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(1199);
    expect(harness.overlay.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.overlay.close).toHaveBeenCalledOnce();

    harness.controller.stop();
    expect(harness.overlay.destroy).toHaveBeenCalledOnce();
    expect(harness.engine.destroy).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
