import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function readPngDimensions(file) {
  const png = readFileSync(file);
  if (png.subarray(1, 4).toString('ascii') !== 'PNG') {
    throw new Error(`${file}: renderer did not produce a PNG image`);
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function assertDimensions(file, width, height) {
  const dimensions = readPngDimensions(file);
  if (dimensions.width !== width || dimensions.height !== height) {
    throw new Error(
      `${file}: expected ${width}x${height}, received ${dimensions.width}x${dimensions.height}`,
    );
  }
}

export function renderSvgWithFallback({
  source,
  output,
  width,
  height,
  transparent = false,
  sips,
  chrome,
  runCommand = execFileSync,
}) {
  mkdirSync(dirname(resolve(output)), { recursive: true });
  rmSync(output, { force: true });

  let sipsError;
  if (sips) {
    try {
      runCommand(
        sips,
        [
          '-s',
          'format',
          'png',
          '-z',
          String(height),
          String(width),
          source,
          '--out',
          output,
        ],
        { stdio: 'pipe' },
      );
      assertDimensions(output, width, height);
      return;
    } catch (error) {
      sipsError = error;
      rmSync(output, { force: true });
    }
  }

  if (!chrome) {
    throw new Error(
      'SVG rendering failed and Chrome/Chromium is unavailable for fallback.',
      { cause: sipsError },
    );
  }

  const profile = mkdtempSync(join(tmpdir(), 'quick-translate-chrome-'));
  let chromeError;
  try {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profile}`,
      '--force-device-scale-factor=1',
      `--window-size=${width},${height}`,
      `--screenshot=${resolve(output)}`,
    ];
    if (transparent) args.push('--default-background-color=00000000');
    args.push(pathToFileURL(resolve(source)).href);
    try {
      runCommand(chrome, args, {
        stdio: 'pipe',
        timeout: 30_000,
        killSignal: 'SIGKILL',
      });
    } catch (error) {
      chromeError = error;
    }
    if (!existsSync(output)) {
      throw chromeError ?? new Error('Chrome did not produce a PNG image');
    }
    assertDimensions(output, width, height);
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}
