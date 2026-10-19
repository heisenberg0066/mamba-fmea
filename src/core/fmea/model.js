// Mamba FMEA data model: project → FMEA documents (DFMEA / PFMEA / FMEA-MSR) following the 7-step method.
// Step 1 planning (doc.planning), 2 structure (doc.nodes tree), 3 functions (doc.functions + characteristics),
// 4 failures (doc.failures with effects/causes links = failure chains FE–FM–FC), 5 risk (doc.risks keyed FM|FC),
// 6 optimisation (doc.actions + post ratings on risks), 7 results (revisions, approval, reports).
import { evaluate, rpn } from './ap.js';

let _seq = 0;
export function uid(prefix = 'x') { _seq = (_seq + 1) % 1e6; return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + _seq.toString(36); }
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const today = () => new Date().toISOString().slice(0, 10);

export const DOC_TYPES = ['DFMEA', 'PFMEA', 'MSR'];
export const KINDS = {
  DFMEA: ['system', 'subsystem', 'component', 'interface'],
  MSR: ['system', 'subsystem', 'component', 'interface'],
  PFMEA: ['item', 'step', 'element'],
};
export const FOUR_M = ['Man', 'Machine', 'Material', 'Method', 'Measurement', 'Environment'];
export const STEP_TYPES = ['operation', 'inspection', 'transport', 'storage', 'delay', 'combined'];
export const ACTION_STATUS = ['open', 'decision', 'implementation', 'completed', 'not-implemented'];
export const CHAR_CLASSES = ['', 'CC', 'SC', 'HI'];

export function newProject(name = 'Untitled project') {
  return { format: 'mamba-fmea', version: 1, id: uid('p'), name, created: new Date().toISOString(), modified: new Date().toISOString(), docs: [], networks: [], library: [], revisions: [], settings: { lang: 'en', rpnHigh: 200, rpnMedium: 100, criteriaOverrides: {} } };
}

export function newDoc(type = 'DFMEA', title, rootName) {
  const id = uid('d'); const root = uid('n');
  const rootKind = type === 'PFMEA' ? 'item' : 'system';
  return {
    id, type, title: title || `${type} ${today()}`, ratingMode: 'AP',
    planning: { company: '', location: '', customer: '', model: '', subject: rootName || '', fmeaId: '', startDate: today(), revisionDate: today(), responsible: '', confidentiality: 'Internal', team: [], intent: '', timing: '', task: '', tools: '', scope: '', boundaries: '', assumptions: '' },
    rootId: root,
    nodes: { [root]: { id: root, parent: null, children: [], name: rootName || (type === 'PFMEA' ? 'Process item' : 'System'), kind: rootKind } },
    functions: {}, failures: {}, risks: {}, actions: {},
    controlPlan: { phase: 'Production', number: '', overrides: {} },
    approval: null,
  };
}

// ---------- structure (step 2) ----------
export function addNode(doc, parentId, name, kind, extra = {}) {
  const p = doc.nodes[parentId]; if (!p) throw new Error('No parent ' + parentId);
  const id = uid('n'); const depth = nodeDepth(doc, parentId) + 1;
  if (!kind) kind = doc.type === 'PFMEA' ? (depth === 1 ? 'step' : 'element') : (depth === 1 ? 'subsystem' : 'component');
  const n = { id, parent: parentId, children: [], name, kind, ...extra };
  if (doc.type === 'PFMEA' && kind === 'step' && !n.processNo) n.processNo = String(10 * (p.children.filter((c) => doc.nodes[c].kind === 'step').length + 1));
  if (doc.type === 'PFMEA' && kind === 'step' && !n.stepType) n.stepType = 'operation';
  if (doc.type === 'PFMEA' && kind === 'element' && !n.m4) n.m4 = 'Machine';
  doc.nodes[id] = n; p.children.push(id); return n;
}
export function nodeDepth(doc, id) { let d = 0; let n = doc.nodes[id]; while (n && n.parent) { d++; n = doc.nodes[n.parent]; } return d; }
export function isAncestor(doc, a, b) { let n = doc.nodes[b]; while (n) { if (n.id === a) return true; n = doc.nodes[n.parent]; } return false; }
/** Drag-drop: move node under newParent at index (reorder within same parent too). */
export function moveNode(doc, id, newParent, index = -1) {
  if (id === doc.rootId) throw new Error('Root cannot be moved');
  if (isAncestor(doc, id, newParent)) throw new Error('Cannot move a node into itself');
  const n = doc.nodes[id]; const old = doc.nodes[n.parent];
  const oi = old.children.indexOf(id); old.children.splice(oi, 1);
  const np = doc.nodes[newParent];
  if (index < 0 || index > np.children.length) index = np.children.length;
  np.children.splice(index, 0, id); n.parent = newParent; return n;
}
export function removeNode(doc, id) {
  if (id === doc.rootId) throw new Error('Root cannot be deleted');
  const n = doc.nodes[id]; [...n.children].forEach((c) => removeNode(doc, c));
  Object.values(doc.functions).filter((f) => f.node === id).forEach((f) => removeFunction(doc, f.id));
  const p = doc.nodes[n.parent]; p.children = p.children.filter((c) => c !== id); delete doc.nodes[id];
}
export function walk(doc, fn, id = doc.rootId, depth = 0) { const n = doc.nodes[id]; if (!n) return; fn(n, depth); n.children.forEach((c) => walk(doc, fn, c, depth + 1)); }
export function nodeList(doc) { const out = []; walk(doc, (n, d) => out.push({ node: n, depth: d })); return out; }

