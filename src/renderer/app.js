// App shell: top bar, navigation, project open/save/autosave, Excel/PDF, self-test.
import CoolPropModule from '../vendor/coolprop/coolprop.js';
import { setCoolProp, useEngine, backendInfo } from '../core/fluids/fluids.js';
import * as engProps from '../vendor/engsuite-core/props.js';
import { newProject, newDoc } from '../core/fmea/model.js';
import { syncLinks } from '../core/fmea/link.js';
import { sampleProject } from '../core/samples.js';
import { h, toast, modal, confirmBox, select } from './ui.js';
import { t, setLang } from './i18n.js';
import { store, commit, setProject, undo, redo, markSaved, onChange, curDoc, curNet } from './store.js';
import { renderDoc, DOC_TABS } from './fmea.js';
import { renderHyd } from './hyd.js';
import { renderHome, renderLibrary, renderSettings, renderAbout } from './pages.js';
import { fmeaReportHTML } from './report.js';
import { runSelftest } from './selftest.js';

export let info = {};
const PAGES = { home: renderHome, doc: renderDoc, hyd: renderHyd, library: renderLibrary, settings: renderSettings, about: renderAbout };
let cleanup = null;

export function go(page, extra = {}) {
  Object.assign(store.ui, { page }, extra);
  if (page === 'doc' && !curDoc()) store.ui.page = 'home';
  if (page === 'hyd' && !curNet()) { store.ui.netId = store.project.networks[0]?.id || null; }
  render();
}
export function render() {
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  renderTop(); renderNav();
  const main = document.getElementById('main'); const keep = main.scrollTop; main.replaceChildren();
  try { const r = PAGES[store.ui.page]?.(main, { go, render }); if (typeof r === 'function') cleanup = r; } catch (e) { console.error(e); main.append(h('div', { class: 'msg error' }, 'Page error: ' + e.message)); }
  if (store.ui.keepScroll) main.scrollTop = keep; store.ui.keepScroll = false;
}
/** Re-render after a model change, keeping the scroll position. */
export function refresh() { store.ui.keepScroll = true; render(); }

