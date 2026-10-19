// FMEA document pages: header, 7-step tabs and the structure / function / failure editors with their network views.
import * as M from '../core/fmea/model.js';
import { pfmeaFromDfmea, syncLinks } from '../core/fmea/link.js';
import { LIBRARY, applyEntry, entryFromNode } from '../core/fmea/library.js';
import { h, s, toast, modal, ask, confirmBox, input, textarea, select, field, apBadge } from './ui.js';
import { t } from './i18n.js';
import { store, commit, curDoc } from './store.js';
import { go, refresh } from './app.js';
import { renderRisk, renderOptimisation, renderResults, renderForm } from './fmea2.js';
import { renderFlow, renderControlPlan, renderDashboard, renderRevisions } from './fmea3.js';

export const DOC_TABS = [
  ['planning', '1 ' + 'Planning & scope'], ['structure', '2 ' + 'Structure'], ['functions', '3 ' + 'Functions'], ['failures', '4 ' + 'Failures'],
  ['risk', '5 ' + 'Risk analysis'], ['optimisation', '6 ' + 'Optimisation'], ['results', '7 ' + 'Results & approval'],
  ['form', 'Form view'], ['flow', 'Process flow'], ['cp', 'Control plan'], ['dashboard', 'Dashboard'], ['revisions', 'Revisions'],
];
const KIND_IC = { system: '▣', subsystem: '▤', component: '◧', interface: '⇄', item: '▣', step: '⚙', element: '◦' };
export const kindLabel = (k) => t({ system: 'System', subsystem: 'Subsystem', component: 'Component', interface: 'Interface', item: 'Process item', step: 'Process step', element: 'Work element' }[k] || k);
const q = (doc) => (doc.type === 'PFMEA' ? 'PFMEA' : doc.type);
export function sel(doc) { const s0 = (store.ui.sel[doc.id] ||= {}); if (!s0.node || !doc.nodes[s0.node]) s0.node = doc.rootId; return s0; }

export function renderDoc(main) {
  const doc = curDoc(); const tab = store.ui.tab || 'planning';
  const tabsList = DOC_TABS.filter(([id]) => doc.type === 'PFMEA' || (id !== 'flow' && id !== 'cp'));
  const head = h('div', { class: 'doc-head' },
    h('div', { class: 'doc-title' }, h('span', { class: 'tbadge big t-' + doc.type }, doc.type === 'MSR' ? 'FMEA-MSR' : doc.type), input(doc.title, (v) => { doc.title = v || doc.title; commit('title'); }, { class: 'title-in' }),
      doc.approval ? h('span', { class: 'approved', title: t('Approved') }, '✔ ' + t('Approved') + ' ' + doc.approval.date + ' · ' + doc.approval.by) : null),
    h('div', { class: 'row' },
      doc.type !== 'MSR' ? h('label', { class: 'seg' }, t('Rating'), select(doc.ratingMode, [['AP', t('Action priority (AIAG-VDA)')], ['RPN', t('Classic RPN (S×O×D)')]], (v) => { doc.ratingMode = v; commit('mode'); })) : null,
      doc.type === 'DFMEA' ? h('button', { class: 'btn', onclick: () => genPfmea(doc), title: t('Create a PFMEA whose effects are linked to the failure modes of this DFMEA') }, '⇢ ' + t('Generate PFMEA')) : null,
      h('button', { class: 'btn', onclick: () => dupDoc(doc) }, t('Duplicate')),
      h('button', { class: 'btn danger', onclick: () => delDoc(doc) }, t('Delete'))));
  const bar = h('div', { class: 'tabs steps-tabs' }, tabsList.map(([id, label]) => { const [n, ...rest] = label.split(' '); const isStep = /^\d$/.test(n); return h('button', { class: 'tab' + (id === tab ? ' active' : '') + (isStep ? ' step' : ' view'), 'data-tab': id, onclick: () => { store.ui.tab = id; refresh(); } }, isStep ? [h('span', { class: 'stepn' }, n), t(rest.join(' '))] : t(label)); }));
  main.append(head, bar);
  const body = h('div', { class: 'doc-body' }); main.append(body);
  const R = { planning: renderPlanning, structure: renderStructure, functions: renderFunctions, failures: renderFailures, risk: renderRisk, optimisation: renderOptimisation, results: renderResults, form: renderForm, flow: renderFlow, cp: renderControlPlan, dashboard: renderDashboard, revisions: renderRevisions }[tab] || renderPlanning;
  return R(body, doc);
}
async function genPfmea(dfmea) {
  const p = pfmeaFromDfmea(dfmea, { title: 'PFMEA – ' + dfmea.nodes[dfmea.rootId].name }); store.project.docs.push(p); syncLinks(store.project); commit('pfmea', { render: false });
  toast(t('PFMEA generated: one process step per component, effects linked to the DFMEA failure modes.')); go('doc', { docId: p.id, tab: 'structure' });
}
function dupDoc(doc) { const c = M.clone(doc); c.id = M.uid('d'); c.title = doc.title + ' (' + t('copy') + ')'; c.approval = null; store.project.docs.push(c); commit('dup', { render: false }); go('doc', { docId: c.id }); }
async function delDoc(doc) { if (!(await confirmBox(t('Delete'), t('Delete this FMEA document?') + ' ' + doc.title))) return; store.project.docs = store.project.docs.filter((d) => d !== doc); store.project.revisions = store.project.revisions.filter((r) => r.doc !== doc.id); commit('del', { render: false }); go('home'); }

