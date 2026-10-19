// Bundle the main-process Excel module (exceljs + core) into one CJS file, so the packaged app
// does not depend on electron-builder's node_modules collection.
import { build } from 'esbuild';
await build({ entryPoints: ['src/core/fmea/xlsx.js'], bundle: true, platform: 'node', format: 'cjs', target: 'node20',
  outfile: 'src/gen/xlsx.bundle.cjs', minify: true, legalComments: 'eof', logLevel: 'info' });
