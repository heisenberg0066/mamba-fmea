// Project overview, template library, settings (rating-table overrides, thresholds, fluids) and About / validation.
import * as M from '../core/fmea/model.js';
import { LIBRARY, applyEntry } from '../core/fmea/library.js';
import { CRITERIA, table } from '../core/fmea/ratings.js';
import { setBackend, backendInfo } from '../core/fluids/fluids.js';
import { h, toast, input, select, field, apBadge, confirmBox } from './ui.js';
import { t, getLang } from './i18n.js';
import { store, commit } from './store.js';
import { go, refresh, newDocDialog, info, importXlsx } from './app.js';
import { catLabel, sel } from './fmea.js';
import { VALIDATION } from './validation-data.js';

export function renderHome(main) {
  const P = store.project;
  main.append(h('div', { class: 'hero' }, h('h1', {}, input(P.name, (v) => { P.name = v || P.name; commit('name'); }, { class: 'hero-in' })),
    h('p', {}, t('AIAG-VDA FMEA (DFMEA, PFMEA, FMEA-MSR) with Action Priority, linked control plans and a pipe-network hydraulics solver — offline, in one file.')),
    h('div', { class: 'hero-badges' }, ['7-step method', 'Action Priority H/M/L', 'DFMEA → PFMEA → Control plan', 'Excel in/out', 'Hydraulics: GGA / Hardy Cross', 'EN · SV · AR'].map((x) => h('span', {}, t(x))))));
  const row = h('div', { class: 'home-grid' });
  for (const d of P.docs) {
    const S = M.stats(d, P.settings);
    row.append(h('div', { class: 'home-card', onclick: () => go('doc', { docId: d.id, tab: 'risk' }) }, h('div', { class: 'row' }, h('span', { class: 'tbadge t-' + d.type }, d.type === 'MSR' ? 'FMEA-MSR' : d.type), d.approval ? h('span', { class: 'approved small' }, '✔') : null),
      h('div', { class: 'hc-t' }, d.title), h('div', { class: 'hc-d' }, `${Object.keys(d.nodes).length} ${t('elements')} · ${S.rows} ${t('chains')} · ${S.actions} ${t('actions')}`),
      h('div', { class: 'row ap-row' }, ['H', 'M', 'L'].map((k) => h('span', {}, apBadge(k), ' ', S.dist[k])), S.overdue ? h('span', { class: 'overdue-b' }, '⏰ ' + S.overdue) : null)));
  }
  row.append(h('div', { class: 'home-card add', onclick: () => newDocDialog() }, h('div', { class: 'hc-ic' }, '＋'), h('div', { class: 'hc-t' }, t('New FMEA')), h('div', { class: 'hc-d' }, t('DFMEA, PFMEA or FMEA-MSR'))));
  row.append(h('div', { class: 'home-card add', onclick: () => importXlsx() }, h('div', { class: 'hc-ic' }, '⇣'), h('div', { class: 'hc-t' }, t('Import Excel')), h('div', { class: 'hc-d' }, t('AIAG-VDA or classic RPN forms'))));
  main.append(h('h2', { class: 'home-h' }, t('FMEA documents')), row);
  const nets = h('div', { class: 'home-grid' });
  for (const n of P.networks) nets.append(h('div', { class: 'home-card', onclick: () => go('hyd', { netId: n.id }) }, h('div', { class: 'hc-ic' }, '💧'), h('div', { class: 'hc-t' }, n.name), h('div', { class: 'hc-d' }, `${n.nodes.length} ${t('nodes')} · ${n.links.length} ${t('links')} · ${n.fluid.id}`)));
  nets.append(h('div', { class: 'home-card add', onclick: () => import('./hyd.js').then((m) => m.newNetworkDialog()) }, h('div', { class: 'hc-ic' }, '＋'), h('div', { class: 'hc-t' }, t('New network')), h('div', { class: 'hc-d' }, t('pipes, pumps, valves, tanks, nozzles'))));
  main.append(h('h2', { class: 'home-h' }, t('Hydraulic networks')), nets);
}

