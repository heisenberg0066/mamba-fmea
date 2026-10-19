// Hydraulics → FMEA: pull a hydraulic component's failure modes (library) into an FMEA document,
// with severity / occurrence hints from the hydraulic results (e.g. low NPSH margin → cavitation).
import { LIBRARY, applyEntry } from '../fmea/library.js';
import { addNode, getRisk, nodeList } from '../fmea/model.js';

export function libraryEntryFor(link) {
  const hyd = link.type === 'pump' ? 'pump' : link.type === 'valve' ? (/check/.test(link.valve.kind) ? 'check' : 'valve') : link.type === 'pipe' ? 'pipe' : link.type;
  return LIBRARY.find((e) => e.hyd === hyd) || null;
}
export function nodeEntryFor(node) { return LIBRARY.find((e) => e.hyd === (node.type === 'nozzle' ? 'nozzle' : node.type === 'junction' ? 'fitting' : 'tank')) || null; }

/** Adds the component under `parentId` (default root) of `doc`. Returns {node, hints}. */
export function addComponentToFmea(doc, net, item, res, parentId) {
  const isLink = !!item.from; const entry = isLink ? libraryEntryFor(item) : nodeEntryFor(item); if (!entry) throw new Error('No library entry for this component');
  const parent = parentId || doc.rootId;
  const node = addNode(doc, parent, `${entry.name} ${item.label} (${net.name})`, doc.type === 'PFMEA' ? 'step' : undefined, { hyd: { net: net.id, id: item.id } });
  const created = applyEntry(doc, node.id, entry);
  const hints = [];
  const r = res && res.ok ? (isLink ? res.links[item.id] : res.nodes[item.id]) : null;
  if (r && item.type === 'pump' && Number.isFinite(r.npshMargin)) {
    const fm = created.failures.map((id) => doc.failures[id]).find((f) => /cavitation/i.test(f.text));
    if (fm) { const O = r.npshMargin < 0 ? 9 : r.npshMargin < 0.5 ? 7 : r.npshMargin < 1.5 ? 4 : 2; fm.causes.forEach((c) => { if (/npsh/i.test(doc.failures[c].text)) { const rk = getRisk(doc, fm.id, c); rk.O = O; rk.remarks = `From hydraulics: NPSH margin ${r.npshMargin.toFixed(2)} m at Q = ${(r.Q * 3600).toFixed(1)} m³/h`; } }); hints.push(`Occurrence ${O} suggested for cavitation (NPSH margin ${r.npshMargin.toFixed(2)} m)`); }
  }
  if (r && item.type === 'pipe' && Math.abs(r.V) > 3) hints.push(`High velocity ${Math.abs(r.V).toFixed(2)} m/s: erosion / water-hammer causes are relevant`);
  void nodeList;
  return { node, created, hints };
}
