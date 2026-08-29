# Chrome 本机语言翻译扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 Chrome 138+ Manifest V3 扩展，通过“选中文字”和“鼠标捕捉”两种互斥模式，在本机检测语言并以即时浮层显示目标语言译文。

**Architecture:** Popup 将启停、模式和目标语言写入 `chrome.storage.local`；顶层 HTTP/HTTPS 页面的 Content Script 订阅设置，提取选区或悬停文本，并在同一窗口环境调用 Chrome Language Detector/Translator API。即时浮层由封闭 Shadow DOM 渲染，翻译状态与页面文字只保存在当前页面内存中，不设置后台 Service Worker。

**Tech Stack:** TypeScript、esbuild、Vitest、jsdom、Chrome Manifest V3、Chrome Built-in Language Detector/Translator API、Shadow DOM、`chrome.storage`、`chrome.i18n`

## Global Constraints

- 最低平台为桌面版 Google Chrome 138。
- Manifest 必须为 V3，且不能包含后台 Service Worker。
- UI 使用原生 TypeScript 和 DOM API，不引入 React 或其他 UI 框架。
- 翻译只能使用 Chrome 内置 Language Detector/Translator API，不调用远程翻译服务。
- Content Script 只运行在普通 HTTP/HTTPS 顶层文档；不支持 Chrome 内部页、Chrome 应用商店、内置 PDF 阅读器和跨域 iframe。
- UI 文案必须通过 `chrome.i18n` 获取；首版提供 `en` 与 `zh_CN`。
- 鼠标捕捉停留阈值为 500ms，最多提取 500 个 Unicode 码点，移开后 250ms 关闭未固定浮层。
- 动态网页文字和译文只能通过 `textContent` 写入；禁止用 `innerHTML` 渲染动态内容。
- 不保存翻译历史，不把网页文本发送到 Service Worker、远程接口或持久化存储。
- 每个任务严格执行红—绿测试循环，并在本任务验证通过后独立提交。

## File Structure

```text
.
├── package.json                         # npm 脚本与开发依赖
├── package-lock.json                    # 可复现依赖锁
├── tsconfig.json                        # Chrome 138 TypeScript 配置
├── vitest.config.ts                     # jsdom 测试环境
├── scripts/
│   ├── build.mjs                        # esbuild 打包与静态文件复制
│   └── validate-dist.mjs                # 构建产物与 Manifest 校验
├── src/
│   ├── manifest.json                    # MV3、storage 权限、Popup、Content Script
│   ├── _locales/
│   │   ├── en/messages.json             # 英文界面文案
│   │   └── zh_CN/messages.json          # 简体中文界面文案
│   ├── shared/
│   │   ├── i18n.ts                      # 消息键读取和语言名显示
│   │   ├── languages.ts                 # 支持语言及 BCP 47 规范化
│   │   └── settings.ts                  # 设置默认值、校验、存储和订阅
│   ├── translation/
│   │   ├── types.ts                     # 翻译适配器与状态联合类型
│   │   ├── chrome-ai-adapter.ts         # Chrome 内置 AI API 薄适配器
│   │   └── translation-engine.ts        # 检测、可用性、缓存和翻译流程
│   ├── content/
│   │   ├── text-extractor.ts            # Selection/悬停文本提取与截断
│   │   ├── overlay-styles.ts             # Shadow DOM 静态 CSS 字符串
│   │   ├── overlay-renderer.ts           # 浮层状态、定位和用户操作
│   │   ├── interaction-controller.ts     # 两种模式、计时器和过期请求控制
│   │   └── index.ts                      # Content Script 依赖接线与生命周期
│   └── popup/
│       ├── index.html                    # Popup 结构
│       ├── popup.css                     # Popup 样式
│       └── popup.ts                      # 设置 UI 与能力提示
└── tests/
    ├── setup.ts                          # Vitest/jsdom 与 Chrome API 测试替身
    ├── build/
    │   ├── manifest.test.ts              # 源 Manifest 约束
    │   └── dist.test.ts                  # 最终构建产物约束
    ├── shared/
    │   ├── languages.test.ts
    │   └── settings.test.ts
    ├── translation/translation-engine.test.ts
    └── content/
        ├── text-extractor.test.ts
        ├── overlay-renderer.test.ts
        └── interaction-controller.test.ts
```

---

### Task 1: 建立可构建、可安装的 MV3 骨架

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `scripts/build.mjs`
- Create: `src/manifest.json`
- Create: `src/_locales/en/messages.json`
- Create: `src/_locales/zh_CN/messages.json`
- Create: `src/popup/index.html`
- Create: `src/popup/popup.css`
- Create: `src/popup/popup.ts`
- Create: `src/content/index.ts`
- Create: `tests/setup.ts`
- Test: `tests/build/manifest.test.ts`

**Interfaces:**
- Consumes: 无；这是项目工具链根任务。
- Produces: `npm run typecheck`、`npm test`、`npm run build`；输出 `dist/manifest.json`、`dist/content.js`、`dist/popup.html`、`dist/popup.js`、`dist/popup.css` 和 `dist/_locales/**`。

- [ ] **Step 1: 创建 npm 与 TypeScript 测试配置**

```json
{
  "name": "quick-translate-extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node scripts/build.mjs",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {}
}
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node", "chrome", "vitest/globals", "@types/dom-chromium-ai"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'jsdom', setupFiles: ['tests/setup.ts'], restoreMocks: true },
});
```

- [ ] **Step 2: 安装并锁定开发依赖**

Run:

```bash
npm install --save-dev typescript esbuild vitest jsdom @types/node @types/chrome @types/dom-chromium-ai
```

Expected: `package-lock.json` 创建，`npm ls --depth=0` 退出码为 0。

- [ ] **Step 3: 写 Manifest 失败测试**

```ts
// tests/build/manifest.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));

describe('manifest', () => {
  it('uses MV3, Chrome 138, minimal permissions, and no background worker', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe('138');
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest.background).toBeUndefined();
    expect(manifest.content_scripts[0]).toMatchObject({
      matches: ['http://*/*', 'https://*/*'],
      all_frames: false,
      js: ['content.js'],
    });
  });
});
```

- [ ] **Step 4: 运行测试并确认缺少 Manifest**

Run: `npm test -- tests/build/manifest.test.ts`

Expected: FAIL，错误包含 `ENOENT` 和 `src/manifest.json`。

- [ ] **Step 5: 创建最小 Manifest、入口与构建脚本**

```json
{
  "manifest_version": 3,
  "name": "__MSG_extensionName__",
  "description": "__MSG_extensionDescription__",
  "version": "0.1.0",
  "minimum_chrome_version": "138",
  "default_locale": "en",
  "permissions": ["storage"],
  "action": { "default_popup": "popup.html" },
  "content_scripts": [{
    "matches": ["http://*/*", "https://*/*"],
    "js": ["content.js"],
    "run_at": "document_idle",
    "all_frames": false
  }]
}
```

```js
// scripts/build.mjs
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await build({
  entryPoints: { content: 'src/content/index.ts', popup: 'src/popup/popup.ts' },
  bundle: true,
  outdir: 'dist',
  entryNames: '[name]',
  format: 'iife',
  platform: 'browser',
  target: ['chrome138'],
  sourcemap: true,
});
await cp('src/manifest.json', 'dist/manifest.json');
await cp('src/_locales', 'dist/_locales', { recursive: true });
await cp('src/popup/popup.css', 'dist/popup.css');
const popupHtml = await readFile('src/popup/index.html', 'utf8');
await writeFile('dist/popup.html', popupHtml);
```

```html
<!-- src/popup/index.html -->
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><link rel="stylesheet" href="popup.css"></head>
  <body><main id="app"></main><script src="popup.js"></script></body>
</html>
```

```css
/* src/popup/popup.css */
html, body { margin: 0; min-width: 320px; font-family: system-ui, sans-serif; }
```

```ts
// src/popup/popup.ts and src/content/index.ts
export {};
```

```ts
// tests/setup.ts
export {};
```

```json
// src/_locales/en/messages.json
{
  "extensionName": { "message": "Quick Translate" },
  "extensionDescription": { "message": "Translate selected or hovered text locally in Chrome." }
}
```

```json
// src/_locales/zh_CN/messages.json
{
  "extensionName": { "message": "轻译" },
  "extensionDescription": { "message": "使用 Chrome 本机能力翻译选中或悬停捕捉的文字。" }
}
```

- [ ] **Step 6: 运行骨架验证**

Run:

```bash
npm run typecheck
npm test -- tests/build/manifest.test.ts
npm run build
```

Expected: all three commands exit 0；`dist/manifest.json` 存在，且 `dist/` 中没有 background worker 文件。