export function renderLibrary(main) {
  const docs = store.project.docs; const ui = (store.ui.lib ||= { doc: docs[0]?.id, cat: 'design' });
  const doc = docs.find((d) => d.id === ui.doc) || docs[0];
  const entries = [...LIBRARY, ...store.project.library];
  main.append(h('h1', { class: 'page-title' }, t('Templates & library')), h('p', { class: 'page-sub' }, t('Reusable functions, failure modes, causes and effects written for Mamba FMEA. Apply one to an element of an FMEA to create complete failure chains; save your own from any element (Structure tab).')));
  const tgt = doc ? h('div', { class: 'row' }, t('Apply to'), select(doc.id, docs.map((d) => [d.id, d.title]), (v) => { ui.doc = v; refresh(); }), select(sel(doc).node, M.nodeList(doc).map(({ node, depth }) => [node.id, ' '.repeat(depth * 2) + node.name]), (v) => { sel(doc).node = v; })) : h('p', { class: 'hint' }, t('Create an FMEA document first.'));
  main.append(h('div', { class: 'panel' }, tgt, h('div', { class: 'tabs' }, ['design', 'process', 'hydraulic', 'user'].map((c) => h('button', { class: 'tab' + (ui.cat === c ? ' active' : ''), onclick: () => { ui.cat = c; refresh(); } }, t(catLabel(c)) + ` (${entries.filter((e) => e.cat === c).length})`)))));
  const grid = h('div', { class: 'lib-grid' });
  for (const e of entries.filter((x) => x.cat === ui.cat)) {
    grid.append(h('div', { class: 'panel lib-card' }, h('h3', {}, e.name, h('span', { class: 'row' }, doc ? h('button', { class: 'btn small primary', onclick: () => { const r = applyEntry(doc, sel(doc).node, e); commit('lib', { render: false }); toast(t('Template applied') + `: ${doc.nodes[sel(doc).node].name} — ${r.failures.length} ${t('failures')}`); go('doc', { docId: doc.id, tab: 'failures' }); } }, t('Apply')) : null,
      e.cat === 'user' ? h('button', { class: 'btn small danger', onclick: async () => { if (await confirmBox(t('Delete'), e.name)) { store.project.library = store.project.library.filter((x) => x !== e); commit('rmlib'); } } }, '×') : null)),
      (e.functions || []).map((f) => h('div', { class: 'lib-fn' }, h('b', {}, f.text), f.req ? h('div', { class: 'hint' }, f.req) : null,
        h('ul', {}, (f.failures || []).map((fm) => h('li', {}, fm.text, h('div', { class: 'hint' }, 'FE: ' + (fm.effects || []).map((x) => `${x.text} (S${x.S})`).join('; ')), h('div', { class: 'hint' }, 'FC: ' + (fm.causes || []).map((x) => `${x.element}: ${x.text}`).join('; ')))))))));
  }
  main.append(grid);
}

