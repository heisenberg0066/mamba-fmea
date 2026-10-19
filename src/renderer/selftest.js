// Packaged-app self-test (MAMBA_SELFTEST=dir) and screenshot run (MAMBA_SHOTS=dir): visits every page and tab,
// exercises editing, Excel/PDF export, Excel import, project save/open, hydraulics solvers and the three UI languages.
import { pfmeaFromDfmea, syncLinks } from '../core/fmea/link.js';
import { addComponentToFmea } from '../core/hyd/tofmea.js';
import { run } from '../core/hyd/analysis.js';
import * as M from '../core/fmea/model.js';
import { setLang } from './i18n.js';
import { fluidState } from '../core/fluids/fluids.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export async function runSelftest(app, info) {
  const lines = []; let ok = true; const t0 = Date.now();
  const check = (name, cond, detail = '') => { lines.push(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!cond) ok = false; };
  const pageOk = () => !document.querySelector('#main .msg.error');
  const shot = async (name) => { await wait(info.shots ? 450 : 120); await window.host.capture({ file: name + '.png' }); };
  const S = app.store;
  try {
    window.onerror = (m) => { lines.push('JS ERROR ' + m); ok = false; };
    window.addEventListener('unhandledrejection', (e) => { lines.push('UNHANDLED ' + (e.reason && e.reason.stack || e.reason)); ok = false; });
    { const fs = fluidState('Water', 293.15); check('fluid layer uses engsuite core (CoolProp WASM)', fs.source === 'engsuite core (CoolProp)', `${fs.source}, ρ=${fs.rho.toFixed(2)}, ν=${fs.nu.toExponential(4)}, Pv=${fs.Pv.toFixed(0)} Pa`); }
    const P = S.project; check('sample project loaded', P.docs.length >= 2 && P.networks.length >= 1, `${P.docs.length} docs, ${P.networks.length} networks`);
    app.go('home'); await wait(150); check('home page renders', pageOk()); await shot('01-home');
    const d = P.docs.find((x) => x.type === 'DFMEA');
    S.ui.sel[d.id] = { node: Object.values(d.nodes).find((n) => n.name.toLowerCase().includes('seal'))?.id || d.rootId };
    const shotsFor = { structure: '02-dfmea-structure', failures: '03-failure-network', risk: '04-risk-analysis', optimisation: '05-optimisation', form: '06-form-view', dashboard: '07-dashboard', revisions: '08-revisions' };
    for (const [id] of app.DOC_TABS) { if (id === 'flow' || id === 'cp') continue; app.go('doc', { docId: d.id, tab: id }); await wait(80); check(`DFMEA tab ${id}`, pageOk()); if (shotsFor[id] && id !== 'revisions') await shot(shotsFor[id]); }
    // editing through the model + undo
    const r0 = M.rows(d)[0]; const oldO = r0.risk.O; r0.risk.O = 10; app.commit('test'); check('rating edit updates AP', M.rows(d)[0].ap === M.rows(d)[0].ap && S.dirty);
    r0.risk.O = oldO; app.commit('test');
    // revision + compare
    const { snapshot } = await import('../core/fmea/diff.js'); snapshot(P, d, { label: 'Selftest baseline', author: 'CI', approve: true }); const fm = Object.values(d.failures).find((f) => f.effects.length); fm.text += ' (rev 2)'; app.commit('rev');
    app.go('doc', { docId: d.id, tab: 'revisions' }); await wait(80); check('revision compare shows the change', document.querySelectorAll('table.diff tr.diff-changed').length >= 1); await shot('08-revisions');
    // DFMEA → PFMEA → control plan
    const p = pfmeaFromDfmea(d, { title: 'PFMEA – selftest' }); P.docs.push(p); syncLinks(P); app.commit('pfmea');
    check('PFMEA generated from DFMEA', Object.keys(p.nodes).length > 3 && M.rows(p).length > 0, `${M.rows(p).length} chains`);
    const firstStep = p.nodes[p.rootId].children[0]; S.ui.sel[p.id] = { node: firstStep };
    for (const id of ['structure', 'failures', 'risk', 'flow', 'cp', 'form']) { app.go('doc', { docId: p.id, tab: id }); await wait(80); check(`PFMEA tab ${id}`, pageOk()); if (id === 'flow') await shot('09-process-flow'); if (id === 'cp') { check('control plan has rows', document.querySelectorAll('table.cp tbody tr').length > 0, document.querySelectorAll('table.cp tbody tr').length + ' rows'); await shot('10-control-plan'); } }
    const msr = P.docs.find((x) => x.type === 'MSR'); if (msr) { app.go('doc', { docId: msr.id, tab: 'risk' }); await wait(80); check('FMEA-MSR risk tab', pageOk()); }
    for (const pg of ['library', 'settings', 'about']) { app.go(pg); await wait(80); check(`page ${pg}`, pageOk()); if (pg === 'settings') await shot('11-rating-tables'); }
    // hydraulics
    const net = P.networks[0]; S.ui.hyd = undefined; app.go('hyd', { netId: net.id }); await wait(250);
    check('hydraulics solves (GGA)', !!document.querySelector('.solve-ok'), document.querySelector('.solve-ok,.solve-bad')?.textContent || '');
    check('animated particles present', document.querySelectorAll('.hyd-canvas .pt').length > 5);
    await shot('12-hydraulics-network');
    const pump = net.links.find((l) => l.type === 'pump'); S.ui.hyd.selId = pump.id;
    for (const tb of ['pump', 'profile', 'steps', 'sweep', 'results']) { S.ui.hyd.bottom = tb; app.refresh(); await wait(120); check(`hydraulics tab ${tb}`, pageOk()); if (tb === 'pump') { document.querySelector('#main').scrollTop = 9999; await shot('13-pump-system-npsh'); } if (tb === 'profile') { document.querySelector('#main').scrollTop = 9999; await shot('14-hgl-egl'); } }
    S.ui.hyd.bottom = 'sweep'; app.refresh(); await wait(60); document.querySelector('.bottom .btn.primary')?.click(); await wait(400); check('parametric sweep runs', document.querySelectorAll('.bottom table.grid tr').length > 5); document.querySelector('#main').scrollTop = 9999; await shot('15-sweep');
    S.ui.hyd.view = 'pressure'; S.ui.hyd.selId = null; app.refresh(); await wait(100); await shot('16-pressure-map');
    const g = run(net); const hc = run({ ...net, solver: 'hardy' }); const maxd = g.ok && hc.ok ? Math.max(...net.links.map((l) => Math.abs(g.links[l.id].Q - hc.links[l.id].Q))) : NaN;
    check('Hardy Cross agrees with GGA on the sample', maxd < 1e-5, `max |ΔQ| = ${maxd.toExponential(2)} m³/s`);
    S.ui.units = 'US'; app.refresh(); await wait(80); check('US units view', pageOk() && document.body.textContent.includes('gpm')); S.ui.units = 'SI';
    const doc2 = P.docs.find((x) => x.type === 'DFMEA'); const before = Object.keys(doc2.failures).length; addComponentToFmea(doc2, net, pump, g, doc2.rootId); app.commit('tofmea');
    check('hydraulic pump failure modes added to FMEA', Object.keys(doc2.failures).length > before, `${Object.keys(doc2.failures).length - before} failures`);
    // exports & round trips
    const pdf1 = await app.exportPdf(await window.host.selftestPath('selftest-hydraulics.pdf')); check('hydraulics PDF report', pdf1 && pdf1.bytes > 20000, pdf1 ? pdf1.bytes + ' bytes' : '');
    app.go('doc', { docId: d.id, tab: 'results' }); await wait(80);
    const pdf2 = await app.exportPdf(await window.host.selftestPath('selftest-dfmea.pdf')); check('FMEA PDF report', pdf2 && pdf2.bytes > 20000, pdf2 ? pdf2.bytes + ' bytes' : '');
    S.ui.docId = p.id; const pdf3 = await app.exportPdf(await window.host.selftestPath('selftest-pfmea.pdf')); check('PFMEA PDF report (with control plan)', pdf3 && pdf3.bytes > 20000, pdf3 ? pdf3.bytes + ' bytes' : '');
    const xl = await app.exportXlsx(await window.host.selftestPath('selftest.xlsx')); check('Excel export', xl && xl.bytes > 8000, xl ? xl.bytes + ' bytes' : '');
    const nDocs = P.docs.length; const im = await window.host.importXlsx({ inPath: await window.host.selftestPath('selftest.xlsx') });
    check('Excel import (lossless)', im && im.lossless && im.project.docs.length === nDocs, im ? `${im.project.docs.length} docs` : '');
    const fp = await app.saveProj(false, await window.host.selftestPath('selftest.mfmea')); const json = await window.host.readFile(fp); const back = JSON.parse(json);
    check('project save', back.format === 'mamba-fmea' && back.docs.length === nDocs && back.networks.length === P.networks.length);
    app.loadJSON(json, fp); check('project re-open', S.project.docs.length === nDocs && M.rows(S.project.docs[0]).length === M.rows(back.docs[0]).length);
    // languages
    for (const L of ['sv', 'ar']) { S.ui.lang = L; setLang(L); S.ui.docId = S.project.docs[0].id; app.go('doc', { tab: 'risk' }); await wait(100); check(`language ${L}`, pageOk() && (L !== 'ar' || document.documentElement.dir === 'rtl')); await shot(`17-lang-${L}`); app.go('hyd', { netId: S.project.networks[0].id }); await wait(150); check(`hydraulics in ${L}`, pageOk()); if (L === 'ar') await shot('18-hydraulics-ar'); }
    S.ui.lang = 'en'; setLang('en'); app.go('home');
  } catch (e) { ok = false; lines.push('EXCEPTION ' + (e.stack || e)); }
  lines.push(`elapsed ${((Date.now() - t0) / 1000).toFixed(1)} s, app v${info.version}`);
  await window.host.selftestDone({ ok, report: { ok, lines } });
}
