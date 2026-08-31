import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function fail(message) {
  throw new Error(message);
}

const root = process.argv[2] ?? 'store-listing';
const required = [
  'en.md',
  'zh-CN.md',
  'privacy-policy.md',
  'privacy-practices.md',
  'reviewer-notes.md',
  'submission-checklist.md',
];
const documents = new Map();

for (const relative of required) {
  const file = join(root, relative);
  if (!existsSync(file)) fail(`missing required store document: ${file}`);
  const content = readFileSync(file, 'utf8');
  if (/\b(?:TBD|TODO|FIXME|CHANGEME)\b|<[^>\n]+>/i.test(content)) {
    fail(`${file}: unresolved placeholder marker`);
  }
  documents.set(relative, content);
}

for (const relative of ['en.md', 'zh-CN.md', 'reviewer-notes.md']) {
  if (!documents.get(relative).includes('Chrome 138')) {
    fail(`${relative}: Chrome 138 minimum must be disclosed`);
  }
}

function extractPrivacyPolicyUrl(relative) {
  const match = documents
    .get(relative)
    .match(/## (?:Privacy policy URL|隐私政策 URL)\s*\n+\s*(https:\/\/[^\s`)]+)/);
  if (!match?.[1]) {
    fail(`${relative}: expected an HTTPS URL in the privacy policy section`);
  }
  return match[1];
}

const englishPolicyUrl = extractPrivacyPolicyUrl('en.md');
const chinesePolicyUrl = extractPrivacyPolicyUrl('zh-CN.md');
if (englishPolicyUrl !== chinesePolicyUrl) {
  fail('localized privacy policy URLs must match');
}
if (!documents.get('privacy-practices.md').includes(englishPolicyUrl)) {
  fail('privacy-practices.md must use the localized listing privacy policy URL');
}
if (!documents.get('privacy-practices.md').includes('Website content')) {
  fail('privacy-practices.md must disclose Website content handling');
}

console.log('store listing validation passed');
