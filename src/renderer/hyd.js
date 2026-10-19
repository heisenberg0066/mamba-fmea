// Hydraulics module: drag-drop network canvas, property panel, solver, animated flow, colour maps,
// pump/system/NPSH plots, HGL/EGL profile, step-by-step solution, parametric sweeps, EPANET .inp, PDF report, → FMEA.
import * as N from '../core/hyd/network.js';
import { run, systemCurve, profile, sweep, explain, SWEEP_PARAMS, fluidFor } from '../core/hyd/analysis.js';
import { MATERIALS, SIZES, SIZE_FAMILIES, FITTINGS, VALVES, PUMPS, valveK } from '../core/hyd/catalog.js';
import { toInp, fromInp } from '../core/hyd/inp.js';
import { addComponentToFmea } from '../core/hyd/tofmea.js';
import { FLUIDS } from '../core/fluids/fluids.js';
import { UNITS, toU, fromU, uLabel } from '../core/units.js';
import * as FM from '../core/fmea/model.js';
import { h, s, toast, modal, ask, confirmBox, select, field, esc } from './ui.js';
import { t } from './i18n.js';
import { store, commit, curNet } from './store.js';
import { go, refresh, info } from './app.js';
import { xyPlot } from './plot.js';
import { reportShell } from './report.js';

const U = () => store.ui.units || 'SI';
const ui = () => (store.ui.hyd ||= { tool: 'select', selId: null, view: 'velocity', anim: true, labels: 'flow', bottom: 'results', pumpId: null, pathA: null, pathB: null, zoom: 1, pan: { x: 0, y: 0 }, sw: null });
const ap = (el, ...k) => el.append(...k.flat(Infinity).filter((x) => x != null && x !== false));
const fmtN = (v, d = 3) => (v == null || !Number.isFinite(v) ? '–' : Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(2) : (+v.toFixed(d)).toString());
const show = (q, v, d = 3) => fmtN(toU(U(), q, v), d);
let lastRes = null; let raf = 0;

export async function newNetworkDialog() {
  const name = h('input', { type: 'text', value: t('Network') + ' ' + (store.project.networks.length + 1) });
  const tpl = h('select', {}, [['empty', t('Empty canvas')], ['pump', t('Pump between two tanks (starter)')]].map(([v, l]) => h('option', { value: v }, l)));
  const r = await modal(t('New network'), h('div', { class: 'form' }, h('label', {}, t('Name')), name, h('label', {}, t('Start from')), tpl), [{ label: t('Create'), primary: true, value: () => ({ name: name.value, tpl: tpl.value }) }]);
  if (!r) return; const net = N.newNetwork(r.name || 'Network');
  if (r.tpl === 'pump') { const a = N.addNode(net, 'reservoir', 120, 300, { z: 0, level: 2, label: 'Sump' }); const j1 = N.addNode(net, 'junction', 300, 300, { z: 0 }); const j2 = N.addNode(net, 'junction', 420, 300, { z: 0 }); const b = N.addNode(net, 'tank', 640, 160, { z: 15, level: 2, label: 'Tank' });
    N.addLink(net, 'pipe', a.id, j1.id, { pipe: { L: 5, D: 0.0779, size: 'nps80-40', eps: 0.045e-3, fittings: [{ id: 'entrSharp', K: 0.5, qty: 1 }] } }); const pc = PUMPS[1];
    N.addLink(net, 'pump', j1.id, j2.id, { pump: { model: pc.id, curve: pc.curve.map(([q, hh]) => [q / 3600, hh]), npshr: pc.npshr.map(([q, hh]) => [q / 3600, hh]), eff: pc.eff.map(([q, e]) => [q / 3600, e]), speed: 1, on: true } });
    N.addLink(net, 'pipe', j2.id, b.id, { pipe: { L: 60, D: 0.0627, size: 'nps65-40', eps: 0.045e-3, fittings: [{ id: 'elbow90', K: 0.3, qty: 4 }, { id: 'exit', K: 1, qty: 1 }] } }); }
  store.project.networks.push(net); commit('net', { render: false }); go('hyd', { netId: net.id });
}

// ---------------- page ----------------
export function renderHyd(main) {
  const net = curNet(); if (!net) { main.append(h('div', { class: 'panel' }, h('p', {}, t('No networks yet')), h('button', { class: 'btn primary', onclick: newNetworkDialog }, '+ ' + t('New network')))); return; }
  const S = ui(); cancelAnimationFrame(raf);
  if (S.fitted !== net.id) { fitView(net); S.fitted = net.id; }
  try { lastRes = net.nodes.length ? run(net) : null; } catch (e) { lastRes = { ok: false, error: e.message }; }
  const res = lastRes && lastRes.ok ? lastRes : null;
  const tools = [['select', '⬚', t('Select / move')], ['junction', '●', t('Junction')], ['reservoir', '⛆', t('Reservoir')], ['tank', '▭', t('Tank')], ['nozzle', '⊲', t('Nozzle / spray')], ['pipe', '━', t('Pipe')], ['pump', '⊙', t('Pump')], ['valve', '⋈', t('Valve')], ['resistance', '▯', t('Fitting / resistance (r·Qⁿ)')]];
  const pal = h('div', { class: 'palette' }, tools.map(([id, ic, label]) => h('div', { class: 'pal-item' + (S.tool === id ? ' on' : ''), title: label, draggable: N.NODE_TYPES.includes(id) ? 'true' : null, ondragstart: (e) => e.dataTransfer.setData('text/hydnode', id), onclick: () => { S.tool = id; S.linkFrom = null; refresh(); } }, h('span', { class: 'pal-ic' }, ic), h('span', { class: 'pal-l' }, label))),
    h('div', { class: 'pal-hint' }, N.NODE_TYPES.includes(S.tool) ? t('Click the canvas (or drag an item onto it) to place.') : ['pipe', 'pump', 'valve', 'resistance'].includes(S.tool) ? t('Click the start node, then the end node.') : t('Drag nodes to move, drag the background to pan, wheel to zoom, Del to delete.')));
  const bar = h('div', { class: 'hyd-bar row' },
    h('input', { type: 'text', class: 'title-in', value: net.name, onchange: (e) => { net.name = e.target.value || net.name; commit('nn'); } }),
    h('label', { class: 'seg' }, t('Units'), select(U(), [['SI', 'SI'], ['US', 'US']], (v) => { store.ui.units = v; localStorage.setItem('mamba-fmea-units', v); refresh(); })),
    h('label', { class: 'seg' }, t('Colour'), select(S.view, [['velocity', t('velocity')], ['pressure', t('pressure')], ['none', t('none')]], (v) => { S.view = v; refresh(); })),
    h('label', { class: 'seg' }, t('Labels'), select(S.labels, [['flow', t('flow')], ['velocity', t('velocity')], ['pressure', t('pressure / head')], ['names', t('names only')]], (v) => { S.labels = v; refresh(); })),
    h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: S.anim, onchange: (e) => { S.anim = e.target.checked; refresh(); } }), t('Animate flow')),
    h('button', { class: 'btn small', onclick: () => { fitView(net); refresh(); }, title: t('Fit the network to the view') }, '⤢ ' + t('Fit')),
    h('span', { class: 'grow' }),
    res ? h('span', { class: 'solve-ok' }, '✔ ' + t('Solved') + ` · ${res.method === 'gga' ? 'Newton GGA' : 'Hardy Cross'} · ${res.iterations} it.`) : lastRes ? h('span', { class: 'solve-bad' }, '✘ ' + (lastRes.error || t('not solved'))) : null,
    h('button', { class: 'btn', onclick: () => exportInp(net) }, t('Export EPANET .inp')), h('button', { class: 'btn', onclick: importInp }, t('Import .inp')),
    h('button', { class: 'btn primary', onclick: () => exportHydPdf() }, '📄 ' + t('PDF report')),
    h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox(t('Delete'), t('Delete this network?') + ' ' + net.name)) { store.project.networks = store.project.networks.filter((x) => x !== net); store.ui.netId = store.project.networks[0]?.id || null; commit('rmnet', { render: false }); go(store.ui.netId ? 'hyd' : 'home'); } } }, t('Delete')));
  const canvas = canvasSvg(net, res);
  const warn = res && (res.warnings.length || res.statusLog.length) ? h('div', { class: 'hyd-warn' }, [...res.warnings, ...res.statusLog].map((w) => h('div', {}, '⚠ ' + w))) : null;
  main.append(bar, h('div', { class: 'hyd-layout' }, pal, h('div', { class: 'canvas-wrap' }, canvas.el, legend(S, canvas), warn), h('div', { class: 'panel props' }, props(net, res))), bottom(net, res));
  if (S.anim && res) raf = requestAnimationFrame(canvas.animate);
  const onKey = (e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && S.selId && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && !e.target.isContentEditable) { delSel(net); } if (e.key === 'Escape') { S.tool = 'select'; S.linkFrom = null; refresh(); } };
  document.addEventListener('keydown', onKey);
  return () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); };
}
export function fitView(net) {
  const S = ui(); if (!net.nodes.length) { S.zoom = 1; S.pan = { x: 0, y: 0 }; return; }
  const xs = net.nodes.map((n) => n.x), ys = net.nodes.map((n) => n.y); const x0 = Math.min(...xs) - 70, x1 = Math.max(...xs) + 70, y0 = Math.min(...ys) - 70, y1 = Math.max(...ys) + 70;
  S.zoom = Math.max(0.3, Math.min(2.2, Math.min(1100 / (x1 - x0), 560 / (y1 - y0)))); const w = 1100 / S.zoom, hh = 560 / S.zoom; S.pan = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - hh / 2 };
}
function delSel(net) { const S = ui(); if (net.nodes.find((n) => n.id === S.selId)) N.removeNode(net, S.selId); else N.removeLink(net, S.selId); S.selId = null; commit('del'); }

