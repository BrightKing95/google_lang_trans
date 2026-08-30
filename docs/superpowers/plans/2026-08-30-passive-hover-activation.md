# Passive Hover Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent passive mouse capture on a new page from opening the full model-confirmation card while preserving a discoverable, explicit way to prepare Chrome's local translation models.

**Architecture:** Keep `TranslationEngine` unchanged and introduce an overlay-only `activation-available` state. `InteractionController` maps passive `activation-required` updates to this compact state, while explicit selection and retry paths continue rendering the existing full state; `OverlayRenderer` owns the compact button and its styling.

**Tech Stack:** TypeScript, DOM events, closed Shadow DOM, CSS system colors, Chrome built-in LanguageDetector/Translator APIs, Vitest, Testing Library.

## Global Constraints

- Passive hover must never render the full `activation-required` confirmation card.
- The compact action must retry the exact last candidate with `userActivated: true`.
- Selection mode and already-available automatic hover translations must remain unchanged.
- The compact target must be at least `32px × 32px`, use localized `prepareTranslation` for `aria-label` and `title`, and retain visible `:focus-visible` styling.
- Do not change the translation engine, model download logic, settings schema, permissions, storage keys, manifest, remote resources, or network behavior.
- Do not stage `.DS_Store` or `.superpowers/` artifacts.

---

## File Structure

- `src/content/overlay-renderer.ts`: defines the overlay-only state and renders the compact activation button.
- `src/content/interaction-controller.ts`: maps passive engine activation requests to the overlay-only state.
- `src/content/overlay-styles.ts`: sizes and styles the compact card and action.
- `tests/content/interaction-controller.test.ts`: covers passive mapping, explicit retry, and unchanged selection behavior.
- `tests/content/overlay-renderer.test.ts`: covers compact accessible markup, click wiring, state reset, and CSS dimensions.

---

### Task 1: Gate passive activation behind a compact explicit action

**Files:**
- Modify: `tests/content/interaction-controller.test.ts`
- Modify: `tests/content/overlay-renderer.test.ts`
- Modify: `src/content/interaction-controller.ts:1-40,222-248`
- Modify: `src/content/overlay-renderer.ts:1-195`
- Modify: `src/content/overlay-styles.ts`

**Interfaces:**
- Consumes: engine callback `(state: TranslationState) => void`, `runCandidate(candidate, userActivated)`, and `OverlayActions.onRetry()`.
- Produces: `OverlayState = TranslationState | { kind: 'activation-available' }`, `.card.compact`, and `.activation-trigger`.

- [ ] **Step 1: Write failing controller tests**

Replace the existing retry test in `tests/content/interaction-controller.test.ts` with:

```ts
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
```

- [ ] **Step 2: Write failing renderer and CSS tests**

Import `OVERLAY_STYLES` in `tests/content/overlay-renderer.test.ts` and add:

```ts
it('renders passive activation as one compact accessible action', () => {
  const actions = createActions();
  const overlay = new OverlayRenderer(document, actions, message);

  overlay.render({ kind: 'activation-available' }, rect(10, 10));

  const card = capturedRoot.querySelector<HTMLElement>('.card')!;
  const button = capturedRoot.querySelector<HTMLButtonElement>(
    '[data-action="activate"]',
  )!;
  expect(card.classList.contains('compact')).toBe(true);
  expect(button.title).toBe('prepareTranslation');
  expect(button.getAttribute('aria-label')).toBe('prepareTranslation');
  expect(button.textContent).toBe('译');
  expect(capturedRoot.textContent).not.toContain('activationRequired');

  button.click();
  expect(actions.onRetry).toHaveBeenCalledOnce();
});

it('resets compact presentation when a full state replaces it', () => {
  const overlay = new OverlayRenderer(document, createActions(), message);
  const anchor = rect(10, 10);
  overlay.render({ kind: 'activation-available' }, anchor);
  overlay.render({ kind: 'preparing', progress: 0.2 }, anchor);

  expect(capturedRoot.querySelector('.card')?.classList.contains('compact'))
    .toBe(false);
  expect(capturedRoot.textContent).toContain('statusPreparing');
});

it('defines a 32px compact activation target with visible focus', () => {
  expect(OVERLAY_STYLES).toMatch(
    /\.activation-trigger\s*{[^}]*min-width:\s*32px[^}]*min-height:\s*32px/s,
  );
  expect(OVERLAY_STYLES).toContain('.card.compact');
  expect(OVERLAY_STYLES).toMatch(/button:focus-visible/);
});
```

