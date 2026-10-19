// Excel export / import of the FMEA form (exceljs). Runs in Node / the Electron main process.
// Export writes one AIAG-VDA-style form sheet per document (+ actions, control plan) and a hidden
// "mamba-json" sheet for a lossless round trip. Import reads that sheet when present, otherwise it maps
// the columns of a foreign / classic (RPN) FMEA form by their headers.
import ExcelJS from 'exceljs';
import { rows, newDoc, addNode, addFunction, addFailure, linkCause, linkEffect, getRisk, addAction, addChar, newProject } from './model.js';
import { controlPlan } from './link.js';

export function formColumns(doc) {
  const msr = doc.type === 'MSR'; const pf = doc.type === 'PFMEA'; const rpnMode = doc.ratingMode === 'RPN';
  const c = [
    ['higher', pf ? 'Process item (next higher level)' : 'Next higher level', 22],
    ['focus', pf ? 'Process step (focus element)' : 'Focus element', 22],
    ['lower', pf ? 'Work element (4M) (next lower level)' : 'Next lower level', 22],
    ['fnHigher', pf ? 'Function of process item' : 'Next higher level function and requirement', 28],
    ['fnFocus', pf ? 'Process step function / product characteristic' : 'Focus element function and requirement', 28],
    ['fnLower', pf ? 'Work element function / process characteristic' : 'Next lower level function and characteristic', 28],
    ['fe', 'Failure effect (FE)', 30], ['S', 'Severity (S)', 6], ['fm', 'Failure mode (FM)', 30], ['fc', 'Failure cause (FC)', 30],
  ];
  if (msr) c.push(['rationale', 'Rationale for frequency', 24], ['F', 'Frequency (F)', 6], ['pc', 'Current diagnostic monitoring', 26], ['response', 'Current system response', 26], ['M', 'Monitoring (M)', 6], ['mitigated', 'Most severe effect after system response', 26], ['sMitigated', 'Severity of mitigated effect', 6]);
  else c.push(['pc', 'Current prevention control (PC)', 28], ['O', 'Occurrence (O)', 6], ['dc', 'Current detection control (DC)', 28], ['D', 'Detection (D)', 6]);
  c.push(['ap', 'Action priority (AP)', 6]);
  if (rpnMode) c.push(['rpn', 'RPN', 7]);
  c.push(['special', 'Special characteristic', 8], ['filter', 'Filter code', 8], ['actPrev', msr ? 'Action (reduce frequency / improve monitoring)' : 'Prevention action', 28], ['actDet', msr ? 'Further action' : 'Detection action', 28],
    ['owner', 'Responsible person', 16], ['due', 'Target completion date', 12], ['status', 'Status', 12], ['taken', 'Action taken with evidence', 26], ['completed', 'Completion date', 12]);
  if (msr) c.push(['S2', 'S (after)', 6], ['F2', 'F (after)', 6], ['M2', 'M (after)', 6]);
  else c.push(['S2', 'S (after)', 6], ['O2', 'O (after)', 6], ['D2', 'D (after)', 6]);
  c.push(['ap2', 'AP (after)', 6]); if (rpnMode) c.push(['rpn2', 'RPN (after)', 7]);
  c.push(['remarks', 'Remarks', 24]);
  return c.map(([key, header, width]) => ({ key, header, width }));
}