- [ ] **Step 7: 提交骨架**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts scripts/build.mjs src tests/setup.ts tests/build/manifest.test.ts
git commit -m "build: scaffold Chrome translation extension"
```

---

### Task 2: 实现支持语言、设置默认值与存储同步

**Files:**
- Create: `src/shared/languages.ts`
- Create: `src/shared/settings.ts`
- Modify: `tests/setup.ts`
- Test: `tests/shared/languages.test.ts`
- Test: `tests/shared/settings.test.ts`

**Interfaces:**
- Consumes: `chrome.storage.local` 和 `chrome.storage.onChanged`。
- Produces: `SupportedLanguage`、`SUPPORTED_LANGUAGES`、`normalizeSupportedLanguage(tag)`、`resolveDefaultTargetLanguage(uiLanguage)`、`ExtensionSettings`、`DEFAULT_MODE`、`loadSettings()`、`updateSettings(patch)`、`watchSettings(listener)`。

- [ ] **Step 1: 写语言规范化失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeSupportedLanguage, resolveDefaultTargetLanguage } from '../../src/shared/languages';

describe('language normalization', () => {
  it.each([
    ['zh-CN', 'zh'], ['zh-SG', 'zh'], ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'], ['en-US', 'en'], ['pt-BR', 'pt'],
  ])('maps %s to %s', (input, expected) => {
    expect(normalizeSupportedLanguage(input)).toBe(expected);
  });

  it('falls back to English for an unsupported UI language', () => {
    expect(resolveDefaultTargetLanguage('xx-ZZ')).toBe('en');
  });
});
```

- [ ] **Step 2: 运行语言测试并确认模块缺失**

Run: `npm test -- tests/shared/languages.test.ts`

Expected: FAIL with `Cannot find module '../../src/shared/languages'`.

- [ ] **Step 3: 实现支持语言与规范化**

```ts
export const SUPPORTED_LANGUAGES = [
  'ar', 'bg', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr',
  'he', 'hi', 'hr', 'hu', 'id', 'it', 'ja', 'kn', 'ko', 'lt', 'mr',
  'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'ta', 'te',
  'th', 'tr', 'uk', 'vi', 'zh', 'zh-Hant',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const supported = new Set<string>(SUPPORTED_LANGUAGES);

export function normalizeSupportedLanguage(tag: string): SupportedLanguage | null {
  const normalized = tag.trim().replaceAll('_', '-');
  const lower = normalized.toLowerCase();
  if (lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo' || lower.startsWith('zh-hant')) return 'zh-Hant';
  if (lower === 'zh-cn' || lower === 'zh-sg' || lower === 'zh' || lower.startsWith('zh-hans')) return 'zh';
  const exact = SUPPORTED_LANGUAGES.find(code => code.toLowerCase() === lower);
  if (exact) return exact;
  const primary = lower.split('-')[0]!;
  return supported.has(primary) ? primary as SupportedLanguage : null;
}

export function resolveDefaultTargetLanguage(uiLanguage: string): SupportedLanguage {
  return normalizeSupportedLanguage(uiLanguage) ?? 'en';
}

export function areEquivalentLanguages(a: string, b: string): boolean {
  const normalizedA = normalizeSupportedLanguage(a);
  const normalizedB = normalizeSupportedLanguage(b);
  return normalizedA !== null && normalizedA === normalizedB;
}
```

- [ ] **Step 4: 运行语言测试并确认通过**

Run: `npm test -- tests/shared/languages.test.ts`

Expected: PASS.

- [ ] **Step 5: 写设置存储失败测试**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, updateSettings, watchSettings } from '../../src/shared/settings';
import { resetChromeStorageFake } from '../setup';

describe('settings', () => {
  beforeEach(() => resetChromeStorageFake());

  it('merges defaults from the browser UI language', async () => {
    chrome.i18n.getUILanguage = vi.fn(() => 'zh-CN');
    await expect(loadSettings()).resolves.toEqual({
      enabled: true, mode: 'selection', targetLanguage: 'zh',
    });
  });

  it('validates updates and notifies subscribers', async () => {
    const listener = vi.fn();
    const unsubscribe = watchSettings(listener);
    await updateSettings({ mode: 'hover', targetLanguage: 'ja' });
    expect(listener).toHaveBeenCalledWith({ enabled: true, mode: 'hover', targetLanguage: 'ja' });
    unsubscribe();
  });
});
```

```ts
// tests/setup.ts
import { vi } from 'vitest';

type ChangeListener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void;
let stored: Record<string, unknown> = {};
const listeners = new Set<ChangeListener>();

export function resetChromeStorageFake(): void {
  stored = {};
  listeners.clear();
  vi.stubGlobal('chrome', {
    i18n: { getUILanguage: vi.fn(() => 'en'), getMessage: vi.fn((key: string) => key) },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [key, newValue] of Object.entries(items)) {
            const oldValue = stored[key];
            stored[key] = newValue;
            for (const listener of listeners) listener({ [key]: { oldValue, newValue } }, 'local');
          }
        }),
      },
      onChanged: {
        addListener: vi.fn((listener: ChangeListener) => listeners.add(listener)),
        removeListener: vi.fn((listener: ChangeListener) => listeners.delete(listener)),
      },
    },
  });
}

resetChromeStorageFake();
```

- [ ] **Step 6: 运行设置测试并确认模块缺失**

Run: `npm test -- tests/shared/settings.test.ts`

Expected: FAIL with `Cannot find module '../../src/shared/settings'`.

- [ ] **Step 7: 实现设置模块**

```ts
export type TranslationMode = 'selection' | 'hover';
export interface ExtensionSettings {
  enabled: boolean;
  mode: TranslationMode;
  targetLanguage: SupportedLanguage;
}

export const SETTINGS_KEY = 'settings';
export const DEFAULT_MODE: TranslationMode = 'selection';

const defaults = (): ExtensionSettings => ({
  enabled: true,
  mode: DEFAULT_MODE,
  targetLanguage: resolveDefaultTargetLanguage(chrome.i18n.getUILanguage()),
});

function sanitize(value: unknown): ExtensionSettings {
  const base = defaults();
  if (!value || typeof value !== 'object') return base;
  const candidate = value as Partial<Record<keyof ExtensionSettings, unknown>>;
  const language = typeof candidate.targetLanguage === 'string'
    ? normalizeSupportedLanguage(candidate.targetLanguage)
    : null;
  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : base.enabled,
    mode: candidate.mode === 'hover' || candidate.mode === 'selection' ? candidate.mode : base.mode,
    targetLanguage: language ?? base.targetLanguage,
  };
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return sanitize(stored[SETTINGS_KEY]);
}

export async function updateSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await loadSettings();
  const normalizedLanguage = typeof patch.targetLanguage === 'string'
    ? normalizeSupportedLanguage(patch.targetLanguage)
    : null;
  const next: ExtensionSettings = {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
    mode: patch.mode === 'hover' || patch.mode === 'selection' ? patch.mode : current.mode,
    targetLanguage: normalizedLanguage ?? current.targetLanguage,
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export function watchSettings(listener: (settings: ExtensionSettings) => void): () => void {
  const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === 'local' && changes[SETTINGS_KEY]?.newValue) {
      listener(sanitize(changes[SETTINGS_KEY].newValue));
    }
  };
  chrome.storage.onChanged.addListener(onChanged);
  return () => chrome.storage.onChanged.removeListener(onChanged);
}
```

- [ ] **Step 8: 运行共享模块验证**

Run:

```bash
npm test -- tests/shared/languages.test.ts tests/shared/settings.test.ts
npm run typecheck
```

Expected: PASS and exit 0.

- [ ] **Step 9: 提交设置模块**

```bash
git add src/shared tests/setup.ts tests/shared
git commit -m "feat: add localized language settings"
```

---

### Task 3: 实现 Chrome 内置翻译适配器与 Translation Engine

**Files:**
- Create: `src/translation/types.ts`
- Create: `src/translation/chrome-ai-adapter.ts`
- Create: `src/translation/translation-engine.ts`
- Test: `tests/translation/translation-engine.test.ts`

**Interfaces:**
- Consumes: `SupportedLanguage`、`areEquivalentLanguages(a, b)`。
- Produces: `ModelAvailability`、`DetectedLanguage`、`TranslationState`、`BuiltInAiAdapter`、`chromeAiAdapter`、`TranslationEngine.translate(text, targetLanguage, onState)`、`TranslationEngine.destroy()`。

- [ ] **Step 1: 写 Engine 状态流失败测试**

```ts
import { describe, expect, it, vi } from 'vitest';
import { TranslationEngine } from '../../src/translation/translation-engine';
import type { BuiltInAiAdapter, TranslationState } from '../../src/translation/types';