// ---------------- canvas ----------------
const ramp = (x) => { x = Math.max(0, Math.min(1, x)); const stops = [[0, [43, 108, 196]], [0.33, [46, 160, 90]], [0.66, [232, 163, 23]], [1, [209, 59, 59]]]; for (let i = 1; i < stops.length; i++) if (x <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; const f = (x - a) / (b - a); return `rgb(${ca.map((c, k) => Math.round(c + (cb[k] - c) * f)).join(',')})`; } return 'rgb(209,59,59)'; };
function canvasSvg(net, res) {
  const S = ui(); const W = 1100, H = 560; const byId = new Map(net.nodes.map((n) => [n.id, n]));
  const svg = s('svg', { class: 'hyd-canvas', viewBox: `${S.pan.x} ${S.pan.y} ${W / S.zoom} ${H / S.zoom}`, preserveAspectRatio: 'xMidYMid meet' });
  svg.append(s('defs', {}, s('pattern', { id: 'grid', width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, s('path', { d: 'M20 0H0V20', fill: 'none', stroke: '#e3e8ef', 'stroke-width': 0.6 })), s('marker', { id: 'harr', viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, s('path', { d: 'M0 1L9 5L0 9z', fill: '#34465c' }))));
  svg.append(s('rect', { x: -5000, y: -5000, width: 10000, height: 10000, fill: 'url(#grid)', class: 'bg' }));
  const maxV = res ? Math.max(0.1, ...net.links.map((l) => Math.abs(res.links[l.id]?.V || 0))) : 1;
  const ps = res ? net.nodes.map((n) => res.nodes[n.id].p) : [0]; const pMin = Math.min(...ps), pMax = Math.max(...ps, pMin + 1);
  const colLink = (l) => { if (!res || S.view === 'none') return null; const r = res.links[l.id]; if (!r) return null; if (S.view === 'velocity') return ramp(Math.abs(r.V || 0) / maxV); const pa = res.nodes[l.from].p, pb = res.nodes[l.to].p; return ramp(((pa + pb) / 2 - pMin) / (pMax - pMin)); };
  const colNode = (n) => (res && S.view === 'pressure' ? ramp((res.nodes[n.id].p - pMin) / (pMax - pMin)) : null);
  const gl = s('g', {}), gp = s('g', { class: 'particles' }), gn = s('g', {}); svg.append(gl, gp, gn);
  const parts = [];
  for (const l of net.links) {
    const a = byId.get(l.from), b = byId.get(l.to); if (!a || !b) continue; const r = res?.links[l.id]; const col = colLink(l);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    const closed = r && (r.closed || r.status === 'closed'); const sel = S.selId === l.id;
    const grp = s('g', { class: 'hlink t-' + l.type + (sel ? ' sel' : '') + (closed ? ' closed' : ''), 'data-id': l.id, onmousedown: (e) => { e.stopPropagation(); if (S.tool === 'select' || true) { S.selId = l.id; refresh(); } } });
    const wid = l.type === 'pipe' ? Math.max(3, Math.min(9, (l.pipe.D || 0.1) * 60)) : 4;
    grp.append(s('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'hl-hit' }), s('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'hl-line', stroke: col || null, 'stroke-width': wid }));
    if (l.type === 'pump') grp.append(s('g', { transform: `translate(${mx},${my}) rotate(${ang})` }, s('circle', { r: 15, class: 'sym' }), s('path', { d: 'M-7 -9L10 0L-7 9z', class: 'sym-in' })));
    if (l.type === 'valve') grp.append(s('g', { transform: `translate(${mx},${my}) rotate(${ang})` }, s('path', { d: 'M-12 -9L12 9V-9L-12 9z', class: 'sym' + (/check/.test(l.valve.kind) ? ' check' : '') }), /check/.test(l.valve.kind) ? s('path', { d: 'M-4 -5L4 0L-4 5', class: 'sym-in' }) : null));
    if (l.type === 'resistance') grp.append(s('g', { transform: `translate(${mx},${my}) rotate(${ang})` }, s('rect', { x: -10, y: -7, width: 20, height: 14, class: 'sym' })));
    if (l.type === 'pipe' && l.pipe.check) grp.append(s('g', { transform: `translate(${mx},${my}) rotate(${ang})` }, s('path', { d: 'M-6 -7L6 0L-6 7z', class: 'sym check' })));
    if (r && Math.abs(r.Q) > 1e-9 && !closed) { const dir = r.Q >= 0 ? 0 : 180; const ox = l.type === 'pipe' ? 0 : 22; grp.append(s('g', { transform: `translate(${mx},${my}) rotate(${ang + dir}) translate(${ox},-12)` }, s('path', { d: 'M-5 -3L4 0L-5 3', class: 'dir' }))); }
    const lab = linkLabel(l, r); const off = l.type === 'pipe' ? 14 : 26; const nx = -(b.y - a.y), ny = b.x - a.x; const nl = Math.hypot(nx, ny) || 1;
    grp.append(s('text', { x: mx + (nx / nl) * off, y: my + (ny / nl) * off + 4, class: 'hl-lab', 'text-anchor': 'middle' }, lab));
    gl.append(grp);
    if (r && Math.abs(r.Q) > 1e-9 && !closed) { const len = Math.hypot(b.x - a.x, b.y - a.y); const n = Math.max(2, Math.round(len / 34)); for (let i = 0; i < n; i++) { const c = s('circle', { r: 2.6, class: 'pt' }); gp.append(c); parts.push({ c, a, b, len, ph: i / n, v: r.V != null ? r.V : (r.Q / 0.01), q: r.Q }); } }
  }
  for (const n of net.nodes) {
    const r = res?.nodes[n.id]; const sel = S.selId === n.id || S.linkFrom === n.id; const col = colNode(n);
    const g = s('g', { class: 'hnode t-' + n.type + (sel ? ' sel' : ''), transform: `translate(${n.x},${n.y})`, 'data-id': n.id });
    if (n.type === 'junction') g.append(s('circle', { r: 7, class: 'nd', fill: col || null }));
    else if (n.type === 'reservoir') g.append(s('path', { d: 'M-26 -14L26 -14L20 14L-20 14Z', class: 'nd res', fill: col || null }), s('path', { d: 'M-23 -6Q-17 -10 -11 -6T1 -6T13 -6T23 -6', class: 'wave' }));
    else if (n.type === 'tank') g.append(s('rect', { x: -18, y: -26, width: 36, height: 52, rx: 4, class: 'nd tank', fill: col || null }), s('rect', { x: -16, y: 0, width: 32, height: 24, class: 'water' }));
    else if (n.type === 'nozzle') g.append(s('path', { d: 'M-12 -9L8 -4L8 4L-12 9Z', class: 'nd', fill: col || null }), s('path', { d: 'M12 -8L22 -14M12 0L24 0M12 8L22 14', class: 'spray' }));
    g.append(s('text', { y: n.type === 'tank' ? -32 : n.type === 'reservoir' ? -20 : -12, 'text-anchor': 'middle', class: 'hn-name' }, n.label), s('text', { y: n.type === 'tank' ? 40 : n.type === 'reservoir' ? 28 : 20, 'text-anchor': 'middle', class: 'hn-lab' }, nodeLabel(n, r)));
    g.addEventListener('mousedown', (e) => nodeDown(e, net, n, svg));
    gn.append(g);
  }
  // background interactions: place nodes / pan / deselect; drop palette items
  const toSvg = (e) => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  const snap = (v) => Math.round(v / 10) * 10;
  svg.addEventListener('mousedown', (e) => {
    if (e.target.closest('.hnode') || e.target.closest('.hlink')) return;
    if (N.NODE_TYPES.includes(S.tool)) { const p = toSvg(e); const n = N.addNode(net, S.tool, snap(p.x), snap(p.y), defaultsFor(S.tool)); S.selId = n.id; commit('add'); return; }
    const start = { x: e.clientX, y: e.clientY, pan: { ...S.pan } }; let moved = false; const k = (W / S.zoom) / svg.clientWidth;
    const mv = (ev) => { moved = true; S.pan.x = start.pan.x - (ev.clientX - start.x) * k; S.pan.y = start.pan.y - (ev.clientY - start.y) * k; svg.setAttribute('viewBox', `${S.pan.x} ${S.pan.y} ${W / S.zoom} ${H / S.zoom}`); };
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); if (!moved) { S.selId = null; S.linkFrom = null; refresh(); } };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  });
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const p = toSvg(e); const z0 = S.zoom; S.zoom = Math.max(0.3, Math.min(4, S.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); S.pan.x = p.x - (p.x - S.pan.x) * z0 / S.zoom; S.pan.y = p.y - (p.y - S.pan.y) * z0 / S.zoom; svg.setAttribute('viewBox', `${S.pan.x} ${S.pan.y} ${W / S.zoom} ${H / S.zoom}`); }, { passive: false });
  svg.addEventListener('dragover', (e) => e.preventDefault());
  svg.addEventListener('drop', (e) => { e.preventDefault(); const ty = e.dataTransfer.getData('text/hydnode'); if (!N.NODE_TYPES.includes(ty)) return; const p = toSvg(e); const n = N.addNode(net, ty, snap(p.x), snap(p.y), defaultsFor(ty)); S.selId = n.id; commit('drop'); });
  let t0 = 0; const animate = (ts) => { const dt = t0 ? Math.min(0.05, (ts - t0) / 1000) : 0; t0 = ts; for (const p of parts) { const speed = Math.max(0.12, Math.min(2.2, Math.abs(p.v) / Math.max(maxV, 0.1) * 2)) * 60 / p.len; p.ph = (p.ph + (p.q >= 0 ? 1 : -1) * speed * dt + 1) % 1; p.c.setAttribute('cx', p.a.x + (p.b.x - p.a.x) * p.ph); p.c.setAttribute('cy', p.a.y + (p.b.y - p.a.y) * p.ph); } raf = requestAnimationFrame(animate); };
  if (!S.anim) for (const p of parts) p.c.remove();
  return { el: svg, animate, maxV, pMin, pMax };
}
function defaultsFor(type) { return type === 'reservoir' ? { z: 0, level: 5 } : type === 'tank' ? { z: 10, level: 2 } : type === 'nozzle' ? { z: 0, nozzle: { d: 0.012, Cd: 0.95 } } : { z: 0 }; }
function nodeDown(e, net, n, svg) {
  e.stopPropagation(); const S = ui();
  if (['pipe', 'pump', 'valve', 'resistance'].includes(S.tool)) {
    if (!S.linkFrom) { S.linkFrom = n.id; refresh(); return; }
    if (S.linkFrom === n.id) { S.linkFrom = null; refresh(); return; }
    const props = S.tool === 'pump' ? { pump: pumpFromCatalog(PUMPS[0]) } : S.tool === 'pipe' ? { pipe: { L: Math.max(1, Math.round(Math.hypot(n.x - net.nodes.find((x) => x.id === S.linkFrom).x, n.y - net.nodes.find((x) => x.id === S.linkFrom).y) / 10)), D: 0.0525, size: 'nps50-40', eps: 0.045e-3, material: 'steel', fittings: [] } } : {};
    const l = N.addLink(net, S.tool, S.linkFrom, n.id, props); S.linkFrom = null; S.selId = l.id; commit('link'); return;
  }
  S.selId = n.id; const start = { x: e.clientX, y: e.clientY, nx: n.x, ny: n.y }; let moved = false; const k = 1 / (svg.getScreenCTM()?.a || 1);
  const g = e.currentTarget;
  const mv = (ev) => { moved = true; n.x = Math.round((start.nx + (ev.clientX - start.x) * k) / 10) * 10; n.y = Math.round((start.ny + (ev.clientY - start.y) * k) / 10) * 10; g.setAttribute('transform', `translate(${n.x},${n.y})`);
    svg.querySelectorAll('.hlink').forEach((lg) => { const l = net.links.find((x) => x.id === lg.dataset.id); if (!l || (l.from !== n.id && l.to !== n.id)) return; lg.style.opacity = 0.35; }); };
  const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); if (moved) commit('move'); else refresh(); };
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
}
export const pumpFromCatalog = (pc) => ({ model: pc.id, curve: pc.curve.map(([q, hh]) => [q / 3600, hh]), npshr: pc.npshr.map(([q, hh]) => [q / 3600, hh]), eff: pc.eff.map(([q, e]) => [q / 3600, e]), speed: 1, on: true });
function linkLabel(l, r) { const S = ui(); if (S.labels === 'names' || !r) return l.label; if (S.labels === 'velocity') return `${l.label}  ${show('vel', r.V, 2)} ${uLabel(U(), 'vel')}`; if (S.labels === 'pressure') return `${l.label}  Δh ${show('head', l.type === 'pump' ? r.head : r.hL, 2)} ${uLabel(U(), 'head')}`; return `${l.label}  ${show('flow', r.Q, 2)} ${uLabel(U(), 'flow')}`; }
function nodeLabel(n, r) { const S = ui(); if (!r || S.labels === 'names') return ''; if (S.labels === 'pressure') return `H ${show('head', r.H, 2)} · p ${show('press', r.p, 1)} ${uLabel(U(), 'press')}`; if (n.type === 'nozzle') return `${show('flow', r.outflow, 2)} ${uLabel(U(), 'flow')}`; return `p ${show('press', r.p, 1)} ${uLabel(U(), 'press')}`; }
function legend(S, c) {
  if (S.view === 'none') return null; const stops = [0, 0.25, 0.5, 0.75, 1];
  const lo = S.view === 'velocity' ? 0 : c.pMin, hi = S.view === 'velocity' ? c.maxV : c.pMax; const q = S.view === 'velocity' ? 'vel' : 'press';
  return h('div', { class: 'legend-bar' }, h('span', {}, t(S.view === 'velocity' ? 'velocity' : 'pressure') + ' (' + uLabel(U(), q) + ')'), h('div', { class: 'grad' }, stops.map((x) => h('span', { style: { background: ramp(x) } }))), h('div', { class: 'grad-l' }, h('span', {}, show(q, lo, 1)), h('span', {}, show(q, hi, 1))));
}