// ---------------- Step 1: planning ----------------
function renderPlanning(body, doc) {
  const P = doc.planning; const f = (k, label, ta) => field(t(label), (ta ? textarea : input)(P[k], (v) => { P[k] = v; commit('planning', { render: false }); }, ta ? { rows: 3 } : {}));
  const date = (k, label) => field(t(label), input(P[k], (v) => { P[k] = v; commit('planning', { render: false }); }, { type: 'date' }));
  body.append(h('div', { class: 'grid-2' },
    h('div', { class: 'panel' }, h('h3', {}, t('Header (who / what / when)')), h('div', { class: 'fgrid' },
      f('company', 'Company'), f('location', 'Engineering location'), f('customer', 'Customer'), f('model', 'Model year / platform'), f('subject', 'Subject'), f('fmeaId', 'FMEA ID number'),
      date('startDate', 'Start date'), date('revisionDate', 'Revision date'), f('responsible', 'Responsible (design / process)'), field(t('Confidentiality'), select(P.confidentiality, ['Business use', 'Internal', 'Confidential', 'Proprietary'].map((x) => [x, t(x)]), (v) => { P.confidentiality = v; commit('planning', { render: false }); })),
      field(t('Cross-functional team (one per line)'), textarea((P.team || []).join('\n'), (v) => { P.team = v.split('\n').map((x) => x.trim()).filter(Boolean); commit('planning', { render: false }); }, { rows: 4 })))),
    h('div', { class: 'panel' }, h('h3', {}, t('Project plan — the 5 Ts')), h('div', { class: 'form' },
      f('intent', 'InTent — why is this FMEA done?', true), f('timing', 'Timing — milestones, due dates', true), f('task', 'Team / Task — deliverables', true), f('tools', 'Tools — software, methods', true)),
      h('h3', { style: { marginTop: '14px' } }, t('Analysis boundaries')), h('div', { class: 'form' }, f('scope', 'In scope', true), f('boundaries', 'Out of scope / interfaces', true), f('assumptions', 'Assumptions & lessons learned used', true)))));
  body.append(h('div', { class: 'panel note' }, h('b', {}, t('Method')), ' ', t('Mamba FMEA follows the 7-step approach: plan the analysis, model the structure, add functions and characteristics, link failure effects – modes – causes into chains, rate S/O/D (or S/F/M for FMEA-MSR) to get the Action Priority, plan and track optimisation actions, then document and approve the results. Rating descriptions are Mamba FMEA\'s own wording — tailor them in Settings.')));
}