function renderTop() {
  const ta = document.getElementById('topActions'); ta.replaceChildren();
  document.getElementById('projName').textContent = store.project.name + (store.dirty ? ' •' : '');
  ta.append(
    select(store.ui.lang, [['en', 'English'], ['sv', 'Svenska'], ['ar', 'العربية']], (v) => { store.ui.lang = v; store.project.settings.lang = v; setLang(v); localStorage.setItem('mamba-fmea-lang', v); render(); }, { title: 'Language', id: 'langSel' }),
    h('button', { onclick: newProj, title: t('New project') }, '＋ ' + t('New')),
    h('button', { onclick: () => openProj() }, '📂 ' + t('Open')),
    h('button', { onclick: () => saveProj(false), title: 'Ctrl+S' }, '💾 ' + t('Save')),
    h('button', { onclick: () => saveProj(true) }, t('Save as')),
    h('span', { class: 'sep' }),
    h('button', { onclick: () => importXlsx(), title: t('Import an FMEA form from Excel') }, '⇣ ' + t('Import Excel')),
    h('button', { onclick: () => exportXlsx(), title: t('Export all FMEA documents to Excel') }, '⇡ ' + t('Export Excel')),
    h('button', { class: 'primary', onclick: () => exportPdf() }, '📄 ' + t('PDF report')),
    h('span', { class: 'sep' }),
    h('button', { onclick: () => { if (undo()) toast(t('Undone')); }, title: 'Ctrl+Z', disabled: !store.undo.length }, '↶'),
    h('button', { onclick: () => { if (redo()) toast(t('Redone')); }, title: 'Ctrl+Y', disabled: !store.redo.length }, '↷'),
  );
}
const TYPE_IC = { DFMEA: '⚙', PFMEA: '🏭', MSR: '📡' };
function renderNav() {
  const nav = document.getElementById('sidebar'); nav.replaceChildren(); const P = store.project; const u = store.ui;
  const item = (active, ic, label, on, extra) => h('div', { class: 'nav-item' + (active ? ' active' : ''), onclick: on }, h('span', { class: 'ic' }, ic), h('span', { class: 'nl' }, label), extra || null);
  nav.append(h('div', { class: 'nav-group' }, item(u.page === 'home', '⌂', t('Project overview'), () => go('home'))));
  const g1 = h('div', { class: 'nav-group' }, h('div', { class: 'nav-group-title' }, t('FMEA documents'), h('button', { class: 'nav-add', title: t('New FMEA'), onclick: (e) => { e.stopPropagation(); newDocDialog(); } }, '+')));
  for (const d of P.docs) g1.append(item(u.page === 'doc' && u.docId === d.id, TYPE_IC[d.type], d.title, () => go('doc', { docId: d.id, tab: u.docId === d.id ? u.tab : 'planning' }), h('span', { class: 'tbadge t-' + d.type }, d.type === 'MSR' ? 'MSR' : d.type[0] + 'FMEA')));
  if (!P.docs.length) g1.append(h('div', { class: 'nav-empty' }, t('No documents yet')));
  const g2 = h('div', { class: 'nav-group' }, h('div', { class: 'nav-group-title' }, t('Hydraulics'), h('button', { class: 'nav-add', title: t('New network'), onclick: (e) => { e.stopPropagation(); import('./hyd.js').then((m) => m.newNetworkDialog()); } }, '+')));
  for (const n of P.networks) g2.append(item(u.page === 'hyd' && u.netId === n.id, '💧', n.name, () => go('hyd', { netId: n.id })));
  if (!P.networks.length) g2.append(h('div', { class: 'nav-empty' }, t('No networks yet')));
  const g3 = h('div', { class: 'nav-group' }, h('div', { class: 'nav-group-title' }, t('Tools')),
    item(u.page === 'library', '📚', t('Templates & library'), () => go('library')), item(u.page === 'settings', '⚙', t('Settings & rating tables'), () => go('settings')), item(u.page === 'about', 'ⓘ', t('About & validation'), () => go('about')));
  nav.append(g1, g2, g3);
}
export async function newDocDialog(type0 = 'DFMEA') {
  const type = h('select', {}, [['DFMEA', t('Design FMEA (DFMEA)')], ['PFMEA', t('Process FMEA (PFMEA)')], ['MSR', t('Supplemental FMEA for Monitoring & System Response (FMEA-MSR)')]].map(([v, l]) => h('option', { value: v }, l))); type.value = type0;
  const title = h('input', { type: 'text', value: '', placeholder: t('e.g. Coolant pump unit') }); const root = h('input', { type: 'text', placeholder: t('Name of the system / process item') });
  const r = await modal(t('New FMEA'), h('div', { class: 'form' }, h('label', {}, t('Type')), type, h('label', {}, t('Title')), title, h('label', {}, t('Top-level element')), root), [{ label: t('Create'), primary: true, value: () => ({ type: type.value, title: title.value, root: root.value }) }]);
  if (!r) return; const d = newDoc(r.type, r.title || `${r.type} ${new Date().toISOString().slice(0, 10)}`, r.root || r.title || undefined);
  store.project.docs.push(d); commit('new doc', { render: false }); go('doc', { docId: d.id, tab: 'planning' });
}
async function newProj() {
  if (store.dirty && !(await confirmBox(t('New project'), t('Discard unsaved changes?')))) return;
  const choice = await modal(t('New project'), h('p', {}, t('Start empty or from the worked example (coolant pump DFMEA + FMEA-MSR + cooling-water network)?')), [{ label: t('Worked example'), value: 'sample' }, { label: t('Empty project'), value: 'empty', primary: true }]);
  if (!choice) return; setProject(choice === 'sample' ? sampleProject() : newProject(t('Untitled project'))); store.ui.docId = store.project.docs[0]?.id || null; store.ui.netId = store.project.networks[0]?.id || null; go('home');
}
export function projectJSON() { syncLinks(store.project); return JSON.stringify(store.project, null, 1); }
export async function saveProj(asNew, forcePath) {
  const fp = await window.host.saveProject({ json: projectJSON(), filePath: forcePath || (asNew ? null : store.filePath), name: store.project.name });
  if (fp) { markSaved(fp); toast(t('Saved') + ': ' + fp); renderTop(); }
  return fp;
}
export function loadJSON(json, fp) {
  const p = JSON.parse(json); if (p.format !== 'mamba-fmea') throw new Error(t('Not a Mamba FMEA project'));
  p.networks = p.networks || []; p.library = p.library || []; p.revisions = p.revisions || []; p.settings = { lang: 'en', rpnHigh: 200, rpnMedium: 100, criteriaOverrides: {}, ...(p.settings || {}) };
  setProject(p, fp); store.ui.docId = p.docs[0]?.id || null; store.ui.netId = p.networks[0]?.id || null;
}
export async function openProj(fp) {
  if (!fp && store.dirty && !(await confirmBox(t('Open'), t('Discard unsaved changes?')))) return null;
  const r = await window.host.openProject(fp); if (!r) return null;
  try { loadJSON(r.json, r.filePath); go('home'); toast(t('Opened') + ': ' + r.filePath); } catch (e) { toast(e.message, 'error'); }
  return r;
}
export async function exportXlsx(outPath, docIds) {
  try { const r = await window.host.exportXlsx({ json: projectJSON(), name: store.project.name.replace(/[^\w\- ]+/g, '').trim() || 'fmea', docIds, outPath }); if (r && !outPath) toast(t('Excel saved') + ': ' + r.path); return r; } catch (e) { toast(e.message, 'error'); return null; }
}
export async function importXlsx(inPath) {
  let type = 'DFMEA';
  if (!inPath) { const sel = h('select', {}, ['DFMEA', 'PFMEA', 'MSR'].map((v) => h('option', { value: v }, v))); const ok = await modal(t('Import Excel'), h('div', { class: 'form' }, h('p', {}, t('Workbooks exported by Mamba FMEA are restored losslessly. Other FMEA forms (AIAG-VDA or classic RPN layouts) are mapped by their column headers.')), h('label', {}, t('Document type for foreign forms')), sel), [{ label: t('Choose file…'), value: () => sel.value, primary: true }]); if (!ok) return null; type = ok; }
  try {
    const r = await window.host.importXlsx({ type, inPath }); if (!r) return null;
    if (r.lossless && r.project) { const add = inPath ? 'merge' : await modal(t('Import Excel'), h('p', {}, t('This workbook contains a complete Mamba FMEA project.')), [{ label: t('Add its documents to this project'), value: 'merge' }, { label: t('Open as project'), value: 'open', primary: true }]); if (!add) return null;
      if (add === 'open') { setProject(r.project); store.ui.docId = r.project.docs[0]?.id; go('home'); } else { store.project.docs.push(...r.project.docs); commit('import'); } }
    else { store.project.docs.push(...r.docs); commit('import', { render: false }); store.ui.docId = r.docs[0]?.id; go('doc', { tab: 'form' }); }
    toast(t('Imported') + ': ' + (r.lossless ? r.project.docs.length : r.docs.length) + ' ' + t('document(s)') + (r.warnings?.length ? ' — ' + r.warnings.length + ' ' + t('warning(s)') : ''));
    return r;
  } catch (e) { toast(e.message, 'error'); return null; }
}
export async function exportPdf(outPath) {
  try {
    if (store.ui.page === 'hyd') { const m = await import('./hyd.js'); return await m.exportHydPdf(outPath); }
    const d = curDoc() || store.project.docs[0]; if (!d) { toast(t('Nothing to report yet.'), 'error'); return null; }
    const html = fmeaReportHTML(store.project, d, { version: info.version });
    const r = await window.host.exportPdf({ html, name: d.title.replace(/[^\w\- ]+/g, '').trim() || 'fmea', outPath, landscape: true });
    if (r && !outPath) toast(t('Report saved') + ': ' + r.path); return r;
  } catch (e) { toast(e.message, 'error'); return null; }
}
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return; const tag = e.target.tagName; const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); saveProj(e.shiftKey); }
  else if (k === 'o') { e.preventDefault(); openProj(); }
  else if ((k === 'z' || k === 'y') && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); (k === 'z' && !e.shiftKey ? undo : redo)(); }
});
onChange((label) => { if (label === 'quiet') { renderTop(); return; } if (label === 'load' || label === 'undo' || label === 'redo') { if (!curDoc() && store.ui.page === 'doc') store.ui.page = 'home'; refresh(); } else refresh(); });
window.addEventListener('beforeunload', (e) => { if (store.dirty && !info.selftest && !info.shots && !window.__closing) { e.returnValue = false; window.__closing = true; confirmBox(t('Quit'), t('Discard unsaved changes?')).then((ok) => { if (ok) window.close(); else window.__closing = false; }); } });
window.__mamba = { go, render, refresh, store, saveProj, openProj, loadJSON, exportXlsx, importXlsx, exportPdf, projectJSON, setProject, sampleProject, commit, DOC_TABS };

