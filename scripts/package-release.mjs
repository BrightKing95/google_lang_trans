import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';

function fail(message) {
  throw new Error(message);
}

function listFiles(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink()) fail(`symbolic links are forbidden: ${absolute}`);
      return entry.isDirectory() ? listFiles(root, absolute) : [relative(root, absolute)];
    })
    .sort();
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const source = resolve(process.argv[2] ?? 'dist');
const output = resolve(
  process.argv[3] ?? `release/quick-translate-${packageJson.version}.zip`,
);

if (!existsSync(source)) fail(`build directory does not exist: ${source}`);
if (!existsSync(join(source, 'manifest.json'))) {
  fail(`manifest.json must exist at the build root: ${source}`);
}
const outputFromSource = relative(source, output);
const outputIsInsideSource =
  outputFromSource === '' ||
  (!isAbsolute(outputFromSource) &&
    outputFromSource !== '..' &&
    !outputFromSource.startsWith(`..${sep}`));
if (outputIsInsideSource) {
  fail('release ZIP must be outside the build directory');
}

mkdirSync(dirname(output), { recursive: true });
rmSync(output, { force: true });
const temporary = mkdtempSync(join(tmpdir(), 'quick-translate-release-'));

try {
  cpSync(source, temporary, {
    recursive: true,
    filter: path => !path.endsWith('.map'),
  });

  const files = listFiles(temporary);
  if (!files.includes('manifest.json')) fail('release staging is missing manifest.json');
  for (const file of files) {
    if (isAbsolute(file) || file === '..' || file.startsWith('../')) {
      fail(`unsafe release path: ${file}`);
    }
    if (file.endsWith('.map')) fail(`source map leaked into release: ${file}`);
  }

  execFileSync('zip', ['-X', '-q', '-r', output, '.'], { cwd: temporary });
  const entries = execFileSync('unzip', ['-Z1', output], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
  if (!entries.includes('manifest.json')) {
    fail('release archive must contain manifest.json at its root');
  }
  if (entries.some(entry => entry.startsWith(`${basename(source)}/`))) {
    fail(`release archive must not contain a ${basename(source)}/ wrapper`);
  }
  if (entries.some(entry => entry.endsWith('.map'))) {
    fail('release archive must not contain source maps');
  }

  console.log(`release package created: ${output}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