// ---------------- structure tree (shared) ----------------
export function tree(doc, { onSelect, draggable = true, counts = true, filter } = {}) {
  const S0 = sel(doc); const wrap = h('div', { class: 'tree' });
  const collapsed = (store.ui.collapsed ||= {});
  const rowFor = (n, depth) => {
    const fns = M.functionsOf(doc, n.id); const fms = Object.values(doc.failures).filter((x) => x.node === n.id).length;
    const row = h('div', { class: 'tree-row' + (S0.node === n.id ? ' sel' : ''), style: { paddingInlineStart: 6 + depth * 18 + 'px' }, 'data-id': n.id, draggable: draggable && n.id !== doc.rootId ? 'true' : null,
      onclick: () => { S0.node = n.id; S0.fm = null; onSelect ? onSelect(n) : refresh(); } },
      h('span', { class: 'caret', onclick: (e) => { e.stopPropagation(); collapsed[n.id] = !collapsed[n.id]; refresh(); } }, n.children.length ? (collapsed[n.id] ? '▸' : '▾') : '·'),
      h('span', { class: 'kic k-' + n.kind, title: kindLabel(n.kind) }, KIND_IC[n.kind] || '•'),
      n.processNo ? h('span', { class: 'pno' }, n.processNo) : null, n.m4 ? h('span', { class: 'm4' }, t(n.m4)) : null,
      h('span', { class: 'tn' }, n.name),
      counts ? h('span', { class: 'tcount', title: t('functions / failures') }, fns.length + '·' + fms) : null);
    if (draggable) {
      row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/node', n.id); e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', (e) => { if (![...e.dataTransfer.types].includes('text/node')) return; e.preventDefault(); const r = row.getBoundingClientRect(); const y = (e.clientY - r.top) / r.height; row.dataset.drop = y < 0.28 && n.id !== doc.rootId ? 'before' : y > 0.72 && n.id !== doc.rootId ? 'after' : 'into'; row.className = row.className.replace(/ drop-\w+/g, '') + ' drop-' + row.dataset.drop; });
      row.addEventListener('dragleave', () => (row.className = row.className.replace(/ drop-\w+/g, '')));
      row.addEventListener('drop', (e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/node'); const mode = row.dataset.drop || 'into'; row.className = row.className.replace(/ drop-\w+/g, ''); if (!id || id === n.id) return;
        try { if (mode === 'into') M.moveNode(doc, id, n.id); else { const p = doc.nodes[n.parent]; let idx = p.children.indexOf(n.id) + (mode === 'after' ? 1 : 0); const cur = p.children.indexOf(id); if (cur >= 0 && cur < idx) idx--; M.moveNode(doc, id, p.id, idx); } commit('move'); } catch (err) { toast(t(err.message), 'error'); } });
    }
    return row;
  };
  M.walk(doc, (n, d) => { let p = doc.nodes[n.parent]; while (p) { if (collapsed[p.id]) return; p = doc.nodes[p.parent]; } if (!filter || filter(n)) wrap.append(rowFor(n, d)); });
  return wrap;
}
function treePanel(doc, title) {
  return h('div', { class: 'panel tree-panel' }, h('h3', {}, t(title || 'Structure tree'), h('span', { class: 'hint' }, t('drag to move'))), tree(doc),
    h('div', { class: 'row tree-actions' }, h('button', { class: 'btn small', onclick: () => addChild(doc, sel(doc).node) }, '+ ' + t('Child')), h('button', { class: 'btn small', onclick: () => { const n = doc.nodes[sel(doc).node]; if (n.parent) addChild(doc, n.parent); } }, '+ ' + t('Sibling'))));
}
async function addChild(doc, parentId) {
  const depth = M.nodeDepth(doc, parentId) + 1; const dflt = doc.type === 'PFMEA' ? (depth === 1 ? t('Process step') : t('Work element')) : (depth === 1 ? t('Subsystem') : t('Component'));
  const name = await ask(t('New element'), t('Name'), dflt); if (!name) return; const n = M.addNode(doc, parentId, name); sel(doc).node = n.id; commit('add node');
}

