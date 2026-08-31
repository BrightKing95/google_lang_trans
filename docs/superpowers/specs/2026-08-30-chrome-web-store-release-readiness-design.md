# Chrome Web Store Release Readiness Design

## Goal

Prepare Quick Translate for a first Chrome Web Store submission without changing its translation behavior or privacy model.

## Release Positioning

- Product names remain localized as `Quick Translate` in English and `轻译` in Simplified Chinese.
- The single purpose is: translate text that a user selects or deliberately captures by hovering on a webpage, using Chrome's built-in on-device language APIs.
- The listing must prominently state that Chrome 138 or later is required and that Chrome may download a language model on first use.
- The extension requires no account, API key, analytics service, advertising SDK, remote code, or developer-operated backend.

## Packaged Extension

The production package contains Manifest V3 code, localizations, popup assets, content scripts, and local PNG icons at 16, 32, 48, and 128 pixels. The manifest declares the icons for both the extension and toolbar action. Source maps are retained in local development builds but excluded from the Web Store ZIP.

The ZIP file is generated from the contents of `dist`, so `manifest.json` is at the archive root. A release validation script rejects missing files, unexpected source maps, unsafe archive paths, and an incorrectly nested root directory.

## Brand and Store Assets

The brand mark is a code-native vector: a blue-to-indigo rounded square containing two overlapping white speech shapes and a directional translation arrow. It deliberately avoids platform or third-party logos.

Source artwork lives under `store-assets/source`; upload-ready assets live under `store-assets/output`. The initial asset set contains:

- 128 × 128 store icon, also used to derive packaged extension icons.
- 1280 × 800 English screenshot presenting the real popup design beside a translation result on a neutral sample page.
- 1280 × 800 Simplified Chinese screenshot with the same composition.
- 440 × 280 small promotional tile with no locale-specific claims beyond the product identity.

The artwork is generated from local SVG sources and converted to PNG by the release asset script. The script uses macOS `sips` when it can render SVG and falls back to a locally installed Chrome or Chromium. Generated images contain no external resources. Because operating systems can resolve the declared system fonts differently, the committed PNG files in `store-assets/output` are the canonical upload assets; cross-platform byte-for-byte reproducibility is not claimed.

## Store Submission Documents

`store-listing/` contains paste-ready English and Simplified Chinese listing copy, privacy-practice answers, reviewer instructions, a submission checklist, and a public privacy-policy document. The descriptions remain factual and avoid unsupported performance claims.

The privacy policy and dashboard declarations match actual code behavior:

- The content script can run on ordinary HTTP and HTTPS pages because selection and hover translation must work on those pages.
- Only the visible text explicitly selected or captured by the user is processed.
- Language detection and translation use Chrome built-in APIs on the user's device.
- Page text, translations, URLs, and browsing history are not transmitted to the developer or third parties and are not retained.
- `chrome.storage.local` stores only enabled state, interaction mode, and target language.

The policy is a static document suitable for hosting on GitHub or another public HTTPS location. The initial listing uses the public policy file on the repository's `main` branch; the checklist still requires the publisher to verify that URL is live before submission.

## Validation

Automated tests verify icon declarations and output, production ZIP structure, exclusion of source maps, and required release documents. Existing unit, integration, type-check, build, and remote-code validations must remain green. A final archive listing and image-dimension check provide release evidence.

## Out of Scope

- Publishing the item or accepting Chrome Web Store legal declarations on the user's behalf.
- Creating or verifying a Chrome Web Store developer account.
- Deploying the privacy policy to a public host.
- Changing translation modes, supported languages, or runtime behavior.
