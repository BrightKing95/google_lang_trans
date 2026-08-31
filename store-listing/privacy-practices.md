# Chrome Web Store Privacy Practices

Use these answers as a dashboard guide. Re-check the dashboard wording at submission time and keep every declaration consistent with the uploaded package.

## Single purpose

Translate text that users select or deliberately capture by hovering on webpages, using Chrome's built-in on-device language capabilities.

## Permission justification

### `storage`

Stores only the user's enabled state, interaction mode, and target language in `chrome.storage.local` so the extension remains ready after installation and browser restarts.

### HTTP and HTTPS page access

The content script must be available on ordinary HTTP and HTTPS webpages so users can translate selected text or deliberately capture a text block by hovering wherever they read. It reads only the visible text involved in the current user interaction. It does not run in cross-origin frames.

## Remote code

No. All executable extension code is included in the uploaded package. The extension does not load JavaScript or WebAssembly from a remote source and does not use `eval` or a Function constructor.

## Data-use disclosure

If the dashboard asks which data types are handled, disclose **Website content** because selected or captured webpage text is processed locally. Describe the handling as follows:

- Purpose: core translation functionality requested by the user.
- Processing location: the user's device through Chrome built-in APIs.
- Transmission: none to the developer or to a developer-operated service.
- Retention: none for page text or translations.
- Settings stored locally: enabled state, interaction mode, and target language only.

The extension does not handle personally identifiable information, health information, financial and payment information, authentication information, personal communications, location, web history, or user activity for analytics or advertising.

## Required certifications

The extension's data use is limited to its single purpose. Data is not sold or transferred for advertising, credit, or unrelated purposes, and it is not used for personalized advertising. Human access to user data does not occur because page content is not transmitted to the developer.

## Privacy policy URL

https://github.com/BrightKing95/google_lang_trans/blob/main/store-listing/privacy-policy.md