The import is:

```ts
import { OVERLAY_STYLES } from '../../src/content/overlay-styles';
```

- [ ] **Step 3: Run the focused tests and verify the red state**

Run:

```bash
npm test -- --run tests/content/interaction-controller.test.ts tests/content/overlay-renderer.test.ts
```

Expected: failures because passive hover still emits the full state and the compact state, markup, reset, and CSS do not exist.

- [ ] **Step 4: Define and map the overlay-only state**

In `src/content/overlay-renderer.ts`, export:

```ts
export type OverlayState =
  | TranslationState
  | { kind: 'activation-available' };
```

Change `OverlayRenderer.render` and `renderState` to accept `OverlayState`. In `src/content/interaction-controller.ts`, import `OverlayState`, change `OverlayPort.render` to accept it, and map the state inside `runCandidate`:

```ts
const overlayState: OverlayState =
  !userActivated && state.kind === 'activation-required'
    ? { kind: 'activation-available' }
    : state;
this.overlay.render(overlayState, candidate);
```

Keep the existing same-language timeout based on the original engine state.

- [ ] **Step 5: Render and reset the compact action**

Before replacing card children in `OverlayRenderer.render`, add:

```ts
this.card!.classList.toggle('compact', state.kind === 'activation-available');
```

Add the switch case:

```ts
case 'activation-available':
  this.renderActivationAvailable(fragment);
  return fragment;
```

Add:

```ts
private renderActivationAvailable(fragment: DocumentFragment): void {
  const label = this.message('prepareTranslation');
  const button = this.createButton(
    'activate',
    label,
    '译',
    () => this.actions.onRetry(),
  );
  button.classList.add('activation-trigger');
  fragment.append(button);
}
```

- [ ] **Step 6: Add compact styles**

Add to `src/content/overlay-styles.ts`:

```css
.card.compact {
  min-width: 0;
  padding: 4px;
  border-radius: 999px;
}

.activation-trigger {
  width: 32px;
  min-width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  border-radius: 999px;
  color: #0b57d0;
  font-weight: 750;
  line-height: 1;
}
```

Reuse the existing button hover, focus-visible, system-color, reduced-motion, positioning, and shadow rules.

- [ ] **Step 7: Run focused tests and typecheck**

Run:

```bash
npm test -- --run tests/content/interaction-controller.test.ts tests/content/overlay-renderer.test.ts
npm run typecheck
```

Expected: both test files and typecheck pass.

- [ ] **Step 8: Commit the behavior fix**

```bash
git add src/content/interaction-controller.ts src/content/overlay-renderer.ts src/content/overlay-styles.ts tests/content/interaction-controller.test.ts tests/content/overlay-renderer.test.ts
git commit -m "fix: gate passive hover activation"
```

---

### Task 2: Verify, review, and update the existing pull request

**Files:**
- Verify only: all project files and generated `dist/`

**Interfaces:**
- Consumes: completed controller mapping and compact overlay renderer.
- Produces: verified commits on `origin/feature/google-language-translator` and the existing pull request.

- [ ] **Step 1: Run the full validation suite**

```bash
npm run validate
git diff --check origin/feature/google-language-translator..HEAD
```

Expected: typecheck, all Vitest tests, build, dist validation, and diff checks pass.

- [ ] **Step 2: Inspect scope and repository hygiene**

```bash
git status --short --branch
git diff --stat origin/feature/google-language-translator..HEAD
git diff --name-status origin/feature/google-language-translator..HEAD
```

Expected: only the design, plan, controller, overlay renderer/styles, and related tests changed. `.DS_Store` remains untracked and unstaged.

- [ ] **Step 3: Request read-only code review**

Review the range from `origin/feature/google-language-translator` to `HEAD` against the design spec, with special attention to passive-versus-explicit activation, overlay state reset, keyboard accessibility, and unchanged engine/settings/manifest behavior. Fix every Critical or Important finding with a failing regression test first.

- [ ] **Step 4: Run fresh verification after review fixes**

```bash
npm run validate
git diff --check origin/feature/google-language-translator..HEAD
```

Expected: all checks pass on the exact tree to be pushed.

- [ ] **Step 5: Push the existing feature branch**

```bash
git push origin feature/google-language-translator
```

Expected: the existing pull request at `https://github.com/favowang/google_lang_trans/pull/1` includes the passive-hover fix commits.