const fnText = (f) => (f ? f.text + (f.req ? ` – ${f.req}` : '') + (f.chars && f.chars.length ? ` [${f.chars.map((c) => c.name + (c.spec ? ' ' + c.spec : '')).join('; ')}]` : '') : '');
/** Flatten a document to form rows (array of plain objects keyed by column key). */
export function formRows(doc, settings) {
  const out = [];
  for (const r of rows(doc, { settings })) {
    const acts = r.actions.length ? r.actions : [null];
    acts.forEach((a, i) => {
      const lowerName = r.childNode ? (doc.type === 'PFMEA' && r.childNode.m4 ? `[${r.childNode.m4}] ` : '') + r.childNode.name : '';
      out.push({
        key: r.key, actionId: a ? a.id : null, first: i === 0,
        higher: r.parentNode ? r.parentNode.name : '', focus: r.node.name, lower: lowerName,
        fnHigher: r.fnHigher.map(fnText).join('\n'), fnFocus: fnText(r.fn), fnLower: fnText(r.fnLower),
        fe: r.fe.map((e) => e.text + (e.S != null ? ` (S${e.S})` : '')).join('\n'), S: r.S ?? '', fm: r.fm.text, fc: r.fc ? r.fc.text : '',
        pc: doc.type === 'MSR' ? r.risk.monitoring || '' : r.risk.pc || '', dc: r.risk.dc || '', O: r.risk.O ?? '', D: r.risk.D ?? '', F: r.risk.F ?? '', M: r.risk.M ?? '',
        rationale: r.risk.rationale || '', response: r.risk.response || '', mitigated: r.risk.mitigated || '', sMitigated: r.risk.sMitigated ?? '',
        ap: r.ap, rpn: r.rpn || '', special: r.special, filter: r.risk.filter || '',
        actPrev: a && a.kind !== 'detection' ? a.text : '', actDet: a && a.kind === 'detection' ? a.text : '', owner: a ? a.owner : '', due: a ? a.due : '', status: a ? a.status : '', taken: a ? [a.taken, a.evidence].filter(Boolean).join(' – ') : '', completed: a ? a.completed : '',
        S2: r.post ? r.post.S ?? '' : '', O2: r.post ? r.post.O ?? '' : '', D2: r.post ? r.post.D ?? '' : '', F2: r.post ? r.post.F ?? '' : '', M2: r.post ? r.post.M ?? '' : '', ap2: r.post ? r.post.ap : '', rpn2: r.post ? r.post.rpn || '' : '',
        remarks: r.risk.remarks || '', level: r.level,
      });
    });
  }
  return out;
}

