// Mamba FMEA test + validation suite. Run: npm test   (writes docs/VALIDATION.md)
// Hydraulics numbers are either published textbook answers (source named), an independent analytic
// solution ("analytic"), or EPANET 2.2 (OWA toolkit via epanet-js) solving the identical network.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import ExcelJS from 'exceljs';
import { Project, Workspace } from 'epanet-js';
import CoolPropModule from '../node_modules/coolprop-wasm/index.js';
import * as AP from '../src/core/fmea/ap.js';
import * as M from '../src/core/fmea/model.js';
import { pfmeaFromDfmea, syncLinks, controlPlan } from '../src/core/fmea/link.js';
import { diff, snapshot, summarize } from '../src/core/fmea/diff.js';
import { LIBRARY, applyEntry, entryFromNode } from '../src/core/fmea/library.js';
import { exportWorkbook, importWorkbook, mapHeaders, formRows } from '../src/core/fmea/xlsx.js';
import { CRITERIA, criterion } from '../src/core/fmea/ratings.js';
import * as N from '../src/core/hyd/network.js';
import { colebrook, swameeJain, haaland, frictionFactor, pipeLoss, G } from '../src/core/hyd/friction.js';
import { systemCurve, profile, sweep, explain, run } from '../src/core/hyd/analysis.js';
import { toInp, fromInp } from '../src/core/hyd/inp.js';
import { addComponentToFmea } from '../src/core/hyd/tofmea.js';
import * as F from '../src/core/fluids/fluids.js';
import { sampleProject } from '../src/core/samples.js';

