# Popup Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain popup with the approved “soft brand × sky blue” design while preserving every current setting, accessibility behavior, and failure path.

**Architecture:** Keep `initializePopup` and its DOM selectors unchanged. Add localized presentational content in semantic HTML, then replace the stylesheet with a token-based light/dark visual system around native checkbox, radio, and select controls.

**Tech Stack:** Chrome Manifest V3, TypeScript, semantic HTML, CSS, Chrome i18n, Vitest, Testing Library, esbuild.

## Global Constraints

- Set the popup width to exactly `336px`.
- Use the approved “soft brand × sky blue” direction and automatic `prefers-color-scheme: dark` support.
- Preserve `#enabled`, `input[name="mode"]`, `#target-language`, and `#status`.
- Keep native checkbox, radio, and select semantics; visually hidden radios must not use `display: none`.
- Add no remote resources, fonts, requests, permissions, settings, or storage fields.
- Add every new key to both locale catalogs and `MESSAGE_KEYS`.
- Do not modify the translation engine, content overlay, manifest, or settings data flow.
- Do not stage the existing `.DS_Store` or `.superpowers/` artifacts.

---

## File Structure

- `src/popup/index.html`: semantic popup structure and decorative elements.
- `src/popup/popup.css`: dimensions, tokens, control states, focus, and light/dark themes.
- `src/popup/popup.ts`: existing settings and capability behavior; no change expected.
- `src/shared/i18n.ts`: typed message-key list.
- `src/_locales/{en,zh_CN}/messages.json`: localized popup copy.
- `tests/popup/popup.test.ts`: source semantics, CSS contracts, and existing behavior.
- `tests/shared/i18n.test.ts`: locale key coverage and parity.

---

### Task 1: Branded semantic markup and localized copy

**Files:**
- Modify: `tests/popup/popup.test.ts:249`
- Modify: `tests/shared/i18n.test.ts:46`
- Modify: `src/shared/i18n.ts:3`
- Modify: `src/_locales/en/messages.json`
- Modify: `src/_locales/zh_CN/messages.json`
- Modify: `src/popup/index.html:10`

**Interfaces:**
- Consumes: `localizeDocument(root: ParentNode): void` and existing popup selectors.
- Produces: `extensionTagline`, `modeSelectionDescription`, `modeHoverDescription`, `privacyNotice`, plus the visual classes consumed by Task 2.

- [ ] **Step 1: Write failing localization tests**

Append to `tests/shared/i18n.test.ts`:

```ts
it('includes every popup visual-refresh message in both catalogs', () => {
  const required = [
    'extensionTagline',
    'modeSelectionDescription',
    'modeHoverDescription',
    'privacyNotice',
  ];
  const en = JSON.parse(
    readFileSync('src/_locales/en/messages.json', 'utf8'),
  ) as Record<string, { message: string }>;
  const zh = JSON.parse(
    readFileSync('src/_locales/zh_CN/messages.json', 'utf8'),
  ) as Record<string, { message: string }>;

  expect(MESSAGE_KEYS).toEqual(expect.arrayContaining(required));
  for (const key of required) {
    expect(en[key]?.message).toBeTruthy();
    expect(zh[key]?.message).toBeTruthy();
  }
});
```

Replace the final source test in `tests/popup/popup.test.ts` with:

```ts
it('keeps scripts external and exposes the branded accessible structure', () => {
  const html = readFileSync('src/popup/index.html', 'utf8');
  expect(html).not.toMatch(/<script[^>]*>\s*[^<]/i);
  const parsed = new DOMParser().parseFromString(html, 'text/html');

  expect(parsed.querySelector('.brand-mark')?.textContent).toBe('译');
  for (const key of [
    'extensionTagline',
    'modeSelectionDescription',
    'modeHoverDescription',
    'privacyNotice',
  ]) {
    expect(parsed.querySelector(`[data-i18n="${key}"]`)).not.toBeNull();
  }

  for (const control of parsed.querySelectorAll('input,select')) {
    const id = control.getAttribute('id');
    const wrapped = control.closest('label');
    const explicit = id ? parsed.querySelector(`label[for="${id}"]`) : null;
    expect(wrapped ?? explicit).not.toBeNull();
  }

  expect(parsed.querySelector('#mode-selection')?.getAttribute('aria-describedby'))
    .toBe('mode-selection-description');
  expect(parsed.querySelector('#mode-hover')?.getAttribute('aria-describedby'))
    .toBe('mode-hover-description');
});
```

