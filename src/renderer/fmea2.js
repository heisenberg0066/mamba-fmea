// Steps 5–7 and the spreadsheet form view: risk analysis, optimisation (actions + re-rating), results/approval, form grid.
import * as M from '../core/fmea/model.js';
import { formColumns, formRows } from '../core/fmea/form.js';
import { snapshot } from '../core/fmea/diff.js';
import { AP_MEANING } from '../core/fmea/ratings.js';
import { h, toast, input, textarea, select, field, apBadge, ask } from './ui.js';
import { t, getLang } from './i18n.js';
import { store, commit } from './store.js';
import { refresh, exportXlsx, exportPdf } from './app.js';
import { ratingPicker, sel, kindLabel } from './fmea.js';

const st = () => store.project.settings;
const isMSR = (doc) => doc.type === 'MSR';
const lvlFilter = (doc) => (store.ui.filters[doc.id] ||= { text: '', level: '', status: '', node: '', open: false });
const chainText = (r) => r.fm.text + (r.fc ? ' ← ' + r.fc.text : '');
function filterBar(doc, { status = false } = {}) {
  const F = lvlFilter(doc); const nodes = M.nodeList(doc);
  const text = h('input', { type: 'search', placeholder: t('Filter text…'), value: F.text, oninput: (e) => { F.text = e.target.value; clearTimeout(text._t); text._t = setTimeout(() => { refresh(); setTimeout(() => { const el = document.querySelector('.filters input[type=search]'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0); }, 350); } });
  return h('div', { class: 'filters row' }, text,
    select(F.level, [['', t('All priorities')], ['H', t('High')], ['M', t('Medium')], ['L', t('Low')], ['-', t('Not rated')]], (v) => { F.level = v; refresh(); }),
    select(F.node, [['', t('All elements')], ...nodes.map(({ node, depth }) => [node.id, ' '.repeat(depth * 2) + node.name])], (v) => { F.node = v; refresh(); }),
    status ? select(F.status, [['', t('Any action status')], ['none', t('No action')], ...M.ACTION_STATUS.map((s0) => [s0, t(s0)]), ['overdue', t('Overdue')]], (v) => { F.status = v; refresh(); }) : null,
    h('button', { class: 'btn small', onclick: () => { Object.assign(F, { text: '', level: '', status: '', node: '' }); refresh(); } }, t('Reset')));
}
function applyFilter(doc, rs) {
  const F = lvlFilter(doc); const q = F.text.toLowerCase();
  return rs.filter((r) => (!F.level || (F.level === '-' ? !r.level : r.level === F.level)) && (!F.node || r.node.id === F.node || (r.childNode && r.childNode.id === F.node))
    && (!q || [r.node.name, r.fm.text, r.fc?.text, ...r.fe.map((e) => e.text), r.risk.pc, r.risk.dc, r.risk.remarks, ...r.actions.map((a) => a.text + ' ' + a.owner)].join(' ').toLowerCase().includes(q))
    && (!F.status || (F.status === 'none' ? !r.actions.length : F.status === 'overdue' ? r.actions.some((a) => M.isOverdue(a)) : r.actions.some((a) => a.status === F.status))));
}

// ---------------- Step 5: risk analysis ----------------
export function renderRisk(body, doc) {
  const all = M.rows(doc, { settings: st() }); const rs = applyFilter(doc, all); const msr = isMSR(doc); const rpnMode = doc.ratingMode === 'RPN';
  const rp = (letter, r, key, title) => ratingPicker(doc, letter, r.risk[key], (v) => { r.risk[key] = v; commit('rate'); }, { title });
  const head = msr ? ['FE', 'S', 'FM', 'FC', t('Rationale for frequency'), 'F', t('Current diagnostic monitoring'), t('System response'), 'M', t('Mitigated effect'), 'S′', 'AP'] : ['FE', 'S', 'FM', 'FC', t('Prevention control (PC)'), 'O', t('Detection control (DC)'), 'D', 'AP', ...(rpnMode ? ['RPN'] : []), t('Filter'), t('Remarks')];
  const tb = h('table', { class: 'grid risk' }, h('thead', {}, h('tr', {}, h('th', {}, t('Element')), head.map((x) => h('th', {}, x)))));
  const body2 = h('tbody'); let lastNode = null;
  for (const r of rs) {
    if (r.node.id !== lastNode) { body2.append(h('tr', { class: 'grp' }, h('td', { colspan: head.length + 1 }, kindLabel(r.node.kind) + ': ' + r.node.name))); lastNode = r.node.id; }
    const fe = h('td', { class: 'fe' }, r.fe.length ? r.fe.map((e) => h('div', { class: 'fe-line' }, ratingPicker(doc, 'S', e.S, (v) => { e.S = v; commit('S'); }, { compact: true }), ' ', e.text, e.link ? ' 🔗' : '')) : h('span', { class: 'hint' }, t('no effect linked')));
    const sCell = h('td', { class: 'num' }, r.fe.length ? h('b', {}, r.S ?? '–') : ratingPicker(doc, 'S', r.fm.S, (v) => { r.fm.S = v; commit('S'); }));
    const tx = (key, ph) => h('td', {}, textarea(r.risk[key], (v) => { r.risk[key] = v; commit('risk', { render: false }); }, { rows: 2, placeholder: ph || '' }));
    const cells = msr
      ? [fe, sCell, h('td', {}, r.fm.text), h('td', {}, r.fc?.text || '—'), tx('rationale'), h('td', {}, rp('F', r, 'F')), tx('monitoring'), tx('response'), h('td', {}, rp('M', r, 'M')), tx('mitigated'), h('td', {}, ratingPicker(doc, 'S', r.risk.sMitigated, (v) => { r.risk.sMitigated = v; commit('rate'); })), h('td', { class: 'num' }, apBadge(r.ap))]
      : [fe, sCell, h('td', { class: 'wtext' }, r.fm.text), h('td', { class: 'wtext' }, r.fc ? [r.fc.text, h('div', { class: 'hint' }, r.childNode?.name || '')] : '—'), tx('pc', t('How is the cause prevented?')), h('td', {}, rp('O', r, 'O')), tx('dc', t('How is the cause / mode detected?')), h('td', {}, rp('D', r, 'D')),
        h('td', { class: 'num' }, apBadge(r.ap)), ...(rpnMode ? [h('td', { class: 'num rpn lvl-' + r.level }, r.rpn || '–')] : []), h('td', {}, input(r.risk.filter, (v) => { r.risk.filter = v; commit('f', { render: false }); }, { style: { width: '70px' } })), tx('remarks')];
    body2.append(h('tr', { class: 'lvl-row-' + (r.level || 'none') }, h('td', { class: 'hint' }, r.childNode ? r.childNode.name : ''), cells));
  }
  tb.append(body2);
  const L = getLang(); const mean = AP_MEANING[L] || AP_MEANING.en;
  body.append(h('div', { class: 'panel' }, h('h3', {}, t('Risk analysis') + ` — ${rs.length}/${all.length} ` + t('failure chains'), h('span', { class: 'legend' }, ['H', 'M', 'L'].map((x) => h('span', { title: mean[x] }, apBadge(x), ' ', t({ H: 'High', M: 'Medium', L: 'Low' }[x]))))),
    filterBar(doc), rs.length ? h('div', { class: 'scroll-x' }, tb) : h('p', { class: 'hint' }, t('No failure chains yet. Link failure effects and causes in step 4.')),
    h('p', { class: 'hint' }, msr ? t('AP for FMEA-MSR is looked up from S, F and M. When M = 1 the severity of the mitigated effect is used.') : rpnMode ? t('Classic RPN mode: RPN = S × O × D; priority High when RPN ≥ {h} or S ≥ 9 with O ≥ 4, Medium when RPN ≥ {m}. AP is still shown for reference.', { h: st().rpnHigh, m: st().rpnMedium }) : t('Action priority is looked up from S, O and D (AIAG-VDA logic). Click a rating to see the criteria.'))));
}

// ---------------- Step 6: optimisation ----------------
export function renderOptimisation(body, doc) {
  const F = lvlFilter(doc); const all = M.rows(doc, { settings: st() }); const msr = isMSR(doc);
  let rs = applyFilter(doc, all); if (!F.open) rs = rs.filter((r) => r.level === 'H' || r.level === 'M' || r.actions.length);
  const panel = h('div', { class: 'stack' });
  for (const r of rs) {
    const acts = h('table', { class: 'grid small actions' }, h('tr', {}, [t('Type'), t('Action'), t('Responsible'), t('Target date'), t('Status'), t('Action taken / evidence'), t('Completion date'), ''].map((x) => h('th', {}, x))),
      r.actions.map((a) => h('tr', { class: M.isOverdue(a) ? 'overdue' : '' },
        h('td', {}, select(a.kind, msr ? [['monitoring', t('monitoring')], ['response', t('system response')], ['prevention', t('prevention')]] : [['prevention', t('prevention')], ['detection', t('detection')]], (v) => { a.kind = v; commit('a', { render: false }); })),
        h('td', {}, textarea(a.text, (v) => { a.text = v; commit('a', { render: false }); }, { rows: 2 })), h('td', {}, input(a.owner, (v) => { a.owner = v; commit('a', { render: false }); }, { style: { width: '110px' } })),
        h('td', {}, input(a.due, (v) => { a.due = v; commit('a'); }, { type: 'date' })), h('td', {}, select(a.status, M.ACTION_STATUS.map((x) => [x, t(x)]), (v) => { a.status = v; if (v === 'completed' && !a.completed) a.completed = M.today(); commit('a'); })),
        h('td', {}, textarea(a.taken, (v) => { a.taken = v; commit('a', { render: false }); }, { rows: 2 })), h('td', {}, input(a.completed, (v) => { a.completed = v; commit('a', { render: false }); }, { type: 'date' })),
        h('td', {}, h('button', { class: 'btn small danger', onclick: () => { delete doc.actions[a.id]; commit('rma'); } }, '×')))));
    const post = r.risk.post || {}; const pp = (L) => ratingPicker(doc, L, post[L], (v) => { M.setPost(doc, r.key, { [L]: v }); commit('post'); }, { compact: true, title: t('after actions') });
    panel.append(h('div', { class: 'panel opt-card lvl-b-' + (r.level || 'none') },
      h('div', { class: 'opt-head' }, apBadge(r.ap), r.rpn && doc.ratingMode === 'RPN' ? h('span', { class: 'rpn' }, 'RPN ' + r.rpn) : null, h('b', {}, chainText(r)), h('span', { class: 'hint' }, r.node.name + (r.fe.length ? ' → ' + r.fe.map((e) => e.text).join('; ') : '')),
        h('span', { class: 'grow' }), h('span', { class: 'hint' }, msr ? `S ${r.S ?? '–'} · F ${r.risk.F ?? '–'} · M ${r.risk.M ?? '–'}` : `S ${r.S ?? '–'} · O ${r.risk.O ?? '–'} · D ${r.risk.D ?? '–'}`)),
      acts, h('div', { class: 'row', style: { marginTop: '6px' } },
        h('button', { class: 'btn small primary', onclick: () => { M.addAction(doc, r.key, { kind: msr ? 'monitoring' : (r.risk.D >= 7 ? 'detection' : 'prevention') }); commit('adda'); } }, '+ ' + t('Action')),
        h('span', { class: 'grow' }), h('span', {}, t('Re-rating after actions') + ':'), 'S', pp('S'), msr ? ['F', pp('F'), 'M', pp('M')] : ['O', pp('O'), 'D', pp('D')], '→', apBadge(r.post?.ap), r.post && doc.ratingMode === 'RPN' ? h('span', { class: 'rpn' }, 'RPN ' + r.post.rpn) : null,
        r.S >= 9 ? h('label', { class: 'chip', title: t('High severity: document management review') }, h('input', { type: 'checkbox', checked: !!r.risk.mgmtReview, onchange: (e) => { r.risk.mgmtReview = e.target.checked; commit('mr', { render: false }); } }), t('Management review')) : null)));
  }
  body.append(h('div', { class: 'panel' }, h('h3', {}, t('Optimisation') + ` — ${rs.length} ` + t('chains'), h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: F.open, onchange: (e) => { F.open = e.target.checked; refresh(); } }), t('show low-priority chains too'))), filterBar(doc, { status: true }),
    h('p', { class: 'hint' }, t('Plan actions for High and Medium priorities: prevention actions lower occurrence, detection actions improve detection. Re-rate once actions are verified to see the new action priority.'))), rs.length ? panel : h('div', { class: 'panel hint' }, t('No chains need action with the current filter.')));
}

