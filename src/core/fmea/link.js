// DFMEA → PFMEA linking and PFMEA → Control Plan generation.
import { newDoc, addNode, addFunction, addChar, addFailure, linkEffect, linkCause, severity, functionsOf, nodeList, findChar, rows, clone } from './model.js';

/** Components = DFMEA leaf nodes (excluding the root). */
function components(d) { return nodeList(d).map((x) => x.node).filter((n) => n.parent && !n.children.length); }

/**
 * Create a PFMEA skeleton linked to a DFMEA:
 *  - one process step per DFMEA component ("Make / fit <component>") with an operator + machine work element,
 *  - product characteristics copied from the component's functions (with class CC/SC and spec) and linked back,
 *  - for each characteristic, a failure mode "<char> not to specification",
 *  - failure effects at process-item level linked to the DFMEA failure modes of that component (severity follows the DFMEA).
 */
export function pfmeaFromDfmea(dfmea, opts = {}) {
  const lang = opts.words || {};
  const W = { make: lang.make || 'Make / fit', item: lang.item || 'Manufacture and assemble', nos: lang.nos || 'not to specification', op: lang.op || 'Operator', mc: lang.mc || 'Equipment', fn: lang.fn || 'Produce', effect: lang.effect || 'Product', wrong: lang.wrong || 'set incorrectly', cause: lang.cause || 'Process parameter' };
  const root = dfmea.nodes[dfmea.rootId];
  const p = newDoc('PFMEA', opts.title || `PFMEA – ${root.name}`, `${W.item} ${root.name}`);
  p.links = { dfmea: dfmea.id };
  p.planning = { ...clone(dfmea.planning), subject: `${W.item} ${root.name}`, fmeaId: dfmea.planning.fmeaId ? dfmea.planning.fmeaId + '-P' : '' };
  const itemFn = addFunction(p, p.rootId, `${W.fn} ${root.name} ${opts.toDrawing || 'to drawing and specification'}`);
  const feByDfm = new Map();
  let opNo = 10;
  for (const comp of components(dfmea)) {
    const step = addNode(p, p.rootId, `${W.make} ${comp.name}`, 'step', { processNo: String(opNo), stepType: 'operation', link: { doc: dfmea.id, node: comp.id } }); opNo += 10;
    const man = addNode(p, step.id, W.op, 'element', { m4: 'Man' });
    const mc = addNode(p, step.id, `${W.mc} – ${comp.name}`, 'element', { m4: 'Machine' });
    const fns = functionsOf(dfmea, comp.id);
    const dfms = Object.values(dfmea.failures).filter((f) => f.node === comp.id);
    // failure effects at the process item, mirroring the DFMEA failure modes of this component
    const fes = dfms.map((dfm) => {
      if (feByDfm.has(dfm.id)) return feByDfm.get(dfm.id);
      const fe = addFailure(p, itemFn.id, `${W.effect}: ${dfm.text} (${comp.name})`, { S: severity(dfmea, dfm.id), link: { doc: dfmea.id, failure: dfm.id } });
      feByDfm.set(dfm.id, fe); return fe;
    });
    const chars = fns.flatMap((f) => f.chars.map((c) => ({ f, c })));
    const stepFn = addFunction(p, step.id, `${W.fn} ${comp.name}${chars.length ? ' – ' + chars.map((x) => x.c.name).join(', ') : ''}`);
    const mcFn = addFunction(p, mc.id, `${W.cause} ${opts.provide || 'provides the right setting'}`);
    const manFn = addFunction(p, man.id, opts.operate || 'Load part and operate the equipment as instructed');
    const list = chars.length ? chars : [{ f: fns[0] || null, c: null }];
    for (const { c } of list) {
      let pc = null;
      if (c) pc = addChar(p, stepFn.id, c.name, { spec: c.spec || '', cls: c.cls || '', kind: 'product', link: { doc: dfmea.id, char: c.id } });
      const fm = addFailure(p, stepFn.id, `${c ? c.name : comp.name} ${W.nos}`, { char: pc ? pc.id : null });
      fes.forEach((fe) => linkEffect(p, fm.id, fe.id));
      const fc1 = addFailure(p, mcFn.id, `${c ? c.name : comp.name}: ${W.cause} ${W.wrong}`);
      const fc2 = addFailure(p, manFn.id, `${opts.opError || 'Operator error'}: ${c ? c.name : comp.name}`);
      linkCause(p, fm.id, fc1.id); linkCause(p, fm.id, fc2.id);
      if (c) addChar(p, mcFn.id, `${c.name} – ${opts.param || 'process parameter'}`, { kind: 'process', cls: c.cls || '' });
    }
  }
  return p;
}

