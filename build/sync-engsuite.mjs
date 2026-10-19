// Copy the shared, UI-free property layer from the engineering suite (ThermoStudio) into
// src/vendor/engsuite-core. Usage: node build/sync-engsuite.mjs [/path/to/engsuite]
import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process';
const src = path.resolve(process.argv[2] || '../engsuite');
const out = path.resolve('src/vendor/engsuite-core');
fs.mkdirSync(out, { recursive: true });
for (const f of ['props.js', 'units.js', 'README.md']) fs.copyFileSync(path.join(src, 'src/core', f), path.join(out, f));
let rev = 'unknown'; try { rev = execSync('git log -1 --format=%h -- src/core', { cwd: src }).toString().trim(); } catch (_) {}
fs.writeFileSync(path.join(out, 'VERSION.json'), JSON.stringify({ source: 'engsuite/src/core', commit: rev, synced: new Date().toISOString().slice(0, 10) }, null, 2) + '\n');
console.log('synced engsuite core', rev, '->', out);