// ---------------- Step 7: results & approval ----------------
const CHECK_TXT = { 'node-no-function': 'Element without function', 'fm-no-effect': 'Failure without effect', 'no-severity': 'Chain without severity', 'not-rated': 'Chain not fully rated', 'fm-no-cause': 'Failure mode without cause', 'high-no-action': 'High priority without action or rationale', 'mgmt-review': 'Severity 9–10: management review recommended', overdue: 'Action overdue' };
export function renderResults(body, doc) {
  const S = M.stats(doc, st()); const ch = M.checks(doc); const msr = isMSR(doc);
  const card = (label, v, cls = '') => h('div', { class: 'result-card ' + cls }, h('div', { class: 'rc-label' }, label), h('div', { class: 'rc-value' }, v));
  body.append(h('div', { class: 'results-grid' }, card(t('Failure chains'), S.rows), card(t('High') + ' (AP)', S.dist.H, 'c-H'), card(t('Medium') + ' (AP)', S.dist.M, 'c-M'), card(t('Low') + ' (AP)', S.dist.L, 'c-L'), card(t('Not rated'), S.dist['']),
    card(t('High after actions'), S.distPost.H, 'c-H'), card(t('Actions'), S.actions), card(t('Open actions'), S.open), card(t('Overdue'), S.overdue, S.overdue ? 'c-H' : '')));
  const lvlIc = { error: '⛔', warn: '⚠', info: 'ℹ' };
  body.append(h('div', { class: 'grid-2' },
    h('div', { class: 'panel' }, h('h3', {}, t('Consistency checks') + ` (${ch.length})`), ch.length ? h('div', { class: 'checks' }, ch.slice(0, 200).map((c) => h('div', { class: 'check ' + c.level, onclick: () => jump(doc, c) }, lvlIc[c.level], ' ', h('b', {}, t(CHECK_TXT[c.code] || c.code)), ': ', c.text))) : h('p', { class: 'ok' }, '✔ ' + t('No findings.'))),
    h('div', { class: 'panel' }, h('h3', {}, t('Revision & approval')), approvalForm(doc),
      h('h3', { style: { marginTop: '16px' } }, t('Documentation')), h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => exportPdf() }, '📄 ' + t('PDF report')), h('button', { class: 'btn', onclick: () => exportXlsx(null, [doc.id]) }, '⇡ ' + t('Excel (this document)'))),
      h('p', { class: 'hint' }, msr ? t('The report contains the planning header, the FMEA-MSR form, the action list and the AP summary.') : t('The report contains the planning header, the FMEA form, the action list, the AP summary and — for PFMEA — the control plan.')))));
}
function jump(doc, c) { if (c.code === 'node-no-function') { sel(doc).node = c.id; store.ui.tab = 'functions'; } else if (c.code === 'fm-no-effect') { sel(doc).node = doc.failures[c.id]?.node || sel(doc).node; sel(doc).fm = c.id; store.ui.tab = 'failures'; } else if (c.code === 'overdue') store.ui.tab = 'optimisation'; else { const fm = doc.failures[c.id.split('|')[0]]; lvlFilter(doc).text = fm ? fm.text : ''; store.ui.tab = c.code === 'high-no-action' || c.code === 'mgmt-review' ? 'optimisation' : 'risk'; } refresh(); }
function approvalForm(doc) {
  const lab = h('input', { type: 'text', placeholder: t('e.g. Design freeze') }), who = h('input', { type: 'text', placeholder: t('Name') }), note = h('textarea', { rows: 2, placeholder: t('What changed?') }), appr = h('input', { type: 'checkbox' });
  const revs = store.project.revisions.filter((r) => r.doc === doc.id);
  return h('div', { class: 'form' }, doc.approval ? h('div', { class: 'approved' }, '✔ ' + t('Approved') + ` — Rev ${doc.approval.rev} · ${doc.approval.by} · ${doc.approval.date}`) : h('div', { class: 'hint' }, t('Not approved yet.')),
    h('div', { class: 'fgrid' }, field(t('Revision label'), lab), field(t('Author / approver'), who)), field(t('Note'), note), h('label', { class: 'chip' }, appr, t('Approve this revision')),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { const r = snapshot(store.project, doc, { label: lab.value, author: who.value, note: note.value, approve: appr.checked }); commit('rev'); toast(t('Revision saved') + ': ' + r.label); } }, t('Save revision')), h('span', { class: 'hint' }, revs.length + ' ' + t('revision(s) saved — compare them in the Revisions tab.'))));
}

