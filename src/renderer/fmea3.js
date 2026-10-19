// Process flow diagram, control plan, dashboard and revision compare.
import * as M from '../core/fmea/model.js';
import { controlPlan } from '../core/fmea/link.js';
import { diff, summarize } from '../core/fmea/diff.js';
import { h, s, toast, input, select, field, apBadge, confirmBox } from './ui.js';
import { t } from './i18n.js';
import { store, commit } from './store.js';
import { refresh } from './app.js';
import { sel } from './fmea.js';
import { barChart, AP_COL } from './plot.js';

const st = () => store.project.settings;
// ---------------- process flow diagram (PFMEA) ----------------
export function flowSvg(doc, { onClick, width } = {}) {
  const steps = doc.nodes[doc.rootId].children.map((id) => doc.nodes[id]); const rs = M.rows(doc, { settings: st() });
  const W = 210, gap = 46, top = 46; const maxEl = Math.max(1, ...steps.map((x) => x.children.length));
  const Wt = Math.max(1, steps.length) * (W + gap) + 20, Ht = top + 130 + maxEl * 30 + 20;
  const g = s('svg', { class: 'flow', viewBox: `0 0 ${Wt} ${Ht}`, width: width || Math.min(Wt, 1800) });
  g.append(s('defs', {}, s('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, s('path', { d: 'M0 0L10 5L0 10z', fill: '#34465c' }))));
  g.append(s('text', { x: 10, y: 22, class: 'flow-title' }, doc.nodes[doc.rootId].name));
  steps.forEach((n, i) => {
    const x = 10 + i * (W + gap), cx = x + 34, cy = top + 40; const ty = n.stepType || 'operation';
    const sym = { operation: s('circle', { cx, cy, r: 24 }), inspection: s('rect', { x: cx - 23, y: cy - 23, width: 46, height: 46 }), transport: s('path', { d: `M${cx - 26} ${cy - 12}H${cx + 6}V${cy - 24}L${cx + 28} ${cy}L${cx + 6} ${cy + 24}V${cy + 12}H${cx - 26}Z` }), storage: s('path', { d: `M${cx - 26} ${cy - 22}H${cx + 26}L${cx} ${cy + 24}Z` }), delay: s('path', { d: `M${cx - 22} ${cy - 24}H${cx}A24 24 0 0 1 ${cx} ${cy + 24}H${cx - 22}Z` }), combined: s('g', {}, s('rect', { x: cx - 24, y: cy - 24, width: 48, height: 48 }), s('circle', { cx, cy, r: 21 })) }[ty];
    const lv = rs.filter((r) => r.node.id === n.id || (r.childNode && r.node.id === n.id)).reduce((m, r) => ('HML'.indexOf(r.level) >= 0 && (m === '' || 'HML'.indexOf(r.level) < 'HML'.indexOf(m)) ? r.level : m), '');
    const chars = [n.id, ...n.children].flatMap((id) => M.functionsOf(doc, id)).flatMap((f) => f.chars);
    const grp = s('g', { class: 'flow-step st-' + ty + (sel(doc).node === n.id ? ' sel' : ''), onclick: () => onClick && onClick(n) }, sym, s('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', class: 'flow-no' }, n.processNo || i + 1),
      s('text', { x: cx + 36, y: cy - 6, class: 'flow-name' }, n.name.length > 18 ? n.name.slice(0, 17) + '…' : n.name), s('text', { x: cx + 36, y: cy + 10, class: 'flow-sub' }, t(ty)),
      lv ? s('rect', { x: cx + 36, y: cy + 16, width: 20, height: 14, rx: 3, fill: AP_COL[lv] }) : null, lv ? s('text', { x: cx + 46, y: cy + 27, 'text-anchor': 'middle', class: 'flow-ap' }, lv) : null,
      chars.filter((c) => c.cls).length ? s('text', { x: cx + 62, y: cy + 27, class: 'flow-sc' }, '◆ ' + [...new Set(chars.filter((c) => c.cls).map((c) => c.cls))].join(' ')) : null);
    g.append(grp);
    n.children.forEach((cid, k) => { const e = doc.nodes[cid]; const y = top + 100 + k * 30; g.append(s('line', { x1: cx, y1: cy + 26, x2: cx, y2: y + 10, class: 'flow-el-line' }), s('g', { class: 'flow-el' }, s('rect', { x: cx + 8, y, width: W - 20, height: 22, rx: 5 }), s('text', { x: cx + 14, y: y + 15 }, `[${t(e.m4 || '')}] ` + (e.name.length > 20 ? e.name.slice(0, 19) + '…' : e.name)))); });
    if (i < steps.length - 1) g.append(s('line', { x1: x + W - 4, y1: cy, x2: x + W + gap - 2, y2: cy, class: 'flow-arrow', 'marker-end': 'url(#arr)' }));
  });
  if (!steps.length) g.append(s('text', { x: 20, y: 80, class: 'hint' }, t('Add process steps in step 2.')));
  return g;
}
export function renderFlow(body, doc) {
  body.append(h('div', { class: 'panel' }, h('h3', {}, t('Process flow diagram'), h('span', { class: 'hint' }, t('symbols: ○ operation · □ inspection · ⇨ transport · ▽ storage · D delay'))),
    h('div', { class: 'scroll-x' }, flowSvg(doc, { onClick: (n) => { sel(doc).node = n.id; refresh(); } }))));
  const n = doc.nodes[sel(doc).node];
  if (n && n.kind === 'step') body.append(h('div', { class: 'panel' }, h('h3', {}, t('Selected step')), h('div', { class: 'fgrid' }, field(t('Name'), input(n.name, (v) => { n.name = v; commit('n'); })), field(t('Process number'), input(n.processNo, (v) => { n.processNo = v; commit('n'); })), field(t('Step type (flow chart symbol)'), select(n.stepType || 'operation', M.STEP_TYPES.map((k) => [k, t(k)]), (v) => { n.stepType = v; commit('n'); })))));
}

// ---------------- control plan ----------------
const CP_COLS = [['processNo', 'Process no.', false], ['step', 'Process step / operation', false], ['machine', 'Machine, device, jig, tools', true], ['charNo', 'Char. no.', true], ['product', 'Product characteristic', false], ['process', 'Process characteristic', false], ['cls', 'Special class', false], ['spec', 'Specification / tolerance', true], ['measurement', 'Evaluation / measurement technique', true], ['sample', 'Sample size', true], ['frequency', 'Frequency', true], ['method', 'Control method', true], ['reaction', 'Reaction plan', true], ['risk', 'AP', false]];
export function renderControlPlan(body, doc) {
  const rows = controlPlan(doc); const ov = (doc.controlPlan.overrides ||= {});
  const tb = h('tbody', {}, rows.map((r) => h('tr', {}, CP_COLS.map(([k, , ed]) => {
    if (k === 'risk') return h('td', { class: 'num' }, apBadge(r.risk));
    if (!ed) return h('td', { class: 'ro' }, r[k]);
    const c = h('td', { class: 'ed' + (ov[r.key] && ov[r.key][k] != null ? ' overridden' : ''), contenteditable: 'true' }, r[k]);
    c.addEventListener('blur', () => { const v = c.innerText.trim(); if (v === r[k]) return; (ov[r.key] ||= {})[k] = v; commit('cp', { render: false }); c.classList.add('overridden'); });
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); c.blur(); } }); return c;
  }))));
  body.append(h('div', { class: 'panel' }, h('h3', {}, t('Control plan'), h('div', { class: 'row' }, field(t('Phase'), select(doc.controlPlan.phase, ['Prototype', 'Pre-launch', 'Production'].map((x) => [x, t(x)]), (v) => { doc.controlPlan.phase = v; commit('cp', { render: false }); })), field(t('Control plan no.'), input(doc.controlPlan.number, (v) => { doc.controlPlan.number = v; commit('cp', { render: false }); })),
    h('button', { class: 'btn small', onclick: async () => { if (await confirmBox(t('Reset'), t('Discard manual edits and regenerate the control plan from the PFMEA?'))) { doc.controlPlan.overrides = {}; commit('cp'); } } }, t('Regenerate')))),
    h('p', { class: 'hint' }, t('Generated from the PFMEA: one line per product / process characteristic; detection controls become the measurement technique and prevention controls the control method. Edited cells (blue) are kept when the PFMEA changes.')),
    rows.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'grid cp' }, h('thead', {}, h('tr', {}, CP_COLS.map(([, l]) => h('th', {}, t(l))))), tb)) : h('p', { class: 'hint' }, t('Add characteristics to the process steps / work elements (step 3) to build the control plan.'))));
}