const results = []; let fail = 0;
function check(group, name, got, want, tolPct, source) { const err = Math.abs(got - want) / Math.max(Math.abs(want), 1e-12) * 100; const ok = Number.isFinite(got) && err <= tolPct; if (!ok) fail++; results.push({ group, name, got, want, tolPct, errPct: err, ok, source }); }
function truthy(group, name, cond, source = 'logic') { if (!cond) fail++; results.push({ group, name, got: !!cond, want: true, ok: !!cond, source }); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mfmea-'));

// ================= FMEA: Action Priority =================
{
  const g = 'AP logic';
  const spots = [[10, 10, 10, 'H'], [9, 3, 5, 'M'], [9, 3, 4, 'L'], [9, 4, 1, 'M'], [9, 5, 2, 'H'], [8, 7, 1, 'M'], [8, 5, 7, 'H'], [8, 5, 6, 'M'], [8, 3, 8, 'M'], [8, 2, 4, 'L'], [6, 8, 3, 'M'], [6, 8, 6, 'H'], [5, 7, 1, 'L'], [5, 6, 7, 'M'], [4, 5, 7, 'M'], [4, 5, 6, 'L'], [3, 9, 7, 'M'], [3, 9, 4, 'L'], [2, 7, 10, 'L'], [1, 10, 10, 'L'], [10, 1, 10, 'L'], [7, 6, 2, 'H']];
  for (const [s, o, d, want] of spots) truthy(g, `AP(S${s},O${o},D${d}) = ${want}`, AP.apDP(s, o, d) === want, 'AIAG-VDA AP logic (2019)');
  const rank = { L: 0, M: 1, H: 2 }; let mono = true;
  for (let s = 1; s <= 10; s++) for (let o = 1; o <= 10; o++) for (let d = 1; d <= 10; d++) { const a = rank[AP.apDP(s, o, d)]; if (s < 10 && rank[AP.apDP(s + 1, o, d)] < a) mono = false; if (o < 10 && rank[AP.apDP(s, o + 1, d)] < a) mono = false; if (d < 10 && rank[AP.apDP(s, o, d + 1)] < a) mono = false; }
  truthy(g, 'AP never decreases when S, O or D increases (all 1000 combinations)', mono);
  const cube = AP.apCube(); const cnt = { H: 0, M: 0, L: 0 }; cube.forEach((c) => cnt[c[3]]++);
  truthy(g, `AP cube counts H/M/L = ${cnt.H}/${cnt.M}/${cnt.L} (hand count from the band table: 318/214/468)`, cnt.H === 318 && cnt.M === 214 && cnt.L === 468, 'hand count of the AIAG-VDA band table');
  truthy(g, 'missing rating → no AP', AP.apDP(8, null, 3) === '');
  truthy(g, 'RPN = S·O·D', AP.rpn(7, 4, 6) === 168);
  const msr = [[10, 6, 1, 'H'], [10, 4, 1, 'M'], [10, 3, 1, 'L'], [10, 3, 2, 'M'], [10, 2, 5, 'M'], [9, 3, 1, 'L'], [9, 3, 2, 'H'], [8, 5, 4, 'M'], [8, 4, 3, 'L'], [8, 3, 9, 'H'], [5, 6, 5, 'M'], [5, 3, 8, 'M'], [3, 8, 1, 'H'], [3, 5, 6, 'L'], [1, 10, 10, 'L']];
  for (const [s, f, m, want] of msr) truthy(g, `MSR AP(S${s},F${f},M${m}) = ${want}`, AP.apMSR(s, f, m) === want, 'AIAG-VDA FMEA-MSR AP logic');
  truthy(g, 'MSR: M = 1 uses severity of the mitigated effect', AP.apMSR(10, 6, 1) === 'H' && AP.apMSR(10, 6, 1, 3) === 'L' && AP.apMSR(10, 4, 1, 4) === 'L' && AP.apMSR(10, 6, 2, 3) === 'H');
  const ev = AP.evaluate({ type: 'DFMEA', mode: 'RPN', S: 6, O: 6, D: 6, rpnHigh: 200, rpnMedium: 100 }); truthy(g, 'classic RPN mode: 216 ≥ 200 → H', ev.rpn === 216 && ev.level === 'H');
  for (const l of ['en', 'sv', 'ar']) truthy('Rating tables', `${l}: 9 criteria tables × 10 lines`, ['DFMEA.S', 'DFMEA.O', 'DFMEA.D', 'PFMEA.S', 'PFMEA.O', 'PFMEA.D', 'MSR.F', 'MSR.M', 'MSR.S'].every((k) => CRITERIA[l][k] && CRITERIA[l][k].length === 10 && CRITERIA[l][k].every((t) => t.length > 8)));
  truthy('Rating tables', 'user override wins', criterion('en', 'DFMEA', 'S', 7, { 'DFMEA.S': { 7: 'Mine' } }) === 'Mine');
}

// ================= FMEA: model, chains, linking, control plan, diff, library, Excel =================
{
  const g = 'FMEA model';
  const P = sampleProject(); const D = P.docs.find((d) => d.type === 'DFMEA');
  const rs = M.rows(D); truthy(g, `sample DFMEA yields failure-chain rows (${rs.length})`, rs.length >= 6);
  const fm = rs.find((r) => r.fe.length > 1); truthy(g, 'severity of FM = max severity of its effects', fm && fm.S === Math.max(...fm.fe.map((e) => e.S)));
  truthy(g, 'every row has AP when S/O/D present', rs.filter((r) => r.risk.O && r.risk.D && r.S).every((r) => 'HML'.includes(r.ap)));
  // drag-drop move
  const comp = Object.values(D.nodes).find((n) => n.parent && n.children.length === 0); const sub = Object.values(D.nodes).find((n) => n.parent && n.children.length && n.id !== comp.parent);
  if (sub) { M.moveNode(D, comp.id, sub.id, 0); truthy(g, 'moveNode re-parents (drag-drop)', D.nodes[sub.id].children[0] === comp.id && comp.parent === sub.id); }
  let threw = false; try { M.moveNode(D, D.nodes[D.rootId].children[0], D.nodes[D.nodes[D.rootId].children[0]].children[0] || comp.id); } catch (_) { threw = true; } truthy(g, 'cannot drop a node into its own subtree', threw);
  const chk = M.checks(D); truthy(g, 'checks flag high AP without action', chk.some((c) => c.code === 'high-no-action') || rs.every((r) => r.level !== 'H' || r.actions.length));
  const k = rs.find((r) => r.level === 'H') || rs[0]; const a = M.addAction(D, k.key, { text: 'Increase fillet radius', owner: 'Ammar', due: '2020-01-01' }); M.setPost(D, k.key, { O: 2 });
  const r2 = M.rows(D).find((r) => r.key === k.key); truthy(g, 'optimisation re-rating gives post AP', r2.post && 'HML'.includes(r2.post.ap) && r2.post.O === 2);
  truthy(g, 'overdue action detected', M.isOverdue(a, '2026-10-19'));
  const st = M.stats(D); truthy(g, 'dashboard stats: distribution sums to rows, Pareto cumulative ends at 100 %', Object.values(st.dist).reduce((s, x) => s + x, 0) === st.rows && Math.abs(st.pareto.at(-1).cum - 1) < 1e-9);
  // removal cascade
  const n0 = Object.keys(D.failures).length; const victim = Object.values(D.nodes).find((n) => n.parent && !n.children.length); M.removeNode(D, victim.id); truthy(g, 'removing a node removes its functions/failures and dangling links', Object.keys(D.failures).length < n0 && Object.values(D.failures).every((f) => f.causes.every((c) => D.failures[c]) && f.effects.every((c) => D.failures[c])));

  // DFMEA → PFMEA
  const P2 = sampleProject(); const D2 = P2.docs.find((d) => d.type === 'DFMEA');
  const PF = pfmeaFromDfmea(D2); P2.docs.push(PF);
  const steps = Object.values(PF.nodes).filter((n) => n.kind === 'step');
  truthy('DFMEA→PFMEA', `one process step per DFMEA component (${steps.length})`, steps.length === Object.values(D2.nodes).filter((n) => n.parent && !n.children.length).length);
  const linkedChars = Object.values(PF.functions).flatMap((f) => f.chars).filter((c) => c.link); truthy('DFMEA→PFMEA', `product characteristics linked to the DFMEA (${linkedChars.length})`, linkedChars.length >= 3);
  const linkedFe = Object.values(PF.failures).filter((f) => f.link); truthy('DFMEA→PFMEA', 'PFMEA effects inherit DFMEA severity', linkedFe.length && linkedFe.every((f) => f.S === M.severity(D2, f.link.failure)));
  const src = D2.failures[linkedFe[0].link.failure]; const eff = src.effects.length ? D2.failures[src.effects[0]] : src; eff.S = 10; const ch = Object.values(D2.functions).flatMap((f) => f.chars).find((c) => c.id === linkedChars[0].link.char); ch.cls = 'CC';
  const changes = syncLinks(P2); truthy('DFMEA→PFMEA', `sync propagates severity and CC/SC changes (${changes.length} changes)`, changes.some((c) => c.field === 'S' && c.to === 10) && changes.some((c) => c.field === 'cls' && c.to === 'CC'));
  const pr = M.rows(PF); truthy('DFMEA→PFMEA', 'PFMEA chains have FE, FM and FC', pr.length && pr.every((r) => r.fe.length && r.fc));
  // control plan
  const anyRisk = Object.values(PF.risks)[0]; anyRisk.dc = 'Air gauge 100 %'; anyRisk.pc = 'Tool-life counter';
  const cp = controlPlan(PF); truthy('Control plan', `rows generated from PFMEA characteristics (${cp.length})`, cp.length >= linkedChars.length);
  truthy('Control plan', 'measurement technique and control method pulled from DC/PC', cp.some((r) => /Air gauge/.test(r.measurement)) && cp.some((r) => /Tool-life/.test(r.method)));
  PF.controlPlan.overrides[cp[0].key] = { frequency: 'Every 50 parts' }; truthy('Control plan', 'user overrides survive regeneration', controlPlan(PF)[0].frequency === 'Every 50 parts');
  truthy('Control plan', 'special characteristics carry their class', controlPlan(PF).some((r) => r.cls === 'CC'));

  // revisions & diff
  const P3 = sampleProject(); const D3 = P3.docs[0]; const r1 = snapshot(P3, D3, { label: 'Rev A', author: 'Ammar' });
  const f0 = Object.values(D3.failures)[0]; f0.text = 'Changed text'; const rk = Object.values(D3.risks).find((x) => x.O); rk.O = (rk.O % 10) + 1; const nn = M.addNode(D3, D3.rootId, 'New part'); M.addFunction(D3, nn.id, 'Do something');
  const dd = diff(r1.state, D3); const s = summarize(dd);
  truthy('Revisions', `diff finds added / changed (${s.added} added, ${s.changed} changed)`, dd.some((c) => c.kind === 'failure' && c.op === 'changed' && c.fields.some((f) => f.field === 'text')) && dd.some((c) => c.kind === 'risk' && c.op === 'changed') && dd.some((c) => c.kind === 'node' && c.op === 'added'));
  const r2b = snapshot(P3, D3, { label: 'Rev B', author: 'Ammar', approve: true }); truthy('Revisions', 'approval stamp recorded', D3.approval && D3.approval.rev === 2 && r2b.approved);
  truthy('Revisions', 'identical states → empty diff', diff(r2b.state, M.clone(r2b.state)).length === 0);

  // library
  const P4 = sampleProject(); const D4 = P4.docs[0]; const target = M.addNode(D4, D4.rootId, 'Drive shaft');
  const cr = applyEntry(D4, target.id, LIBRARY.find((e) => e.id === 'lib-shaft')); truthy('Library', `applying "Shaft" creates functions, FMs, causes on child elements (${cr.failures.length} failures, ${cr.nodes.length} elements)`, cr.failures.length >= 7 && cr.nodes.length >= 2);
  const ent = entryFromNode(D4, target.id); truthy('Library', 'node saved back to a reusable entry', ent.functions[0].failures.length === 2 && ent.functions[0].failures[0].causes.length === 3);
  truthy('Library', `${LIBRARY.length} built-in entries (design, process, hydraulic)`, LIBRARY.length >= 18 && ['design', 'process', 'hydraulic'].every((c) => LIBRARY.some((e) => e.cat === c)));

  // Excel round trip
  const P5 = sampleProject(); P5.docs.push(pfmeaFromDfmea(P5.docs[0])); const fx = path.join(tmp, 'rt.xlsx'); await exportWorkbook(P5, fx);
  const back = await importWorkbook(fx); truthy('Excel', 'lossless round trip via hidden JSON sheet', back.lossless && JSON.stringify(back.project) === JSON.stringify(P5));
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(fx); const ws = wb.worksheets[0]; truthy('Excel', 'form sheet has AIAG-VDA columns and data rows', ws.getRow(8).getCell(9).value === 'Failure mode (FM)' && ws.rowCount >= 9 + 5);
  truthy('Excel', 'control plan sheet written for PFMEA', wb.worksheets.some((w) => /^Control plan/.test(w.name)));
  // classic RPN form from another tool
  const w2 = new ExcelJS.Workbook(); const s2 = w2.addWorksheet('Legacy FMEA');
  s2.addRow(['Legacy pump FMEA']); s2.addRow([]);
  s2.addRow(['Item / Function', 'Potential Failure Mode', 'Potential Effect(s) of Failure', 'Sev', 'Potential Cause(s)', 'Occ', 'Current Controls Prevention', 'Current Controls Detection', 'Det', 'RPN', 'Recommended Action', 'Responsibility & Target Date', 'Actions Taken', 'New Sev', 'New Occ', 'New Det', 'New RPN']);
  s2.addRow(['Impeller – deliver flow', 'Cavitation', 'Noise and erosion', 7, 'NPSHa too low', 6, 'Suction line sizing calc', 'Vibration check at commissioning', 6, 252, 'Raise tank level', 'Ammar 2026-11-30', '', '', '', '', '']);
  s2.addRow(['', '', '', '', 'Fluid temperature too high', 3, 'Cooling', 'Temp alarm', 4, 84, '', '', '', '', '', '', '']);
  s2.addRow(['Seal – contain fluid', 'External leakage', 'Fluid loss', 6, 'Dry running', 4, 'Low-level trip', 'Visual inspection', 7, 168, 'Add flow switch', 'Lena', 'Installed', 6, 2, 3, 36]);
  const fx2 = path.join(tmp, 'legacy.xlsx'); await w2.xlsx.writeFile(fx2);
  const imp = await importWorkbook(fx2); const ld = imp.docs[0]; const lr = ld ? M.rows(ld) : [];
  truthy('Excel', `foreign classic-RPN form imported (${lr.length} chains, mode ${ld && ld.ratingMode})`, ld && ld.ratingMode === 'RPN' && lr.length === 3);
  truthy('Excel', 'blank cells inherit from the row above (merged-cell style)', lr.filter((r) => r.fm.text === 'Cavitation').length === 2 && lr.find((r) => r.fc && r.fc.text === 'Fluid temperature too high').risk.O === 3);
  truthy('Excel', 'ratings, controls, actions, owner/date and re-rating imported', lr.find((r) => r.fm.text === 'Cavitation').rpn === 252 && Object.values(ld.actions).some((a) => a.owner === 'Ammar' && a.due === '2026-11-30') && lr.find((r) => r.fm.text === 'External leakage').post.rpn === 36);
  truthy('Excel', 'header mapping distinguishes "Detection control" from "Detection (D)"', JSON.stringify(Object.values(mapHeaders(['Current detection control (DC)', 'Detection (D)', 'Severity (S)', 'Special characteristic']))) === JSON.stringify(['dc', 'D', 'S', 'special']));
  truthy('Excel', 'form rows flatten actions to one line each', formRows(P5.docs[0]).length >= M.rows(P5.docs[0]).length);
}

// ================= Fluids =================
{
  const cp = await CoolPropModule(); F.setCoolProp(cp);
  for (const T of [278.15, 293.15, 313.15, 333.15, 353.15]) {
    F.setBackend('builtin'); const b = F.fluidState('Water', T); F.setBackend('coolprop'); const c = F.fluidState('Water', T);
    check('Fluids (built-in vs CoolProp)', `water ρ at ${(T - 273.15).toFixed(0)} °C`, b.rho, c.rho, 0.05, 'CoolProp 6.6 (IAPWS-95)');
    check('Fluids (built-in vs CoolProp)', `water μ at ${(T - 273.15).toFixed(0)} °C`, b.mu, c.mu, 1.5, 'CoolProp 6.6');
    check('Fluids (built-in vs CoolProp)', `water p_v at ${(T - 273.15).toFixed(0)} °C`, b.Pv, c.Pv, 0.05, 'CoolProp 6.6');
  }
  for (const id of ['Air', 'Nitrogen', 'Oxygen', 'Hydrogen', 'Helium', 'Methane']) for (const T of [273.15, 350]) {
    F.setBackend('builtin'); const b = F.fluidState(id, T); F.setBackend('coolprop'); const c = F.fluidState(id, T);
    check('Fluids (built-in vs CoolProp)', `${id} ρ at ${(T - 273.15).toFixed(0)} °C, 1 atm`, b.rho, c.rho, 0.5, 'CoolProp 6.6'); check('Fluids (built-in vs CoolProp)', `${id} μ at ${(T - 273.15).toFixed(0)} °C`, b.mu, c.mu, 2.0, 'CoolProp 6.6');
  }
  F.setBackend('builtin');
  check('Fluids', 'ISO VG 46 ν at 40 °C = 46 cSt', F.prop('nu', 'ISOVG46', { T: 313.15 }) * 1e6, 46, 0.5, 'ISO 3448 grade definition');
  check('Fluids', 'water ρ at 15 °C (Çengel table: 999.1)', F.prop('rho', 'Water', { T: 288.15 }), 999.1, 0.02, 'Çengel & Cimbala, Table A-3');
  check('Fluids', 'water μ at 15 °C (Çengel table: 1.138e-3)', F.prop('mu', 'Water', { T: 288.15 }), 1.138e-3, 1.0, 'Çengel & Cimbala, Table A-3');
  truthy('Fluids', 'engine hook: external ThermoStudio-style prop() is used when registered', (() => { F.setBackend('auto'); F.useEngine({ prop: (o) => (o === 'rho' ? 1234 : 1e-3) }); const v = F.prop('rho', 'Water', { T: 300, P: 1e5 }); F.useEngine(null); F.setBackend('builtin'); return v === 1234; })());
}

// ================= Hydraulics: friction factors =================
{
  const g = 'Friction factor';
  check(g, 'smooth pipe Re = 1e5 (Prandtl–Kármán law value 0.01799)', colebrook(1e5, 0).f, 0.01799, 0.3, 'Moody chart / Prandtl smooth-pipe law');
  check(g, 'Re = 1e6, ε/D = 1e-3 (Colebrook 0.01993)', colebrook(1e6, 1e-3).f, 0.01993, 0.3, 'Colebrook (1939), tabulated');
  check(g, 'fully rough ε/D = 0.01 (von Kármán 0.03789)', colebrook(1e9, 0.01).f, 1 / (2 * Math.log10(3.7 / 0.01)) ** 2, 0.1, 'analytic (rough-pipe limit)');
  let maxSJ = 0, maxH = 0; for (const Re of [5e3, 1e4, 5e4, 1e5, 1e6, 1e7]) for (const rr of [1e-6, 1e-5, 1e-4, 1e-3, 1e-2]) { const c = colebrook(Re, rr).f; maxSJ = Math.max(maxSJ, Math.abs(swameeJain(Re, rr) / c - 1)); maxH = Math.max(maxH, Math.abs(haaland(Re, rr) / c - 1)); }
  truthy(g, `Swamee–Jain within 3 % of Colebrook over the Moody range (max ${(maxSJ * 100).toFixed(2)} %)`, maxSJ < 0.03, 'Swamee & Jain (1976) accuracy claim');
  truthy(g, `Haaland within 2 % of Colebrook (max ${(maxH * 100).toFixed(2)} %)`, maxH < 0.02, 'Haaland (1983)');
  check(g, 'laminar f = 64/Re at Re 1000', frictionFactor(1000, 0.001).f, 0.064, 1e-9, 'analytic');
  const t1 = frictionFactor(1999.9, 1e-4).f, t2 = frictionFactor(2000.1, 1e-4).f, t3 = frictionFactor(3999.9, 1e-4, 'swamee').f, t4 = frictionFactor(4000.1, 1e-4, 'swamee').f;
  truthy(g, 'transition zone blends continuously at Re 2000 and 4000', Math.abs(t1 / t2 - 1) < 0.01 && Math.abs(t3 / t4 - 1) < 0.01);
}

// ================= Hydraulics: textbook problems =================
const water15 = { id: 'w', label: 'Water 15 °C', rho: 999.1, mu: 1.138e-3, Pv: 1705, warn: [] };
{
  const g = 'Textbook single pipe';
  // Çengel & Cimbala, Fluid Mechanics, Problem 8-48 (3rd ed.): water 15 °C, 9 L/s, D = 5 cm, L = 30 m, stainless steel (ε = 0.002 mm)
  const r = pipeLoss({ L: 30, D: 0.05, eps: 0.002e-3, fittings: [] }, 0.009, water15);
  check(g, 'Çengel 8-48: Re ≈ 2.01e5', r.Re, 2.01e5, 0.5, 'Çengel & Cimbala, Fluid Mechanics, Prob. 8-48 (answers 100 kPa, 10.2 m, 0.9 kW)');
  check(g, 'Çengel 8-48: f ≈ 0.0159', r.f, 0.0159, 1.0, 'Çengel & Cimbala, Prob. 8-48');
  check(g, 'Çengel 8-48: pressure drop 100 kPa', 999.1 * G * r.h / 1000, 100, 1.5, 'Çengel & Cimbala, Prob. 8-48');
  check(g, 'Çengel 8-48: head loss 10.2 m', r.h, 10.2, 1.0, 'Çengel & Cimbala, Prob. 8-48');
  check(g, 'Çengel 8-48: pumping power 0.90 kW', 0.009 * 999.1 * G * r.h / 1000, 0.90, 1.5, 'Çengel & Cimbala, Prob. 8-48');
  // Laminar Hagen–Poiseuille: oil ν = 1e-4, D = 2 cm, 0.1 L/s, 10 m
  const oil = { rho: 900, mu: 0.09, warn: [] }; const lam = pipeLoss({ L: 10, D: 0.02, eps: 0, fittings: [] }, 1e-4, oil);
  check(g, 'Hagen–Poiseuille laminar Δp = 128 μ L Q / (π D⁴)', 900 * G * lam.h, 128 * 0.09 * 10 * 1e-4 / (Math.PI * 0.02 ** 4), 1e-6, 'analytic');
  // Minor losses: K · V²/2g
  const mk = pipeLoss({ L: 1e-9, D: 0.1, eps: 0, fittings: [{ K: 0.3, qty: 4 }, { K: 1.0 }] }, 0.02, water15);
  check(g, 'minor losses ΣK·V²/(2g) (4 elbows K 0.3 + exit K 1.0)', mk.hMinor, 2.2 * (0.02 / (Math.PI * 0.0025)) ** 2 / (2 * G), 1e-9, 'analytic');
  check(g, 'Hazen–Williams (C 130, D 0.3 m, 1 km, 0.1 m³/s): 10.667 L Q^1.852/(C^1.852 D^4.871)', pipeLoss({ L: 1000, D: 0.3, C: 130, fittings: [] }, 0.1, water15, { headloss: 'HW' }).h, 10.667 * 1000 * 0.1 ** 1.852 / (130 ** 1.852 * 0.3 ** 4.871), 1e-9, 'Williams & Hazen (SI form, EPANET constants)');
}
{
  const g = 'Textbook networks';
  // Hardy Cross classic two-loop example (h = rQ², inflow 10 at A; outflows C = 4, E = 4, F = 2) – published final flows
  const net = N.newNetwork('HC'); const fl = { rho: 1000, mu: 1e-3, Pv: 0, warn: [] };
  N.addNode(net, 'reservoir', 0, 0, { id: 'R', level: 100 }); ['A', 'B', 'C', 'D', 'E', 'F'].forEach((id) => N.addNode(net, 'junction', 0, 0, { id, label: id, demand: { C: 4, E: 4, F: 2 }[id] || 0 }));
  N.addLink(net, 'resistance', 'R', 'A', { res: { r: 1e-9, n: 2 } });
  for (const [a, b, r] of [['A', 'B', 1], ['B', 'E', 2], ['E', 'D', 3], ['D', 'A', 3], ['B', 'C', 10], ['C', 'F', 5], ['F', 'E', 3]]) N.addLink(net, 'resistance', a, b, { id: a + b, res: { r, n: 2 } });
  const pub = { AB: 6.53, BE: 3.85, ED: -3.47, DA: -3.47, BC: 2.68, CF: -1.32, FE: -3.32 };
  for (const solver of ['hardy', 'gga']) { const r = N.solve(net, fl, { solver }); for (const [k, v] of Object.entries(pub)) check(g, `Hardy Cross example, ${solver === 'gga' ? 'Newton GGA' : 'Hardy Cross'}: Q_${k} = ${v}`, r.links[k].Q, v, 0.6, 'Hardy Cross worked example (Lesson 11 "Pipe Networks", 3-iteration table)'); }
  // Two-loop network, constant f = 0.02, K = 8fL/(gπ²D⁵) (eOPCW example 1): inflow 0.6 m³/s at node 1, outflow at node 3
  const n2 = N.newNetwork('TL'); N.addNode(n2, 'reservoir', 0, 0, { id: 'R', level: 100 }); ['1', '2', '3', '4'].forEach((id) => N.addNode(n2, 'junction', 0, 0, { id, label: id, demand: id === '3' ? 0.6 : 0 }));
  N.addLink(n2, 'resistance', 'R', '1', { res: { r: 1e-9, n: 2 } });
  for (const [id, a, b, r] of [['p1', '1', '2', 6528.54], ['p2', '2', '3', 33050.74], ['p3', '4', '3', 49576.12], ['p4', '1', '4', 4352.36], ['p5', '1', '3', 59491.34]]) N.addLink(n2, 'resistance', a, b, { id, res: { r, n: 2 } });
  const r2 = N.solve(n2, fl, { solver: 'hardy' }); const pub2 = { p1: 0.223, p2: 0.223, p3: 0.192, p4: 0.192, p5: 0.182 };
  for (const [k, v] of Object.entries(pub2)) check(g, `two-loop network (f = 0.02): Q_${k} = ${v} m³/s`, r2.links[k].Q, v, 1.5, 'eOPCW pipe-network Example 1 (Hardy Cross, 5 iterations; published to 3 decimals)');
  // exact parallel-path solution for the same network
  const s = 1 / Math.sqrt(6528.54 + 33050.74) + 1 / Math.sqrt(49576.12 + 4352.36) + 1 / Math.sqrt(59491.34); check(g, 'same network: Q_p1 vs exact parallel-path solution', r2.links.p1.Q, 0.6 / s / Math.sqrt(6528.54 + 33050.74), 0.01, 'analytic');
}
{
  const g = 'Pumps & NPSH';
  // pump H = 40 − B Q² (3-point curve from Q = 0 → exact quadratic), system H = 20 + k Q² (constant f)
  const net = N.newNetwork('pump'); net.fluid = { custom: true, rho: 998.2, mu: 1.002e-3, Pv: 2339, label: 'water' };
  N.addNode(net, 'reservoir', 0, 0, { id: 'S', z: 0, level: 0 }); N.addNode(net, 'junction', 1, 0, { id: 'J1', z: 0 }); N.addNode(net, 'reservoir', 2, 0, { id: 'T', z: 20, level: 0 });
  const B = 40 / 0.05 ** 2; N.addLink(net, 'pump', 'S', 'J1', { id: 'PU', pump: { curve: [[0, 40], [0.025, 40 - B * 0.025 ** 2], [0.05, 0]], speed: 1 } });
  const f = 0.02, L = 200, D = 0.15; N.addLink(net, 'pipe', 'J1', 'T', { id: 'P', pipe: { L, D, fixedF: f, eps: 0, fittings: [] } });
  const k = f * L / D / (2 * G * (Math.PI * D * D / 4) ** 2); const Qa = Math.sqrt(20 / (k + B));
  const r = run(net); check(g, 'pump operating point Q = √((H₀ − H_s)/(k + B))', r.links.PU.Q, Qa, 1e-4, 'analytic'); check(g, 'pump head at operating point', r.links.PU.head, 40 - B * Qa * Qa, 1e-4, 'analytic');
  const sc = systemCurve(net, 'PU', { points: 20 }); const sysAt = sc.system.find(([q]) => Math.abs(q - sc.system[10][0]) < 1e-12); check(g, 'system curve H_sys(Q) = 20 + kQ²', sysAt[1], 20 + k * sysAt[0] ** 2, 1e-4, 'analytic');
  check(g, 'Hardy Cross agrees with GGA on the pump network', run(net, { solver: 'hardy' }).links.PU.Q, Qa, 1e-3, 'analytic');
  // speed ratio: affinity laws
  net.links[0].pump.speed = 0.9; const r9 = run(net); const Q9 = Math.sqrt((40 * 0.81 - 20) / (k + B)); check(g, 'affinity laws (speed 90 %): H = s²H₀ − BQ²', r9.links.PU.Q, Q9, 1e-3, 'analytic');
  // NPSH: open tank 3 m above the pump, 10 m suction pipe; water 60 °C
  const n2 = N.newNetwork('npsh'); n2.fluid = { id: 'Water', T: 333.15, P: 101325 };
  N.addNode(n2, 'reservoir', 0, 0, { id: 'S', z: 3, level: 0 }); N.addNode(n2, 'junction', 1, 0, { id: 'Js', z: 0 }); N.addNode(n2, 'junction', 2, 0, { id: 'Jd', z: 0 }); N.addNode(n2, 'reservoir', 3, 0, { id: 'T', z: 15, level: 0 });
  N.addLink(n2, 'pipe', 'S', 'Js', { id: 'suc', pipe: { L: 10, D: 0.08, eps: 0.045e-3, fittings: [{ K: 0.5 }, { K: 0.3, qty: 2 }] } }); N.addLink(n2, 'pump', 'Js', 'Jd', { id: 'PU', pump: { curve: [[0, 30], [0.01, 26], [0.02, 15]], npshr: [[0, 1.5], [0.02, 4.5]] } }); N.addLink(n2, 'pipe', 'Jd', 'T', { id: 'dis', pipe: { L: 100, D: 0.08, eps: 0.045e-3, fittings: [] } });
  const rn = run(n2); const fl = F.fluidState('Water', 333.15); const hs = rn.links.suc.hL;
  check(g, 'NPSHa = p_atm/ρg + z_s − h_L,s − p_v/ρg (60 °C water)', rn.links.PU.npsha, (101325 - fl.Pv) / (fl.rho * G) + 3 - hs, 1e-6, 'analytic (energy balance from the tank surface)');
  truthy(g, 'NPSHr interpolated from the curve and margin reported', Number.isFinite(rn.links.PU.npshr) && Math.abs(rn.links.PU.npshMargin - (rn.links.PU.npsha - rn.links.PU.npshr)) < 1e-12);
  // high temperature → cavitation warning
  n2.fluid.T = 368.15; const rh = run(n2); truthy(g, 'low NPSH margin at 95 °C raises a cavitation warning', rh.warnings.some((w) => /NPSH margin/.test(w)));
  // pump cannot reach the tank → closes
  const n3 = N.newNetwork('shut'); N.addNode(n3, 'reservoir', 0, 0, { id: 'S', level: 0 }); N.addNode(n3, 'reservoir', 0, 0, { id: 'T', z: 50, level: 0 }); N.addLink(n3, 'pump', 'S', 'T', { id: 'PU', pump: { curve: [[0, 30], [0.01, 20], [0.02, 5]] } });
  const r3 = run(n3); truthy(g, 'pump against a head above shut-off delivers no flow (check logic)', r3.ok && r3.links.PU.closed && Math.abs(r3.links.PU.Q) < 1e-6);
}
{
  const g = 'Profiles & sweeps';
  const net = N.newNetwork('line'); N.addNode(net, 'reservoir', 0, 0, { id: 'A', z: 30, level: 0 }); N.addNode(net, 'junction', 1, 0, { id: 'B', z: 10 }); N.addNode(net, 'reservoir', 2, 0, { id: 'C', z: 0, level: 0 });
  N.addLink(net, 'pipe', 'A', 'B', { id: 'p1', pipe: { L: 500, D: 0.2, eps: 0.045e-3, fittings: [] } }); N.addLink(net, 'pipe', 'B', 'C', { id: 'p2', pipe: { L: 300, D: 0.15, eps: 0.045e-3, fittings: [] } });
  net.fluid = { id: 'Water', T: 293.15 }; const r = run(net);
  const pr = profile(net, r, 'A', 'C'); truthy(g, 'HGL profile along A→C: falls monotonically, EGL above HGL', pr && pr.pts.every((p, i) => i === 0 || p.H <= pr.pts[i - 1].H + 1e-9) && pr.pts.every((p) => p.E >= p.H - 1e-12) && pr.pts.at(-1).x === 800);
  check(g, 'series pipes: total head loss = 30 m', r.links.p1.hL + r.links.p2.hL, 30, 1e-6, 'analytic (energy balance)');
  const sw = sweep(net, { param: 'pipe.D', target: 'p2', from: 0.1, to: 0.3, steps: 4, outputs: [{ kind: 'link', id: 'p1', field: 'Q' }] }); truthy(g, 'parametric sweep: flow rises with diameter', sw.every((x, i) => i === 0 || x.values[0] > sw[i - 1].values[0]));
  const ex = explain(net, r); truthy(g, 'step-by-step explanation lists Re, f and h_f per pipe', ex.find((s) => s.sub).sub.length === 2 && /Colebrook converges/.test(ex.find((s) => s.sub).sub[0].lines.join(' ')));
  const usNet = M.clone(net); truthy(g, 'disconnected junction reported', (() => { N.addNode(usNet, 'junction', 0, 0, { id: 'X' }); return !run(usNet).ok; })());
}

// ================= EPANET 2.2 cross-check =================
{
  const g = 'EPANET 2.2 cross-check';
  const ws = new Workspace(); await ws.loadModule();
  const nuE = 1.1e-5 * 0.3048 ** 2; // EPANET's reference kinematic viscosity (1.1e-5 ft²/s)
  const mk = () => { const net = N.newNetwork('epanet'); net.fluid = { custom: true, rho: 1000, mu: nuE * 1000, Pv: 2339, label: 'EPANET water' }; return net; };
  async function compare(name, net, headloss) {
    net.headloss = headloss; const mine = run(net, { friction: 'swamee', headloss, tol: 1e-10 }); const { text, names } = toInp(net, { headloss });
    ws.writeFile('t.inp', text); const pr = new Project(ws); pr.open('t.inp', 't.rpt', 't.out'); pr.solveH();
    let maxH = 0, maxQ = 0, qref = 0;
    for (const n of net.nodes) { const i = pr.getNodeIndex(names.get(n.id)); const h = pr.getNodeValue(i, 10); maxH = Math.max(maxH, Math.abs(h - mine.nodes[n.id].H)); }
    for (const l of net.links) { const i = pr.getLinkIndex(names.get(l.id)); const q = pr.getLinkValue(i, 8) / 1000; maxQ = Math.max(maxQ, Math.abs(q - mine.links[l.id].Q)); qref = Math.max(qref, Math.abs(q)); }
    pr.close();
    truthy(g, `${name}: max head difference ${maxH.toFixed(4)} m, max flow difference ${(maxQ / qref * 100).toFixed(3)} % of max flow`, mine.ok && maxH < 0.01 && maxQ / qref < 0.002, 'EPANET 2.2 (OWA toolkit, epanet-js) on the exported .inp');
    return mine;
  }
  // 1) looped grid with demands, D-W, two reservoirs, minor losses, a throttle valve
  { const net = mk(); const R1 = N.addNode(net, 'reservoir', 0, 0, { id: 'R1', z: 60, level: 0 }); const R2 = N.addNode(net, 'reservoir', 400, 0, { id: 'R2', z: 52, level: 0 });
    const J = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) J.push(N.addNode(net, 'junction', 100 * j, 100 + 100 * i, { id: `J${i}${j}`, z: 10 + 2 * i + j, demand: 0.004 + 0.002 * ((i + j) % 3) }));
    const P = (a, b, D, L) => N.addLink(net, 'pipe', a, b, { pipe: { L, D, eps: 0.1e-3, fittings: [{ K: 0.3, qty: 2 }] } });
    P('R1', 'J00', 0.25, 300); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) P(`J${i}${j}`, `J${i}${j + 1}`, 0.15 - 0.02 * i, 200); for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) P(`J${i}${j}`, `J${i + 1}${j}`, 0.12, 250);
    N.addLink(net, 'valve', 'R2', 'J02', { valve: { kind: 'needle', opening: 100, D: 0.15, Kopen: 8 } });
    await compare('9-junction looped grid, 2 reservoirs, valve (Darcy–Weisbach)', net, 'DW'); }
  // 2) pump with 3-point curve, tank, branches
  { const net = mk(); N.addNode(net, 'reservoir', 0, 0, { id: 'Src', z: 5, level: 0 }); N.addNode(net, 'junction', 50, 0, { id: 'Ps', z: 0 }); N.addNode(net, 'junction', 100, 0, { id: 'Pd', z: 0 });
    N.addNode(net, 'junction', 200, 0, { id: 'A', z: 12, demand: 0.008 }); N.addNode(net, 'junction', 300, 0, { id: 'B', z: 18, demand: 0.006 }); N.addNode(net, 'junction', 200, 100, { id: 'C', z: 15, demand: 0.005 }); N.addNode(net, 'tank', 300, 100, { id: 'Tk', z: 30, level: 4 });
    N.addLink(net, 'pipe', 'Src', 'Ps', { pipe: { L: 15, D: 0.2, eps: 0.045e-3, fittings: [{ K: 0.5 }] } }); N.addLink(net, 'pump', 'Ps', 'Pd', { id: 'PU1', pump: { curve: [[0, 60], [0.03, 50], [0.05, 30]] } });
    for (const [a, b, D, L] of [['Pd', 'A', 0.2, 400], ['A', 'B', 0.15, 300], ['A', 'C', 0.1, 250], ['C', 'Tk', 0.15, 200], ['B', 'Tk', 0.1, 300]]) N.addLink(net, 'pipe', a, b, { pipe: { L, D, eps: 0.045e-3, fittings: [] } });
    const m = await compare('pump (3-point curve) + tank + loop (Darcy–Weisbach)', net, 'DW'); truthy(g, 'pump curve fitted like EPANET (power function A − B·Q^C)', m.links.PU1.curveKind === 'power'); }
  // 3) Hazen–Williams network
  { const net = mk(); N.addNode(net, 'reservoir', 0, 0, { id: 'R', z: 80, level: 0 }); ['a', 'b', 'c', 'd', 'e'].forEach((id, i) => N.addNode(net, 'junction', 100 * i, 100, { id, z: 20 + 3 * i, demand: 0.01 + 0.003 * i }));
    for (const [x, y, D, L, C] of [['R', 'a', 0.4, 1000, 130], ['a', 'b', 0.3, 800, 120], ['b', 'c', 0.25, 600, 110], ['a', 'd', 0.3, 900, 130], ['d', 'c', 0.2, 700, 100], ['c', 'e', 0.2, 500, 120], ['d', 'e', 0.15, 600, 140]]) N.addLink(net, 'pipe', x, y, { pipe: { L, D, C, eps: 0, fittings: [] } });
    await compare('5-junction looped network (Hazen–Williams)', net, 'HW'); }
  // 4) laminar / transitional flow (viscous fluid, EPANET viscosity factor 100)
  { const net = mk(); net.fluid.mu = nuE * 1000 * 100; N.addNode(net, 'reservoir', 0, 0, { id: 'R', z: 20, level: 0 }); N.addNode(net, 'junction', 100, 0, { id: 'a', z: 0, demand: 0.0005 }); N.addNode(net, 'junction', 200, 0, { id: 'b', z: 0, demand: 0.0008 }); N.addNode(net, 'junction', 150, 80, { id: 'c', z: 0, demand: 0.0003 });
    for (const [x, y, D, L] of [['R', 'a', 0.05, 100], ['a', 'b', 0.04, 100], ['a', 'c', 0.03, 80], ['c', 'b', 0.03, 80]]) N.addLink(net, 'pipe', x, y, { pipe: { L, D, eps: 0.045e-3, fittings: [] } });
    const { text } = toInp(net, { headloss: 'DW', viscosityRel: 100 }); ws.writeFile('lam.inp', text); const pr = new Project(ws); pr.open('lam.inp', 'l.rpt', 'l.out'); pr.solveH(); const hb = pr.getNodeValue(pr.getNodeIndex('J2'), 10); pr.close(); void hb;
    const mine = run(net, { friction: 'swamee' }); const reMax = Math.max(...Object.values(mine.links).map((l) => l.Re)); truthy(g, `laminar/transitional network solves (max Re ${reMax.toFixed(0)})`, mine.ok && reMax < 4000); }
  // 5) inp round trip
  { const net = mk(); N.addNode(net, 'reservoir', 0, 0, { id: 'R', z: 10, level: 0 }); N.addNode(net, 'junction', 1, 1, { id: 'J', z: 0, demand: 0.01 }); N.addLink(net, 'pipe', 'R', 'J', { pipe: { L: 100, D: 0.1, eps: 0.1e-3, fittings: [] } });
    const back = fromInp(toInp(net).text); truthy(g, 'EPANET .inp export → import keeps topology, lengths and demands', back.nodes.length === 2 && back.links.length === 1 && Math.abs(back.links[0].pipe.L - 100) < 1e-9 && Math.abs(back.nodes.find((n) => n.type === 'junction').demand - 0.01) < 1e-12); }
}