- [ ] **Step 2: Run tests and verify the red state**

Run:

```bash
npm test -- --run tests/shared/i18n.test.ts tests/popup/popup.test.ts
```

Expected: FAIL because the new keys, `.brand-mark`, and described mode inputs are absent.

- [ ] **Step 3: Add exact typed messages**

Add after `extensionDescription` in `MESSAGE_KEYS`:

```ts
'extensionTagline',
'modeSelectionDescription',
'modeHoverDescription',
'privacyNotice',
```

Add to the English catalog:

```json
"extensionTagline": { "message": "Translate as you browse" },
"modeSelectionDescription": { "message": "Translate after selecting text" },
"modeHoverDescription": { "message": "Translate after hovering for 500 ms" },
"privacyNotice": { "message": "Translated locally by Chrome · Page content is not uploaded" }
```

Add to the Simplified Chinese catalog:

```json
"extensionTagline": { "message": "让网页阅读更顺畅" },
"modeSelectionDescription": { "message": "划选后立即翻译" },
"modeHoverDescription": { "message": "悬停 500 毫秒后翻译" },
"privacyNotice": { "message": "Chrome 本地翻译 · 网页内容不会上传" }
```

- [ ] **Step 4: Replace the popup body with semantic branded markup**

Keep the current `<head>` and external script. Replace only `<main id="app">` with:

