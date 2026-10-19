// Collects every UI string that goes through t(): literal t('...') calls plus label tables used via t(variable).
import fs from 'fs';
import { MATERIALS, FITTINGS, VALVES } from '../src/core/hyd/catalog.js';
import { FLUIDS } from '../src/core/fluids/fluids.js';
import { formColumns } from '../src/core/fmea/form.js';
import { newDoc, ACTION_STATUS, FOUR_M, STEP_TYPES } from '../src/core/fmea/model.js';
const keys = new Set();
for (const f of fs.readdirSync('src/renderer').filter((x) => x.endsWith('.js') && !x.startsWith('i18n') && !x.startsWith('validation'))) {
  const s = fs.readFileSync('src/renderer/' + f, 'utf8');
  for (const m of s.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'"));
  for (const m of s.matchAll(/\bt\(\{([^}]*)\}/g)) for (const k of m[1].matchAll(/:\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(k[1].replace(/\\'/g, "'"));
  const lists = [/CHECK_TXT = \{([^}]*)\}/, /CP_COLS = \[(.*)\];/, /SW_LABEL = \{(.*)\};/, /DOC_TABS = \[([\s\S]*?)\];/, /\['7-step method'([^\]]*)\]/, /catLabel = \(c\) => \(\{([^}]*)\}/, /kindLabel = \(k\) => t\(\{([^}]*)\}/];
  for (const re of lists) { const m = s.match(re); if (m) for (const k of m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)) if (/[A-Za-z]{2}/.test(k[1]) && !/^[a-z]+\.[A-Za-z]+$/.test(k[1]) && !/^(pipe|pump|valve|node|fluid)\b/.test(k[1])) keys.add(k[1].replace(/\\'/g, "'").replace(/^\d /, '')); }
}
['7-step method'].forEach((k) => keys.add(k));
for (const x of [...MATERIALS, ...FITTINGS, ...VALVES, ...FLUIDS]) keys.add(x.label);
for (const ty of ['DFMEA', 'PFMEA', 'MSR']) for (const rm of ['AP', 'RPN']) { const d = newDoc(ty); d.ratingMode = rm; formColumns(d).forEach((c) => keys.add(c.header)); }
[...ACTION_STATUS, ...FOUR_M, ...STEP_TYPES, 'junction', 'reservoir', 'tank', 'nozzle', 'pipe', 'pump', 'valve', 'resistance', 'laminar', 'transitional', 'turbulent', 'quick', 'equal', 'linear', 'gate', 'globe', 'ball', 'butterfly', 'plug', 'diaphragm', 'swingcheck', 'liftcheck', 'needle',
  'prevention', 'detection', 'monitoring', 'response', 'added', 'removed', 'changed', 'node', 'function', 'failure', 'risk', 'action', 'char', 'planning', 'settings', 'Business use', 'Internal', 'Confidential', 'Proprietary', 'Prototype', 'Pre-launch', 'Production',
  'Fluid properties', 'Governing equations', 'Link calculations at the solution', 'Node results', 'Iteration', 'Σ|ΔQ| / Σ|Q|', 'Node', 'z (m)', 'H (m)', 'p (kPa g)', 'Cannot move a node into itself', 'Root cannot be moved'].forEach((k) => keys.add(k));
const out = [...keys].filter((k) => k && /[A-Za-z]/.test(k)).sort();
if (process.argv[2] === '--missing') { const { DICT } = await import('../src/renderer/i18n-data.js'); for (const L of ['sv', 'ar']) { const miss = out.filter((k) => !DICT[L][k]); console.log(L, 'missing', miss.length); if (miss.length) console.log(JSON.stringify(miss, null, 0)); } }
else fs.writeFileSync('build/i18n-keys.json', JSON.stringify(out, null, 1));
console.log(out.length, 'keys');