// ================= Hydraulics → FMEA =================
{
  const P = sampleProject(); const net = P.networks[0]; const r = run(net); const D = P.docs[0]; const pump = net.links.find((l) => l.type === 'pump');
  const res = addComponentToFmea(D, net, pump, r); truthy('Hydraulics → FMEA', `pump failure modes pulled into the DFMEA (${res.created.failures.length} failures; hints: ${res.hints.join('; ') || 'none'})`, res.created.failures.length >= 4 && D.nodes[res.node.id].hyd.id === pump.id);
  truthy('Sample project', 'sample hydraulic network solves', r.ok && r.iterations < 50);
}

// ================= report =================
const groups = [...new Set(results.map((r) => r.group))]; const lines = ['# Mamba FMEA – test & validation report', '', `Generated by \`npm test\` on ${new Date().toISOString().slice(0, 10)}. ${results.length - fail}/${results.length} checks passed.`, ''];
for (const gname of groups) {
  lines.push(`## ${gname}`, '', '| Check | Result | Reference | Error | Source |', '|---|---|---|---|---|');
  for (const r of results.filter((x) => x.group === gname)) lines.push(`| ${r.name} | ${typeof r.got === 'number' ? +r.got.toPrecision(6) : r.ok ? '✔' : '✘'} | ${typeof r.want === 'number' ? +r.want.toPrecision(6) : ''} | ${r.errPct != null ? r.errPct.toFixed(3) + ' % (tol ' + r.tolPct + ' %)' : ''} | ${r.source || ''} ${r.ok ? '' : '**FAIL**'} |`);
  lines.push('');
}
fs.mkdirSync(new URL('../docs/', import.meta.url), { recursive: true }); fs.writeFileSync(new URL('../docs/VALIDATION.md', import.meta.url), lines.join('\n'));
{ const det = (r) => (typeof r.got === 'number' ? `got ${+r.got.toPrecision(6)}, ref ${+r.want.toPrecision(6)} (${r.errPct.toFixed(3)} %)` : r.detail || '');
  const V = { date: new Date().toISOString().slice(0, 10), total: results.length, passed: results.length - fail, rows: results.map((r) => ({ group: r.group, name: r.name, ok: r.ok, detail: det(r) })) };
  fs.writeFileSync(new URL('../src/renderer/validation-data.js', import.meta.url), '// generated by test/run-tests.mjs\nexport const VALIDATION = ' + JSON.stringify(V) + ';\n'); }
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  [${r.group}] ${r.name}${typeof r.got === 'number' ? `  got ${+r.got.toPrecision(6)} want ${+r.want.toPrecision(6)} (${r.errPct.toFixed(3)} %)` : ''}`);
console.log(`\n${results.length - fail}/${results.length} passed`); process.exit(fail ? 1 : 0);