// ---------- functions & characteristics (step 3) ----------
export function addFunction(doc, nodeId, text, extra = {}) {
  if (!doc.nodes[nodeId]) throw new Error('No node');
  const f = { id: uid('f'), node: nodeId, text, req: '', chars: [], supports: [], ...extra }; doc.functions[f.id] = f; return f;
}
export function addChar(doc, fnId, name, extra = {}) {
  const f = doc.functions[fnId]; const c = { id: uid('c'), name, spec: '', cls: '', kind: doc.type === 'PFMEA' && doc.nodes[f.node].kind === 'element' ? 'process' : 'product', ...extra }; f.chars.push(c); return c;
}
export function removeFunction(doc, fnId) {
  Object.values(doc.failures).filter((x) => x.fn === fnId).forEach((x) => removeFailure(doc, x.id));
  Object.values(doc.functions).forEach((f) => { f.supports = (f.supports || []).filter((s) => s !== fnId); });
  delete doc.functions[fnId];
}
export function linkFunction(doc, lowerFn, higherFn) { const f = doc.functions[lowerFn]; f.supports = f.supports || []; if (!f.supports.includes(higherFn)) f.supports.push(higherFn); }
export function functionsOf(doc, nodeId) { return Object.values(doc.functions).filter((f) => f.node === nodeId); }
export function findChar(doc, charId) { for (const f of Object.values(doc.functions)) { const c = f.chars.find((x) => x.id === charId); if (c) return { fn: f, char: c }; } return null; }

// ---------- failures & failure chains (step 4) ----------
export function addFailure(doc, fnId, text, extra = {}) {
  const f = doc.functions[fnId]; if (!f) throw new Error('No function');
  const x = { id: uid('e'), fn: fnId, node: f.node, text, S: null, effects: [], causes: [], ...extra }; doc.failures[x.id] = x; return x;
}
export function removeFailure(doc, id) {
  for (const f of Object.values(doc.failures)) { f.effects = f.effects.filter((e) => e !== id); f.causes = f.causes.filter((c) => c !== id); }
  for (const k of Object.keys(doc.risks)) { const [fm, fc] = k.split('|'); if (fm === id || fc === id) removeRisk(doc, k); }
  delete doc.failures[id];
}
function removeRisk(doc, key) { Object.values(doc.actions).filter((a) => a.risk === key).forEach((a) => delete doc.actions[a.id]); delete doc.risks[key]; }
/** FE (effect) of FM. Also links the related functions in the function network. */
export function linkEffect(doc, fmId, feId) {
  if (fmId === feId) throw new Error('A failure cannot be its own effect');
  const fm = doc.failures[fmId]; if (!fm.effects.includes(feId)) fm.effects.push(feId);
  linkFunction(doc, fm.fn, doc.failures[feId].fn);
}
export function linkCause(doc, fmId, fcId) {
  if (fmId === fcId) throw new Error('A failure cannot be its own cause');
  const fm = doc.failures[fmId]; if (!fm.causes.includes(fcId)) fm.causes.push(fcId);
  linkFunction(doc, doc.failures[fcId].fn, fm.fn);
  const k = riskKey(fmId, fcId); if (!doc.risks[k]) doc.risks[k] = newRisk(doc);
}
export function unlinkEffect(doc, fmId, feId) { const fm = doc.failures[fmId]; fm.effects = fm.effects.filter((e) => e !== feId); }
export function unlinkCause(doc, fmId, fcId) { const fm = doc.failures[fmId]; fm.causes = fm.causes.filter((e) => e !== fcId); removeRisk(doc, riskKey(fmId, fcId)); }
export const riskKey = (fm, fc) => `${fm}|${fc || ''}`;
function newRisk(doc) { return doc.type === 'MSR' ? { F: null, M: null, rationale: '', monitoring: '', response: '', mitigated: '', sMitigated: null, pc: '', remarks: '', filter: '', post: {} } : { O: null, D: null, pc: '', dc: '', remarks: '', filter: '', post: {} }; }
export function getRisk(doc, fm, fc) { const k = riskKey(fm, fc); if (!doc.risks[k]) doc.risks[k] = newRisk(doc); return doc.risks[k]; }