// ---------------- Step 2: structure ----------------
function renderStructure(body, doc) {
  const S0 = sel(doc); const n = doc.nodes[S0.node]; const kinds = M.KINDS[doc.type];
  const det = h('div', { class: 'panel' }, h('h3', {}, t('Element'), h('span', { class: 'hint' }, kindLabel(n.kind))),
    h('div', { class: 'fgrid' }, field(t('Name'), input(n.name, (v) => { n.name = v || n.name; commit('name'); })),
      field(t('Kind'), select(n.kind, kinds.map((k) => [k, kindLabel(k)]), (v) => { n.kind = v; commit('kind'); })),
      doc.type === 'PFMEA' && n.kind === 'step' ? [field(t('Process number'), input(n.processNo, (v) => { n.processNo = v; commit('pno'); })), field(t('Step type (flow chart symbol)'), select(n.stepType || 'operation', M.STEP_TYPES.map((k) => [k, t(k)]), (v) => { n.stepType = v; commit('stype'); }))] : null,
      doc.type === 'PFMEA' && n.kind === 'element' ? field(t('4M category'), select(n.m4 || 'Machine', M.FOUR_M.map((k) => [k, t(k)]), (v) => { n.m4 = v; commit('m4'); })) : null,
      field(t('Notes'), textarea(n.notes, (v) => { n.notes = v; commit('notes', { render: false }); }))),
    h('div', { class: 'row', style: { marginTop: '10px' } },
      h('button', { class: 'btn primary', onclick: () => addChild(doc, n.id) }, '+ ' + t('Add child element')),
      n.parent ? h('button', { class: 'btn', onclick: () => { const i = doc.nodes[n.parent].children.indexOf(n.id); if (i > 0) { M.moveNode(doc, n.id, n.parent, i - 1); commit('up'); } } }, '↑') : null,
      n.parent ? h('button', { class: 'btn', onclick: () => { const i = doc.nodes[n.parent].children.indexOf(n.id); M.moveNode(doc, n.id, n.parent, i + 1); commit('down'); } }, '↓') : null,
      n.parent ? h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox(t('Delete'), t('Delete this element with its sub-elements, functions and failures?'))) { S0.node = n.parent; M.removeNode(doc, n.id); commit('rm'); } } }, t('Delete')) : null));
  const libSel = h('select', {}, h('option', { value: '' }, '— ' + t('choose a template') + ' —'), ['design', 'process', 'hydraulic', 'user'].map((cat) => h('optgroup', { label: t(catLabel(cat)) }, [...LIBRARY, ...store.project.library].filter((e) => e.cat === cat).map((e) => h('option', { value: e.id }, e.name)))));
  const lib = h('div', { class: 'panel' }, h('h3', {}, t('Templates')), h('p', { class: 'hint' }, t('Apply a library template to this element: it adds typical functions, failure modes, causes on sub-elements and effects on the parent — complete failure chains to review and rate.')),
    h('div', { class: 'row' }, libSel, h('button', { class: 'btn', onclick: () => { const e = [...LIBRARY, ...store.project.library].find((x) => x.id === libSel.value); if (!e) return; const r = applyEntry(doc, n.id, e); commit('lib'); toast(t('Template applied') + `: ${r.functions.length} ${t('functions')}, ${r.failures.length} ${t('failures')}`); } }, t('Apply')),
      h('button', { class: 'btn', onclick: () => { const e = entryFromNode(doc, n.id); store.project.library.push(e); commit('save tpl', { render: false }); toast(t('Saved to the project library') + ': ' + e.name); } }, t('Save element as template'))));
  body.append(h('div', { class: 'grid-tree' }, treePanel(doc), h('div', { class: 'stack' }, det, lib, h('div', { class: 'panel' }, h('h3', {}, t('Structure diagram')), structureDiagram(doc)))));
}
export const catLabel = (c) => ({ design: 'Design', process: 'Process', hydraulic: 'Hydraulic components', user: 'My templates' }[c] || c);
function structureDiagram(doc) {
  // tidy top-down tree: leaves get consecutive x slots, parents centre over children
  const pos = new Map(); let slot = 0; const W = 150, H = 74;
  const place = (id, d) => { const n = doc.nodes[id]; if (!n.children.length) { pos.set(id, { x: slot++ * W, y: d * H }); return; } n.children.forEach((c) => place(c, d + 1)); const xs = n.children.map((c) => pos.get(c).x); pos.set(id, { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: d * H }); };
  place(doc.rootId, 0); const maxX = Math.max(...[...pos.values()].map((p) => p.x)) + W, maxY = Math.max(...[...pos.values()].map((p) => p.y)) + 50;
  const g = s('svg', { class: 'sdiag', viewBox: `-10 -10 ${maxX + 20} ${maxY + 20}`, width: Math.min(maxX + 20, 1600) });
  for (const n of Object.values(doc.nodes)) if (n.parent && pos.has(n.parent)) { const a = pos.get(n.parent), b = pos.get(n.id); g.append(s('path', { d: `M${a.x + 65} ${a.y + 36} V${(a.y + b.y) / 2 + 18} H${b.x + 65} V${b.y}`, class: 'sd-link' })); }
  for (const n of Object.values(doc.nodes)) { const p = pos.get(n.id); if (!p) continue; const selc = sel(doc).node === n.id;
    g.append(s('g', { class: 'sd-node k-' + n.kind + (selc ? ' sel' : ''), transform: `translate(${p.x},${p.y})`, onclick: () => { sel(doc).node = n.id; refresh(); } }, s('rect', { width: 130, height: 36, rx: 7 }), s('text', { x: 65, y: 15, 'text-anchor': 'middle', class: 'sd-k' }, (n.processNo ? n.processNo + ' · ' : '') + (n.m4 ? t(n.m4) : kindLabel(n.kind))), s('text', { x: 65, y: 29, 'text-anchor': 'middle' }, n.name.length > 20 ? n.name.slice(0, 19) + '…' : n.name))); }
  return h('div', { class: 'scroll-x' }, g);
}

