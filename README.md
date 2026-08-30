# 轻译 / Quick Translate

轻译是一个桌面版 Chrome 138+ 扩展，使用 Chrome 内置 Language Detector 和 Translator API 在本机翻译网页文字。扩展不需要账号或 API Key，不调用远程翻译接口，也不保存翻译历史。

## Build

```bash
npm install
npm run validate
npm run build
```

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
