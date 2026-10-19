// FMEA form (spreadsheet) columns and rows — shared by the form view, Excel export and PDF report.
import { rows } from './model.js';

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