function createFakeAiAdapter(options: { detectedLanguage?: string; translation?: string } = {}) {
  const detector = {
    detect: vi.fn(async () => [{ detectedLanguage: options.detectedLanguage ?? 'en', confidence: 0.99 }]),
    destroy: vi.fn(),
  };
  const translator = {
    translate: vi.fn(async () => options.translation ?? 'translated'),
    destroy: vi.fn(),
  };
  const adapter = {
    detectorAvailability: vi.fn(async () => 'downloadable' as const),
    createDetector: vi.fn(async (_onProgress: (loaded: number) => void) => detector),
    translatorAvailability: vi.fn(async () => 'available' as const),
    createTranslator: vi.fn(async () => translator),
  } satisfies BuiltInAiAdapter;
  return { adapter, detector, translator };
}

it('detects, prepares, translates, and caches a language pair', async () => {
  const harness = createFakeAiAdapter({ detectedLanguage: 'en', translation: '你好' });
  const engine = new TranslationEngine(harness.adapter);
  const states: string[] = [];

  const result = await engine.translate('hello', 'zh', state => states.push(state.kind));
  expect(result).toEqual({ kind: 'success', sourceLanguage: 'en', targetLanguage: 'zh', translatedText: '你好' });
  expect(states).toEqual(['preparing', 'translating', 'success']);

  await engine.translate('hello again', 'zh', () => undefined);
  expect(harness.adapter.createTranslator).toHaveBeenCalledTimes(1);
});

it('does not create a translator for equivalent languages', async () => {
  const harness = createFakeAiAdapter({ detectedLanguage: 'en-US' });
  const engine = new TranslationEngine(harness.adapter);
  await expect(engine.translate('hello', 'en', () => undefined)).resolves.toEqual({
    kind: 'same-language', language: 'en-US',
  });
  expect(harness.adapter.createTranslator).not.toHaveBeenCalled();
});
```

The test helper `createFakeAiAdapter` returns vi.fn implementations for detector/translator availability and creation, plus destroy spies.

- [ ] **Step 2: 运行 Engine 测试并确认模块缺失**

Run: `npm test -- tests/translation/translation-engine.test.ts`

Expected: FAIL with `Cannot find module '../../src/translation/translation-engine'`.

- [ ] **Step 3: 定义精确适配器和状态类型**

```ts
export type ModelAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';
export interface DetectedLanguage { detectedLanguage: string; confidence: number }
export interface DetectorPort { detect(text: string): Promise<DetectedLanguage[]>; destroy(): void }
export interface TranslatorPort { translate(text: string): Promise<string>; destroy(): void }
export interface LanguagePair { sourceLanguage: string; targetLanguage: string }
export interface BuiltInAiAdapter {
  detectorAvailability(): Promise<ModelAvailability>;
  createDetector(onProgress: (loaded: number) => void): Promise<DetectorPort>;
  translatorAvailability(pair: LanguagePair): Promise<ModelAvailability>;
  createTranslator(pair: LanguagePair, onProgress: (loaded: number) => void): Promise<TranslatorPort>;
}
export type TranslationState =
  | { kind: 'preparing'; progress?: number }
  | { kind: 'translating'; sourceLanguage: string }
  | { kind: 'success'; sourceLanguage: string; targetLanguage: string; translatedText: string }
  | { kind: 'same-language'; language: string }
  | { kind: 'unsupported'; sourceLanguage?: string; targetLanguage: string }
  | { kind: 'error'; retryable: boolean };
export type TerminalTranslationState = Exclude<TranslationState, { kind: 'preparing' | 'translating' }>;
```

- [ ] **Step 4: 实现 Engine**

```ts
export class TranslationEngine {
  private detector?: DetectorPort;
  private readonly translators = new Map<string, TranslatorPort>();
  constructor(private readonly adapter: BuiltInAiAdapter) {}

  async translate(
    text: string,
    targetLanguage: SupportedLanguage,
    onState: (state: TranslationState) => void,
  ): Promise<TerminalTranslationState> {
    try {
      const detectorAvailability = await this.adapter.detectorAvailability();
      if (detectorAvailability === 'unavailable') {
        return this.finish({ kind: 'unsupported', targetLanguage }, onState);
      }
      if (detectorAvailability !== 'available') onState({ kind: 'preparing' });
      this.detector ??= await this.adapter.createDetector(progress => onState({ kind: 'preparing', progress }));
      const detections = await this.detector.detect(text);
      const sourceLanguage = detections
        .filter(item => item.detectedLanguage)
        .sort((a, b) => b.confidence - a.confidence)[0]?.detectedLanguage;
      if (!sourceLanguage) return this.finish({ kind: 'error', retryable: true }, onState);
      if (areEquivalentLanguages(sourceLanguage, targetLanguage)) {
        return this.finish({ kind: 'same-language', language: sourceLanguage }, onState);
      }
      const pair = { sourceLanguage, targetLanguage };
      const availability = await this.adapter.translatorAvailability(pair);
      if (availability === 'unavailable') {
        return this.finish({ kind: 'unsupported', sourceLanguage, targetLanguage }, onState);
      }
      if (availability !== 'available') onState({ kind: 'preparing' });
      const key = `${sourceLanguage}→${targetLanguage}`;
      let translator = this.translators.get(key);
      if (!translator) {
        translator = await this.adapter.createTranslator(pair, progress => onState({ kind: 'preparing', progress }));
        this.translators.set(key, translator);
      }
      onState({ kind: 'translating', sourceLanguage });
      const translatedText = await translator.translate(text);
      return this.finish({ kind: 'success', sourceLanguage, targetLanguage, translatedText }, onState);
    } catch {
      return this.finish({ kind: 'error', retryable: true }, onState);
    }
  }

  destroy(): void {
    this.detector?.destroy();
    for (const translator of this.translators.values()) translator.destroy();
    this.detector = undefined;
    this.translators.clear();
  }

  private finish<T extends TerminalTranslationState>(
    state: T,
    onState: (state: TranslationState) => void,
  ): T {
    onState(state);
    return state;
  }
}
```

- [ ] **Step 5: 实现真实 Chrome 适配器**

```ts
export const chromeAiAdapter: BuiltInAiAdapter = {
  detectorAvailability: () => LanguageDetector.availability(),
  createDetector: onProgress => LanguageDetector.create({
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', event => onProgress(event.loaded));
    },
  }),
  translatorAvailability: pair => Translator.availability(pair),
  createTranslator: (pair, onProgress) => Translator.create({
    ...pair,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', event => onProgress(event.loaded));
    },
  }),
};
```

Feature detection belongs in the adapter: when `LanguageDetector` or `Translator` is absent, availability returns `unavailable` instead of throwing.

- [ ] **Step 6: 增加不支持、失败、进度和销毁测试**

```ts
it('reports unsupported without creating a translator', async () => {
  const harness = createFakeAiAdapter();
  harness.adapter.detectorAvailability.mockResolvedValue('unavailable');
  const engine = new TranslationEngine(harness.adapter);
  await expect(engine.translate('hello', 'zh', () => undefined)).resolves.toEqual({
    kind: 'unsupported', targetLanguage: 'zh',
  });
  expect(harness.adapter.createTranslator).not.toHaveBeenCalled();
});

it('emits download progress and maps translation failure to retryable error', async () => {
  const harness = createFakeAiAdapter();
  harness.adapter.createDetector.mockImplementation(async onProgress => {
    onProgress(0.5);
    return harness.detector;
  });
  harness.translator.translate.mockRejectedValue(new Error('offline'));
  const engine = new TranslationEngine(harness.adapter);
  const states: TranslationState[] = [];
  await expect(engine.translate('hello', 'zh', state => states.push(state))).resolves.toEqual({
    kind: 'error', retryable: true,
  });
  expect(states).toContainEqual({ kind: 'preparing', progress: 0.5 });
});

it('destroys the detector and cached translators exactly once', async () => {
  const harness = createFakeAiAdapter();
  const engine = new TranslationEngine(harness.adapter);
  await engine.translate('hello', 'zh', () => undefined);
  engine.destroy();
  expect(harness.detector.destroy).toHaveBeenCalledOnce();
  expect(harness.translator.destroy).toHaveBeenCalledOnce();
});
```

- [ ] **Step 7: 运行翻译层验证**

Run:

```bash
npm test -- tests/translation/translation-engine.test.ts
npm run typecheck
```

Expected: PASS and exit 0.

- [ ] **Step 8: 提交翻译层**

```bash
git add src/translation tests/translation
git commit -m "feat: add built-in translation engine"
```

---

### Task 4: 实现选区与鼠标文本提取

**Files:**
- Create: `src/content/text-extractor.ts`
- Test: `tests/content/text-extractor.test.ts`

**Interfaces:**
- Consumes: DOM `Selection`、`Range`、`EventTarget`。
- Produces: `TextCandidate`、`normalizeAndLimitText(text, maxCodePoints)`、`extractSelectionCandidate(selection)`、`extractHoverCandidate(target)`。

- [ ] **Step 1: 写规范化与候选提取失败测试**

```ts
import { describe, expect, it } from 'vitest';
import {
  extractHoverCandidate, extractSelectionCandidate, normalizeAndLimitText,
} from '../../src/content/text-extractor';

