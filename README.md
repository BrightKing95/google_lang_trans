# 轻译 / Quick Translate

轻译是一个桌面版 Chrome 138+ 扩展，使用 Chrome 内置 Language Detector 和 Translator API 在本机翻译网页文字。扩展不需要账号或 API Key，不调用远程翻译接口，也不保存翻译历史。

## Build

```bash
npm install
npm run validate
npm run build
```

## Prepare a Chrome Web Store release

```bash
npm ci
npm run release:prepare
```

This validates the extension, regenerates all committed icon and store artwork from local SVG sources, and creates `release/quick-translate-0.1.0.zip`. The archive contains `manifest.json` at its root and excludes development source maps. The generator uses macOS `sips` with a local Chrome/Chromium fallback; the committed PNG files are the canonical upload assets because system-font rendering can differ slightly across operating systems.

Submission-ready copy, privacy declarations, reviewer instructions, and the final manual checklist are in [`store-listing`](store-listing). Upload-ready PNG artwork is in [`store-assets/output`](store-assets/output); editable vector sources are in [`store-assets/source`](store-assets/source).

The privacy-policy link in the listing documents points to the `main` branch on GitHub. Merge and push the release changes, then confirm that link opens without authentication before submitting the extension.

## Install locally

1. Open `chrome://extensions` in Chrome 138 or later.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository's generated `dist` directory.

## Use

- **Select text:** select visible webpage text to show the translation nearby.
- **Mouse capture:** leave the pointer over a text block for 500ms. Moving away closes an unpinned result after 250ms.
- Use the Popup to enable/disable the extension, switch the mutually exclusive mode, and choose a persistent target language.
- The first use of a language may download a Chrome-managed language pack and display preparation progress.
- If Chrome requires a user action before a language pack download, choose **Prepare and translate** in the nearby result. Detector and translator packs can require separate confirmations on first use.

## Permissions and privacy

The extension requests only `storage` to remember settings. Its declared HTTP/HTTPS Content Script access reads only the visible text that the user selects or captures. Page text and translations stay in the current tab's memory and are not written to storage or sent to a remote translation API.

## Supported surfaces

The first release supports top-level documents on ordinary HTTP/HTTPS webpages. Chrome internal pages, Chrome Web Store pages, the built-in PDF viewer, and cross-origin iframes are not supported.