// ---------------- Form view (spreadsheet), synced with the model ----------------
const EDIT = { fm: 'fm', fc: 'fc', pc: 'risk', dc: 'risk', O: 'rate', D: 'rate', F: 'rate', M: 'rate', S: 'S', filter: 'risk', remarks: 'risk', rationale: 'risk', response: 'risk', mitigated: 'risk', sMitigated: 'rate', actPrev: 'act', actDet: 'act', owner: 'act', due: 'act', status: 'act', taken: 'act', completed: 'act', S2: 'post', O2: 'post', D2: 'post', F2: 'post', M2: 'post' };
export function renderForm(body, doc) {
  const cols = formColumns(doc); const fr = formRows(doc, st()); const rs = M.rows(doc, { settings: st() }); const byKey = new Map(rs.map((r) => [r.key, r]));
  const keep = new Set(applyFilter(doc, rs).map((r) => r.key)); let data = fr.filter((x) => keep.has(x.key));
  const sort = store.ui.sort?.doc === doc.id ? store.ui.sort : null;
  if (sort) { const k = sort.key, dir = sort.dir; const val = (x) => (k === 'ap' || k === 'ap2' ? 'HML'.indexOf(x[k] || 'X') : x[k] === '' ? null : x[k]); data = [...data].sort((a, b) => { const A = val(a), B = val(b); if (A == null && B == null) return 0; if (A == null) return 1; if (B == null) return -1; return (typeof A === 'number' && typeof B === 'number' ? A - B : String(A).localeCompare(String(B))) * dir; }); }
  const th = cols.map((c) => h('th', { style: { minWidth: Math.max(46, c.width * 6.2) + 'px' }, class: 'sortable' + (sort?.key === c.key ? ' sorted' : ''), onclick: () => { store.ui.sort = { doc: doc.id, key: c.key, dir: sort?.key === c.key ? -sort.dir : 1 }; refresh(); } }, t(c.header), sort?.key === c.key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''));
  const tb = h('tbody');
  for (const row of data) {
    const r = byKey.get(row.key); const a = row.actionId ? doc.actions[row.actionId] : null;
    tb.append(h('tr', { class: row.first ? 'first' : 'cont' }, cols.map((c) => {
      const v = row[c.key]; const kind = EDIT[c.key];
      if (c.key === 'ap' || c.key === 'ap2') return h('td', { class: 'num' }, v ? apBadge(v) : '');
      if (!kind || (!row.first && !['act'].includes(kind)) || (kind === 'act' && !a && c.key !== 'actPrev' && c.key !== 'actDet') || (kind === 'fc' && !r.fc) || (kind === 'S' && r.fe.length)) return h('td', { class: 'ro ' + (['S', 'O', 'D', 'F', 'M', 'rpn', 'rpn2'].includes(c.key) ? 'num' : '') }, String(v ?? ''));
      const cell = h('td', { class: 'ed', contenteditable: 'true', spellcheck: 'false' }, String(v ?? ''));
      cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); cell.blur(); } if (e.key === 'Escape') { cell.textContent = String(v ?? ''); cell.blur(); } });
      cell.addEventListener('blur', () => { const nv = cell.innerText.trim(); if (nv === String(v ?? '')) return; if (setCell(doc, r, a, c.key, kind, nv)) commit('form'); else { cell.textContent = String(v ?? ''); toast(t('Invalid value'), 'error'); } });
      return cell;
    })));
  }
  body.append(h('div', { class: 'panel' }, h('h3', {}, t('Form view') + ` — ${data.length} ` + t('rows'), h('span', { class: 'hint' }, t('Edit cells directly; changes update the tree and the analysis. Click a header to sort.'))), filterBar(doc, { status: true }),
    h('div', { class: 'form-wrap' }, h('table', { class: 'grid form-grid' }, h('thead', {}, h('tr', {}, th)), tb))));
}
function setCell(doc, r, a, key, kind, v) {
  const num = (x) => (x === '' ? null : Number.isInteger(+x) && +x >= 1 && +x <= 10 ? +x : undefined);
  if (kind === 'fm') { r.fm.text = v; return true; } if (kind === 'fc') { r.fc.text = v; return true; }
  if (kind === 'S') { const n = num(v); if (n === undefined) return false; r.fm.S = n; return true; }
  if (kind === 'risk') { const map = { pc: isMSR(doc) ? 'monitoring' : 'pc' }; r.risk[map[key] || key] = v; return true; }
  if (kind === 'rate') { const n = num(v); if (n === undefined) return false; r.risk[key] = n; return true; }
  if (kind === 'post') { const n = num(v); if (n === undefined) return false; M.setPost(doc, r.key, { [key[0]]: n }); return true; }
  if (kind === 'act') {
    let act = a; if (!act) { if (!v) return true; act = M.addAction(doc, r.key, { kind: key === 'actDet' ? 'detection' : 'prevention' }); }
    if (key === 'actPrev' || key === 'actDet') { act.text = v; act.kind = key === 'actDet' ? 'detection' : act.kind === 'detection' ? 'prevention' : act.kind; }
    else if (key === 'status') { const s0 = M.ACTION_STATUS.find((x) => x === v || t(x) === v); if (!s0) return false; act.status = s0; }
    else if (key === 'due' || key === 'completed') { if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; act[key] = v; }
    else if (key === 'taken') act.taken = v; else act[key] = v;
    return true;
  }
  return false;
}