it('collapses whitespace and cuts at a sentence boundary before 500 code points', () => {
  const input = `${'a'.repeat(480)}. ${'b'.repeat(40)}`;
  expect([...normalizeAndLimitText(input, 500)].length).toBe(481);
});

it('uses the nearest semantic text block', () => {
  document.body.innerHTML = '<article><p id="p">Hello <strong id="word">world</strong></p></article>';
  const candidate = extractHoverCandidate(document.querySelector('#word'));
  expect(candidate?.text).toBe('Hello world');
  expect(candidate?.element).toBe(document.querySelector('#p'));
});

it.each(['input', 'textarea', '[contenteditable="true"]'])('ignores %s', selector => {
  document.body.innerHTML = selector.startsWith('[')
    ? '<div contenteditable="true">secret</div>'
    : `<${selector}>secret</${selector}>`;
  expect(extractHoverCandidate(document.querySelector(selector))).toBeNull();
});
```

- [ ] **Step 2: 运行提取测试并确认模块缺失**

Run: `npm test -- tests/content/text-extractor.test.ts`

Expected: FAIL with `Cannot find module '../../src/content/text-extractor'`.

- [ ] **Step 3: 实现文本候选规则**

```ts
export interface TextCandidate {
  text: string;
  anchorRect: DOMRect;
  element: Element;
}

export const HOVER_TEXT_LIMIT = 500;
const SEMANTIC_BLOCKS = 'p,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,figcaption';
const EXCLUDED = 'input,textarea,select,option,[contenteditable]:not([contenteditable="false"]),script,style,[data-quick-translate-host]';

export function normalizeAndLimitText(text: string, maxCodePoints = HOVER_TEXT_LIMIT): string {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  const points = Array.from(normalized);
  if (points.length <= maxCodePoints) return normalized;
  const prefix = points.slice(0, maxCodePoints).join('');
  const boundary = Math.max(prefix.lastIndexOf('.'), prefix.lastIndexOf('!'), prefix.lastIndexOf('?'),
    prefix.lastIndexOf('。'), prefix.lastIndexOf('！'), prefix.lastIndexOf('？'), prefix.lastIndexOf(' '));
  return boundary >= Math.floor(maxCodePoints * 0.75) ? prefix.slice(0, boundary + 1).trim() : prefix;
}

function elementFromTarget(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  return target instanceof Node ? target.parentElement : null;
}

function isExcluded(element: Element): boolean {
  return Boolean(element.closest(EXCLUDED));
}

function isVisible(element: Element): boolean {
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

export function extractHoverCandidate(target: EventTarget | null): TextCandidate | null {
  const origin = elementFromTarget(target);
  if (!origin || isExcluded(origin)) return null;
  let element = origin.closest(SEMANTIC_BLOCKS);
  if (!element) {
    element = origin;
    while (element && /^(BODY|MAIN|ARTICLE)$/.test(element.tagName)) element = element.parentElement;
    while (element && ![...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) {
      element = element.parentElement;
      if (element && /^(BODY|MAIN|ARTICLE)$/.test(element.tagName)) return null;
    }
  }
  if (!element || !isVisible(element)) return null;
  const text = normalizeAndLimitText(element.textContent ?? '');
  return text ? { text, anchorRect: element.getBoundingClientRect(), element } : null;
}

export function extractSelectionCandidate(selection: Selection | null): TextCandidate | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const element = elementFromTarget(range.commonAncestorContainer);
  if (!element || isExcluded(element) || !isVisible(element)) return null;
  const text = selection.toString().replace(/\s+/gu, ' ').trim();
  return text ? { text, anchorRect: range.getBoundingClientRect(), element } : null;
}
```

- [ ] **Step 4: 增加 Selection 和可视性测试**

```ts
it('extracts a non-collapsed Selection and its range rectangle', () => {
  document.body.innerHTML = '<p id="p">Hello world</p>';
  const text = document.querySelector('#p')!.firstChild!;
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, 5);
  Object.assign(range, { getBoundingClientRect: () => new DOMRect(10, 20, 80, 20) });
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  expect(extractSelectionCandidate(selection)).toMatchObject({
    text: 'Hello', anchorRect: { x: 10, y: 20, width: 80, height: 20 },
  });
});

it('rejects collapsed, hidden, and extension-owned content', () => {
  document.body.innerHTML = [
    '<p id="hidden" style="display:none">hidden</p>',
    '<div data-quick-translate-host><p id="owned">owned</p></div>',
  ].join('');
  const collapsed = document.getSelection()!;
  collapsed.removeAllRanges();
  expect(extractSelectionCandidate(collapsed)).toBeNull();
  expect(extractHoverCandidate(document.querySelector('#hidden'))).toBeNull();
  expect(extractHoverCandidate(document.querySelector('#owned'))).toBeNull();
});
```

- [ ] **Step 5: 运行提取层验证**

Run:

```bash
npm test -- tests/content/text-extractor.test.ts
npm run typecheck
```

Expected: PASS and exit 0.

- [ ] **Step 6: 提交提取模块**

```bash
git add src/content/text-extractor.ts tests/content/text-extractor.test.ts
git commit -m "feat: extract selection and hover text"
```

---

### Task 5: 实现封闭 Shadow DOM 即时浮层

**Files:**
- Create: `src/content/overlay-styles.ts`
- Create: `src/content/overlay-renderer.ts`
- Test: `tests/content/overlay-renderer.test.ts`

**Interfaces:**
- Consumes: `TranslationState`、候选 `DOMRect`、本地化 `translateMessage(key, substitutions)`。
- Produces: `OverlayActions`、`OverlayRenderer.render(state, anchorRect)`、`close()`、`setPinned(pinned)`、`pinned`、`containsEvent(event)`、`destroy()`。

- [ ] **Step 1: 写 Shadow DOM 与安全渲染失败测试**

```ts
import { beforeEach, expect, it, vi } from 'vitest';
import { OverlayRenderer } from '../../src/content/overlay-renderer';

const rect = (x: number, y: number, width = 80, height = 20) => new DOMRect(x, y, width, height);
const createActions = () => ({
  onCopy: vi.fn(), onSpeak: vi.fn(), onPinChange: vi.fn(),
  onRetry: vi.fn(), onClose: vi.fn(),
});
const originalAttachShadow = HTMLElement.prototype.attachShadow;
let capturedRoot: ShadowRoot;

beforeEach(() => {
  document.body.replaceChildren();
  vi.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function (init) {
    expect(init.mode).toBe('closed');
    capturedRoot = originalAttachShadow.call(this, { mode: 'open' });
    return capturedRoot;
  });
});