// ---------------- dashboard ----------------
export function dashboardCharts(doc) {
  const S = M.stats(doc, st()); const lab = { H: t('High'), M: t('Medium'), L: t('Low'), '': t('Not rated') };
  const dist = barChart({ title: t('Action priority — before / after actions'), bars: ['H', 'M', 'L', ''].flatMap((k) => [{ label: lab[k] + ' ' + t('before'), value: S.dist[k], color: AP_COL[k] }, { label: lab[k] + ' ' + t('after'), value: S.distPost[k], color: AP_COL[k] + 'aa' }]), w: 520, h: 270 });
  const status = barChart({ title: t('Actions by status'), bars: M.ACTION_STATUS.map((k) => ({ label: t(k), value: S.byStatus[k] || 0, color: { open: '#e8a317', decision: '#8e7cc3', implementation: '#3d85c6', completed: '#2ea05a', 'not-implemented': '#a8b3c2' }[k] })), w: 520, h: 270 });
  const owners = Object.entries(S.byOwner).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const own = barChart({ title: t('Open actions by owner'), bars: owners.map(([k, v]) => ({ label: k, value: v, color: '#ff7a00' })), w: 520, h: 40 + Math.max(owners.length, 2) * 26, horizontal: true });
  const top = S.pareto.filter((p) => p.score > 0).slice(0, 14);
  const pareto = barChart({ title: t('Pareto of failure modes (sum of S×O×D)'), bars: top.map((p) => ({ label: p.fm.text, value: p.score, color: AP_COL[p.level] })), line: top.map((p) => p.cum), w: 1060, h: 320 });
  // S × O (or S × F) heat matrix
  const msr = doc.type === 'MSR'; const cell = 26; const g = s('svg', { class: 'plot', viewBox: `0 0 ${50 + cell * 10} ${40 + cell * 10}`, width: 50 + cell * 10 });
  g.append(s('text', { x: 4, y: 14, class: 'plot-title' }, (msr ? 'S × F' : 'S × O') + ' ' + t('matrix')));
  for (let si = 0; si < 10; si++) for (let oi = 0; oi < 10; oi++) { const n = S.matrixSO[si][oi]; const sv = si + 1, ov = oi + 1; const tone = sv >= 9 && ov >= 4 || sv * ov >= 42 ? '#f8d0d0' : sv * ov >= 20 ? '#ffe9b3' : '#d7f2dc';
    const x = 40 + oi * cell, y = 20 + (9 - si) * cell; g.append(s('rect', { x, y, width: cell - 1, height: cell - 1, fill: n ? (sv >= 9 && ov >= 4 || sv * ov >= 42 ? '#d13b3b' : sv * ov >= 20 ? '#e8a317' : '#2ea05a') : tone }), n ? s('text', { x: x + cell / 2, y: y + cell / 2 + 4, 'text-anchor': 'middle', class: 'mtx-n' }, n) : null); }
  for (let i = 1; i <= 10; i++) g.append(s('text', { x: 34, y: 20 + (10 - i) * cell + cell / 2 + 4, 'text-anchor': 'end', class: 'tick' }, i), s('text', { x: 40 + (i - 1) * cell + cell / 2, y: 34 + cell * 10, 'text-anchor': 'middle', class: 'tick' }, i));
  return { S, dist, status, own, pareto, matrix: g };
}
export function renderDashboard(body, doc) {
  const c = dashboardCharts(doc); const S = c.S;
  const card = (l, v, cls = '') => h('div', { class: 'result-card ' + cls }, h('div', { class: 'rc-label' }, l), h('div', { class: 'rc-value' }, v));
  body.append(h('div', { class: 'results-grid' }, card(t('Failure chains'), S.rows), card(t('High'), S.dist.H, 'c-H'), card(t('High after actions'), S.distPost.H, 'c-H'), card(t('Open actions'), S.open), card(t('Overdue'), S.overdue, S.overdue ? 'c-H' : ''), card(t('Completed'), S.byStatus.completed || 0, 'c-L')),
    h('div', { class: 'dash' }, h('div', { class: 'panel' }, c.dist), h('div', { class: 'panel' }, c.status), h('div', { class: 'panel' }, c.own), h('div', { class: 'panel' }, c.matrix)), h('div', { class: 'panel' }, h('div', { class: 'scroll-x' }, c.pareto)));
}