// ---------------- property panel ----------------
function num(label, q, get, set, attrs = {}) {
  const e = h('input', { type: 'number', step: 'any', ...attrs }); const v = get(); e.value = v == null ? '' : +toU(U(), q, v).toPrecision(6);
  e.addEventListener('change', () => { const x = parseFloat(e.value); if (!Number.isFinite(x)) return; set(fromU(U(), q, x)); commit('prop'); });
  return field(label, h('div', { class: 'with-unit' }, e, q ? h('span', { class: 'unit' }, uLabel(U(), q)) : null));
}
function raw(label, unit, get, set, attrs = {}) { const e = h('input', { type: 'number', step: 'any', ...attrs }); e.value = get() ?? ''; e.addEventListener('change', () => { const x = parseFloat(e.value); if (Number.isFinite(x)) { set(x); commit('prop'); } }); return field(label, h('div', { class: 'with-unit' }, e, unit ? h('span', { class: 'unit' }, unit) : null)); }
function props(net, res) {
  const S = ui(); const n = net.nodes.find((x) => x.id === S.selId); const l = net.links.find((x) => x.id === S.selId);
  const out = h('div', { class: 'form' });
  const resBox = (rows) => h('div', { class: 'res-box' }, rows.filter(Boolean).map(([k, v, cls]) => h('div', { class: 'rb-row ' + (cls || '') }, h('span', {}, k), h('b', {}, v))));
  if (!n && !l) {
    const fl = fluidFor(net);
    ap(out, h('h3', {}, t('Network & fluid')),
      field(t('Fluid'), select(net.fluid.custom ? 'custom' : net.fluid.id, [...FLUIDS.map((f) => [f.id, t(f.label)]), ['custom', t('Custom fluid…')]], (v) => { if (v === 'custom') net.fluid = { ...net.fluid, custom: true, label: 'Custom', rho: fl.rho, mu: fl.mu, Pv: fl.Pv }; else net.fluid = { id: v, T: net.fluid.T ?? 293.15, P: net.fluid.P ?? N.P_ATM }; commit('fl'); })),
      num(t('Temperature'), 'temp', () => net.fluid.T ?? 293.15, (v) => (net.fluid.T = v)),
      net.fluid.custom ? [num(t('Density'), 'dens', () => net.fluid.rho, (v) => (net.fluid.rho = v)), num(t('Dynamic viscosity'), 'visc', () => net.fluid.mu, (v) => (net.fluid.mu = v)), num(t('Vapour pressure'), 'press', () => net.fluid.Pv, (v) => (net.fluid.Pv = v))] : null,
      resBox([[t('Density'), `${show('dens', fl.rho, 2)} ${uLabel(U(), 'dens')}`], [t('Viscosity'), `${show('visc', fl.mu, 4)} ${uLabel(U(), 'visc')}`], [t('Vapour pressure'), Number.isFinite(fl.Pv) ? `${show('press', fl.Pv, 3)} ${uLabel(U(), 'press')}` : '–'], [t('Source'), fl.source || t('user')], ...(fl.warn || []).map((w) => ['⚠', w, 'warn'])]),
      field(t('Head-loss model'), select(net.headloss, [['DW', 'Darcy–Weisbach'], ['HW', 'Hazen–Williams (water)']], (v) => { net.headloss = v; commit('hl'); })),
      net.headloss === 'DW' ? field(t('Friction factor'), select(net.friction, [['colebrook', 'Colebrook–White'], ['swamee', 'Swamee–Jain (explicit)']], (v) => { net.friction = v; commit('fr'); })) : null,
      field(t('Solver'), select(net.solver, [['gga', t('Newton global gradient (EPANET method)')], ['hardy', 'Hardy Cross']], (v) => { net.solver = v; commit('sv'); })),
      num(t('Atmospheric pressure'), 'press', () => net.Patm ?? N.P_ATM, (v) => (net.Patm = v)),
      h('p', { class: 'hint' }, t('Select a node or link on the canvas to edit it.')));
    return out;
  }
  if (n) {
    const r = res?.nodes[n.id];
    ap(out, h('h3', {}, t({ junction: 'Junction', reservoir: 'Reservoir', tank: 'Tank', nozzle: 'Nozzle / spray' }[n.type]), h('button', { class: 'btn small danger', onclick: () => delSel(net) }, t('Delete'))),
      field(t('Label'), h('input', { type: 'text', value: n.label, onchange: (e) => { n.label = e.target.value; commit('lab'); } })),
      num(t('Elevation z'), 'len', () => n.z, (v) => (n.z = v)),
      n.type === 'junction' ? num(t('Demand (outflow)'), 'flow', () => n.demand, (v) => (n.demand = v)) : null,
      n.type === 'reservoir' || n.type === 'tank' ? num(t('Water level above z'), 'len', () => n.level, (v) => (n.level = v)) : null,
      n.type === 'tank' ? num(t('Gas pressure above liquid (gauge)'), 'press', () => n.pressure || 0, (v) => (n.pressure = v)) : null,
      n.type === 'nozzle' ? [num(t('Orifice diameter'), 'dia', () => n.nozzle.d, (v) => (n.nozzle.d = v)), raw(t('Discharge coefficient Cd'), '', () => n.nozzle.Cd, (v) => (n.nozzle.Cd = v))] : null,
      r ? resBox([[t('Head H'), `${show('head', r.H)} ${uLabel(U(), 'head')}`], [t('Pressure (gauge)'), `${show('press', r.p, 2)} ${uLabel(U(), 'press')}`, r.p < 0 ? 'warn' : ''], [t('Absolute pressure'), `${show('press', r.pAbs, 2)} ${uLabel(U(), 'press')}`], n.type !== 'junction' ? [t('Net outflow'), `${show('flow', r.outflow, 3)} ${uLabel(U(), 'flow')}`] : null]) : null,
      fmeaBtn(net, n, res));
    return out;
  }
  const r = res?.links[l.id]; const lab = { pipe: 'Pipe', pump: 'Pump', valve: 'Valve', resistance: 'Fitting / resistance (r·Qⁿ)' }[l.type];
  ap(out, h('h3', {}, t(lab), h('button', { class: 'btn small danger', onclick: () => delSel(net) }, t('Delete'))), field(t('Label'), h('input', { type: 'text', value: l.label, onchange: (e) => { l.label = e.target.value; commit('lab'); } })),
    h('div', { class: 'row' }, h('span', { class: 'hint' }, `${net.nodes.find((x) => x.id === l.from)?.label} → ${net.nodes.find((x) => x.id === l.to)?.label}`), h('button', { class: 'btn small', onclick: () => { [l.from, l.to] = [l.to, l.from]; commit('rev'); } }, '⇄ ' + t('Reverse'))),
    field(t('Status'), select(l.status || 'open', [['open', t('open')], ['closed', t('closed')]], (v) => { l.status = v; commit('st'); })));
  if (l.type === 'pipe') {
    const p = l.pipe; const fam = (SIZES.find((x) => x.id === p.size) || {}).family || '';
    ap(out, num(t('Length'), 'len', () => p.L, (v) => (p.L = v)),
      field(t('Material'), select(p.material || '', [['', '—'], ...MATERIALS.map((m) => [m.id, t(m.label)])], (v) => { const m = MATERIALS.find((x) => x.id === v); p.material = v; if (m) { p.eps = m.eps; p.C = m.C; } commit('mat'); })),
      field(t('Size series'), select(fam, [['', t('custom')], ...SIZE_FAMILIES.map((f) => [f, f])], (v) => { const first = SIZES.find((x) => x.family === v); if (first) { p.size = first.id; p.D = first.D; } else p.size = ''; commit('fam'); })),
      fam ? field(t('Nominal size'), select(p.size, SIZES.filter((x) => x.family === fam).map((x) => [x.id, `${x.label} — ID ${show('dia', x.D, 1)} ${uLabel(U(), 'dia')}`]), (v) => { const z = SIZES.find((x) => x.id === v); p.size = v; p.D = z.D; commit('size'); })) : null,
      num(t('Inner diameter'), 'dia', () => p.D, (v) => { p.D = v; p.size = ''; }),
      net.headloss === 'HW' ? raw(t('Hazen–Williams C'), '', () => p.C, (v) => (p.C = v)) : num(t('Roughness ε'), 'rough', () => p.eps, (v) => (p.eps = v)),
      h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: !!p.check, onchange: (e) => { p.check = e.target.checked; commit('cv'); } }), t('Check valve in this pipe')),
      fittingsEditor(p));
    if (r) ap(out, resBox([[t('Flow'), `${show('flow', r.Q)} ${uLabel(U(), 'flow')}`], [t('Velocity'), `${show('vel', r.V)} ${uLabel(U(), 'vel')}`, Math.abs(r.V) > 3 ? 'warn' : ''], ['Re', fmtN(r.Re, 0) + ' (' + t(r.regime || '') + ')'], ['f', fmtN(r.f, 5)], [t('Friction loss'), `${show('head', r.hMajor)} ${uLabel(U(), 'head')}`], [t('Minor losses') + ` (ΣK ${fmtN(r.K, 2)})`, `${show('head', r.hMinor)} ${uLabel(U(), 'head')}`], [t('Total head loss'), `${show('head', r.hL)} ${uLabel(U(), 'head')}`]]));
  } else if (l.type === 'pump') {
    const p = l.pump;
    ap(out, field(t('Catalogue curve'), select(p.model || '', [['', t('user-defined')], ...PUMPS.map((x) => [x.id, x.label])], (v) => { const pc = PUMPS.find((x) => x.id === v); if (pc) Object.assign(p, pumpFromCatalog(pc), { speed: p.speed ?? 1, on: p.on }); else p.model = ''; commit('pm'); })),
      curveEditor(t('Pump curve H(Q)'), p, 'curve', 'head'), curveEditor(t('NPSHr(Q)'), p, 'npshr', 'head'), curveEditor(t('Efficiency η(Q) %'), p, 'eff', null),
      raw(t('Speed ratio n/n₀ (affinity laws)'), '', () => p.speed ?? 1, (v) => (p.speed = v), { min: 0.1, max: 2, step: 0.05 }),
      h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: p.on !== false, onchange: (e) => { p.on = e.target.checked; commit('on'); } }), t('Pump running')));
    if (r) ap(out, resBox([[t('Flow'), `${show('flow', r.Q)} ${uLabel(U(), 'flow')}`], [t('Pump head'), `${show('head', r.head)} ${uLabel(U(), 'head')}`], [t('Curve fit'), r.curveKind], [t('Hydraulic power'), `${show('power', r.powerHyd)} ${uLabel(U(), 'power')}`], Number.isFinite(r.eta) ? [t('Efficiency'), (r.eta * 100).toFixed(1) + ' %'] : null, Number.isFinite(r.powerShaft) ? [t('Shaft power'), `${show('power', r.powerShaft)} ${uLabel(U(), 'power')}`] : null,
      [t('NPSH available'), `${show('head', r.npsha, 2)} ${uLabel(U(), 'head')}`], Number.isFinite(r.npshr) ? [t('NPSH required'), `${show('head', r.npshr, 2)} ${uLabel(U(), 'head')}`] : null, Number.isFinite(r.npshMargin) ? [t('NPSH margin'), `${show('head', r.npshMargin, 2)} ${uLabel(U(), 'head')}`, r.npshMargin < 0.5 ? 'warn' : 'ok'] : null, r.closed ? [t('Status'), t('closed / no flow (head above shut-off or reverse flow)'), 'warn'] : null]));
  } else if (l.type === 'valve') {
    const v = l.valve; const def = VALVES.find((x) => x.id === v.kind) || VALVES[0];
    ap(out, field(t('Valve type'), select(v.kind, VALVES.map((x) => [x.id, t(x.label)]), (k) => { v.kind = k; delete v.Kopen; commit('vk'); })),
      raw(t('Opening'), '%', () => v.opening ?? 100, (x) => (v.opening = Math.max(0, Math.min(100, x))), { min: 0, max: 100, step: 5 }),
      h('input', { type: 'range', min: 0, max: 100, step: 1, value: v.opening ?? 100, class: 'slider', onchange: (e) => { v.opening = +e.target.value; commit('vo'); } }),
      num(t('Diameter'), 'dia', () => v.D, (x) => (v.D = x)), raw(t('K fully open'), '', () => v.Kopen ?? def.Kopen, (x) => (v.Kopen = x)),
      h('p', { class: 'hint' }, t('Characteristic') + ': ' + t(def.char) + ` · K(${v.opening ?? 100} %) = ${fmtN(valveK(v), 3)}`));
    if (r) ap(out, resBox([[t('Flow'), `${show('flow', r.Q)} ${uLabel(U(), 'flow')}`], [t('Velocity'), `${show('vel', r.V)} ${uLabel(U(), 'vel')}`], [t('Head loss'), `${show('head', r.hL)} ${uLabel(U(), 'head')}`], [t('Pressure drop'), `${show('press', r.hL * (res.fluid.rho * 9.80665), 2)} ${uLabel(U(), 'press')}`]]));
  } else if (l.type === 'resistance') {
    ap(out, raw(t('Resistance r (SI: h = r·|Q|ⁿ⁻¹·Q)'), '', () => l.res.r, (x) => (l.res.r = x)), raw(t('Exponent n'), '', () => l.res.n, (x) => (l.res.n = x)));
    if (r) ap(out, resBox([[t('Flow'), `${show('flow', r.Q)} ${uLabel(U(), 'flow')}`], [t('Head loss'), `${show('head', r.hL)} ${uLabel(U(), 'head')}`]]));
  }
  ap(out, fmeaBtn(net, l, res));
  return out;
}
function fittingsEditor(p) {
  const sel0 = h('select', {}, FITTINGS.map((f) => h('option', { value: f.id }, `${t(f.label)} (K ${f.K})`)));
  return h('div', { class: 'fittings' }, h('div', { class: 'form-heading' }, t('Fittings / minor losses')),
    (p.fittings || []).map((f, i) => h('div', { class: 'fit-row' }, h('span', { class: 'grow' }, t((FITTINGS.find((x) => x.id === f.id) || {}).label || f.id)), h('input', { type: 'number', value: f.qty ?? 1, min: 0, step: 1, style: { width: '52px' }, onchange: (e) => { f.qty = +e.target.value; commit('fq'); } }), '× K', h('input', { type: 'number', value: f.K, step: 'any', style: { width: '58px' }, onchange: (e) => { f.K = +e.target.value; commit('fk'); } }), h('button', { class: 'btn small danger', onclick: () => { p.fittings.splice(i, 1); commit('rf'); } }, '×'))),
    h('div', { class: 'row' }, sel0, h('button', { class: 'btn small', onclick: () => { const f = FITTINGS.find((x) => x.id === sel0.value); (p.fittings ||= []).push({ id: f.id, K: f.K, qty: 1 }); commit('af'); } }, '+')),
    raw(t('Extra ΣK'), '', () => p.Kextra || 0, (x) => (p.Kextra = x)));
}
function curveEditor(label, p, key, q) {
  const fq = (v) => +toU(U(), 'flow', v).toPrecision(5); const fh = (v) => (q ? +toU(U(), q, v).toPrecision(5) : v);
  const ta = h('textarea', { rows: 4, class: 'mono', title: t('One point per line: flow  value') }); ta.value = (p[key] || []).map(([a, b]) => `${fq(a)}  ${fh(b)}`).join('\n');
  ta.addEventListener('change', () => { const pts = ta.value.split('\n').map((x) => x.trim().split(/[\s,;]+/).map(Number)).filter((x) => x.length >= 2 && x.every(Number.isFinite)).map(([a, b]) => [fromU(U(), 'flow', a), q ? fromU(U(), q, b) : b]); p[key] = pts; p.model = ''; commit('curve'); });
  return field(label + ` (${uLabel(U(), 'flow')} → ${q ? uLabel(U(), q) : '%'})`, ta);
}
function fmeaBtn(net, item, res) {
  return h('button', { class: 'btn', style: { marginTop: '10px' }, onclick: () => toFmea(net, item, res), title: t('Create an element with this component\'s typical failure modes in an FMEA') }, '⇢ ' + t('Add failure modes to FMEA'));
}
async function toFmea(net, item, res) {
  const docs = store.project.docs.filter((d) => d.type !== 'MSR');
  const dsel = h('select', {}, [['new', t('New DFMEA for this network')], ...docs.map((d) => [d.id, d.title])].map(([v, l]) => h('option', { value: v }, l)));
  const r = await modal(t('Add failure modes to FMEA'), h('div', { class: 'form' }, h('p', {}, t('Adds an element with the library failure modes for this component (with effects and causes). Results such as a low NPSH margin are used as occurrence hints.')), h('label', {}, t('Target FMEA')), dsel), [{ label: t('Add'), primary: true, value: () => dsel.value }]);
  if (!r) return; let doc = docs.find((d) => d.id === r);
  if (!doc) { doc = FM.newDoc('DFMEA', 'DFMEA – ' + net.name, net.name); store.project.docs.push(doc); }
  try { const out = addComponentToFmea(doc, net, item, res, doc.rootId); commit('tofmea', { render: false }); toast(t('Added to FMEA') + ': ' + out.node.name + (out.hints.length ? ' — ' + out.hints.join('; ') : '')); store.ui.sel[doc.id] = { node: out.node.id }; go('doc', { docId: doc.id, tab: 'failures' }); } catch (e) { toast(e.message, 'error'); }
}