/** Re-sync severities, texts of linked effects and special-characteristic classes from the DFMEA(s). Returns change list. */
export function syncLinks(project) {
  const byId = new Map(project.docs.map((d) => [d.id, d])); const changes = [];
  for (const p of project.docs.filter((d) => d.type === 'PFMEA')) {
    for (const fe of Object.values(p.failures)) {
      if (!fe.link || !fe.link.failure) continue; const d = byId.get(fe.link.doc); if (!d) { fe.link.broken = true; continue; }
      const src = d.failures[fe.link.failure]; if (!src) { if (!fe.link.broken) changes.push({ doc: p.id, id: fe.id, field: 'link', to: 'broken' }); fe.link.broken = true; continue; }
      delete fe.link.broken;
      const s = severity(d, src.id); if (s != null && s !== fe.S) { changes.push({ doc: p.id, id: fe.id, field: 'S', from: fe.S, to: s }); fe.S = s; }
    }
    for (const fn of Object.values(p.functions)) for (const c of fn.chars) {
      if (!c.link || !c.link.char) continue; const d = byId.get(c.link.doc); if (!d) continue; const src = findChar(d, c.link.char); if (!src) { c.link.broken = true; continue; }
      delete c.link.broken;
      if ((src.char.cls || '') !== (c.cls || '')) { changes.push({ doc: p.id, id: c.id, field: 'cls', from: c.cls, to: src.char.cls }); c.cls = src.char.cls || ''; }
      if ((src.char.spec || '') !== (c.spec || '')) { changes.push({ doc: p.id, id: c.id, field: 'spec', from: c.spec, to: src.char.spec }); c.spec = src.char.spec || ''; }
      if (src.char.name !== c.name) { changes.push({ doc: p.id, id: c.id, field: 'name', from: c.name, to: src.char.name }); c.name = src.char.name; }
    }
  }
  return changes;
}

/** Link an existing PFMEA failure effect to a DFMEA failure (severity then follows the DFMEA). */
export function linkToDfmea(pfmea, feId, dfmea, dfmId) { const fe = pfmea.failures[feId]; fe.link = { doc: dfmea.id, failure: dfmId }; fe.S = severity(dfmea, dfmId); return fe; }

/** Control plan rows generated from a PFMEA. User edits are kept in doc.controlPlan.overrides[charId]. */
export function controlPlan(doc) {
  if (doc.type !== 'PFMEA') return [];
  const rs = rows(doc); const ov = (doc.controlPlan && doc.controlPlan.overrides) || {}; const out = []; let n = 0;
  const steps = nodeList(doc).filter((x) => x.depth === 1).map((x) => x.node);
  for (const step of steps) {
    const elements = step.children.map((c) => doc.nodes[c]);
    const machines = elements.filter((e) => e.m4 === 'Machine' || e.m4 === 'Measurement').map((e) => e.name).join(', ');
    const scopeNodes = [step.id, ...step.children];
    const chars = [];
    for (const nid of scopeNodes) for (const fn of functionsOf(doc, nid)) for (const c of fn.chars) chars.push({ fn, c });
    for (const { fn, c } of chars) {
      // rows whose failure mode relates to this characteristic (explicit char link, or the same function)
      const rel = rs.filter((r) => r.fm.char === c.id || (!r.fm.char && r.fm.fn === fn.id) || (r.fc && r.fc.fn === fn.id));
      const uniq = (a) => [...new Set(a.filter(Boolean))].join('; ');
      const o = ov[c.id] || {};
      n++;
      out.push({
        key: c.id, processNo: step.processNo || '', step: step.name, machine: o.machine ?? machines, charNo: o.charNo ?? String(n),
        product: c.kind === 'product' ? c.name : '', process: c.kind === 'process' ? c.name : '', cls: c.cls || '', spec: o.spec ?? (c.spec || ''),
        measurement: o.measurement ?? uniq(rel.map((r) => r.risk.dc)), sample: o.sample ?? (c.cls ? '5' : '1'), frequency: o.frequency ?? (c.cls ? (o.freqDefault || 'Every hour') : 'Start of shift'),
        method: o.method ?? uniq(rel.map((r) => r.risk.pc)), reaction: o.reaction ?? 'Stop, contain and segregate suspect parts; correct the process; notify the team leader',
        risk: rel.reduce((m, r) => ('HML'.indexOf(r.level) >= 0 && (m === '' || 'HML'.indexOf(r.level) < 'HML'.indexOf(m)) ? r.level : m), ''),
      });
    }
  }
  return out;
}
