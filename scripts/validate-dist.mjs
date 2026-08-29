import { existsSync, readFileSync } from 'node:fs';

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${file}: invalid or unreadable JSON (${error.message})`);
  }
}

const manifestFile = 'dist/manifest.json';
if (!existsSync(manifestFile)) fail(`missing required file: ${manifestFile}`);
const manifest = readJson(manifestFile);

if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if (manifest.minimum_chrome_version !== '138') {
  fail('minimum_chrome_version must be 138');
}
if (JSON.stringify(manifest.permissions) !== JSON.stringify(['storage'])) {
  fail('permissions must equal ["storage"]');
}
if ('background' in manifest) fail('background worker is forbidden');
if ('host_permissions' in manifest) fail('remote host_permissions are forbidden');
if (manifest.action?.default_popup !== 'popup.html') {
  fail('action.default_popup must equal popup.html');
}
if (manifest.content_scripts?.length !== 1) {
  fail('exactly one content script declaration is required');
}
const contentScript = manifest.content_scripts[0];
if (JSON.stringify(contentScript.matches) !== JSON.stringify(['http://*/*', 'https://*/*'])) {
  fail('content script matches must be limited to HTTP and HTTPS pages');
}
if (contentScript.all_frames !== false) {
  fail('content script all_frames must be false');
}

const required = [
  'dist/content.js',
  'dist/popup.html',
  'dist/popup.js',
  'dist/popup.css',
  'dist/_locales/en/messages.json',
  'dist/_locales/zh_CN/messages.json',
];
for (const file of required) {
  if (!existsSync(file)) fail(`missing required file: ${file}`);
}
readJson('dist/_locales/en/messages.json');
readJson('dist/_locales/zh_CN/messages.json');

const forbidden = [
  { label: 'remote URL', pattern: /https?:\/\// },
  { label: 'eval', pattern: /\beval\s*\(/ },
  { label: 'Function constructor', pattern: /\bnew\s+Function\b/ },
];
for (const file of ['dist/content.js', 'dist/popup.js']) {
  const source = readFileSync(file, 'utf8');
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) {
      fail(`${file}: forbidden ${rule.label}`);
    }
  }
}

console.log('dist validation passed');