async function boot() {
  info = await window.host.appInfo();
  document.getElementById('ver').textContent = 'v' + info.version;
  store.ui.lang = info.lang || localStorage.getItem('mamba-fmea-lang') || 'en'; setLang(store.ui.lang);
  store.ui.units = localStorage.getItem('mamba-fmea-units') || 'SI';
  try { const wasm = await window.host.readAsset('vendor/coolprop/coolprop.wasm'); const cp = await CoolPropModule({ wasmBinary: wasm }); setCoolProp(cp); engProps.setCoolProp(cp); useEngine({ prop: engProps.prop }); } catch (e) { console.warn('CoolProp not loaded, using built-in correlations', e); }
  let loaded = false;
  if (info.openFile) { try { const r = await window.host.openProject(info.openFile); loadJSON(r.json, r.filePath); loaded = true; } catch (e) { toast(e.message, 'error'); } }
  if (!loaded && info.autosave) { try { const r = await window.host.openProject(info.autosave); loadJSON(r.json, null); store.dirty = true; loaded = true; toast(t('Restored the last session (autosave). Save it to keep it.')); } catch {} }
  if (!loaded) { setProject(sampleProject()); store.ui.docId = store.project.docs[0]?.id; store.ui.netId = store.project.networks[0]?.id; }
  document.getElementById('loading')?.remove();
  go('home');
  if (info.selftest || info.shots) runSelftest(window.__mamba, info);
}
export const coolpropReady = () => backendInfo().coolprop;
boot().catch((e) => { document.getElementById('main').innerHTML = '<div class="msg error">Startup failed: ' + e.message + '</div>'; console.error(e); window.host?.selftestDone({ ok: false, report: { lines: ['boot failed: ' + e.stack] } }); });
