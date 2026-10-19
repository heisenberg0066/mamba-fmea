// Minimal SVG charts: line/xy plots with several series and markers, bar charts, stacked bars.
import { s } from './ui.js';
const nice = (lo, hi, n = 5) => { if (!(hi > lo)) { hi = lo + 1; } const span = hi - lo; const step0 = span / n; const mag = 10 ** Math.floor(Math.log10(step0)); const st = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= step0) || mag * 10; const a = Math.floor(lo / st) * st, b = Math.ceil(hi / st) * st; const ticks = []; for (let v = a; v <= b + st * 1e-9; v += st) ticks.push(+v.toPrecision(10)); return { a, b, ticks }; };
const fmtT = (v) => { const a = Math.abs(v); return a !== 0 && (a < 1e-3 || a >= 1e5) ? v.toExponential(1) : String(+v.toPrecision(4)); };
/** series: [{name, color, pts:[[x,y]], dash, width, marker}] ; points: [{x,y,label,color}] */
export function xyPlot({ series = [], points = [], w = 620, h = 340, xLabel = '', yLabel = '', title = '', xMin, yMin, xMax, yMax, legend = true, areas = [] }) {
  const all = series.flatMap((x) => x.pts).concat(points.map((p) => [p.x, p.y])).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const X = nice(xMin ?? Math.min(...xs, 0), xMax ?? Math.max(...xs, 1)), Y = nice(yMin ?? Math.min(...ys, 0), yMax ?? Math.max(...ys, 1));
  const hasLeg = legend && series.filter((x) => x.name).length > 1; const L = 58, R = 14, T = (title ? 28 : 12) + (hasLeg ? 14 : 0), B = 44; const pw = w - L - R, ph = h - T - B;
  const px = (x) => L + ((x - X.a) / (X.b - X.a)) * pw, py = (y) => T + ph - ((y - Y.a) / (Y.b - Y.a)) * ph;
  const g = s('svg', { class: 'plot', viewBox: `0 0 ${w} ${h}`, width: w, height: h });
  if (title) g.append(s('text', { x: L, y: 18, class: 'plot-title' }, title));
  g.append(s('rect', { x: L, y: T, width: pw, height: ph, class: 'plot-area' }));
  for (const v of X.ticks) g.append(s('line', { x1: px(v), x2: px(v), y1: T, y2: T + ph, class: 'grid' }), s('text', { x: px(v), y: T + ph + 15, 'text-anchor': 'middle', class: 'tick' }, fmtT(v)));
  for (const v of Y.ticks) g.append(s('line', { x1: L, x2: L + pw, y1: py(v), y2: py(v), class: 'grid' }), s('text', { x: L - 6, y: py(v) + 4, 'text-anchor': 'end', class: 'tick' }, fmtT(v)));
  g.append(s('text', { x: L + pw / 2, y: h - 8, 'text-anchor': 'middle', class: 'axis-label' }, xLabel), s('text', { x: 14, y: T + ph / 2, transform: `rotate(-90 14 ${T + ph / 2})`, 'text-anchor': 'middle', class: 'axis-label' }, yLabel));
  const clip = 'c' + Math.random().toString(36).slice(2, 8); g.append(s('clipPath', { id: clip }, s('rect', { x: L, y: T, width: pw, height: ph })));
  for (const a of areas) { const d = a.pts.map(([x, y], i) => (i ? 'L' : 'M') + px(x).toFixed(1) + ' ' + py(y).toFixed(1)).join(' '); g.append(s('path', { d, fill: a.color, opacity: a.opacity ?? 0.15, 'clip-path': `url(#${clip})` })); }
  series.forEach((se) => {
    const pts = se.pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)); if (!pts.length) return;
    const d = pts.map(([x, y], i) => (i ? 'L' : 'M') + px(x).toFixed(1) + ' ' + py(y).toFixed(1)).join(' ');
    g.append(s('path', { d, fill: 'none', stroke: se.color, 'stroke-width': se.width || 2, 'stroke-dasharray': se.dash || null, 'clip-path': `url(#${clip})` }));
    if (se.marker) pts.forEach(([x, y]) => g.append(s('circle', { cx: px(x), cy: py(y), r: 3, fill: se.color })));
  });
  points.forEach((p) => { if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return; g.append(s('circle', { cx: px(p.x), cy: py(p.y), r: 5.5, fill: p.color || '#e4572e', stroke: '#fff', 'stroke-width': 2 })); if (p.label) g.append(s('text', { x: px(p.x) + 8, y: py(p.y) - 8, class: 'pt-label' }, p.label)); });
  if (hasLeg) { let lx = L + 4; const ly = T - 6; series.forEach((se) => { if (!se.name) return; g.append(s('line', { x1: lx, x2: lx + 18, y1: ly - 4, y2: ly - 4, stroke: se.color, 'stroke-width': 2.5, 'stroke-dasharray': se.dash || null }), s('text', { x: lx + 22, y: ly, class: 'series-label' }, se.name)); lx += 30 + se.name.length * 6.2; }); }
  return g;
}
/** bars: [{label, value, color}] ; optional line (cumulative %) */
export function barChart({ bars, w = 560, h = 260, title = '', yLabel = '', line = null, horizontal = false }) {
  const L = horizontal ? 150 : 46, R = line ? 44 : 12, T = title ? 28 : 10, B = horizontal ? 24 : 64; const pw = w - L - R, ph = h - T - B;
  const max = Math.max(1, ...bars.map((b) => b.value)); const Y = nice(0, max * 1.15, 4);
  const g = s('svg', { class: 'plot', viewBox: `0 0 ${w} ${h}`, width: w, height: h }); if (title) g.append(s('text', { x: 8, y: 18, class: 'plot-title' }, title));
  g.append(s('rect', { x: L, y: T, width: pw, height: ph, class: 'plot-area' }));
  if (!horizontal) {
    for (const v of Y.ticks) { const y = T + ph - (v / Y.b) * ph; g.append(s('line', { x1: L, x2: L + pw, y1: y, y2: y, class: 'grid' }), s('text', { x: L - 5, y: y + 4, 'text-anchor': 'end', class: 'tick' }, fmtT(v))); }
    const bw = pw / Math.max(bars.length, 1);
    bars.forEach((b, i) => { const bh = (b.value / Y.b) * ph; const x = L + i * bw + bw * 0.15; g.append(s('rect', { x, y: T + ph - bh, width: bw * 0.7, height: bh, fill: b.color || '#ff7a00', rx: 2 }, s('title', {}, `${b.label}: ${b.value}`)));
      g.append(s('text', { x: x + bw * 0.35, y: T + ph - bh - 4, 'text-anchor': 'middle', class: 'tick' }, fmtT(b.value)));
      const lab = String(b.label).length > 16 ? String(b.label).slice(0, 15) + '…' : String(b.label); g.append(s('text', { x: x + bw * 0.35, y: T + ph + 12, 'text-anchor': 'end', transform: `rotate(-35 ${x + bw * 0.35} ${T + ph + 12})`, class: 'tick' }, lab)); });
    if (line) { const d = line.map((v, i) => (i ? 'L' : 'M') + (L + i * bw + bw / 2).toFixed(1) + ' ' + (T + ph - v * ph).toFixed(1)).join(' '); g.append(s('path', { d, fill: 'none', stroke: '#142132', 'stroke-width': 2 })); line.forEach((v, i) => g.append(s('circle', { cx: L + i * bw + bw / 2, cy: T + ph - v * ph, r: 3, fill: '#142132' })));
      [0, 0.5, 0.8, 1].forEach((v) => g.append(s('text', { x: L + pw + 4, y: T + ph - v * ph + 4, class: 'tick' }, Math.round(v * 100) + '%'))); g.append(s('line', { x1: L, x2: L + pw, y1: T + ph * 0.2, y2: T + ph * 0.2, stroke: '#d13b3b', 'stroke-dasharray': '4 3' })); }
  } else {
    const bh = ph / Math.max(bars.length, 1);
    bars.forEach((b, i) => { const bw = (b.value / Y.b) * pw; const y = T + i * bh + bh * 0.15; g.append(s('rect', { x: L, y, width: bw, height: bh * 0.7, fill: b.color || '#ff7a00', rx: 2 }), s('text', { x: L - 6, y: y + bh * 0.45, 'text-anchor': 'end', class: 'tick' }, String(b.label).slice(0, 22)), s('text', { x: L + bw + 4, y: y + bh * 0.45, class: 'tick' }, fmtT(b.value))); });
  }
  return g;
}
export const AP_COL = { H: '#d13b3b', M: '#e8a317', L: '#2ea05a', '': '#a8b3c2' };
