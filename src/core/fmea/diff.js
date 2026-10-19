// Revision snapshots and structured diff between two FMEA document states.
import { clone } from './model.js';

const FIELDS = {
  node: ['name', 'kind', 'parent', 'processNo', 'stepType', 'm4'],
  function: ['text', 'req', 'chars'],
  failure: ['text', 'S', 'effects', 'causes'],
  risk: ['O', 'D', 'F', 'M', 'pc', 'dc', 'monitoring', 'response', 'sMitigated', 'remarks', 'filter', 'post'],
  action: ['text', 'kind', 'owner', 'due', 'status', 'taken', 'evidence', 'completed'],
};
const COLL = { node: 'nodes', function: 'functions', failure: 'failures', risk: 'risks', action: 'actions' };
const norm = (v) => (v === undefined || v === '' ? null : v);
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const show = (v) => (v == null ? '' : Array.isArray(v) ? (v.length && typeof v[0] === 'object' ? v.map((c) => c.name + (c.cls ? ` [${c.cls}]` : '')).join(', ') : v.length + ' item(s)') : typeof v === 'object' ? Object.entries(v).filter(([, x]) => x != null).map(([k, x]) => `${k}=${x}`).join(' ') : String(v));

export function label(doc, kind, id) {
  if (!doc) return id;
  if (kind === 'node') return doc.nodes[id] && doc.nodes[id].name;
  if (kind === 'function') return doc.functions[id] && doc.functions[id].text;
  if (kind === 'failure') return doc.failures[id] && doc.failures[id].text;
  if (kind === 'action') return doc.actions[id] && doc.actions[id].text;
  if (kind === 'risk') { const [fm, fc] = id.split('|'); return (doc.failures[fm] ? doc.failures[fm].text : '?') + (fc ? ' ← ' + (doc.failures[fc] ? doc.failures[fc].text : '?') : ''); }
  return id;
}

/** diff(a, b): changes going from state a (older) to b (newer). */
export function diff(a, b) {
  const out = [];
  for (const [kind, coll] of Object.entries(COLL)) {
    const A = (a && a[coll]) || {}, B = (b && b[coll]) || {};
    for (const id of Object.keys(B)) {
      if (!A[id]) { if (kind === 'risk' && isEmptyRisk(B[id])) continue; out.push({ kind, id, op: 'added', label: label(b, kind, id) }); continue; }
      const fields = [];
      for (const f of FIELDS[kind]) if (!same(A[id][f], B[id][f])) fields.push({ field: f, from: show(A[id][f]), to: show(B[id][f]) });
      if (fields.length) out.push({ kind, id, op: 'changed', label: label(b, kind, id), fields });
    }
    for (const id of Object.keys(A)) if (!B[id]) { if (kind === 'risk' && isEmptyRisk(A[id])) continue; out.push({ kind, id, op: 'removed', label: label(a, kind, id) }); }
  }
  const pf = []; const PA = (a && a.planning) || {}, PB = (b && b.planning) || {};
  for (const k of new Set([...Object.keys(PA), ...Object.keys(PB)])) if (!same(PA[k], PB[k])) pf.push({ field: k, from: show(PA[k]), to: show(PB[k]) });
  if (pf.length) out.push({ kind: 'planning', id: 'planning', op: 'changed', label: 'Planning', fields: pf });
  if (a && b && a.ratingMode !== b.ratingMode) out.push({ kind: 'settings', id: 'ratingMode', op: 'changed', label: 'Rating mode', fields: [{ field: 'ratingMode', from: a.ratingMode, to: b.ratingMode }] });
  return out;
}
function isEmptyRisk(r) { return !r || (['O', 'D', 'F', 'M', 'pc', 'dc', 'remarks'].every((k) => r[k] == null || r[k] === '') && (!r.post || !Object.keys(r.post).length)); }

export function summarize(changes) { const s = { added: 0, removed: 0, changed: 0 }; changes.forEach((c) => s[c.op]++); return s; }

/** Create a revision entry for a document. */
export function snapshot(project, doc, { label: lab = '', author = '', note = '', approve = false } = {}) {
  const prev = project.revisions.filter((r) => r.doc === doc.id);
  const rev = { id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), doc: doc.id, n: prev.length + 1, label: lab || `Rev ${prev.length + 1}`, author, note, date: new Date().toISOString(), approved: approve ? { by: author, date: new Date().toISOString().slice(0, 10) } : null, state: clone({ ...doc, approval: undefined }) };
  project.revisions.push(rev); if (approve) doc.approval = { by: author, date: rev.approved.date, rev: rev.n };
  return rev;
}