export function renderSettings(main) {
  const S = store.project.settings; const ui = (store.ui.set ||= { tab: 'DFMEA.S' }); const ov = (S.criteriaOverrides ||= {});
  main.append(h('h1', { class: 'page-title' }, t('Settings & rating tables')));
  main.append(h('div', { class: 'grid-2' },
    h('div', { class: 'panel' }, h('h3', {}, t('Classic RPN mode thresholds')), h('div', { class: 'fgrid' }, field(t('High when RPN ≥'), input(S.rpnHigh, (v) => { S.rpnHigh = +v || 200; commit('s'); }, { type: 'number' })), field(t('Medium when RPN ≥'), input(S.rpnMedium, (v) => { S.rpnMedium = +v || 100; commit('s'); }, { type: 'number' }))),
      h('p', { class: 'hint' }, t('Used only by documents switched to “Classic RPN”. Severity 9–10 with occurrence ≥ 4 is always High.'))),
    h('div', { class: 'panel' }, h('h3', {}, t('Fluid property engine')), field(t('Back-end'), select(localStorage.getItem('mamba-fmea-fluids') || 'auto', [['auto', t('Automatic (CoolProp when available, else built-in)')], ['coolprop', 'CoolProp 6.6 (WASM)'], ['builtin', t('Built-in correlations')]], (v) => { localStorage.setItem('mamba-fmea-fluids', v); setBackend(v); toast(t('Fluid back-end') + ': ' + v); })),
      h('p', { class: 'hint' }, t('CoolProp loaded') + ': ' + (backendInfo().coolprop ? '✔' : '✘') + '. ' + t('The fluid layer (src/core/fluids) has the same prop(out, fluid, {T, P}) call as ThermoStudio, so both apps can share one engine.')))));
  const keys = ['DFMEA.S', 'DFMEA.O', 'DFMEA.D', 'PFMEA.S', 'PFMEA.O', 'PFMEA.D', 'MSR.F', 'MSR.M'];
  const [type, letter] = ui.tab.split('.'); const L = getLang();
  const rows = table(L, type, letter, ov);
  main.append(h('div', { class: 'panel' }, h('h3', {}, t('Rating tables'), h('span', { class: 'hint' }, t('Own wording — edit any line to match your company guideline; edits are stored in the project.'))),
    h('div', { class: 'tabs' }, keys.map((k) => h('button', { class: 'tab' + (ui.tab === k ? ' active' : ''), onclick: () => { ui.tab = k; refresh(); } }, k.replace('.', ' · ')))),
    h('table', { class: 'grid crit' }, h('tr', {}, h('th', {}, t('Rating')), h('th', {}, t('Criterion')), h('th', {})), rows.map((r) => { const edited = ov[ui.tab] && ov[ui.tab][r.value]; const c = h('td', { class: 'ed' + (edited ? ' overridden' : ''), contenteditable: 'true' }, r.text);
      c.addEventListener('blur', () => { const v = c.innerText.trim(); const def = (CRITERIA[L] || CRITERIA.en)[ui.tab][10 - r.value]; if (v === r.text) return; (ov[ui.tab] ||= {})[r.value] = v && v !== def ? v : undefined; if (!ov[ui.tab][r.value]) delete ov[ui.tab][r.value]; commit('crit'); });
      return h('tr', {}, h('td', { class: 'num' }, h('span', { class: 'rating r' + r.value }, r.value)), c, h('td', {}, edited ? h('button', { class: 'btn small', onclick: () => { delete ov[ui.tab][r.value]; commit('crit'); } }, t('Reset')) : null)); })),
    h('h3', { style: { marginTop: '16px' } }, t('Action priority table (DFMEA / PFMEA)')), apTable()));
}
function apTable() {
  // compact visual of the S/O/D → AP logic (computed, not copied)
  const Sb = [[10, 9], [8, 7], [6, 4], [3, 2], [1, 1]], Ob = [[10, 8], [7, 6], [5, 4], [3, 2], [1, 1]], Db = [[10, 7], [6, 5], [4, 2], [1, 1]];
  return h('table', { class: 'grid aptab' }, h('tr', {}, h('th', {}, 'S'), h('th', {}, 'O'), Db.map(([a, b]) => h('th', {}, 'D ' + (a === b ? a : b + '–' + a)))),
    Sb.flatMap(([sa, sb]) => Ob.map(([oa, ob], i) => h('tr', {}, i === 0 ? h('td', { rowspan: 5, class: 'num' }, sa === sb ? sa : sb + '–' + sa) : null, h('td', { class: 'num' }, oa === ob ? oa : ob + '–' + oa), Db.map(([da]) => h('td', { class: 'num' }, apBadge(apDPcached(sa, oa, da))))))));
}
import { apDP } from '../core/fmea/ap.js';
const apDPcached = (S, O, D) => apDP(S, O, D);

export function renderAbout(main) {
  const V = VALIDATION;
  main.append(h('h1', { class: 'page-title' }, 'Mamba FMEA ' + (info.version ? 'v' + info.version : '')),
    h('div', { class: 'panel' }, h('p', {}, t('Free for personal use. Offline: no account, no telemetry. Projects are single .mfmea files (JSON); the last session is autosaved.')),
      h('p', {}, t('The FMEA method and the Action Priority logic follow the published AIAG-VDA approach; all rating descriptions, templates and help texts are Mamba FMEA\'s own wording — no handbook text is reproduced. Verify ratings against your organisation\'s licensed handbook / customer-specific requirements.')),
      h('p', {}, t('Hydraulics: steady incompressible flow; Darcy–Weisbach (Colebrook–White or Swamee–Jain, laminar 64/Re) or Hazen–Williams; Newton global-gradient (Todini–Pilati, as in EPANET) or Hardy Cross. Fluid properties: built-in correlations or CoolProp 6.6 (MIT licence).'))),
    h('div', { class: 'panel' }, h('h3', {}, t('Validation') + ` — ${V.passed}/${V.total} ` + t('checks passed') + ` (${V.date})`), h('p', { class: 'hint' }, t('Run with npm test; the full table is in docs/VALIDATION.md.')),
      h('div', { class: 'scroll-y' }, h('table', { class: 'grid small' }, h('tr', {}, h('th', {}, t('Group')), h('th', {}, t('Check')), h('th', {}, t('Result'))), V.rows.map((r) => h('tr', { class: r.ok ? '' : 'bad' }, h('td', {}, r.group), h('td', {}, r.name), h('td', {}, (r.ok ? '✔ ' : '✘ ') + (r.detail || ''))))))));
}