/** Severity of a failure mode = highest severity of its effects (or its own S when it has no effects). */
export function severity(doc, fmId, seen = new Set()) {
  const fm = doc.failures[fmId]; if (!fm || seen.has(fmId)) return null; seen.add(fmId);
  let s = null;
  for (const e of fm.effects) { const fe = doc.failures[e]; if (!fe) continue; const v = fe.S != null ? fe.S : severity(doc, e, seen); if (v != null && (s == null || v > s)) s = v; }
  if (s == null) s = fm.S ?? null;
  return s;
}

/** Failure-chain rows (used by risk analysis, optimisation, form view, reports). */
export function rows(doc, opts = {}) {
  const out = []; const usedAsCause = new Set(), usedAsEffect = new Set(); Object.values(doc.failures).forEach((f) => { f.causes.forEach((c) => usedAsCause.add(c)); f.effects.forEach((e) => usedAsEffect.add(e)); });
  const settings = opts.settings || {};
  const order = nodeList(doc);
  for (const { node, depth } of order) {
    for (const fn of functionsOf(doc, node.id)) {
      for (const fm of Object.values(doc.failures).filter((x) => x.fn === fn.id)) {
        // pure causes (lowest level) and pure effects (top level) are not failure modes of their own row
        if (!fm.causes.length && !fm.effects.length && (usedAsCause.has(fm.id) || usedAsEffect.has(fm.id))) continue;
        const causes = fm.causes.length ? fm.causes : [''];
        for (const fcId of causes) {
          const fc = fcId ? doc.failures[fcId] : null; const r = getRisk(doc, fm.id, fcId);
          const S = severity(doc, fm.id);
          const ev = evaluate({ type: doc.type, mode: doc.ratingMode, S, O: r.O, D: r.D, F: r.F, M: r.M, sMitigated: r.sMitigated, rpnHigh: settings.rpnHigh, rpnMedium: settings.rpnMedium });
          const post = r.post || {};
          const S2 = post.S ?? S;
          const ev2 = (post.O || post.D || post.F || post.M || post.S) ? evaluate({ type: doc.type, mode: doc.ratingMode, S: S2, O: post.O ?? r.O, D: post.D ?? r.D, F: post.F ?? r.F, M: post.M ?? r.M, sMitigated: r.sMitigated, rpnHigh: settings.rpnHigh, rpnMedium: settings.rpnMedium }) : null;
          const parentNode = node.parent ? doc.nodes[node.parent] : null;
          out.push({
            key: riskKey(fm.id, fcId), node, depth, parentNode, childNode: fc ? doc.nodes[fc.node] : null,
            fn, fnHigher: [...new Set(fm.effects.map((e) => doc.failures[e] && doc.failures[e].fn))].filter(Boolean).map((id) => doc.functions[id]),
            fnLower: fc ? doc.functions[fc.fn] : null,
            fm, fc, fe: fm.effects.map((e) => doc.failures[e]).filter(Boolean), risk: r, S, ...ev,
            post: ev2 ? { S: S2, O: post.O ?? r.O, D: post.D ?? r.D, F: post.F ?? r.F, M: post.M ?? r.M, ...ev2 } : null,
            actions: Object.values(doc.actions).filter((a) => a.risk === riskKey(fm.id, fcId)),
            special: fn.chars.map((c) => c.cls).filter(Boolean).join(' '),
          });
        }
      }
    }
  }
  return out;
}

// ---------- optimisation (step 6) ----------
export function addAction(doc, key, fields = {}) {
  const a = { id: uid('a'), risk: key, kind: doc.type === 'MSR' ? 'monitoring' : 'prevention', text: '', owner: '', due: '', status: 'open', taken: '', evidence: '', completed: '', ...fields };
  doc.actions[a.id] = a; return a;
}
export function setPost(doc, key, ratings) { const r = doc.risks[key]; r.post = { ...(r.post || {}), ...ratings }; return r; }
export function isOverdue(a, now = today()) { return a.due && a.status !== 'completed' && a.status !== 'not-implemented' && a.due < now; }