// ---------------- bottom panel ----------------
function bottom(net, res) {
  const S = ui(); const tabsL = [['results', t('Results tables')], ['pump', t('Pump & system curve')], ['profile', t('HGL / EGL profile')], ['steps', t('Step-by-step solution')], ['sweep', t('Parametric sweep')]];
  const body = h('div', { class: 'bottom-body' });
  const panel = h('div', { class: 'panel bottom' }, h('div', { class: 'tabs' }, tabsL.map(([id, l]) => h('button', { class: 'tab' + (S.bottom === id ? ' active' : ''), 'data-tab': id, onclick: () => { S.bottom = id; refresh(); } }, l))), body);
  if (!res) { body.append(h('p', { class: 'hint' }, lastRes?.error || t('Build a network with at least one reservoir or tank.'))); return panel; }
  ({ results: resultsTab, pump: pumpTab, profile: profileTab, steps: stepsTab, sweep: sweepTab }[S.bottom] || resultsTab)(body, net, res);
  return panel;
}
function resultsTab(body, net, res) {
  const u = (q) => uLabel(U(), q); const S = ui();
  const nt = h('table', { class: 'grid small' }, h('tr', {}, [t('Node'), t('Type'), `z (${u('len')})`, `${t('Demand')} (${u('flow')})`, `H (${u('head')})`, `p (${u('press')})`, `${t('Outflow')} (${u('flow')})`].map((x) => h('th', {}, x))),
    net.nodes.map((n) => { const r = res.nodes[n.id]; return h('tr', { class: (S.selId === n.id ? 'hl' : '') + (r.p < 0 ? ' bad' : ''), onclick: () => { S.selId = n.id; refresh(); } }, h('td', {}, n.label), h('td', {}, t(n.type)), h('td', { class: 'num' }, show('len', n.z, 2)), h('td', { class: 'num' }, show('flow', n.demand || 0)), h('td', { class: 'num' }, show('head', r.H)), h('td', { class: 'num' }, show('press', r.p, 2)), h('td', { class: 'num' }, n.type === 'junction' ? '' : show('flow', r.outflow))); }));
  const lt = h('table', { class: 'grid small' }, h('tr', {}, [t('Link'), t('Type'), `Q (${u('flow')})`, `V (${u('vel')})`, 'Re', 'f', `h_L (${u('head')})`, `${t('Pump head')} (${u('head')})`, t('Status')].map((x) => h('th', {}, x))),
    net.links.map((l) => { const r = res.links[l.id]; return h('tr', { class: S.selId === l.id ? 'hl' : '', onclick: () => { S.selId = l.id; refresh(); } }, h('td', {}, l.label), h('td', {}, t(l.type)), h('td', { class: 'num' }, show('flow', r.Q)), h('td', { class: 'num' }, r.V != null ? show('vel', r.V) : ''), h('td', { class: 'num' }, r.Re ? fmtN(r.Re, 0) : ''), h('td', { class: 'num' }, r.f ? fmtN(r.f, 5) : ''), h('td', { class: 'num' }, show('head', r.hL)), h('td', { class: 'num' }, l.type === 'pump' ? show('head', r.head) : ''), h('td', {}, r.closed ? t('closed') : t('open'))); }));
  body.append(h('div', { class: 'grid-2' }, h('div', { class: 'scroll-y' }, nt), h('div', { class: 'scroll-y' }, lt)));
}
function pumpTab(body, net, res) {
  const S = ui(); const pumps = net.links.filter((l) => l.type === 'pump'); if (!pumps.length) { body.append(h('p', { class: 'hint' }, t('No pump in this network.'))); return; }
  if (!pumps.find((p) => p.id === S.pumpId)) S.pumpId = pumps[0].id;
  const sc = systemCurve(net, S.pumpId); const fq = (pts) => pts.map(([q, v]) => [toU(U(), 'flow', q), toU(U(), 'head', v)]);
  const op = sc.op; const pts = op ? [{ x: toU(U(), 'flow', op.Q), y: toU(U(), 'head', op.H), label: `${t('operating point')} ${show('flow', op.Q, 2)} ${uLabel(U(), 'flow')} / ${show('head', op.H, 2)} ${uLabel(U(), 'head')}`, color: '#e4572e' }] : [];
  const hTop = Math.max(sc.curve.shutoffS || 0, op ? op.H : 0) * 1.35 || 10; const pumpPts = sc.pump.filter(([, v]) => v >= 0);
  const p1 = xyPlot({ title: t('Pump curve, system curve and operating point'), series: [{ name: t('pump H(Q)'), color: '#ff7a00', pts: fq(pumpPts), width: 2.5 }, { name: t('system curve'), color: '#2b6cc4', pts: fq(sc.system), width: 2.5 }], points: pts, xLabel: `Q (${uLabel(U(), 'flow')})`, yLabel: `H (${uLabel(U(), 'head')})`, yMin: Math.min(0, ...sc.system.map(([, v]) => toU(U(), 'head', v))), yMax: toU(U(), 'head', hTop), xMax: toU(U(), 'flow', (pumpPts[pumpPts.length - 1] || [0.01])[0]), w: 620, h: 340 });
  const p2 = xyPlot({ title: t('NPSH available vs required'), series: [{ name: 'NPSHa', color: '#2ea05a', pts: fq(sc.npsha), width: 2.5 }, { name: 'NPSHr', color: '#d13b3b', pts: fq(sc.npshr), width: 2.5, dash: '6 4' }], points: op && Number.isFinite(op.npsha) ? [{ x: toU(U(), 'flow', op.Q), y: toU(U(), 'head', op.npsha), color: '#2ea05a', label: `NPSHa ${show('head', op.npsha, 2)}` }] : [], xLabel: `Q (${uLabel(U(), 'flow')})`, yLabel: `NPSH (${uLabel(U(), 'head')})`, yMin: 0, w: 560, h: 340 });
  body.append(h('div', { class: 'row' }, t('Pump'), select(S.pumpId, pumps.map((p) => [p.id, p.label]), (v) => { S.pumpId = v; refresh(); }), op ? h('span', { class: 'hint' }, `${t('Curve fit')}: ${sc.curve.kind} · η ${Number.isFinite(op.eta) ? (op.eta * 100).toFixed(1) + ' %' : '–'} · ${t('Shaft power')} ${Number.isFinite(op.P) ? show('power', op.P) + ' ' + uLabel(U(), 'power') : '–'}${Number.isFinite(op.npshr) ? ` · NPSH ${t('margin')} ${show('head', op.npsha - op.npshr, 2)} ${uLabel(U(), 'head')}` : ''}`) : h('span', { class: 'solve-bad' }, t('Pump delivers no flow.'))),
    h('div', { class: 'plots' }, p1, p2));
}
function profileTab(body, net, res) {
  const S = ui(); const opts = net.nodes.map((n) => [n.id, n.label]);
  if (!net.nodes.find((n) => n.id === S.pathA)) S.pathA = (net.nodes.find((n) => n.type === 'reservoir') || net.nodes[0]).id;
  if (!net.nodes.find((n) => n.id === S.pathB)) S.pathB = (net.nodes.filter((n) => n.type !== 'junction' && n.id !== S.pathA).pop() || net.nodes[net.nodes.length - 1]).id;
  const pr = profile(net, res, S.pathA, S.pathB);
  body.append(h('div', { class: 'row' }, t('From'), select(S.pathA, opts, (v) => { S.pathA = v; refresh(); }), t('to'), select(S.pathB, opts, (v) => { S.pathB = v; refresh(); }), h('span', { class: 'hint' }, t('Shortest path by pipe length. EGL = HGL + V²/2g; pumps show as a vertical rise.'))));
  if (!pr) { body.append(h('p', { class: 'hint' }, t('No path between these nodes.'))); return; }
  const X = (v) => toU(U(), 'len', v), Y = (v) => toU(U(), 'head', v);
  body.append(xyPlot({ title: t('Hydraulic and energy grade lines'), series: [{ name: 'EGL', color: '#e4572e', pts: pr.pts.map((p) => [X(p.x), Y(p.E)]), dash: '6 3' }, { name: 'HGL', color: '#2b6cc4', pts: pr.pts.map((p) => [X(p.x), Y(p.H)]), width: 2.5 }, { name: t('pipe elevation'), color: '#6b778a', pts: pr.pts.map((p) => [X(p.x), Y(p.z)]) }],
    points: pr.pts.filter((p) => p.label).map((p) => ({ x: X(p.x), y: Y(p.H), label: p.label, color: '#2b6cc4' })), xLabel: `${t('distance along path')} (${uLabel(U(), 'len')})`, yLabel: `${t('head / elevation')} (${uLabel(U(), 'head')})`, w: 1100, h: 330 }));
}
function stepsTab(body, net, res) {
  const steps = explain(net, res);
  body.append(h('div', { class: 'steps' }, steps.map((st, i) => h('div', { class: 'step' }, h('div', { class: 'step-n' }, i + 1), h('div', {}, h('div', { class: 'step-title' }, t(st.title)),
    (st.lines || []).map((l) => h('div', { class: 'step-math' }, l)),
    st.table ? h('table', { class: 'grid small' }, h('tr', {}, st.table.head.map((x) => h('th', {}, t(x)))), st.table.rows.slice(0, 60).map((r) => h('tr', {}, r.map((c) => h('td', { class: 'num' }, c))))) : null,
    st.hardy ? st.hardy.map((it) => h('div', { class: 'hardy' }, h('b', {}, `${t('Iteration')} ${it.it}`), it.loops.map((lp) => h('div', { class: 'mono' }, `${t('loop')} ${lp.loop}: Σh = ${lp.sumH.toExponential(3)} m, Σ dh/dQ = ${lp.sumD.toExponential(3)} → ΔQ = −Σh/Σ(dh/dQ) = ${(lp.dQ * 1000).toFixed(4)} L/s  [${lp.rows.map((r) => `${r.link}: Q ${(r.Q * 1000).toFixed(2)}, h ${r.h.toFixed(3)}`).join(' · ')}]`)))) : null,
    st.sub ? st.sub.map((x) => h('div', { class: 'substep' }, h('b', {}, x.title), x.lines.map((l) => h('div', { class: 'step-math' }, l)))) : null)))));
}
const SW_LABEL = { 'pipe.D': ['Pipe diameter', 'dia'], 'pipe.L': ['Pipe length', 'len'], 'pipe.eps': ['Pipe roughness', 'rough'], 'pump.speed': ['Pump speed ratio', null], 'valve.opening': ['Valve opening (%)', null], 'node.demand': ['Junction demand', 'flow'], 'node.level': ['Reservoir / tank level', 'len'], 'node.z': ['Node elevation', 'len'], 'fluid.T': ['Fluid temperature', 'temp'] };
function sweepTab(body, net, res) {
  const S = ui(); const sw = (S.sw && S.sw.net === net.id) ? S.sw : (S.sw = { net: net.id, param: 'valve.opening', target: '', from: 10, to: 100, steps: 10, out: [] });
  const targetsFor = (p) => p.startsWith('pipe') ? net.links.filter((l) => l.type === 'pipe') : p.startsWith('pump') ? net.links.filter((l) => l.type === 'pump') : p.startsWith('valve') ? net.links.filter((l) => l.type === 'valve') : p === 'node.demand' ? net.nodes.filter((n) => n.type === 'junction') : p === 'node.level' ? net.nodes.filter((n) => n.type === 'reservoir' || n.type === 'tank') : p === 'node.z' ? net.nodes : [];
  const tg = targetsFor(sw.param); if (sw.param !== 'fluid.T' && !tg.find((x) => x.id === sw.target)) sw.target = tg[0]?.id || '';
  const [lab, q] = SW_LABEL[sw.param]; const cv = (v) => (q ? toU(U(), q, v) : v), cvb = (v) => (q ? fromU(U(), q, v) : v);
  const outs = [...net.links.map((l) => ({ kind: 'link', id: l.id, field: 'Q', label: `Q ${l.label}`, q: 'flow' })), ...net.links.filter((l) => l.type === 'pipe').map((l) => ({ kind: 'link', id: l.id, field: 'V', label: `V ${l.label}`, q: 'vel' })), ...net.nodes.map((n) => ({ kind: 'node', id: n.id, field: 'p', label: `p ${n.label}`, q: 'press' })), ...net.links.filter((l) => l.type === 'pump').flatMap((l) => [{ kind: 'link', id: l.id, field: 'head', label: `H ${l.label}`, q: 'head' }, { kind: 'link', id: l.id, field: 'npshMargin', label: `NPSH margin ${l.label}`, q: 'head' }])];
  if (!sw.out.length) sw.out = outs.filter((o) => o.kind === 'link' && o.field === 'Q').slice(0, 3).map((o) => o.label);
  const numIn = (k, conv) => { const e = h('input', { type: 'number', step: 'any', value: +(conv ? cv(sw[k]) : sw[k]).toPrecision(6), style: { width: '90px' } }); e.addEventListener('change', () => { const x = +e.value; if (Number.isFinite(x)) sw[k] = conv ? cvb(x) : x; }); return e; };
  body.append(h('div', { class: 'row' }, t('Vary'), select(sw.param, SWEEP_PARAMS.map((p) => [p, t(SW_LABEL[p][0])]), (v) => { sw.param = v; const def = { 'pipe.D': [0.02, 0.15], 'pipe.L': [10, 500], 'pipe.eps': [1e-5, 1e-3], 'pump.speed': [0.6, 1.2], 'valve.opening': [10, 100], 'node.demand': [0, 0.01], 'node.level': [0, 10], 'node.z': [0, 20], 'fluid.T': [278.15, 353.15] }[v]; sw.from = def[0]; sw.to = def[1]; sw.rows = null; refresh(); }),
    sw.param !== 'fluid.T' ? select(sw.target, tg.map((x) => [x.id, x.label]), (v) => { sw.target = v; }) : null, t('from'), numIn('from', true), t('to'), numIn('to', true), q ? uLabel(U(), q) : '', t('steps'), numIn('steps'),
    h('button', { class: 'btn primary', onclick: () => { const o = outs.filter((x) => sw.out.includes(x.label)); sw.rows = sweep(net, { param: sw.param, target: sw.target, from: sw.from, to: sw.to, steps: Math.max(2, Math.min(60, Math.round(sw.steps))), outputs: o }); sw.outDefs = o; refresh(); } }, '▶ ' + t('Run sweep'))),
    h('div', { class: 'chips' }, t('Outputs') + ':', outs.map((o) => h('label', { class: 'chip' + (sw.out.includes(o.label) ? ' on' : '') }, h('input', { type: 'checkbox', checked: sw.out.includes(o.label), onchange: (e) => { if (e.target.checked) sw.out.push(o.label); else sw.out = sw.out.filter((x) => x !== o.label); } }), o.label))));
  if (sw.rows && sw.outDefs) {
    const cols = ['#ff7a00', '#2b6cc4', '#2ea05a', '#d13b3b', '#8e7cc3', '#34465c', '#e8a317'];
    const groups = [...new Set(sw.outDefs.map((o) => o.q))];
    body.append(h('div', { class: 'plots' }, groups.map((gq) => xyPlot({ title: t('Sweep') + ': ' + t(lab), series: sw.outDefs.map((o, i) => ({ o, i })).filter(({ o }) => o.q === gq).map(({ o, i }) => ({ name: o.label, color: cols[i % cols.length], marker: true, pts: sw.rows.filter((r) => r.ok).map((r) => [cv(r.v), toU(U(), o.q, o.field === 'Q' || o.field === 'V' ? r.values[i] : r.values[i])]) })), xLabel: t(lab) + (q ? ` (${uLabel(U(), q)})` : ''), yLabel: uLabel(U(), gq), w: 540, h: 300 }))),
      h('div', { class: 'scroll-y' }, h('table', { class: 'grid small' }, h('tr', {}, h('th', {}, t(lab)), sw.outDefs.map((o) => h('th', {}, `${o.label} (${uLabel(U(), o.q)})`))), sw.rows.map((r) => h('tr', { class: r.ok ? '' : 'bad' }, h('td', { class: 'num' }, fmtN(cv(r.v), 4)), r.values.map((v, i) => h('td', { class: 'num' }, r.ok ? show(sw.outDefs[i].q, v) : '✘')))))));
  }
}

