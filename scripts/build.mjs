import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await build({
  entryPoints: {
    content: 'src/content/index.ts',
    popup: 'src/popup/popup-entry.ts',
  },
  bundle: true,
  outdir: 'dist',
  entryNames: '[name]',
  format: 'iife',
  platform: 'browser',
  target: ['chrome138'],
  sourcemap: true,
});
await cp('src/manifest.json', 'dist/manifest.json');
await cp('src/_locales', 'dist/_locales', { recursive: true });
await cp('src/popup/popup.css', 'dist/popup.css');
const popupHtml = await readFile('src/popup/index.html', 'utf8');
await writeFile('dist/popup.html', popupHtml);