// ---------- results (step 7): consistency checks ----------
export function checks(doc) {
  const out = []; const rs = rows(doc);
  for (const n of Object.values(doc.nodes)) if (!functionsOf(doc, n.id).length) out.push({ level: 'info', code: 'node-no-function', id: n.id, text: n.name });
  for (const f of Object.values(doc.failures)) {
    const isTop = !doc.nodes[f.node].parent;
    if (!f.effects.length && !isTop && f.S == null && !Object.values(doc.failures).some((x) => x.causes.includes(f.id))) out.push({ level: 'warn', code: 'fm-no-effect', id: f.id, text: f.text });
  }
  for (const r of rs) {
    if (r.S == null) out.push({ level: 'warn', code: 'no-severity', id: r.key, text: r.fm.text });
    if (doc.type === 'MSR' ? (r.risk.F == null || r.risk.M == null) : (r.risk.O == null || r.risk.D == null)) out.push({ level: 'warn', code: 'not-rated', id: r.key, text: r.fm.text + (r.fc ? ' ← ' + r.fc.text : '') });
    if (!r.fc) out.push({ level: 'info', code: 'fm-no-cause', id: r.key, text: r.fm.text });
    if (r.level === 'H' && !r.actions.length && !r.risk.remarks) out.push({ level: 'error', code: 'high-no-action', id: r.key, text: r.fm.text + (r.fc ? ' ← ' + r.fc.text : '') });
    if (r.S >= 9 && (r.level === 'H' || r.level === 'M') && !r.risk.mgmtReview) out.push({ level: 'info', code: 'mgmt-review', id: r.key, text: r.fm.text });
  }
  for (const a of Object.values(doc.actions)) if (isOverdue(a)) out.push({ level: 'warn', code: 'overdue', id: a.id, text: a.text });
  return out;
}

// ---------- statistics / dashboard ----------
export function stats(doc, settings) {
  const rs = rows(doc, { settings });
  const dist = { H: 0, M: 0, L: 0, '': 0 }, distPost = { H: 0, M: 0, L: 0, '': 0 };
  rs.forEach((r) => { dist[r.level || '']++; distPost[(r.post ? r.post.level : r.level) || '']++; });
  const acts = Object.values(doc.actions);
  const byStatus = {}; ACTION_STATUS.forEach((s) => (byStatus[s] = 0)); acts.forEach((a) => (byStatus[a.status] = (byStatus[a.status] || 0) + 1));
  const byOwner = {}; acts.filter((a) => a.status !== 'completed' && a.status !== 'not-implemented').forEach((a) => (byOwner[a.owner || '—'] = (byOwner[a.owner || '—'] || 0) + 1));
  const overdue = acts.filter((a) => isOverdue(a)).length;
  // Pareto of failure modes by risk score (RPN, or AP-weighted severity when RPN cannot be formed)
  const fmScore = new Map();
  rs.forEach((r) => { const s = r.rpn || 0; const cur = fmScore.get(r.fm.id) || { fm: r.fm, score: 0, level: '' }; cur.score += s; if ('HML'.indexOf(r.level) >= 0 && (cur.level === '' || 'HML'.indexOf(r.level) < 'HML'.indexOf(cur.level))) cur.level = r.level; fmScore.set(r.fm.id, cur); });
  const pareto = [...fmScore.values()].sort((a, b) => b.score - a.score); const tot = pareto.reduce((s, x) => s + x.score, 0) || 1; let cum = 0;
  pareto.forEach((p) => { cum += p.score; p.cum = cum / tot; });
  const matrixSO = Array.from({ length: 10 }, () => Array(10).fill(0));
  rs.forEach((r) => { const o = doc.type === 'MSR' ? r.risk.F : r.risk.O; if (r.S && o) matrixSO[r.S - 1][o - 1]++; });
  return { rows: rs.length, dist, distPost, actions: acts.length, open: acts.filter((a) => a.status !== 'completed' && a.status !== 'not-implemented').length, overdue, byStatus, byOwner, pareto, matrixSO };
}

// ---------- severity / RPN helpers for UI ----------
export { rpn };
export function docSummary(doc) { return { id: doc.id, type: doc.type, title: doc.title, nodes: Object.keys(doc.nodes).length, functions: Object.keys(doc.functions).length, failures: Object.keys(doc.failures).length, actions: Object.keys(doc.actions).length }; }
