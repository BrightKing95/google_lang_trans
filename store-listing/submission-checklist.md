# Chrome Web Store Submission Checklist

## Developer account

- [ ] Developer registration fee has been paid.
- [ ] Contact email has been verified.
- [ ] Google two-step verification is enabled.
- [ ] Publisher name is final and accurate.
- [ ] Trader or Non-Trader status has been declared accurately.

## Repository and privacy policy

- [ ] The release branch has been merged to `main` and pushed to GitHub.
- [ ] The repository is public, or the privacy policy is hosted at another public HTTPS URL.
- [ ] The privacy policy URL opens in an incognito window without signing in:
      `https://github.com/BrightKing95/google_lang_trans/blob/main/store-listing/privacy-policy.md`
- [ ] The privacy policy URL entered in both localized listings is identical to the live URL.

## Package

- [ ] `npm ci` completes successfully.
- [ ] `npm run release:prepare` completes successfully.
- [ ] `release/quick-translate-0.1.0.zip` contains `manifest.json` at the archive root.
- [ ] The ZIP contains icons at 16, 32, 48, and 128 pixels.
- [ ] The ZIP contains no source maps, remote code, secrets, test files, or development-only documents.
- [ ] The unpacked `dist` directory has been smoke-tested in Chrome 138 or later.

## Store listing

- [ ] English name, summary, detailed description, and category have been entered from `store-listing/en.md`.
- [ ] Simplified Chinese localization has been entered from `store-listing/zh-CN.md`.
- [ ] `store-assets/output/store-icon-128.png` has been uploaded as the store icon.
- [ ] At least one 1280 × 800 screenshot has been uploaded; both localized screenshots are preferred.
- [ ] `store-assets/output/small-promo.png` has been uploaded as the 440 × 280 small promotional tile.
- [ ] Chrome 138+ and first-use language-model preparation are clearly disclosed.

## Privacy practices

- [ ] Single-purpose description matches `store-listing/privacy-practices.md`.
- [ ] `storage` and HTTP/HTTPS page-access justifications are complete.
- [ ] Remote code is declared as **No**.
- [ ] Website content is disclosed as locally handled for core functionality.
- [ ] No collection, transmission, retention, sale, advertising, or analytics claims match the submitted package.

## Review and distribution

- [ ] Reviewer notes have been copied from `store-listing/reviewer-notes.md`.
- [ ] Public, unlisted, or private visibility and target countries have been chosen deliberately.
- [ ] The final draft has been previewed in every listed language.
- [ ] Package version `0.1.0` is higher than any previously uploaded version.
- [ ] Submit for review; choose automatic or deferred publishing intentionally.