// ---------------- EPANET & report ----------------
async function exportInp(net) { const { text } = toInp(net); const fp = await window.host.saveText({ text, name: net.name.replace(/[^\w\- ]+/g, '') + '.inp', ext: 'inp' }); if (fp) toast(t('Saved') + ': ' + fp); }
async function importInp() { const r = await window.host.openText({ ext: 'inp' }); if (!r) return; try { const net = fromInp(r.text, r.filePath.split(/[\\/]/).pop().replace(/\.inp$/i, '')); store.project.networks.push(net); commit('inp', { render: false }); go('hyd', { netId: net.id }); toast(t('Imported') + ': ' + net.nodes.length + ' ' + t('nodes')); } catch (e) { toast(e.message, 'error'); } }
export async function exportHydPdf(outPath) {
  const net = curNet(); if (!net) return null; const res = run(net); if (!res.ok) { toast(res.error, 'error'); return null; }
  const S = ui(); const anim = S.anim; S.anim = false; const cv = canvasSvg(net, res).el; S.anim = anim;
  const xs = net.nodes.map((n) => n.x), ys = net.nodes.map((n) => n.y); cv.setAttribute('viewBox', `${Math.min(...xs) - 60} ${Math.min(...ys) - 60} ${Math.max(...xs) - Math.min(...xs) + 120} ${Math.max(...ys) - Math.min(...ys) + 120}`); cv.setAttribute('width', '100%');
  const u = (q) => uLabel(U(), q); const fl = res.fluid;
  let html = `<h2>${t('Network')}</h2><style>.hyd-canvas .hl-line{stroke:#7a8899;stroke-linecap:round}.hyd-canvas .hl-hit{stroke:transparent}.hyd-canvas .sym{fill:#fff;stroke:#34465c;stroke-width:2}.hyd-canvas .sym-in{fill:#34465c}.hyd-canvas .nd{fill:#fff;stroke:#34465c;stroke-width:2}.hyd-canvas .water{fill:#9cc9f0}.hyd-canvas .wave,.hyd-canvas .spray{stroke:#2b6cc4;fill:none;stroke-width:1.5}.hyd-canvas text{font-size:11px}.hyd-canvas .hn-name{font-weight:700}.hyd-canvas .hl-lab,.hyd-canvas .hn-lab{fill:#34465c;font-size:10px}.hyd-canvas .bg{fill:#fff}.hyd-canvas .dir{fill:#34465c}</style>${cv.outerHTML}`;
  html += `<h2>${t('Fluid & settings')}</h2><table><tr><th>${t('Fluid')}</th><td>${esc(t(fl.label))} @ ${show('temp', fl.T ?? 293.15, 1)} ${u('temp')} (${esc(fl.source || 'user')})</td><th>ρ</th><td>${show('dens', fl.rho, 2)} ${u('dens')}</td><th>μ</th><td>${show('visc', fl.mu, 4)} ${u('visc')}</td></tr><tr><th>${t('Head-loss model')}</th><td>${net.headloss === 'HW' ? 'Hazen–Williams' : 'Darcy–Weisbach / ' + (net.friction === 'swamee' ? 'Swamee–Jain' : 'Colebrook–White')}</td><th>${t('Solver')}</th><td>${res.method === 'gga' ? 'Newton GGA' : 'Hardy Cross'} (${res.iterations} it.)</td><th>${t('Units')}</th><td>${U()}</td></tr></table>`;
  if (res.warnings.length || res.statusLog.length) html += `<p>${[...res.warnings, ...res.statusLog].map((w) => '⚠ ' + esc(w)).join('<br>')}</p>`;
  html += `<h2>${t('Node results')}</h2><table><tr><th>${t('Node')}</th><th>${t('Type')}</th><th>z (${u('len')})</th><th>${t('Demand')} (${u('flow')})</th><th>H (${u('head')})</th><th>p (${u('press')})</th></tr>${net.nodes.map((n) => { const r = res.nodes[n.id]; return `<tr><td>${esc(n.label)}</td><td>${t(n.type)}</td><td class="num">${show('len', n.z, 2)}</td><td class="num">${show('flow', n.demand || 0)}</td><td class="num">${show('head', r.H)}</td><td class="num">${show('press', r.p, 2)}</td></tr>`; }).join('')}</table>`;
  html += `<h2>${t('Link results')}</h2><table><tr><th>${t('Link')}</th><th>${t('Type')}</th><th>${t('Details')}</th><th>Q (${u('flow')})</th><th>V (${u('vel')})</th><th>Re</th><th>f</th><th>h_L (${u('head')})</th></tr>${net.links.map((l) => { const r = res.links[l.id]; const d = l.type === 'pipe' ? `L ${show('len', l.pipe.L, 1)} ${u('len')}, D ${show('dia', l.pipe.D, 1)} ${u('dia')}, ΣK ${fmtN(r.K, 2)}` : l.type === 'pump' ? `H ${show('head', r.head, 2)} ${u('head')}, NPSHa ${show('head', r.npsha, 2)}${Number.isFinite(r.npshr) ? ' / NPSHr ' + show('head', r.npshr, 2) : ''}` : l.type === 'valve' ? `${t(l.valve.kind)} ${l.valve.opening ?? 100} %` : ''; return `<tr><td>${esc(l.label)}</td><td>${t(l.type)}</td><td>${d}</td><td class="num">${show('flow', r.Q)}</td><td class="num">${r.V != null ? show('vel', r.V) : ''}</td><td class="num">${r.Re ? fmtN(r.Re, 0) : ''}</td><td class="num">${r.f ? fmtN(r.f, 5) : ''}</td><td class="num">${show('head', r.hL)}</td></tr>`; }).join('')}</table>`;
  const tmp = h('div'); for (const p of net.links.filter((l) => l.type === 'pump')) { S.pumpId = p.id; pumpTab(tmp, net, res); }
  S.pathA = null; S.pathB = null; const tmp2 = h('div'); profileTab(tmp2, net, res);
  html += `<h2 class="page">${t('Pump & system curve')}</h2><div class="charts">${[...tmp.querySelectorAll('svg')].map((x) => x.outerHTML).join('')}</div><h2>${t('HGL / EGL profile')}</h2>${[...tmp2.querySelectorAll('svg')].map((x) => x.outerHTML).join('')}`;
  const steps = explain(net, res);
  html += `<h2 class="page">${t('Step-by-step solution')}</h2><div class="steps">${steps.map((st, i) => `<div class="st"><b>${i + 1}. ${esc(t(st.title))}</b>${(st.lines || []).map((l) => `<div class="mono ltr">${esc(l)}</div>`).join('')}${st.table ? `<table><tr>${st.table.head.map((x) => `<th>${esc(t(x))}</th>`).join('')}</tr>${st.table.rows.slice(0, 40).map((r) => `<tr>${r.map((c) => `<td class="num">${esc(c)}</td>`).join('')}</tr>`).join('')}</table>` : ''}${st.sub ? st.sub.map((x) => `<div class="st"><b>${esc(x.title)}</b>${x.lines.map((l) => `<div class="mono ltr">${esc(l)}</div>`).join('')}</div>`).join('') : ''}${st.hardy ? st.hardy.slice(0, 3).map((it) => `<div class="mono ltr">it ${it.it}: ${it.loops.map((lp) => `loop ${lp.loop} ΔQ = ${(lp.dQ * 1000).toFixed(4)} L/s`).join('; ')}</div>`).join('') : ''}</div>`).join('')}</div>`;
  const r = await window.host.exportPdf({ html: reportShell(t('Hydraulic analysis') + ': ' + net.name, store.project.name, html, { version: info.version }), name: net.name.replace(/[^\w\- ]+/g, '').trim() || 'hydraulics', outPath });
  if (r && !outPath) toast(t('Report saved') + ': ' + r.path); return r;
}