// ---------------- revisions & compare ----------------
const OP_IC = { added: '＋', removed: '－', changed: '✎' };
export function renderRevisions(body, doc) {
  const revs = store.project.revisions.filter((r) => r.doc === doc.id); const ui = ((store.ui.rev ||= {})[doc.id] ||= {}); if (ui.count !== revs.length) { ui.count = revs.length; ui.a = null; ui.b = 'current'; }
  const opts = [['current', t('Current (unsaved state)')], ...revs.map((r) => [r.id, `Rev ${r.n} · ${r.label} · ${r.date.slice(0, 10)}`])];
  if (!ui.a || (ui.a !== 'current' && !revs.find((r) => r.id === ui.a))) ui.a = revs.length ? revs[revs.length - 1].id : 'current';
  if (!ui.b) ui.b = 'current';
  const stateOf = (id) => (id === 'current' ? doc : revs.find((r) => r.id === id)?.state);
  const ch = diff(stateOf(ui.a), stateOf(ui.b)); const sm = summarize(ch);
  body.append(h('div', { class: 'grid-2' },
    h('div', { class: 'panel' }, h('h3', {}, t('Revision history')), revs.length ? h('table', { class: 'grid small' }, h('tr', {}, [t('Rev'), t('Label'), t('Date'), t('Author'), t('Approved'), t('Note'), ''].map((x) => h('th', {}, x))),
      revs.slice().reverse().map((r) => h('tr', {}, h('td', {}, r.n), h('td', {}, r.label), h('td', {}, r.date.slice(0, 16).replace('T', ' ')), h('td', {}, r.author), h('td', {}, r.approved ? '✔ ' + r.approved.date : ''), h('td', {}, r.note),
        h('td', {}, h('button', { class: 'btn small', onclick: async () => { if (!(await confirmBox(t('Restore'), t('Replace the current document with this revision? (The current state can be recovered with Undo.)')))) return; const i = store.project.docs.indexOf(doc); store.project.docs[i] = { ...M.clone(r.state), id: doc.id, approval: doc.approval }; commit('restore'); toast(t('Restored') + ' Rev ' + r.n); } }, t('Restore')))))) : h('p', { class: 'hint' }, t('No revisions yet — save one in step 7 (Results & approval).'))),
    h('div', { class: 'panel' }, h('h3', {}, t('Compare')), h('div', { class: 'row' }, select(ui.a, opts, (v) => { ui.a = v; refresh(); }), '→', select(ui.b, opts, (v) => { ui.b = v; refresh(); })),
      h('p', {}, h('span', { class: 'diff-added' }, `＋${sm.added} ` + t('added')), '  ', h('span', { class: 'diff-removed' }, `－${sm.removed} ` + t('removed')), '  ', h('span', { class: 'diff-changed' }, `✎${sm.changed} ` + t('changed'))),
      ch.length ? h('table', { class: 'grid small diff' }, h('tr', {}, [t('Change'), t('Type'), t('Item'), t('Details')].map((x) => h('th', {}, x))),
        ch.map((c) => h('tr', { class: 'diff-' + c.op }, h('td', {}, OP_IC[c.op] + ' ' + t(c.op)), h('td', {}, t(c.kind)), h('td', {}, c.label), h('td', {}, (c.fields || []).map((f) => h('div', {}, h('b', {}, f.field + ': '), h('span', { class: 'old' }, fmtV(f.from)), ' → ', h('span', { class: 'new' }, fmtV(f.to)))))))) : h('p', { class: 'hint' }, t('No differences.')))));
}
const fmtV = (v) => (v == null || v === '' ? '∅' : typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v));
