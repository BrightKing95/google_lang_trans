# Chrome Web Store Reviewer Notes

## Requirements

- Chrome 138 or later.
- No account, API key, test credential, or external service is required.
- Chrome's built-in Language Detector and Translator APIs must be available.
- A language model may need to be downloaded and prepared by Chrome during first use.

## Core test — Select text

1. Install the extension and open an ordinary HTTPS webpage containing selectable English text, such as `https://example.com/`.
2. Open the extension popup and confirm the extension is enabled.
3. Choose **Select text** and choose a target language other than English.
4. Select a sentence on the webpage.
5. Confirm a compact result appears near the selection.
6. If the result says Chrome needs confirmation, choose **Prepare and translate**. Chrome may separately prepare the detector and translator models.
7. Confirm the translated text appears. Copy, listen, pin, and close controls can be exercised from the result card.

## Core test — Mouse capture

1. Open the extension popup and choose **Mouse capture**.
2. Rest the pointer over a visible text block for at least 500 milliseconds.
3. Confirm the nearby result appears without selecting text.
4. Moving away closes an unpinned result after a short delay; a pinned result remains visible.

## Settings persistence

1. Change the enabled state, interaction mode, or target language.
2. Close and reopen the popup.
3. Confirm the setting is preserved through `chrome.storage.local`.

## Expected unsupported surfaces

Chrome internal pages, Chrome Web Store pages, the built-in PDF viewer, and cross-origin frames are intentionally unsupported. The extension has no background worker, remote code, analytics, login, or network translation backend.
