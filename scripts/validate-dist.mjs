import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

function readPngDimensions(file) {
  const png = readFileSync(file);
  if (png.subarray(1, 4).toString('ascii') !== 'PNG') {
    fail(`${file}: expected a PNG image`);
  }
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

const root = process.argv[2] ?? 'dist';
const artifact = relative => join(root, relative);
const manifestFile = artifact('manifest.json');
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
const expectedIcons = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
};
if (JSON.stringify(manifest.icons) !== JSON.stringify(expectedIcons)) {
  fail('manifest.icons must declare the 16, 32, 48, and 128 PNG icons');
}
if (JSON.stringify(manifest.action?.default_icon) !== JSON.stringify(expectedIcons)) {
  fail('action.default_icon must use the packaged PNG icons');
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
  'content.js',
  'popup.html',
  'popup.js',
  'popup.css',
  '_locales/en/messages.json',
  '_locales/zh_CN/messages.json',
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
];
for (const relative of required) {
  const file = artifact(relative);
  if (!existsSync(file)) fail(`missing required file: ${file}`);
}
readJson(artifact('_locales/en/messages.json'));
readJson(artifact('_locales/zh_CN/messages.json'));
for (const size of [16, 32, 48, 128]) {
  const dimensions = readPngDimensions(artifact(`icons/icon-${size}.png`));
  if (dimensions.width !== size || dimensions.height !== size) {
    fail(`icons/icon-${size}.png must be exactly ${size}x${size}`);
  }
}

const forbidden = [
  { label: 'remote URL', pattern: /https?:\/\// },
  {
    label: 'protocol-relative URL',
    pattern:
      /(?:["'`]|\burl\(\s*|=\s*)\/\/[^/"'`\s)]+(?:[/?#\s"'`)])/i,
  },
  { label: 'eval', pattern: /\beval\s*\(/ },
  { label: 'Function constructor', pattern: /\bnew\s+Function\b/ },
];
for (const relative of ['content.js', 'popup.js', 'popup.html', 'popup.css']) {
  const file = artifact(relative);
  const source = readFileSync(file, 'utf8');
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) {
      fail(`${file}: forbidden ${rule.label}`);
    }
  }
}

console.log('dist validation passed');
