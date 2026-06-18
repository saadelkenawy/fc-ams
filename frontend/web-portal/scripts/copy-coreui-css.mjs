// Copies CoreUI's prebuilt LTR + RTL stylesheets into public/coreui so they can
// be loaded as swappable <link> tags (dir-aware) at runtime. Run on postinstall.
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(pathToFileURL(resolve(__dirname, '..') + '/'));

// Never block a build: if @coreui isn't resolvable yet (e.g. an early install
// phase) the committed copies in public/coreui are used as-is.
try {
  const srcDir = dirname(require.resolve('@coreui/coreui/dist/css/coreui.min.css'));
  const outDir = resolve(__dirname, '..', 'public', 'coreui');
  mkdirSync(outDir, { recursive: true });
  for (const file of ['coreui.min.css', 'coreui.rtl.min.css']) {
    copyFileSync(resolve(srcDir, file), resolve(outDir, file));
  }
  console.log('[coreui] copied LTR + RTL stylesheets to public/coreui');
} catch (err) {
  console.warn('[coreui] skipped stylesheet copy (using committed public/coreui):', err.message);
}