// ---------------- Step 3: functions ----------------
function renderFunctions(body, doc) {
  const S0 = sel(doc); const n = doc.nodes[S0.node]; const parent = n.parent ? doc.nodes[n.parent] : null;
  const parentFns = parent ? M.functionsOf(doc, parent.id) : [];
  const list = h('div', { class: 'stack' });
  for (const f of M.functionsOf(doc, n.id)) {
    const chars = h('table', { class: 'grid small' }, h('tr', {}, h('th', {}, t('Characteristic')), h('th', {}, t('Specification / tolerance')), h('th', {}, t('Class')), h('th', {}, t('Type')), h('th', {})),
      f.chars.map((c) => h('tr', {}, h('td', {}, input(c.name, (v) => { c.name = v; commit('c', { render: false }); })), h('td', {}, input(c.spec, (v) => { c.spec = v; commit('c', { render: false }); })),
        h('td', {}, select(c.cls, M.CHAR_CLASSES.map((x) => [x, x || '—']), (v) => { c.cls = v; commit('c'); }, { title: t('CC = critical, SC = significant, HI = high impact') })),
        h('td', {}, select(c.kind, [['product', t('product')], ['process', t('process')]], (v) => { c.kind = v; commit('c', { render: false }); })),
        h('td', {}, h('button', { class: 'btn small danger', onclick: () => { f.chars = f.chars.filter((x) => x !== c); commit('rmc'); } }, '×')))));
    const supports = parentFns.length ? h('div', { class: 'chips' }, t('Supports') + ':', parentFns.map((pf) => h('label', { class: 'chip' + ((f.supports || []).includes(pf.id) ? ' on' : '') }, h('input', { type: 'checkbox', checked: (f.supports || []).includes(pf.id), onchange: (e) => { if (e.target.checked) M.linkFunction(doc, f.id, pf.id); else f.supports = f.supports.filter((x) => x !== pf.id); commit('sup'); } }), pf.text))) : null;
    list.append(h('div', { class: 'panel fn-card' }, h('div', { class: 'fgrid' }, field(t('Function (verb + noun)'), input(f.text, (v) => { f.text = v; commit('fn'); })), field(t('Requirement'), input(f.req, (v) => { f.req = v; commit('fn', { render: false }); }))),
      supports, h('div', { style: { marginTop: '8px' } }, chars), h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'btn small', onclick: () => { M.addChar(doc, f.id, t('New characteristic')); commit('addc'); } }, '+ ' + t('Characteristic')),
        h('button', { class: 'btn small danger', onclick: async () => { if (await confirmBox(t('Delete'), t('Delete this function and its failures?'))) { M.removeFunction(doc, f.id); commit('rmf'); } } }, t('Delete function')))));
  }
  body.append(h('div', { class: 'grid-tree' }, treePanel(doc), h('div', { class: 'stack' },
    h('div', { class: 'panel' }, h('h3', {}, t('Functions of') + ' ' + n.name, h('button', { class: 'btn primary small', onclick: async () => { const x = await ask(t('New function'), t('Function (verb + noun)'), ''); if (x) { M.addFunction(doc, n.id, x); commit('addf'); } } }, '+ ' + t('Function'))),
      M.functionsOf(doc, n.id).length ? null : h('p', { class: 'hint' }, t('No functions yet. Describe what this element must do, e.g. “Transmit torque to the impeller”.'))),
    list, h('div', { class: 'panel' }, h('h3', {}, t('Function network'), h('span', { class: 'hint' }, t('higher level ← focus → lower level'))), functionNet(doc, n)))));
}
function colNet(cols, links, { onDrop, onClick } = {}) {
  // generic 3-column network: cols = [{title, items:[{id,text,sub,cls}], drop}] ; links = [[fromId,toId]]
  const W = 250, gap = 90, rowH = 46; const maxN = Math.max(1, ...cols.map((c) => c.items.length)); const Ht = 40 + maxN * rowH;
  const g = s('svg', { class: 'net', viewBox: `0 0 ${cols.length * W + (cols.length - 1) * gap} ${Ht}`, width: '100%' }); const pos = {};
  cols.forEach((c, ci) => { const x = ci * (W + gap); g.append(s('text', { x: x + W / 2, y: 16, 'text-anchor': 'middle', class: 'net-h' }, c.title));
    if (c.drop) { const zone = s('rect', { x, y: 24, width: W, height: Ht - 26, rx: 10, class: 'dropzone', 'data-col': ci }); g.append(zone); }
    c.items.forEach((it, i) => { const y = 28 + i * rowH; pos[it.id] = { x, y, ci };
      const node = s('g', { class: 'net-node ' + (it.cls || ''), transform: `translate(${x},${y})`, onclick: () => onClick && onClick(it) }, s('rect', { width: W, height: 38, rx: 8 }), s('text', { x: 10, y: 16 }, it.text.length > 38 ? it.text.slice(0, 37) + '…' : it.text), it.sub ? s('text', { x: 10, y: 31, class: 'net-sub' }, it.sub) : null, s('title', {}, it.text));
      g.append(node); }); });
  for (const [a, b] of links) { const A = pos[a], B = pos[b]; if (!A || !B) continue; const [L, R] = A.ci < B.ci ? [A, B] : [B, A]; g.insertBefore(s('path', { d: `M${L.x + W} ${L.y + 19} C${L.x + W + gap / 2} ${L.y + 19} ${R.x - gap / 2} ${R.y + 19} ${R.x} ${R.y + 19}`, class: 'net-link' }), g.firstChild); }
  if (onDrop) { g.addEventListener('dragover', (e) => e.preventDefault()); g.addEventListener('drop', (e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/failure'); const pt = g.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const p = pt.matrixTransform(g.getScreenCTM().inverse()); const ci = Math.floor(p.x / (W + gap)); if (id) onDrop(id, ci); }); }
  return g;
}
function functionNet(doc, n) {
  const parent = n.parent ? doc.nodes[n.parent] : null; const mine = M.functionsOf(doc, n.id);
  const higher = parent ? M.functionsOf(doc, parent.id) : []; const lower = n.children.flatMap((c) => M.functionsOf(doc, c));
  const links = []; mine.forEach((f) => (f.supports || []).forEach((x) => links.push([f.id, x]))); lower.forEach((f) => (f.supports || []).forEach((x) => links.push([f.id, x])));
  const it = (f) => ({ id: f.id, text: f.text, sub: doc.nodes[f.node].name + (f.chars.length ? ' · ' + f.chars.map((c) => c.name).join(', ') : '') });
  return colNet([{ title: t('Next higher level'), items: higher.map(it) }, { title: t('Focus element'), items: mine.map((f) => ({ ...it(f), cls: 'focus' })) }, { title: t('Next lower level'), items: lower.map(it) }], links, { onClick: (x) => { const f = doc.functions[x.id]; if (f && f.node !== n.id) { sel(doc).node = f.node; refresh(); } } });
}

// ---------------- Step 4: failures (failure chains) ----------------
function renderFailures(body, doc) {
  const S0 = sel(doc); const n = doc.nodes[S0.node]; const fns = M.functionsOf(doc, n.id);
  const fms = Object.values(doc.failures).filter((x) => x.node === n.id);
  if (!S0.fm || !doc.failures[S0.fm] || doc.failures[S0.fm].node !== n.id) S0.fm = fms[0]?.id || null;
  const fmList = h('div', { class: 'panel' }, h('h3', {}, t('Failures of') + ' ' + n.name));
  if (!fns.length) fmList.append(h('p', { class: 'hint' }, t('Add a function first (step 3) — a failure is the loss or degradation of a function.')));
  for (const f of fns) {
    fmList.append(h('div', { class: 'fn-line' }, h('b', {}, f.text), h('button', { class: 'btn small', onclick: async () => { const x = await ask(t('New failure'), t('Failure (how the function fails)'), ''); if (x) { const fm = M.addFailure(doc, f.id, x); S0.fm = fm.id; commit('addfm'); } } }, '+ ' + t('Failure'))));
    for (const fm of fms.filter((x) => x.fn === f.id)) {
      const S = effSeverity(doc, fm);
      fmList.append(h('div', { class: 'fm-item' + (S0.fm === fm.id ? ' sel' : ''), draggable: 'true', ondragstart: (e) => e.dataTransfer.setData('text/failure', fm.id), onclick: () => { S0.fm = fm.id; refresh(); } },
        h('span', { class: 'sev', title: t('Severity') }, S ?? '–'), h('span', { class: 'grow' }, fm.text), h('span', { class: 'hint' }, `${effectsOf(doc, fm).length} FE · ${causesOf(doc, fm).length} FC`), fm.link ? h('span', { class: 'linkic', title: t('Linked to DFMEA') }, '🔗') : null));
    }
  }
  const right = h('div', { class: 'stack' }, fmList);
  const fm = S0.fm && doc.failures[S0.fm];
  if (fm) right.append(chainEditor(doc, n, fm));
  body.append(h('div', { class: 'grid-tree' }, treePanel(doc), right));
}
function candidates(doc, n, dir) {
  // effects come from the next higher level (parent node), causes from the next lower level (children)
  const ids = dir === 'effect' ? (n.parent ? [n.parent] : []) : n.children;
  return Object.values(doc.failures).filter((x) => ids.includes(x.node));
}
// effects / causes of a failure, from both directions of the links (FM.effects / FM.causes and the inverse relations)
export function effectsOf(doc, fm) { const fwd = fm.effects.map((id) => doc.failures[id]).filter(Boolean); const inv = Object.values(doc.failures).filter((x) => x.causes.includes(fm.id) && !fm.effects.includes(x.id)); return [...fwd.map((x) => ({ x, inv: false })), ...inv.map((x) => ({ x, inv: true }))]; }
export function causesOf(doc, fm) { const fwd = fm.causes.map((id) => doc.failures[id]).filter(Boolean); const inv = Object.values(doc.failures).filter((x) => x.effects.includes(fm.id) && !fm.causes.includes(x.id)); return [...fwd.map((x) => ({ x, inv: false })), ...inv.map((x) => ({ x, inv: true }))]; }
export function effSeverity(doc, fm) { const s0 = M.severity(doc, fm.id); if (s0 != null) return s0; const v = effectsOf(doc, fm).map(({ x }) => M.severity(doc, x.id)).filter((v) => v != null); return v.length ? Math.max(...v) : null; }
function chainEditor(doc, n, fm) {
  const S0 = sel(doc); const parent = n.parent ? doc.nodes[n.parent] : null; const isTop = !parent;
  const effC = candidates(doc, n, 'effect'), cauC = candidates(doc, n, 'cause');
  const chip = (x, rm, extra) => h('span', { class: 'chip on' }, x.S != null ? h('span', { class: 'sev small' }, x.S) : null, x.text, h('span', { class: 'hint' }, ' · ' + doc.nodes[x.node].name), extra, h('button', { class: 'x', onclick: rm, title: t('Unlink') }, '×'));
  const pick = (list, on) => { const e = h('select', {}, h('option', { value: '' }, '— ' + t('link existing') + ' —'), list.map((x) => h('option', { value: x.id }, `${doc.nodes[x.node].name}: ${x.text}`))); e.addEventListener('change', () => e.value && on(e.value)); return e; };
  const sevSel = (x) => ratingPicker(doc, 'S', x.S, (v) => { x.S = v; commit('S'); }, { compact: true });
  const panel = h('div', { class: 'panel' }, h('h3', {}, t('Failure chain'), h('span', { class: 'hint' }, 'FE ← FM ← FC')),
    h('div', { class: 'fgrid' }, field(t('Failure mode (FM)'), input(fm.text, (v) => { fm.text = v; commit('fmt'); })),
      isTop || !effectsOf(doc, fm).length ? field(t('Severity of this failure (used when it has no effects)'), ratingPicker(doc, 'S', fm.S, (v) => { fm.S = v; commit('S'); })) : field(t('Severity (highest effect)'), h('b', {}, effSeverity(doc, fm) ?? '–')),
      doc.type === 'PFMEA' ? field(t('Related characteristic'), select(fm.char || '', [['', '—'], ...doc.functions[fm.fn].chars.map((c) => [c.id, c.name])], (v) => { fm.char = v || undefined; commit('char', { render: false }); })) : null),
    h('div', { class: 'chain-cols' },
      h('div', {}, h('h4', {}, t('Failure effects (FE)'), h('span', { class: 'hint' }, parent ? parent.name : t('top level'))), h('div', { class: 'chips col' }, effectsOf(doc, fm).map(({ x, inv }) => chip(x, () => { if (inv) M.unlinkCause(doc, x.id, fm.id); else M.unlinkEffect(doc, fm.id, x.id); commit('ue'); }, inv ? h('span', { class: 'hint inv', title: t('linked from the higher level (this failure is its cause)') }, '↖') : sevSel(x)))),
        parent ? h('div', { class: 'row' }, pick(effC.filter((x) => !effectsOf(doc, fm).some((e) => e.x === x)), (id) => { M.linkEffect(doc, fm.id, id); commit('le'); }), h('button', { class: 'btn small', onclick: () => newLinked(doc, parent, fm, 'effect') }, '+ ' + t('New effect'))) : h('p', { class: 'hint' }, t('Top-level failures are the effects on the end user / vehicle / plant; rate their severity directly.'))),
      h('div', {}, h('h4', {}, t('Failure causes (FC)'), h('span', { class: 'hint' }, n.children.length ? n.children.map((c) => doc.nodes[c].name).join(', ') : t('no sub-elements'))), h('div', { class: 'chips col' }, causesOf(doc, fm).map(({ x, inv }) => chip(x, () => { if (inv) M.unlinkEffect(doc, x.id, fm.id); else M.unlinkCause(doc, fm.id, x.id); commit('uc'); }, inv ? h('span', { class: 'hint inv', title: t('linked from the lower level (this failure is its effect)') }, '↙') : null))),
        n.children.length ? h('div', { class: 'row' }, pick(cauC.filter((x) => !causesOf(doc, fm).some((e) => e.x === x)), (id) => { M.linkCause(doc, fm.id, id); commit('lc'); }), h('button', { class: 'btn small', onclick: () => newLinked(doc, n, fm, 'cause') }, '+ ' + t('New cause'))) : h('p', { class: 'hint' }, t('Add sub-elements (step 2) to describe causes, e.g. 4M work elements in a PFMEA.')))),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn small danger', onclick: async () => { if (await confirmBox(t('Delete'), t('Delete this failure and its links?'))) { M.removeFailure(doc, fm.id); S0.fm = null; commit('rmfm'); } } }, t('Delete failure'))));
  const net = h('div', { class: 'panel' }, h('h3', {}, t('Failure network'), h('span', { class: 'hint' }, t('drag a failure from the lists onto the FE or FC column to link it'))),
    colNet([{ title: 'FE · ' + (parent ? parent.name : t('top level')), drop: !!parent, items: effectsOf(doc, fm).map(({ x }) => ({ id: x.id, text: x.text, sub: 'S ' + (effSeverity(doc, x) ?? '–') + ' · ' + doc.nodes[x.node].name, cls: 'fe' })) },
      { title: 'FM · ' + n.name, items: [{ id: fm.id, text: fm.text, sub: 'S ' + (effSeverity(doc, fm) ?? '–'), cls: 'fm' }] },
      { title: 'FC · ' + t('lower level'), drop: true, items: causesOf(doc, fm).map(({ x }) => ({ id: x.id, text: x.text, sub: doc.nodes[x.node].name + (doc.nodes[x.node].m4 ? ' · ' + t(doc.nodes[x.node].m4) : ''), cls: 'fc' })) }],
      [...effectsOf(doc, fm).map(({ x }) => [x.id, fm.id]), ...causesOf(doc, fm).map(({ x }) => [fm.id, x.id])],
      { onDrop: (id, ci) => { const x = doc.failures[id]; if (!x || id === fm.id) return; try { if (ci === 0 && effC.includes(x)) M.linkEffect(doc, fm.id, id); else if (ci === 2 && cauC.includes(x)) M.linkCause(doc, fm.id, id); else { toast(t('Effects must come from the next higher level, causes from the next lower level.'), 'error'); return; } commit('dnd'); } catch (e) { toast(e.message, 'error'); } } }),
    h('div', { class: 'palettes' }, h('div', {}, h('h4', {}, t('Higher-level failures')), effC.map((x) => h('div', { class: 'drag-chip fe', draggable: 'true', ondragstart: (e) => e.dataTransfer.setData('text/failure', x.id) }, x.text))),
      h('div', {}, h('h4', {}, t('Lower-level failures')), cauC.map((x) => h('div', { class: 'drag-chip fc', draggable: 'true', ondragstart: (e) => e.dataTransfer.setData('text/failure', x.id) }, x.text, h('span', { class: 'hint' }, ' · ' + doc.nodes[x.node].name))))));
  return h('div', { class: 'stack' }, panel, net);
}
async function newLinked(doc, nodeOrParent, fm, dir) {
  // effect: failure on a function of the parent node; cause: failure on a function of a chosen child element
  let targets = dir === 'effect' ? M.functionsOf(doc, nodeOrParent.id) : nodeOrParent.children.flatMap((c) => M.functionsOf(doc, c));
  const nodeSel = dir === 'cause' ? h('select', {}, nodeOrParent.children.map((c) => h('option', { value: c }, doc.nodes[c].name))) : null;
  const text = h('input', { type: 'text', style: { width: '100%' } });
  const r = await modal(dir === 'effect' ? t('New effect') : t('New cause'), h('div', { class: 'form' }, nodeSel ? [h('label', {}, t('Element')), nodeSel] : null, h('label', {}, dir === 'effect' ? t('Effect on the next higher level / end user') : t('Cause (what goes wrong in the lower-level element)')), text), [{ label: t('Create'), primary: true, value: () => ({ text: text.value.trim(), node: nodeSel?.value }) }]);
  if (!r || !r.text) return;
  const nodeId = dir === 'effect' ? nodeOrParent.id : r.node; targets = M.functionsOf(doc, nodeId);
  const fn = targets[0] || M.addFunction(doc, nodeId, dir === 'effect' ? t('Fulfil the function of') + ' ' + doc.nodes[nodeId].name : t('Perform as intended'));
  const x = M.addFailure(doc, fn.id, r.text); if (dir === 'effect') M.linkEffect(doc, fm.id, x.id); else M.linkCause(doc, fm.id, x.id); commit('newlinked');
}

// ---------------- rating picker with own-wording criteria ----------------
import { criterion } from '../core/fmea/ratings.js';
import { getLang } from './i18n.js';
export function ratingPicker(doc, letter, value, on, { compact = false, title } = {}) {
  const type = doc.type; const ov = store.project.settings.criteriaOverrides;
  const b = h('button', { class: 'rating r' + (value ?? 'x') + (compact ? ' compact' : ''), title: (title || letter) + (value ? ' ' + value + ': ' + criterion(getLang(), type, letter, value, ov) : ''), onclick: (e) => { e.stopPropagation(); open(); } }, value ?? '–');
  function open() {
    document.querySelectorAll('.pop').forEach((p) => p.remove());
    const rect = b.getBoundingClientRect(); const names = { S: t('Severity'), O: t('Occurrence'), D: t('Detection'), F: t('Frequency'), M: t('Monitoring') };
    const pop = h('div', { class: 'pop' }, h('div', { class: 'pop-h' }, names[letter] + ' (' + (type === 'MSR' && letter === 'S' ? 'DFMEA' : type) + ')'),
      Array.from({ length: 10 }, (_, i) => 10 - i).map((v) => h('div', { class: 'pop-row' + (v === value ? ' cur' : ''), onclick: () => { pop.remove(); on(v); } }, h('span', { class: 'rating r' + v }, v), h('span', {}, criterion(getLang(), type, letter, v, ov)))),
      h('div', { class: 'pop-row clear', onclick: () => { pop.remove(); on(null); } }, '— ' + t('clear')));
    document.body.append(pop); const W = 420; const left = Math.min(Math.max(8, rect.left - 40), window.innerWidth - W - 8); const top = rect.bottom + 4 + 380 > window.innerHeight ? Math.max(8, rect.top - 384) : rect.bottom + 4;
    Object.assign(pop.style, { left: left + 'px', top: top + 'px', width: W + 'px' });
    setTimeout(() => document.addEventListener('mousedown', function off(ev) { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('mousedown', off); } }), 0);
  }
  return b;
}
export { apBadge, q };