```html
<main id="app">
  <header class="hero">
    <div class="hero-row">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">译</span>
        <div>
          <h1 data-i18n="extensionName">Quick Translate</h1>
          <p class="tagline" data-i18n="extensionTagline">Translate as you browse</p>
        </div>
      </div>
      <label class="enabled-switch" for="enabled">
        <span class="sr-only" data-i18n="enabled">Enabled</span>
        <input id="enabled" type="checkbox">
        <span class="switch-track" aria-hidden="true"></span>
      </label>
    </div>
    <p id="status" role="status" data-state="preparing"></p>
  </header>

  <section class="settings">
    <fieldset>
      <legend data-i18n="modeLabel">Translation mode</legend>
      <div class="mode-options">
        <label class="mode-option" for="mode-selection">
          <input id="mode-selection" type="radio" name="mode" value="selection"
            aria-labelledby="mode-selection-label"
            aria-describedby="mode-selection-description">
          <span class="mode-icon" aria-hidden="true">⌁</span>
          <span class="mode-copy">
            <span id="mode-selection-label" class="mode-title"
              data-i18n="modeSelection">Select text</span>
            <span id="mode-selection-description" class="mode-description"
              data-i18n="modeSelectionDescription">Translate after selecting text</span>
          </span>
        </label>
        <label class="mode-option" for="mode-hover">
          <input id="mode-hover" type="radio" name="mode" value="hover"
            aria-labelledby="mode-hover-label"
            aria-describedby="mode-hover-description">
          <span class="mode-icon" aria-hidden="true">◎</span>
          <span class="mode-copy">
            <span id="mode-hover-label" class="mode-title"
              data-i18n="modeHover">Mouse capture</span>
            <span id="mode-hover-description" class="mode-description"
              data-i18n="modeHoverDescription">Translate after hovering for 500 ms</span>
          </span>
        </label>
      </div>
    </fieldset>

    <div class="target-field">
      <label for="target-language" data-i18n="targetLanguage">Target language</label>
      <div class="select-shell">
        <span class="language-icon" aria-hidden="true">◎</span>
        <select id="target-language"></select>
      </div>
    </div>

    <p class="privacy-note">
      <span aria-hidden="true">◇</span>
      <span data-i18n="privacyNotice">Translated locally by Chrome · Page content is not uploaded</span>
    </p>
  </section>
</main>
```

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
npm test -- --run tests/shared/i18n.test.ts tests/popup/popup.test.ts
npm run typecheck
```

Expected: PASS. Existing role queries still resolve `Enabled`, `Select text`, `Mouse capture`, and `Target language`.

- [ ] **Step 6: Commit**

```bash
git add src/popup/index.html src/shared/i18n.ts src/_locales/en/messages.json src/_locales/zh_CN/messages.json tests/popup/popup.test.ts tests/shared/i18n.test.ts
git commit -m "feat: restructure localized popup"
```

---

### Task 2: Sky-blue light and dark visual system

**Files:**
- Modify: `tests/popup/popup.test.ts`
- Replace: `src/popup/popup.css`

**Interfaces:**
- Consumes: all presentational classes created in Task 1.
- Produces: a fixed `336px` popup, visible focus, disabled states, status colors, and automatic dark mode.

- [ ] **Step 1: Add a failing CSS contract test**

Append to `tests/popup/popup.test.ts`:

```ts
it('defines the approved dimensions, themes, and focus contracts', () => {
  const css = readFileSync('src/popup/popup.css', 'utf8');

  expect(css).toMatch(/body\s*{[^}]*width:\s*336px/s);
  expect(css).toContain('.brand-mark');
  expect(css).toContain('.enabled-switch');
  expect(css).toContain('.mode-option');
  expect(css).toContain('.privacy-note');
  expect(css).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
  expect(css).toMatch(/\.mode-option:has\(input:focus-visible\)/);
  expect(css).not.toMatch(/\.mode-option\s+input\s*{[^}]*display:\s*none/s);
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run:

```bash
npm test -- --run tests/popup/popup.test.ts
```

Expected: FAIL because the current body is `320px` and the new selectors do not exist.

- [ ] **Step 3: Replace the stylesheet with exact design tokens**

Define these light tokens in `:root`:

```css
:root {
  color-scheme: light dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system,
    BlinkMacSystemFont, "Segoe UI", sans-serif;
  --accent: #4f75e8;
  --accent-strong: #3159c4;
  --accent-soft: #eef4ff;
  --surface: #fbfcff;
  --surface-raised: #ffffff;
  --text: #20283a;
  --muted: #737b8c;
  --subtle: #8a91a0;
  --border: #e1e6ef;
  --focus: #2f78ed;
  --ready: #1d8f59;
  --warning: #b66a00;
  --danger: #b3261e;
}
```

Implement the fixed shell and approved header with these exact dimensions:

```css
* { box-sizing: border-box; }
html, body { margin: 0; }
body { width: 336px; overflow-x: hidden; background: var(--surface); color: var(--text); font-size: 13px; }
#app { overflow: hidden; background: var(--surface); }
.hero { padding: 20px 20px 22px; background: linear-gradient(135deg, #e9f5ff, #f1f3ff); }
.hero-row, .brand { display: flex; align-items: center; }
.hero-row { justify-content: space-between; }
.brand { gap: 11px; min-width: 0; }
.brand-mark {
  display: grid; flex: 0 0 auto; width: 38px; height: 38px; place-items: center;
  border-radius: 12px; background: linear-gradient(135deg, #2f88f5, #6568e8);
  box-shadow: 0 8px 20px rgba(65, 104, 224, 0.28); color: #fff;
  font-size: 19px; font-weight: 800;
}
h1 { margin: 0; font-size: 18px; font-weight: 760; letter-spacing: -0.02em; line-height: 1.15; }
.tagline { margin: 4px 0 0; color: #6d7588; font-size: 10.5px; }
```

Style `.enabled-switch` as a `42px × 24px` track. Keep its input absolutely positioned with `opacity: 0`; use `.switch-track::after` for the `18px` thumb, translating it `18px` when checked. Give `input:focus-visible + .switch-track` a `2px solid var(--focus)` outline with `3px` offset.

Implement `#status` as an inline-flex pill with `min-height: 26px`, `margin-top: 16px`, `5px 10px` padding, `999px` radius, `10.5px` bold text, and a `7px` `::before` dot. Use `--warning` by default, `--ready` for `[data-state="ready"]`, and `--danger` for unsupported/error.

Implement the settings and controls with these exact contracts:

```css
.settings { padding: 18px 20px 20px; }
fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
legend, .target-field > label {
  display: block; margin: 0 0 9px; color: var(--muted); font-size: 10.5px;
  font-weight: 760; letter-spacing: 0.055em; text-transform: uppercase;
}
.mode-options { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.mode-option {
  position: relative; display: grid; grid-template-columns: 23px minmax(0, 1fr);
  gap: 7px; min-height: 76px; padding: 12px; border: 1px solid var(--border);
  border-radius: 13px; background: var(--surface-raised);
  box-shadow: 0 5px 15px rgba(34, 51, 84, 0.045); color: #626c7f; cursor: pointer;
}
.mode-option input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.mode-icon { display: grid; width: 23px; height: 23px; place-items: center; border-radius: 7px; background: #f0f3f8; }
.mode-title, .mode-description { display: block; }
.mode-title { font-size: 12px; font-weight: 720; line-height: 23px; }
.mode-description { margin-top: 7px; color: var(--subtle); font-size: 9.5px; line-height: 1.35; }
.mode-option:has(input:checked) {
  border-color: var(--accent); background: var(--accent-soft); color: var(--accent-strong);
  box-shadow: 0 0 0 1px var(--accent) inset, 0 7px 17px rgba(57, 91, 190, 0.09);
}
.mode-option:has(input:disabled) { cursor: not-allowed; opacity: 0.5; }
.mode-option:has(input:focus-visible), select:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
.target-field { margin-top: 18px; }
.select-shell { position: relative; }
.language-icon { position: absolute; top: 50%; left: 13px; z-index: 1; color: var(--accent); pointer-events: none; transform: translateY(-50%); }
select {
  width: 100%; min-height: 44px; padding: 0 36px 0 39px; border: 1px solid var(--border);
  border-radius: 12px; background: var(--surface-raised); color: var(--text);
  box-shadow: 0 4px 13px rgba(34, 51, 84, 0.04); font: inherit; font-size: 12px; font-weight: 650;
}
.privacy-note {
  display: flex; align-items: flex-start; gap: 7px; margin: 16px 0 0; padding-top: 14px;
  border-top: 1px solid #edf0f5; color: #7e889a; font-size: 9.5px; line-height: 1.45;
}
```

Add `.sr-only` using the standard `1px` clipped pattern. Add a reduced-motion query that removes switch transitions.

Inside `@media (prefers-color-scheme: dark)`, override the tokens with:

```css
:root {
  --accent: #7798ff; --accent-strong: #cbd8ff; --accent-soft: #273755;
  --surface: #1d2533; --surface-raised: #252e3e; --text: #ecf1fa;
  --muted: #9ba7b9; --subtle: #8996a9; --border: #3a4558;
  --focus: #8eb0ff; --ready: #8be4b5; --warning: #f4be70; --danger: #ffaaa4;
}
```

Use `linear-gradient(135deg, #243b59, #2e3154)` for the dark hero, remove raised shadows, use `#333e50` for unselected icons, `#344d79` for selected icons, and `#303a4b` for the privacy divider.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
npm test -- --run tests/popup/popup.test.ts tests/shared/i18n.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Build and inspect the real popup**

Run:

```bash
npm run build
node scripts/validate-dist.mjs
```

Reload the unpacked extension from:

```text
/Users/bytedance/go/src/myai/google_lang_trans/.worktrees/google-language-translator/dist
```

Verify: 336px width, no horizontal scrolling, complete English and Chinese copy, visible keyboard focus on all controls, mutually exclusive mode styling, legible error pills, and the approved dark theme through DevTools Rendering emulation.

- [ ] **Step 6: Run full verification**

```bash
npm run validate
git diff --check
```

Expected: all tests, typecheck, build, and dist validation pass; `git diff --check` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/popup/popup.css tests/popup/popup.test.ts
git commit -m "feat: polish popup visual design"
```

---

### Task 3: Final verification and PR update

**Files:**
- Verify only: files committed by Tasks 1 and 2.

**Interfaces:**
- Consumes: the two implementation commits.
- Produces: a clean validated branch on existing Pull Request #1.

- [ ] **Step 1: Check the branch diff and preserve unrelated files**

```bash
git status --short
git diff --stat 712d0d4..HEAD
git log --oneline -4
```

Expected: `.DS_Store` may remain untracked but unstaged; committed changes are limited to popup HTML/CSS, locales, typed keys, tests, design, and plan documents.

- [ ] **Step 2: Run fresh final validation**

```bash
npm run validate
git diff --check
```

Expected: fresh PASS output after the final code commit.

- [ ] **Step 3: Push to the existing PR**

```bash
git push origin feature/google-language-translator
```

Expected: `https://github.com/BrightKing95/google_lang_trans/pull/1` includes the popup refresh commits.
