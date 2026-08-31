# Chrome Web Store Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a validated Chrome Web Store upload package, required visual assets, and accurate submission documentation for Quick Translate.

**Architecture:** Keep runtime behavior unchanged. Extend the existing build with local icon assets and add a separate release pipeline that regenerates upload artwork from local SVG sources, assembles a source-map-free ZIP from `dist`, and validates its contents. Committed PNG artwork is canonical because system-font rendering can differ slightly across operating systems.

**Tech Stack:** Manifest V3, TypeScript, Node.js ESM, Vitest, local SVG sources, macOS `sips` with Chrome/Chromium fallback for PNG conversion.

## Global Constraints

- Chrome minimum version remains exactly `138`.
- Runtime permissions remain exactly `["storage"]` with no background worker or explicit `host_permissions`.
- No remote code, remote assets, analytics, advertising, login, API key, or developer backend.
- Page text and translations remain local and are never persisted.
- Production ZIP root contains `manifest.json` and excludes all `*.map` files.
- Store content is provided in English and Simplified Chinese.

---

### Task 1: Package icons and manifest declarations

**Files:**
- Create: `src/icons/icon-16.png`
- Create: `src/icons/icon-32.png`
- Create: `src/icons/icon-48.png`
- Create: `src/icons/icon-128.png`
- Create: `store-assets/source/icon.svg`
- Modify: `src/manifest.json`
- Modify: `scripts/build.mjs`
- Modify: `scripts/validate-dist.mjs`
- Test: `tests/build/manifest.test.ts`
- Test: `tests/build/dist.test.ts`

**Interfaces:**
- Consumes: existing `npm run build` output contract.
- Produces: icon paths `icons/icon-{16,32,48,128}.png` in both the manifest and `dist`.

- [ ] **Step 1: Add failing manifest and dist assertions for all four icon sizes.**
- [ ] **Step 2: Run the focused build tests and confirm failure because icons are absent.**
- [ ] **Step 3: Add icon sources, generated PNGs, manifest declarations, build copy, and validation.**
- [ ] **Step 4: Run the focused build tests and confirm they pass.**

### Task 2: Store documentation

**Files:**
- Create: `store-listing/en.md`
- Create: `store-listing/zh-CN.md`
- Create: `store-listing/privacy-policy.md`
- Create: `store-listing/privacy-practices.md`
- Create: `store-listing/reviewer-notes.md`
- Create: `store-listing/submission-checklist.md`

**Interfaces:**
- Consumes: the existing manifest, README privacy description, and actual storage/content-script behavior.
- Produces: copy that can be pasted into Chrome Web Store Dashboard and a static privacy policy suitable for public HTTPS hosting.

- [ ] **Step 1: Write concise localized listing copy, privacy declarations, reviewer steps, and checklist.**
- [ ] **Step 2: Self-review the documents against the manifest and runtime code, then scan for placeholder markers and contradictions.**

### Task 3: Reproducible release package

**Files:**
- Create: `scripts/package-release.mjs`
- Modify: `package.json`
- Test: `tests/release/package-release.test.ts`

**Interfaces:**
- Consumes: a freshly generated `dist` directory and package version from `package.json`.
- Produces: `release/quick-translate-{version}.zip` with `manifest.json` at its root and no source maps.

- [ ] **Step 1: Add a failing integration test that invokes `npm run package` and inspects the archive listing.**
- [ ] **Step 2: Run the focused test and confirm failure because the command does not exist.**
- [ ] **Step 3: Implement clean staging, archive creation, traversal-safe path validation, and deterministic naming.**
- [ ] **Step 4: Run the focused test and confirm it passes.**

### Task 4: Store artwork and handoff

**Files:**
- Create: `store-assets/source/screenshot-en.svg`
- Create: `store-assets/source/screenshot-zh-CN.svg`
- Create: `store-assets/source/small-promo.svg`
- Create: `store-assets/output/screenshot-en.png`
- Create: `store-assets/output/screenshot-zh-CN.png`
- Create: `store-assets/output/small-promo.png`
- Create: `scripts/generate-store-assets.mjs`
- Modify: `README.md`
- Test: `tests/release/store-assets.test.ts`

**Interfaces:**
- Consumes: visual tokens from the current popup and the vector brand mark from Task 1.
- Produces: PNG files at exactly 1280 × 800, 1280 × 800, and 440 × 280.

- [ ] **Step 1: Add a failing test for required output filenames and exact PNG dimensions.**
- [ ] **Step 2: Run the focused test and confirm failure because the assets are absent.**
- [ ] **Step 3: Add local source artwork, a renderer-fallback generation script, canonical PNG outputs, and README release instructions.**
- [ ] **Step 4: Run the focused test and confirm it passes.**
- [ ] **Step 5: Run `npm run validate`, `npm run package`, inspect the archive and images, and record the results in the final handoff.**
