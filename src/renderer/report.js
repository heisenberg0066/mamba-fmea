// HTML for PDF reports (rendered by a hidden window and printed with printToPDF).
import * as M from '../core/fmea/model.js';
import { formColumns, formRows } from '../core/fmea/form.js';
import { controlPlan } from '../core/fmea/link.js';
import { esc } from './ui.js';
import { t, getLang } from './i18n.js';
import { dashboardCharts, flowSvg } from './fmea3.js';

export const REPORT_CSS = `
*{box-sizing:border-box} body{font:10px/1.35 "Segoe UI",system-ui,"Noto Sans Arabic","Noto Sans",sans-serif;color:#1b2533;margin:0}
h1{font-size:18px;margin:0 0 2px} h2{font-size:13px;margin:14px 0 6px;border-bottom:2px solid #ff7a00;padding-bottom:2px;break-after:avoid} h3{font-size:11px;margin:8px 0 4px}
.cover{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #142132;padding-bottom:6px;margin-bottom:8px}
.brand{color:#ff7a00;font-weight:700} .muted{color:#6b778a} .small{font-size:8.5px}
table{border-collapse:collapse;width:100%;break-inside:auto} th,td{border:1px solid #c9d1dc;padding:2px 4px;vertical-align:top;text-align:start;white-space:pre-wrap}
th{background:#eef2f7;font-weight:600;font-size:8.5px} tr{break-inside:avoid} td.num,th.num{text-align:center}
.form td,.form th{font-size:7.6px} .hdr td{border:none;padding:1px 6px 1px 0} .hdr b{color:#34465c}
.ap{display:inline-block;min-width:16px;text-align:center;border-radius:3px;font-weight:700;color:#fff;padding:0 3px} .ap-H{background:#d13b3b}.ap-M{background:#e8a317}.ap-L{background:#2ea05a}
.charts{display:flex;flex-wrap:wrap;gap:8px} .charts svg{max-width:48%;height:auto} svg text{font-family:inherit} .plot .tick{font-size:9px;fill:#5b687a}.plot .plot-title{font-size:11px;font-weight:600}.plot .grid{stroke:#e9edf3}.plot .plot-area{fill:#fbfcfe;stroke:#cfd7e2}.plot .axis-label{font-size:10px}.mtx-n{font-size:10px;fill:#fff;font-weight:700}
.flow circle,.flow rect,.flow path{fill:#fff;stroke:#34465c;stroke-width:1.6}.flow .flow-arrow{stroke:#34465c;stroke-width:1.6}.flow text{font-size:10px}.flow .flow-no{font-weight:700}.flow .flow-sub{fill:#6b778a;font-size:9px}.flow .flow-el rect{fill:#f3f6fa;stroke:#c9d1dc}.flow-el-line{stroke:#c9d1dc}.flow .flow-ap{fill:#fff;font-weight:700;font-size:9px}.flow .flow-sc{fill:#a33a17;font-size:9px}
.page{break-before:page} .kpi{display:flex;gap:14px;margin:4px 0 8px} .kpi div{border:1px solid #dfe4ec;border-radius:6px;padding:4px 10px} .kpi b{font-size:14px;display:block}
.steps .st{margin:4px 0 8px;break-inside:avoid} .steps .st b{display:block;margin-bottom:2px} .mono{font-family:Consolas,"Cascadia Mono",monospace;font-size:9px}
html[dir=rtl] th,html[dir=rtl] td{text-align:right} .ltr{direction:ltr;unicode-bidi:isolate}
`;
export function reportShell(title, sub, inner, { version } = {}) {
  const L = getLang();
  return `<!DOCTYPE html><html lang="${L}" dir="${L === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${REPORT_CSS}</style></head><body>
<div class="cover"><div><div class="brand">◆ Mamba FMEA</div><h1>${esc(title)}</h1><div class="muted">${esc(sub)}</div></div><div class="muted small">${t('Generated')} ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · v${esc(version || '')}</div></div>${inner}</body></html>`;
}
const ap = (x) => (x ? `<span class="ap ap-${x}">${x}</span>` : '');
export function fmeaReportHTML(project, doc, { version } = {}) {
  const P = doc.planning; const set = project.settings;
  const hdr = [['Company', P.company], ['Engineering location', P.location], ['Customer', P.customer], ['Model year / platform', P.model], ['Subject', P.subject], ['FMEA ID number', P.fmeaId], ['Start date', P.startDate], ['Revision date', P.revisionDate], ['Responsible (design / process)', P.responsible], ['Confidentiality', P.confidentiality], ['Cross-functional team (one per line)', (P.team || []).join(', ')]];
  let html = `<table class="hdr"><tr>${hdr.map(([k, v], i) => `<td><b>${esc(t(k))}:</b> ${esc(v || '–')}</td>${i % 4 === 3 ? '</tr><tr>' : ''}`).join('')}</tr></table>`;
  const plan = [['InTent — why is this FMEA done?', P.intent], ['Timing — milestones, due dates', P.timing], ['Team / Task — deliverables', P.task], ['Tools — software, methods', P.tools], ['In scope', P.scope], ['Out of scope / interfaces', P.boundaries], ['Assumptions & lessons learned used', P.assumptions]].filter(([, v]) => v);
  if (plan.length) html += `<h2>1 · ${t('Planning & scope')}</h2><table>${plan.map(([k, v]) => `<tr><th style="width:22%">${esc(t(k))}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
  const c = dashboardCharts(doc); const S = c.S;
  html += `<h2>${t('Summary')}</h2><div class="kpi"><div>${t('Failure chains')}<b>${S.rows}</b></div><div>${ap('H')} ${t('High')}<b>${S.dist.H} → ${S.distPost.H}</b></div><div>${ap('M')} ${t('Medium')}<b>${S.dist.M} → ${S.distPost.M}</b></div><div>${ap('L')} ${t('Low')}<b>${S.dist.L} → ${S.distPost.L}</b></div><div>${t('Open actions')}<b>${S.open}</b></div><div>${t('Overdue')}<b>${S.overdue}</b></div>${doc.approval ? `<div>${t('Approved')}<b>Rev ${doc.approval.rev} · ${esc(doc.approval.by)} · ${doc.approval.date}</b></div>` : ''}</div>`;
  html += `<div class="charts">${c.dist.outerHTML}${c.status.outerHTML}${c.matrix.outerHTML}</div>`;
  if (doc.type === 'PFMEA') html += `<h2>${t('Process flow diagram')}</h2>${flowSvg(doc, { width: '100%' }).outerHTML}`;
  const cols = formColumns(doc).filter((x) => !['owner', 'due', 'status', 'taken', 'completed', 'actPrev', 'actDet', 'S2', 'O2', 'D2', 'F2', 'M2', 'ap2', 'rpn2', 'filter'].includes(x.key));
  const fr = formRows(doc, set).filter((r) => r.first);
  html += `<h2 class="page">2–5 · ${t('FMEA form')} (${doc.type}${doc.ratingMode === 'RPN' ? ' · RPN' : ''})</h2><table class="form"><thead><tr>${cols.map((x) => `<th>${esc(t(x.header))}</th>`).join('')}</tr></thead><tbody>${fr.map((r) => `<tr>${cols.map((x) => `<td class="${['S', 'O', 'D', 'F', 'M', 'ap', 'rpn', 'sMitigated'].includes(x.key) ? 'num' : ''}">${x.key === 'ap' ? ap(r.ap) : esc(r[x.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const rs = M.rows(doc, { settings: set }); const acts = Object.values(doc.actions);
  if (acts.length) html += `<h2>6 · ${t('Optimisation')} — ${t('actions')}</h2><table><thead><tr>${['Failure chain', 'AP', 'Type', 'Action', 'Responsible', 'Target date', 'Status', 'Action taken / evidence', 'Completion date', 'AP (after)'].map((x) => `<th>${esc(t(x))}</th>`).join('')}</tr></thead><tbody>${acts.map((a) => { const r = rs.find((x) => x.key === a.risk); return `<tr><td>${esc(r ? r.fm.text + (r.fc ? ' ← ' + r.fc.text : '') : '')}</td><td class="num">${ap(r?.ap)}</td><td>${esc(t(a.kind))}</td><td>${esc(a.text)}</td><td>${esc(a.owner)}</td><td>${esc(a.due)}${M.isOverdue(a) ? ' ⏰' : ''}</td><td>${esc(t(a.status))}</td><td>${esc([a.taken, a.evidence].filter(Boolean).join(' – '))}</td><td>${esc(a.completed)}</td><td class="num">${ap(r?.post?.ap)}</td></tr>`; }).join('')}</tbody></table>`;
  if (doc.type === 'PFMEA') { const cp = controlPlan(doc); if (cp.length) html += `<h2 class="page">${t('Control plan')} — ${esc(t(doc.controlPlan.phase))} ${esc(doc.controlPlan.number || '')}</h2><table><thead><tr>${['Process no.', 'Process step / operation', 'Machine, device, jig, tools', 'Char. no.', 'Product characteristic', 'Process characteristic', 'Special class', 'Specification / tolerance', 'Evaluation / measurement technique', 'Sample size', 'Frequency', 'Control method', 'Reaction plan'].map((x) => `<th>${esc(t(x))}</th>`).join('')}</tr></thead><tbody>${cp.map((r) => `<tr>${['processNo', 'step', 'machine', 'charNo', 'product', 'process', 'cls', 'spec', 'measurement', 'sample', 'frequency', 'method', 'reaction'].map((k) => `<td>${esc(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`; }
  const revs = project.revisions.filter((r) => r.doc === doc.id);
  if (revs.length) html += `<h2>7 · ${t('Revision history')}</h2><table><tr>${['Rev', 'Label', 'Date', 'Author', 'Approved', 'Note'].map((x) => `<th>${t(x)}</th>`).join('')}</tr>${revs.map((r) => `<tr><td>${r.n}</td><td>${esc(r.label)}</td><td>${r.date.slice(0, 10)}</td><td>${esc(r.author)}</td><td>${r.approved ? '✔ ' + r.approved.date : ''}</td><td>${esc(r.note)}</td></tr>`).join('')}</table>`;
  html += `<p class="muted small">${esc(t('Rating descriptions are Mamba FMEA\'s own wording; Action Priority follows the AIAG-VDA logic.'))}</p>`;
  return reportShell(`${doc.type === 'MSR' ? 'FMEA-MSR' : doc.type}: ${doc.title}`, `${project.name} · ${P.fmeaId || ''}`, html, { version });
}