it('attaches a closed shadow root and renders dynamic text as text', () => {
  const overlay = new OverlayRenderer(document, createActions(), key => key);
  overlay.render({ kind: 'success', sourceLanguage: 'en', targetLanguage: 'zh', translatedText: '<img src=x onerror=alert(1)>' }, rect(10, 10));
  expect(capturedRoot.querySelector('img')).toBeNull();
  expect(capturedRoot.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(document.querySelector('[data-quick-translate-host]')?.shadowRoot).toBeNull();
});
```

- [ ] **Step 2: 运行浮层测试并确认模块缺失**

Run: `npm test -- tests/content/overlay-renderer.test.ts`

Expected: FAIL with `Cannot find module '../../src/content/overlay-renderer'`.

- [ ] **Step 3: 定义浮层 API 与静态样式**

```ts
export interface OverlayActions {
  onCopy(text: string): void | Promise<void>;
  onSpeak(text: string, language: string): void;
  onPinChange(pinned: boolean): void;
  onRetry(): void;
  onClose(): void;
}

export class OverlayRenderer {
  constructor(doc: Document, actions: OverlayActions, message: (key: string) => string);
  get pinned(): boolean;
  render(state: TranslationState, anchorRect: DOMRect): void;
  setPinned(pinned: boolean): void;
  containsEvent(event: Event): boolean;
  close(): void;
  destroy(): void;
}
```

`overlay-styles.ts` exports one static CSS string for a 290px max-width card, loading progress, action row, error colors, visible focus states, and `prefers-reduced-motion`. The renderer creates elements with `createElement` and assigns dynamic values only through `textContent`.

- [ ] **Step 4: 实现状态渲染和视口定位**

Use one exhaustive switch so a new state cannot compile without a renderer branch:

```ts
private renderState(state: TranslationState): DocumentFragment {
  const fragment = this.doc.createDocumentFragment();
  switch (state.kind) {
    case 'preparing': return this.renderPreparing(fragment, state.progress);
    case 'translating': return this.renderTranslating(fragment, state.sourceLanguage);
    case 'success': return this.renderSuccess(fragment, state);
    case 'same-language': return this.renderNotice(fragment, this.message('sameLanguage'));
    case 'unsupported': return this.renderError(fragment, this.message('unsupportedPair'), false);
    case 'error': return this.renderError(fragment, this.message('translationFailed'), state.retryable);
  }
}

private position(anchor: DOMRect, overlay: DOMRect): { left: number; top: number } {
  const margin = 8;
  const below = anchor.bottom + margin;
  const top = below + overlay.height <= innerHeight
    ? below
    : Math.max(margin, anchor.top - overlay.height - margin);
  const left = Math.min(
    Math.max(margin, anchor.left),
    Math.max(margin, innerWidth - overlay.width - margin),
  );
  return { left, top };
}
```

`renderPreparing`, `renderTranslating`, `renderSuccess`, `renderNotice`, and `renderError` each create DOM nodes with `createElement` and `textContent`. Register scroll/resize listeners only while visible；remove them in `close()` and `destroy()`.

- [ ] **Step 5: 增加操作、固定与关闭测试**

```ts
it('wires success actions and pin state', () => {
  const actions = createActions();
  const overlay = new OverlayRenderer(document, actions, key => key);
  overlay.render({ kind: 'success', sourceLanguage: 'en', targetLanguage: 'zh', translatedText: '你好' }, rect(10, 10));
  capturedRoot!.querySelector<HTMLButtonElement>('[data-action="copy"]')!.click();
  capturedRoot!.querySelector<HTMLButtonElement>('[data-action="speak"]')!.click();
  capturedRoot!.querySelector<HTMLButtonElement>('[data-action="pin"]')!.click();
  expect(actions.onCopy).toHaveBeenCalledWith('你好');
  expect(actions.onSpeak).toHaveBeenCalledWith('你好', 'zh');
  expect(actions.onPinChange).toHaveBeenCalledWith(true);
  expect(overlay.pinned).toBe(true);
});

it('only renders retry for retryable errors and removes the host on close', () => {
  const overlay = new OverlayRenderer(document, createActions(), key => key);
  overlay.render({ kind: 'error', retryable: false }, rect(10, 10));
  expect(capturedRoot!.querySelector('[data-action="retry"]')).toBeNull();
  overlay.render({ kind: 'error', retryable: true }, rect(10, 10));
  expect(capturedRoot!.querySelector('[data-action="retry"]')).not.toBeNull();
  overlay.close();
  expect(document.querySelector('[data-quick-translate-host]')).toBeNull();
});
```

```ts
it('removes viewport listeners when closed', () => {
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  const overlay = new OverlayRenderer(document, createActions(), key => key);
  overlay.render({ kind: 'translating', sourceLanguage: 'en' }, rect(10, 10));
  overlay.close();
  const scrollListener = add.mock.calls.find(([type]) => type === 'scroll')?.[1];
  const resizeListener = add.mock.calls.find(([type]) => type === 'resize')?.[1];
  expect(remove).toHaveBeenCalledWith('scroll', scrollListener);
  expect(remove).toHaveBeenCalledWith('resize', resizeListener);
});
```

Esc behavior remains controller-owned.

- [ ] **Step 6: 运行浮层验证**

Run:

```bash
npm test -- tests/content/overlay-renderer.test.ts
npm run typecheck
```

Expected: PASS and exit 0.

- [ ] **Step 7: 提交浮层模块**

```bash
git add src/content/overlay-styles.ts src/content/overlay-renderer.ts tests/content/overlay-renderer.test.ts
git commit -m "feat: render secure translation overlay"
```

---

### Task 6: 实现双模式 Interaction Controller

**Files:**
- Create: `src/content/interaction-controller.ts`
- Test: `tests/content/interaction-controller.test.ts`

**Interfaces:**
- Consumes: `ExtensionSettings`、`extractSelectionCandidate`、`extractHoverCandidate`、`TranslationEngine.translate`、`OverlayRenderer`。
- Produces: `InteractionController.start(settings)`、`applySettings(settings)`、`retry()`、`stop()`；负责 selection/hover 监听器、500ms/250ms 计时器、请求 ID 和固定暂停。

- [ ] **Step 1: 写模式互斥与悬停计时失败测试**

```ts
import { beforeEach, expect, it, vi } from 'vitest';
import { InteractionController } from '../../src/content/interaction-controller';
import type { ExtensionSettings } from '../../src/shared/settings';
import type { SupportedLanguage } from '../../src/shared/languages';
import type { TranslationState } from '../../src/translation/types';

beforeEach(() => vi.useFakeTimers());

function createControllerHarness(overrides: Partial<ExtensionSettings> = {}) {
  document.body.innerHTML = '<p id="target">Hello world</p>';
  const target = document.querySelector('#target')!;
  const candidate = { text: 'Hello world', anchorRect: new DOMRect(10, 10, 80, 20), element: target };
  const selectionExtractor = vi.fn(() => candidate);
  const hoverExtractor = vi.fn(() => candidate);
  const engine = {
    translate: vi.fn(async (
      _text: string,
      _target: SupportedLanguage,
      onState: (state: TranslationState) => void,
    ) => {
      const result = { kind: 'success', sourceLanguage: 'en', targetLanguage: 'zh', translatedText: '你好' } as const;
      onState(result);
      return result;
    }),
    destroy: vi.fn(),
  };
  const overlay = {
    pinned: false,
    render: vi.fn(), containsEvent: vi.fn(() => false),
    close: vi.fn(), destroy: vi.fn(),
  };
  const settings = { enabled: true, mode: 'selection', targetLanguage: 'zh', ...overrides } as ExtensionSettings;
  const controller = new InteractionController({
    document, engine, overlay, selectionExtractor, hoverExtractor,
  });
  return { controller, target, engine, overlay, settings, selectionExtractor, hoverExtractor };
}

it('activates hover only after 500ms and closes 250ms after leaving', async () => {
  const harness = createControllerHarness({ mode: 'hover' });
  harness.controller.start(harness.settings);
  harness.target.dispatchEvent(new Event('pointerover', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(499);
  expect(harness.engine.translate).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(harness.engine.translate).toHaveBeenCalledTimes(1);

  harness.target.dispatchEvent(new Event('pointerout', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(249);
  expect(harness.overlay.close).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(harness.overlay.close).toHaveBeenCalledTimes(1);
});

it('switches modes without retaining old listeners', () => {
  const harness = createControllerHarness({ mode: 'selection' });
  harness.controller.start(harness.settings);
  harness.controller.applySettings({ ...harness.settings, mode: 'hover' });
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  expect(harness.selectionExtractor).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行控制器测试并确认模块缺失**

Run: `npm test -- tests/content/interaction-controller.test.ts`

Expected: FAIL with `Cannot find module '../../src/content/interaction-controller'`.

- [ ] **Step 3: 定义依赖端口并实现监听器生命周期**

```ts
export interface TranslationPort {
  translate(text: string, target: SupportedLanguage, onState: (state: TranslationState) => void): Promise<TerminalTranslationState>;
  destroy(): void;
}
export interface OverlayPort {
  readonly pinned: boolean;
  render(state: TranslationState, rect: DOMRect): void;
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
  constructor(dependencies: InteractionControllerDependencies);
  start(settings: ExtensionSettings): void;
  applySettings(settings: ExtensionSettings): void;
  retry(): void;
  close(): void;
  stop(): void;
}
```

Selection mode listens to `mouseup` and keyboard `keyup` for Shift+Arrow selection changes. Hover mode listens to delegated `pointerover`/`pointerout`. Every mode change removes prior listeners and timers before adding the new set. `enabled:false` registers no interaction listeners and closes the overlay.

- [ ] **Step 4: 实现请求 ID、固定和关闭规则**

```ts
private runCandidate(candidate: TextCandidate): void {
  if (!this.settings.enabled || this.overlay.pinned) return;
  this.lastCandidate = candidate;
  const requestId = ++this.requestId;
  void this.engine.translate(candidate.text, this.settings.targetLanguage, state => {
    if (requestId !== this.requestId) return;
    this.overlay.render(state, candidate.anchorRect);
    if (state.kind === 'same-language') {
      this.clearSameLanguageTimer();
      this.sameLanguageTimer = window.setTimeout(() => this.overlay.close(), 1200);
    }
  });
}

retry(): void {
  if (!this.lastCandidate) return;
  const candidate = this.lastCandidate;
  this.lastCandidate = null;
  this.runCandidate(candidate);
}

close(): void {
  ++this.requestId;
  this.clearHoverTimers();
  this.clearSameLanguageTimer();
  this.overlay.close();
}
```

Outside `pointerdown` calls `close()` only when `overlay.containsEvent(event) === false && overlay.pinned === false`. `keydown` with `event.key === 'Escape'` always calls `close()`. The 250ms hover-leave timer also calls `close()`, so a late translation cannot reopen the overlay. A pinned overlay prevents selection/hover translation until unpinned or closed. Entering the overlay cancels the hover-close timer. `stop()` increments `requestId`, removes every registered listener, clears hover/same-language timers, closes and destroys the overlay once.

- [ ] **Step 5: 增加竞态、固定、Esc、同语言自动关闭测试**

```ts
it('drops an older translation that resolves after the newest request', async () => {
  const harness = createControllerHarness();
  const callbacks: Array<(state: TranslationState) => void> = [];
  harness.engine.translate.mockImplementation(async (_text, _target, onState) => {
    callbacks.push(onState);
    return { kind: 'success', sourceLanguage: 'en', targetLanguage: 'zh', translatedText: 'done' };
  });
  harness.controller.start(harness.settings);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  callbacks[1]!({ kind: 'success', sourceLanguage: 'en', targetLanguage: 'zh', translatedText: 'new' });
  callbacks[0]!({ kind: 'success', sourceLanguage: 'en', targetLanguage: 'zh', translatedText: 'old' });
  expect(harness.overlay.render).toHaveBeenCalledTimes(1);
  expect(harness.overlay.render).toHaveBeenCalledWith(
    { kind: 'success', sourceLanguage: 'en', targetLanguage: 'zh', translatedText: 'new' },
    expect.any(DOMRect),
  );
});

it('pauses while pinned, closes pinned overlay on Escape, and not on outside click', () => {
  const harness = createControllerHarness();
  harness.overlay.pinned = true;
  harness.controller.start(harness.settings);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  expect(harness.engine.translate).not.toHaveBeenCalled();
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(harness.overlay.close).not.toHaveBeenCalled();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(harness.overlay.close).toHaveBeenCalledOnce();
});

it('manual close invalidates an in-flight translation', () => {
  const harness = createControllerHarness();
  let callback!: (state: TranslationState) => void;
  harness.engine.translate.mockImplementation(async (_text, _target, onState) => {
    callback = onState;
    return { kind: 'success', sourceLanguage: 'en', targetLanguage: 'zh', translatedText: 'late' };
  });
  harness.controller.start(harness.settings);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  harness.controller.close();
  callback({ kind: 'success', sourceLanguage: 'en', targetLanguage: 'zh', translatedText: 'late' });
  expect(harness.overlay.render).not.toHaveBeenCalled();
});

it('closes same-language notice at exactly 1200ms and fully stops', async () => {
  const harness = createControllerHarness();
  harness.engine.translate.mockImplementation(async (_text, _target, onState) => {
    const state = { kind: 'same-language', language: 'zh' } as const;
    onState(state);
    return state;
  });
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
```

- [ ] **Step 6: 运行交互层验证**

Run:

```bash
npm test -- tests/content/interaction-controller.test.ts tests/content/text-extractor.test.ts tests/content/overlay-renderer.test.ts
npm run typecheck
```

Expected: PASS and exit 0.

- [ ] **Step 7: 提交交互控制器**

```bash
git add src/content/interaction-controller.ts tests/content/interaction-controller.test.ts
git commit -m "feat: control selection and hover modes"
```

---

### Task 7: 实现本地化 Popup 设置界面

**Files:**
- Create: `src/shared/i18n.ts`
- Modify: `src/_locales/en/messages.json`
- Modify: `src/_locales/zh_CN/messages.json`
- Modify: `src/popup/index.html`
- Modify: `src/popup/popup.css`
- Modify: `src/popup/popup.ts`
- Test: `tests/shared/i18n.test.ts`
- Test: `tests/popup/popup.test.ts`

**Interfaces:**
- Consumes: `SUPPORTED_LANGUAGES`、`loadSettings()`、`updateSettings()`、`watchSettings()`。
- Produces: `message(key, substitutions?)`、`displayLanguageName(code)`、Popup 的总开关、互斥模式控件、目标语言选择器和能力状态。

- [ ] **Step 1: 安装 DOM 测试工具并写 i18n 与 Popup 初始化失败测试**

Run:

```bash
npm install --save-dev @testing-library/dom @testing-library/user-event
```

```ts
import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { message, displayLanguageName } from '../../src/shared/i18n';
import { initializePopup } from '../../src/popup/popup';
import { resetChromeStorageFake } from '../setup';
import type { ExtensionSettings } from '../../src/shared/settings';

const settingsMocks = vi.hoisted(() => ({
  loadSettings: vi.fn(async () => ({ enabled: true, mode: 'selection', targetLanguage: 'zh' })),
  updateSettings: vi.fn(async (patch: Partial<ExtensionSettings>) => ({ enabled: true, mode: 'selection', targetLanguage: 'zh', ...patch })),
  watchSettings: vi.fn(() => vi.fn()),
}));
vi.mock('../../src/shared/settings', () => settingsMocks);

beforeEach(() => {
  vi.unstubAllGlobals();
  resetChromeStorageFake();
  settingsMocks.loadSettings.mockClear();
  settingsMocks.updateSettings.mockClear();
  settingsMocks.watchSettings.mockClear();
  const messages: Record<string, string> = {
    enabled: 'Enabled', modeLabel: 'Mode', modeSelection: 'Select text',
    modeHover: 'Mouse capture', targetLanguage: 'Target language', statusReady: 'Ready',
    statusUnsupported: 'Chrome 138 or later is required',
  };
  chrome.i18n.getMessage = vi.fn((key: string) => messages[key] ?? key);
  vi.stubGlobal('LanguageDetector', { availability: vi.fn() });
  vi.stubGlobal('Translator', { availability: vi.fn() });
  document.body.innerHTML = `
    <main id="app">
      <label><input id="enabled" type="checkbox"><span data-i18n="enabled"></span></label>
      <fieldset><legend data-i18n="modeLabel"></legend>
        <label><input type="radio" name="mode" value="selection"><span data-i18n="modeSelection"></span></label>
        <label><input type="radio" name="mode" value="hover"><span data-i18n="modeHover"></span></label>
      </fieldset>
      <label for="target-language" data-i18n="targetLanguage"></label>
      <select id="target-language"></select><p id="status" role="status"></p>
    </main>`;
});

it('uses chrome.i18n for messages and Intl.DisplayNames for language names', () => {
  chrome.i18n.getMessage = vi.fn((key: string) => key === 'modeSelection' ? 'Select text' : key);
  expect(message('modeSelection')).toBe('Select text');
  expect(displayLanguageName('ja', 'en')).toMatch(/Japanese/i);
});

it('loads settings and keeps the two modes mutually exclusive', async () => {
  await initializePopup();
  expect((screen.getByRole('radio', { name: 'Select text' }) as HTMLInputElement).checked).toBe(true);
  await userEvent.click(screen.getByRole('radio', { name: 'Mouse capture' }));
  expect(settingsMocks.updateSettings).toHaveBeenCalledWith({ mode: 'hover' });
});
```

Use `@testing-library/dom` and `@testing-library/user-event`; install both as dev dependencies and commit the lockfile change in this task.

- [ ] **Step 2: 运行 Popup 测试并确认导出缺失**

Run: `npm test -- tests/shared/i18n.test.ts tests/popup/popup.test.ts`

Expected: FAIL because `message`, `displayLanguageName`, or `initializePopup` is missing.

- [ ] **Step 3: 实现 i18n helper 和完整消息目录**

Message keys must include: `extensionName`, `extensionDescription`, `enabled`, `modeLabel`, `modeSelection`, `modeHover`, `targetLanguage`, `statusReady`, `statusPreparing`, `statusUnsupported`, `detecting`, `translating`, `sameLanguage`, `unsupportedPair`, `translationFailed`, `retry`, `copy`, `copied`, `speak`, `pin`, `unpin`, `close`.

Use these exact message values:

| Key | English | 简体中文 |
| --- | --- | --- |
| enabled | Enabled | 已启用 |
| modeLabel | Translation mode | 翻译模式 |
| modeSelection | Select text | 选中文字 |
| modeHover | Mouse capture | 鼠标捕捉 |
| targetLanguage | Target language | 目标语言 |
| statusReady | Ready | 已就绪 |
| statusPreparing | Preparing translation… | 正在准备翻译能力… |
| statusUnsupported | Chrome 138 or later is required | 需要 Chrome 138 或更高版本 |
| detecting | Detecting language… | 正在检测语言… |
| translating | Translating… | 正在翻译… |
| sameLanguage | Content is already in the target language | 内容已经是目标语言 |
| unsupportedPair | This language pair is not supported | 当前语言组合暂不受支持 |
| translationFailed | Translation could not be completed | 翻译未完成 |
| retry | Retry | 重试 |
| copy | Copy | 复制 |
| copied | Copied | 已复制 |
| speak | Listen | 朗读 |
| pin | Pin | 固定 |
| unpin | Unpin | 取消固定 |
| close | Close | 关闭 |

```ts
export const MESSAGE_KEYS = [
  'extensionName', 'extensionDescription', 'enabled', 'modeLabel', 'modeSelection',
  'modeHover', 'targetLanguage', 'statusReady', 'statusPreparing', 'statusUnsupported',
  'detecting', 'translating', 'sameLanguage', 'unsupportedPair', 'translationFailed',
  'retry', 'copy', 'copied', 'speak', 'pin', 'unpin', 'close',
] as const;
export type MessageKey = (typeof MESSAGE_KEYS)[number];

export function message(key: MessageKey, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

export function displayLanguageName(
  code: SupportedLanguage,
  locale = chrome.i18n.getUILanguage(),
): string {
  return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code;
}

export function localizeDocument(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n as MessageKey;
    element.textContent = message(key);
  }
}
```

Add this catalog parity test to `tests/shared/i18n.test.ts`:

```ts
it('keeps English and Chinese catalogs in exact key parity', () => {
  const en = JSON.parse(readFileSync('src/_locales/en/messages.json', 'utf8'));
  const zh = JSON.parse(readFileSync('src/_locales/zh_CN/messages.json', 'utf8'));
  const expected = [...MESSAGE_KEYS].sort();
  expect(Object.keys(en).sort()).toEqual(expected);
  expect(Object.keys(zh).sort()).toEqual(expected);
});
```

Import `readFileSync` from `node:fs` and `MESSAGE_KEYS` from `src/shared/i18n.ts` in the test file.

- [ ] **Step 4: 实现 Popup DOM 与样式**

Replace `src/popup/index.html` body with the semantic fixture from Step 1 and retain external `popup.css`/`popup.js` references. Implement initialization around these exact IDs:

```ts
export async function initializePopup(): Promise<() => void> {
  localizeDocument(document);
  const enabled = document.querySelector<HTMLInputElement>('#enabled')!;
  const modes = [...document.querySelectorAll<HTMLInputElement>('input[name="mode"]')];
  const target = document.querySelector<HTMLSelectElement>('#target-language')!;
  const status = document.querySelector<HTMLElement>('#status')!;
  for (const code of SUPPORTED_LANGUAGES) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = displayLanguageName(code);
    target.append(option);
  }
  const render = (settings: ExtensionSettings) => {
    enabled.checked = settings.enabled;
    for (const radio of modes) radio.checked = radio.value === settings.mode;
    target.value = settings.targetLanguage;
  };
  render(await loadSettings());
  const supported = typeof LanguageDetector !== 'undefined' && typeof Translator !== 'undefined';
  status.textContent = message(supported ? 'statusReady' : 'statusUnsupported');
  for (const radio of modes) radio.disabled = !supported;
  enabled.addEventListener('change', () => void updateSettings({ enabled: enabled.checked }));
  for (const radio of modes) radio.addEventListener('change', () => {
    if (radio.checked) void updateSettings({ mode: radio.value as TranslationMode });
  });
  target.addEventListener('change', () => void updateSettings({ targetLanguage: target.value as SupportedLanguage }));
  return watchSettings(render);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void initializePopup(), { once: true });
} else {
  void initializePopup();
}
```

`popup.css` uses a 320px width, system font, visible focus rings, a two-column segmented radio group, and light/dark colors through `prefers-color-scheme`. Do not hide native focus or use inline style attributes.

- [ ] **Step 5: 增加设置持久化、订阅和 unsupported 测试**

```ts
it('writes only changed fields and renders external settings updates', async () => {
  await initializePopup();
  const enabled = screen.getByRole('checkbox', { name: 'Enabled' });
  await userEvent.click(enabled);
  expect(settingsMocks.updateSettings).toHaveBeenCalledWith({ enabled: false });
  const subscriber = settingsMocks.watchSettings.mock.calls[0]![0];
  subscriber({ enabled: true, mode: 'hover', targetLanguage: 'ja' });
  expect((screen.getByRole('radio', { name: 'Mouse capture' }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('combobox', { name: 'Target language' }) as HTMLSelectElement).value).toBe('ja');
});

it('shows unsupported status and disables mode radios without hiding target language', async () => {
  vi.stubGlobal('LanguageDetector', undefined);
  vi.stubGlobal('Translator', undefined);
  await initializePopup();
  expect(screen.getByRole('status').textContent).toBe('Chrome 138 or later is required');
  for (const radio of screen.getAllByRole('radio')) expect((radio as HTMLInputElement).disabled).toBe(true);
  expect(screen.getByRole('combobox', { name: 'Target language' })).not.toBeNull();
});
```

```ts
it('keeps scripts external and labels every form control in popup source', () => {
  const html = readFileSync('src/popup/index.html', 'utf8');
  expect(html).not.toMatch(/<script[^>]*>\s*[^<]/i);
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  for (const control of parsed.querySelectorAll('input,select')) {
    const id = control.getAttribute('id');
    const wrapped = control.closest('label');
    const explicit = id ? parsed.querySelector(`label[for="${id}"]`) : null;
    expect(wrapped ?? explicit).not.toBeNull();
  }
});
```

Import `readFileSync` from `node:fs` in this test file.

- [ ] **Step 6: 运行 Popup 验证**

Run:

```bash
npm test -- tests/shared/i18n.test.ts tests/popup/popup.test.ts
npm run typecheck
npm run build
```

Expected: PASS and exit 0.

- [ ] **Step 7: 提交 Popup**

```bash
git add package.json package-lock.json src/shared/i18n.ts src/_locales src/popup tests/shared/i18n.test.ts tests/popup/popup.test.ts
git commit -m "feat: add localized popup settings"
```

---

### Task 8: 接线 Content Script 并验证完整内存数据流

**Files:**
- Modify: `src/content/index.ts`
- Modify: `src/content/interaction-controller.ts`
- Test: `tests/content/content-app.test.ts`

**Interfaces:**
- Consumes: `loadSettings()`、`watchSettings()`、`chromeAiAdapter`、`TranslationEngine`、`OverlayRenderer`、`InteractionController`、`message()`。
- Produces: `startContentApp()` 返回清理函数；真实页面上的设置 → 提取 → 本机翻译 → 浮层链路。

- [ ] **Step 1: 写 Content App 接线失败测试**

```ts
import { beforeEach, expect, it, vi } from 'vitest';
import { copyText, speakText, startContentApp } from '../../src/content/index';
import type { ContentAppDependencies } from '../../src/content/index';
import type { InteractionController } from '../../src/content/interaction-controller';
import type { ExtensionSettings } from '../../src/shared/settings';
import { resetChromeStorageFake } from '../setup';

class FakeUtterance {
  lang = '';
  constructor(public readonly text: string) {}
}

beforeEach(() => {
  resetChromeStorageFake();
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
});

function createContentAppHarness() {
  const initial = { enabled: true, mode: 'selection', targetLanguage: 'en' } as const;
  const controller = { start: vi.fn(), applySettings: vi.fn(), stop: vi.fn() };
  const unsubscribe = vi.fn();
  let subscriber: ((settings: ExtensionSettings) => void) | undefined;
  const dependencies: ContentAppDependencies = {
    loadSettings: vi.fn(async () => initial),
    watchSettings: vi.fn(listener => { subscriber = listener; return unsubscribe; }),
    createController: vi.fn(() => controller as unknown as InteractionController),
  };
  return {
    dependencies, controller, unsubscribe,
    emitSettings(settings: ExtensionSettings) { subscriber!(settings); },
  };
}

it('loads settings, starts once, applies storage changes, and cleans up', async () => {
  const harness = createContentAppHarness();
  const stop = await startContentApp(harness.dependencies);
  expect(harness.controller.start).toHaveBeenCalledWith({
    enabled: true, mode: 'selection', targetLanguage: 'en',
  });
  harness.emitSettings({ enabled: true, mode: 'hover', targetLanguage: 'ja' });
  expect(harness.controller.applySettings).toHaveBeenCalledWith({
    enabled: true, mode: 'hover', targetLanguage: 'ja',
  });
  stop();
  expect(harness.unsubscribe).toHaveBeenCalledOnce();
  expect(harness.controller.stop).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: 运行接线测试并确认导出缺失**

Run: `npm test -- tests/content/content-app.test.ts`

Expected: FAIL because `startContentApp` is not exported.

- [ ] **Step 3: 实现可注入的 Content App 组合根**

```ts
export interface ContentAppDependencies {
  loadSettings: typeof loadSettings;
  watchSettings: typeof watchSettings;
  createController(): InteractionController;
}

export async function startContentApp(dependencies: ContentAppDependencies): Promise<() => void>;
export async function copyText(text: string, doc?: Document): Promise<void>;
export function speakText(text: string, language: string, synth?: SpeechSynthesis): void;
```

Production composition uses this exact dependency order:

```ts
function createProductionController(): InteractionController {
  const engine = new TranslationEngine(chromeAiAdapter);
  let controller!: InteractionController;
  const overlay = new OverlayRenderer(document, {
    onCopy: text => copyText(text),
    onSpeak: (text, language) => speakText(text, language),
    onPinChange: () => undefined,
    onRetry: () => controller.retry(),
    onClose: () => controller.close(),
  }, message);
  controller = new InteractionController({
    document,
    engine,
    overlay,
    selectionExtractor: extractSelectionCandidate,
    hoverExtractor: extractHoverCandidate,
  });
  return controller;
}

if (typeof LanguageDetector !== 'undefined' && typeof Translator !== 'undefined') {
  void startContentApp({ loadSettings, watchSettings, createController: createProductionController });
}
```

`InteractionController.stop()` calls `engine.destroy()` through the `TranslationPort.destroy()` method defined in Task 6. If either built-in API global is absent, Content Script stays inert while Popup reports unsupported.

- [ ] **Step 4: 实现安全复制与朗读 helper 测试**

```ts
it('copies translated text and falls back to a temporary readonly textarea', async () => {
  const writeText = vi.fn().mockRejectedValue(new Error('denied'));
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  const exec = vi.fn(() => true);
  Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
  await copyText('你好', document);
  expect(writeText).toHaveBeenCalledWith('你好');
  expect(exec).toHaveBeenCalledWith('copy');
  expect(document.querySelector('textarea[data-quick-translate-copy]')).toBeNull();
});

it('speaks translated text with its language and performs no storage/runtime calls', () => {
  const speak = vi.fn();
  const synth = { speak } as unknown as SpeechSynthesis;
  speakText('你好', 'zh', synth);
  const utterance = speak.mock.calls[0]![0] as SpeechSynthesisUtterance;
  expect(utterance.text).toBe('你好');
  expect(utterance.lang).toBe('zh');
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
  expect((chrome as { runtime?: unknown }).runtime).toBeUndefined();
});
```

`copyText` first attempts `navigator.clipboard.writeText(text)`. On rejection, it appends one offscreen readonly textarea marked `data-quick-translate-copy`, selects it, calls `document.execCommand('copy')`, and removes it in `finally`. `speakText` creates one `SpeechSynthesisUtterance(text)`, sets `lang`, and passes it to the injected/default synthesizer.

- [ ] **Step 5: 运行完整自动化验证**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all suites PASS；build exits 0；`dist/manifest.json` has no `background` and no remote host permissions.

- [ ] **Step 6: 提交 Content App 接线**

```bash
git add src/content tests/content/content-app.test.ts
git commit -m "feat: connect page translation workflow"
```

---

### Task 9: 构建产物校验、使用说明与 Chrome 手工验收

**Files:**
- Create: `scripts/validate-dist.mjs`
- Create: `tests/build/dist.test.ts`
- Create: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1–8 的完整 `dist/`。
- Produces: `npm run validate`、可加载的 `dist/`、安装/权限/支持范围/手工验收说明。

- [ ] **Step 1: 写构建产物失败测试**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

beforeAll(() => execFileSync('npm', ['run', 'build'], { stdio: 'inherit' }));

it('builds an installable extension without remote code or a worker', () => {
  for (const file of ['manifest.json', 'content.js', 'popup.html', 'popup.js', 'popup.css']) {
    expect(existsSync(`dist/${file}`)).toBe(true);
  }
  const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
  expect(manifest.background).toBeUndefined();
  expect(manifest.host_permissions).toBeUndefined();
  const scripts = readFileSync('dist/content.js', 'utf8') + readFileSync('dist/popup.js', 'utf8');
  expect(scripts).not.toMatch(/https?:\/\//);
});
```

- [ ] **Step 2: 运行产物测试并确认 validate 脚本缺失**

Run: `npm run validate`

Expected: FAIL with `Missing script: "validate"`.

- [ ] **Step 3: 实现 validate 脚本**

```json
{
  "scripts": {
    "validate": "npm run typecheck && npm test && npm run build && node scripts/validate-dist.mjs"
  }
}
```

`validate-dist.mjs` parses `dist/manifest.json`, checks MV3/Chrome 138/storage-only/no background/no host permissions, verifies all referenced files and both locale catalogs exist, scans built JS for `http://`, `https://`, `eval(`, and `new Function`, and exits nonzero with the exact offending file and rule.

```js
// scripts/validate-dist.mjs
import { existsSync, readFileSync } from 'node:fs';

const fail = message => { throw new Error(message); };
const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if (manifest.minimum_chrome_version !== '138') fail('minimum_chrome_version must be 138');
if (JSON.stringify(manifest.permissions) !== JSON.stringify(['storage'])) fail('permissions must equal ["storage"]');
if ('background' in manifest) fail('background worker is forbidden');
if ('host_permissions' in manifest) fail('remote host_permissions are forbidden');

const required = [
  'dist/content.js', 'dist/popup.html', 'dist/popup.js', 'dist/popup.css',
  'dist/_locales/en/messages.json', 'dist/_locales/zh_CN/messages.json',
];
for (const file of required) if (!existsSync(file)) fail(`missing required file: ${file}`);

const forbidden = [
  { label: 'remote URL', pattern: /https?:\/\// },
  { label: 'eval', pattern: /\beval\s*\(/ },
  { label: 'Function constructor', pattern: /\bnew\s+Function\b/ },
];
for (const file of ['dist/content.js', 'dist/popup.js']) {
  const source = readFileSync(file, 'utf8');
  for (const rule of forbidden) if (rule.pattern.test(source)) fail(`${file}: forbidden ${rule.label}`);
}

console.log('dist validation passed');
```

- [ ] **Step 4: 编写 README**

Use this exact README structure and content:

````markdown
# 轻译 / Quick Translate

轻译是一个桌面版 Chrome 138+ 扩展，使用 Chrome 内置 Language Detector 和 Translator API 在本机翻译网页文字。扩展不需要账号或 API Key，不调用远程翻译接口，也不保存翻译历史。

## Build

```bash
npm install
npm run validate
npm run build
```

## Install locally

1. Open \`chrome://extensions\` in Chrome 138 or later.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository's generated \`dist\` directory.

## Use

- **Select text:** select visible webpage text to show the translation nearby.
- **Mouse capture:** leave the pointer over a text block for 500ms. Moving away closes an unpinned result after 250ms.
- Use the Popup to enable/disable the extension, switch the mutually exclusive mode, and choose a persistent target language.
- The first use of a language may download a Chrome-managed language pack and display preparation progress.

## Permissions and privacy

The extension requests only \`storage\` to remember settings. Its declared HTTP/HTTPS Content Script access reads only the visible text that the user selects or captures. Page text and translations stay in the current tab's memory and are not written to storage or sent to a remote translation API.

## Supported surfaces

The first release supports top-level documents on ordinary HTTP/HTTPS webpages. Chrome internal pages, Chrome Web Store pages, the built-in PDF viewer, and cross-origin iframes are not supported.
````

- [ ] **Step 5: 运行最终自动化验收**

Run:

```bash
npm run validate
git diff --check
git status --short
```

Expected: validate exits 0；`git diff --check` produces no output；status lists only Task 9 intended files before commit.

- [ ] **Step 6: 在 Chrome 138+ 执行手工验收**

Load `dist/` unpacked and record PASS for each item:

- English and Simplified Chinese browser UI locales render matching Popup/Overlay copy.
- Default target language follows UI locale；changing it persists across tabs and browser restart.
- Selection/hover controls are mutually exclusive and change active listeners immediately.
- Selection mode translates a normal paragraph and excludes input/textarea/contenteditable.
- Hover mode triggers at 500ms, limits text to 500 code points, and closes 250ms after leaving.
- First model use shows preparation progress；later use reuses the model.
- Same-language message closes at 1200ms.
- Unsupported pair and failed download show localized retryable/non-retryable states.
- Copy, speak, pin/unpin, outside click, and Esc match the spec.
- Pinned overlay pauses new triggers；scroll/resize keeps it in the viewport.
- DevTools Network shows no request carrying selected/captured page text to a third-party service.
- Chrome internal pages, Web Store, PDF viewer, and cross-origin iframe are documented as unsupported and fail inertly.

- [ ] **Step 7: 提交最终验收与文档**

```bash
git add package.json scripts/validate-dist.mjs tests/build/dist.test.ts README.md
git commit -m "test: validate installable translation extension"
```

- [ ] **Step 8: 提交后重新验证干净状态**

Run:

```bash
npm run validate
git status --short
git log --oneline -10
```

Expected: validate exits 0；status is empty；log contains the nine task commits plus the design and plan commits.