const AP_FILL = { H: 'FFF8D0D0', M: 'FFFFE9B3', L: 'FFD7F2DC' };
export async function exportWorkbook(project, file, opts = {}) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Mamba FMEA'; wb.created = new Date();
  const docs = opts.docIds ? project.docs.filter((d) => opts.docIds.includes(d.id)) : project.docs;
  for (const doc of docs) {
    const ws = wb.addWorksheet(safeName(`${doc.type} ${doc.title}`, wb), { views: [{ state: 'frozen', ySplit: 8, xSplit: 2 }], pageSetup: { orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    const cols = formColumns(doc); ws.columns = cols.map((c) => ({ key: c.key, width: c.width }));
    const P = doc.planning;
    const head = [[`${doc.type === 'MSR' ? 'FMEA-MSR' : doc.type}: ${doc.title}`], ['Company', P.company, 'Subject', P.subject, 'FMEA ID', P.fmeaId], ['Location', P.location, 'Start date', P.startDate, 'Responsible', P.responsible], ['Customer', P.customer, 'Revision date', P.revisionDate, 'Confidentiality', P.confidentiality], ['Model / programme', P.model, 'Team', (P.team || []).map((t) => t.name + (t.role ? ` (${t.role})` : '')).join(', '), 'Rating', doc.ratingMode === 'RPN' ? 'Classic RPN' : 'Action Priority (AIAG-VDA)'], ['Scope', P.scope]];
    head.forEach((h, i) => { const row = ws.getRow(i + 1); h.forEach((v, j) => (row.getCell(j * 2 + 1 - (i === 0 ? j : 0)).value = v ?? '')); });
    ws.getRow(1).font = { bold: true, size: 14 }; [2, 3, 4, 5, 6].forEach((r) => [1, 3, 5].forEach((c) => (ws.getRow(r).getCell(c).font = { bold: true })));
    const hr = ws.getRow(8); cols.forEach((c, i) => { const cell = hr.getCell(i + 1); cell.value = c.header; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF7A00' } }; cell.alignment = { wrapText: true, vertical: 'middle' }; });
    hr.height = 42;
    const fr = formRows(doc, project.settings);
    fr.forEach((r, i) => {
      const row = ws.getRow(9 + i); cols.forEach((c, j) => { const v = r[c.key]; row.getCell(j + 1).value = v === '' || v == null ? null : v; row.getCell(j + 1).alignment = { wrapText: true, vertical: 'top' }; });
      for (const k of ['ap', 'ap2']) { const j = cols.findIndex((c) => c.key === k); const v = r[k]; if (j >= 0 && AP_FILL[v]) row.getCell(j + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AP_FILL[v] } }; }
    });
    ws.autoFilter = { from: { row: 8, column: 1 }, to: { row: 8 + fr.length, column: cols.length } };
    if (doc.type === 'PFMEA') {
      const cp = controlPlan(doc); if (cp.length) {
        const cs = wb.addWorksheet(safeName(`Control plan ${doc.title}`, wb));
        const CC = [['processNo', 'Process no.', 9], ['step', 'Process step', 24], ['machine', 'Machine / device / tool', 22], ['charNo', 'Char. no.', 7], ['product', 'Product characteristic', 22], ['process', 'Process characteristic', 22], ['cls', 'Special class', 8], ['spec', 'Specification / tolerance', 18], ['measurement', 'Evaluation / measurement technique', 24], ['sample', 'Sample size', 8], ['frequency', 'Frequency', 12], ['method', 'Control method', 24], ['reaction', 'Reaction plan', 30]];
        cs.columns = CC.map(([key, header, width]) => ({ key, header, width })); cs.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; cs.getRow(1).eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF7A00' } }));
        cp.forEach((r) => cs.addRow(r));
      }
    }
  }
  const acts = wb.addWorksheet('Actions');
  acts.columns = [['doc', 'FMEA', 20], ['fm', 'Failure mode', 30], ['fc', 'Failure cause', 30], ['kind', 'Type', 11], ['text', 'Action', 34], ['owner', 'Responsible', 16], ['due', 'Target date', 12], ['status', 'Status', 14], ['taken', 'Action taken', 26], ['completed', 'Completed', 12]].map(([key, header, width]) => ({ key, header, width }));
  acts.getRow(1).font = { bold: true };
  for (const d of docs) for (const a of Object.values(d.actions)) { const [fm, fc] = a.risk.split('|'); acts.addRow({ doc: d.title, fm: d.failures[fm] ? d.failures[fm].text : '', fc: fc && d.failures[fc] ? d.failures[fc].text : '', kind: a.kind, text: a.text, owner: a.owner, due: a.due, status: a.status, taken: a.taken, completed: a.completed }); }
  const js = wb.addWorksheet('mamba-json', { state: 'veryHidden' });
  const json = JSON.stringify(project); for (let i = 0, r = 1; i < json.length; i += 30000, r++) js.getCell(r, 1).value = json.slice(i, i + 30000);
  await wb.xlsx.writeFile(file);
  return { file, sheets: wb.worksheets.length };
}
function safeName(n, wb) { let s = n.replace(/[\\/*?:[\]]/g, ' ').slice(0, 28); let k = 2; const base = s; while (wb.getWorksheet(s)) s = (base.slice(0, 25) + ' ' + k++); return s; }

// ---------------- import ----------------
const RULES = [
  ['fnHigher', /(next higher level function|higher.*function|function of process item)/],
  ['fnLower', /(next lower level function|lower.*function|work element function|process characteristic)/],
  ['fnFocus', /(focus element function|step function|^item\s*\/\s*function|^function|function and requirement|^requirement)/],
  ['higher', /(next higher level|process item|^system)/],
  ['lower', /(next lower level|work element|^4m)/],
  ['focus', /(focus element|process step|^item$|^component|^element|^process function)/],
  ['fe', /effect/], ['fm', /failure mode|^mode/], ['fc', /cause|mechanism/],
  ['pc', /prevention.*control|controls.*prevention|current.*prevention|diagnostic monitoring/],
  ['dc', /detection.*control|controls.*detection|current.*detection/],
  ['S2', /(new|after|revised|resulting).*(sev|^s\b|\bs\))|^s'|^s \(after|^s\s*neu/], ['O2', /(new|after|revised|resulting).*(occ|\bo\))|^o'|^o \(after/], ['D2', /(new|after|revised|resulting).*(det|\bd\))|^d'|^d \(after/],
  ['F2', /^f \(after|^f'/], ['M2', /^m \(after|^m'/],
  ['S', /^sev|severity|^s$|\(s\)$/], ['O', /^occ|occurrence|^o$|\(o\)$/], ['D', /^det|detection|^d$|\(d\)$/], ['F', /frequency|^f$/], ['M', /^monitoring|^m$/],
  ['rpn2', /rpn.*(after|new|revised)|(new|revised).*rpn/], ['rpn', /rpn|risk priority/],
  ['ap2', /ap.*after|(new|revised).*ap\b/], ['ap', /action priority|^ap$/],
  ['actPrev', /recommended action|prevention action|^action[s]?$|optimi/], ['actDet', /detection action/],
  ['owner', /responsib|owner/], ['due', /target|due/], ['status', /status/], ['taken', /action[s]? taken|evidence/], ['completed', /completion|completed/],
  ['special', /special|class/], ['remarks', /remark|comment|note/], ['response', /system response/], ['rationale', /rationale/],
];
export function mapHeaders(headers) {
  const map = {}; const used = new Set();
  headers.forEach((h, i) => {
    const t = String(h || '').toLowerCase().replace(/\s+/g, ' ').trim(); if (!t) return;
    for (const [key, re] of RULES) { if (used.has(key)) continue; if (re.test(t)) { if (key === 'D' && /control/.test(t)) continue; if (key === 'S' && /special/.test(t)) continue; map[i] = key; used.add(key); break; } }
  });
  return map;
}
const num = (v) => { const n = parseInt(String(v ?? '').trim(), 10); return n >= 1 && n <= 10 ? n : null; };
const cellText = (v) => { if (v == null) return ''; if (typeof v === 'object') { if (v.richText) return v.richText.map((x) => x.text).join(''); if (v.text) return String(v.text); if (v.result != null) return String(v.result); if (v instanceof Date) return v.toISOString().slice(0, 10); } return String(v).trim(); };

/** Import a workbook. Returns {project} (lossless) or {docs:[...]} parsed from form sheets. */
export async function importWorkbook(file, { type = 'DFMEA' } = {}) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
  const js = wb.getWorksheet('mamba-json');
  if (js) { let s = ''; js.eachRow((row) => (s += cellText(row.getCell(1).value))); try { const p = JSON.parse(s); if (p.format === 'mamba-fmea') return { project: p, lossless: true }; } catch (_) { /* fall back to form parsing */ } }
  const docs = [];
  wb.eachSheet((ws) => {
    if (/^actions$|control plan|mamba-json/i.test(ws.name)) return;
    // find header row: the first row in the top 15 with >= 4 recognised headers including a failure-mode column
    let hdrRow = 0, map = null;
    for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
      const vals = []; ws.getRow(r).eachCell({ includeEmpty: true }, (c, i) => (vals[i - 1] = cellText(c.value)));
      const m = mapHeaders(vals); const keys = Object.values(m);
      if (keys.length >= 4 && keys.includes('fm')) { hdrRow = r; map = m; break; }
    }
    if (!map) return;
    const t = /pfmea|process/i.test(ws.name) ? 'PFMEA' : /msr/i.test(ws.name) ? 'MSR' : type;
    const doc = parseForm(ws, hdrRow, map, t, ws.name); if (doc) docs.push(doc);
  });
  return { docs };
}

function parseForm(ws, hdrRow, map, type, name) {
  const doc = newDoc(type, name.replace(/^(DFMEA|PFMEA|MSR)\s*/i, '') || name);
  const keys = Object.values(map); doc.ratingMode = keys.includes('rpn') && !keys.includes('ap') ? 'RPN' : 'AP';
  const root = doc.nodes[doc.rootId]; let rootFn = null; const prev = {};
  const nodeByName = new Map(); const fnByKey = new Map(); const failByKey = new Map();
  const getNode = (nm, parent, kind) => { const k = parent + '>' + nm; if (!nodeByName.has(k)) nodeByName.set(k, addNode(doc, parent, nm, kind)); return nodeByName.get(k); };
  const getFn = (nodeId, text) => { const k = nodeId + '>' + text; if (!fnByKey.has(k)) fnByKey.set(k, addFunction(doc, nodeId, text)); return fnByKey.get(k); };
  const getFail = (fnId, text) => { const k = fnId + '>' + text; if (!failByKey.has(k)) failByKey.set(k, addFailure(doc, fnId, text)); return failByKey.get(k); };
  let count = 0;
  for (let r = hdrRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r); const v = {};
    for (const [i, key] of Object.entries(map)) v[key] = cellText(row.getCell(+i + 1).value);
    if (!Object.values(v).some(Boolean)) continue;
    // merged / blank cells inherit from the row above (typical in hand-made forms)
    for (const k of ['higher', 'focus', 'fnHigher', 'fnFocus', 'fe', 'S', 'fm']) { if (!v[k] && prev[k] && !(k === 'fe' && v.fm && v.fm !== prev.fm)) v[k] = prev[k]; }
    if (!v.fm) continue;
    Object.assign(prev, v);
    if (v.higher && !count && root.name !== v.higher) root.name = v.higher;
    const focus = getNode(v.focus || 'Item', doc.rootId);
    const fn = getFn(focus.id, v.fnFocus || `Function of ${focus.name}`);
    const fm = getFail(fn.id, v.fm);
    if (v.fe) for (const line of v.fe.split(/\n|;\s*/).map((s) => s.replace(/\s*\(S\d+\)\s*$/, '').trim()).filter(Boolean)) {
      if (!rootFn) rootFn = addFunction(doc, doc.rootId, v.fnHigher || `Function of ${root.name}`);
      const fe = getFail(rootFn.id, line); if (num(v.S) && (fe.S == null || num(v.S) > fe.S)) fe.S = num(v.S); linkEffect(doc, fm.id, fe.id);
    } else if (num(v.S)) fm.S = num(v.S);
    let fcId = '';
    if (v.fc) {
      let lowerName = v.lower || (type === 'PFMEA' ? 'Work element' : 'Cause element'); let m4 = null;
      const mm = lowerName.match(/^\[(\w+)\]\s*(.*)$/); if (mm) { m4 = mm[1]; lowerName = mm[2]; }
      const low = getNode(lowerName, focus.id, undefined); if (m4) low.m4 = m4;
      const lfn = getFn(low.id, v.fnLower || `${lowerName} function`);
      const fc = getFail(lfn.id, v.fc); linkCause(doc, fm.id, fc.id); fcId = fc.id;
    }
    const rk = getRisk(doc, fm.id, fcId);
    if (type === 'MSR') { if (num(v.F)) rk.F = num(v.F); if (num(v.M)) rk.M = num(v.M); if (v.pc) rk.monitoring = v.pc; if (v.response) rk.response = v.response; if (v.rationale) rk.rationale = v.rationale; }
    else { if (num(v.O)) rk.O = num(v.O); if (num(v.D)) rk.D = num(v.D); if (v.pc) rk.pc = v.pc; if (v.dc) rk.dc = v.dc; }
    if (v.remarks) rk.remarks = v.remarks; if (v.filter) rk.filter = v.filter;
    const post = {}; ['S2', 'O2', 'D2', 'F2', 'M2'].forEach((k) => { if (num(v[k])) post[k[0]] = num(v[k]); }); if (Object.keys(post).length) rk.post = post;
    if (v.actPrev || v.actDet) {
      const key = fm.id + '|' + fcId; let owner = v.owner || ''; let due = v.due || '';
      const md = owner.match(/(\d{4}-\d{2}-\d{2})/); if (!due && md) { due = md[1]; owner = owner.replace(md[1], '').replace(/[,;/\s]+$/, '').trim(); }
      const st = (v.status || '').toLowerCase(); const status = /complet|done|closed/.test(st) ? 'completed' : /decision/.test(st) ? 'decision' : /implement/.test(st) && !/not/.test(st) ? 'implementation' : /not/.test(st) ? 'not-implemented' : (v.taken ? 'completed' : 'open');
      if (v.actPrev) addAction(doc, key, { kind: 'prevention', text: v.actPrev, owner, due, status, taken: v.taken || '', completed: v.completed || '' });
      if (v.actDet) addAction(doc, key, { kind: 'detection', text: v.actDet, owner, due, status, taken: v.taken || '', completed: v.completed || '' });
    }
    if (v.special) { const cls = /cc|critical/i.test(v.special) ? 'CC' : /sc|significant/i.test(v.special) ? 'SC' : ''; if (cls && !fn.chars.length) addChar(doc, fn.id, 'Characteristic', { cls }); }
    count++;
  }
  return count ? doc : null;
}

export function projectFromImport(res, name = 'Imported') { if (res.project) return res.project; const p = newProject(name); p.docs.push(...res.docs); return p; }
