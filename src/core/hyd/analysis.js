// Pump / system curves, NPSH, HGL–EGL profiles, parametric sweeps and step-by-step explanations.
import { solve, pumpCurve, interp, P_ATM } from './network.js';
import { G, area, colebrook, swameeJain, minorK } from './friction.js';
import { fluidState } from '../fluids/fluids.js';
import { clone } from '../fmea/model.js';

export function fluidFor(net) { const f = net.fluid || {}; if (f.custom) return { id: 'custom', label: f.label || 'Custom fluid', rho: f.rho, mu: f.mu, nu: f.mu / f.rho, Pv: f.Pv ?? 2339, gas: !!f.gas, warn: [], T: f.T, P: f.P }; return fluidState(f.id || 'Water', f.T ?? 293.15, f.P ?? P_ATM); }
export function run(net, opts = {}) { const fl = opts.fluid || fluidFor(net); return solve(net, fl, opts); }

/** System curve seen by pump `pumpId`: required head vs flow (other pumps keep running), plus pump curve and operating point. */
export function systemCurve(net, pumpId, { points = 25, qmax } = {}) {
  const pump = net.links.find((l) => l.id === pumpId); if (!pump) throw new Error('No pump'); const pc = pumpCurve(pump.pump); const fl = fluidFor(net);
  const Qm = qmax || pc.qmaxS * 1.1 || 0.01; const sys = [], pcurve = [];
  for (let i = 0; i <= points; i++) {
    const Q = (Qm * i) / points; const r = solve(net, fl, { fixedFlows: { [pumpId]: Q }, trace: false });
    if (r.ok) sys.push([Q, r.nodes[pump.to].H - r.nodes[pump.from].H]);
    pcurve.push([Q, pc.H(Q)]);
  }
  const op = solve(net, fl, { trace: false }); const lr = op.ok ? op.links[pumpId] : null;
  const npshr = (pump.pump.npshr || []).length ? pcurve.map(([Q]) => [Q, interp(pump.pump.npshr, Q / (pc.speed || 1)) * (pc.speed || 1) ** 2]) : [];
  // NPSHa vs Q: from the fixed-flow solutions
  const npsha = []; for (let i = 0; i <= points; i++) { const Q = (Qm * i) / points; const r = solve(net, fl, { fixedFlows: { [pumpId]: Q }, trace: false }); if (!r.ok) continue; const sn = net.nodes.find((n) => n.id === pump.from); const pAbs = r.nodes[pump.from].pAbs; let Vs = 0; for (const l of net.links) if (l.type === 'pipe' && (l.to === pump.from || l.from === pump.from)) Vs = Math.max(Vs, Math.abs(r.links[l.id].Q) / area(l.pipe.D)); npsha.push([Q, (pAbs - (fl.Pv || 0)) / (fl.rho * G)]); void Vs; void sn; }
  return { system: sys, pump: pcurve, npshr, npsha, op: lr && !lr.closed ? { Q: lr.Q, H: lr.head, npsha: lr.npsha, npshr: lr.npshr, eta: lr.eta, P: lr.powerShaft } : null, curve: pc };
}

/** Shortest path (by link count, preferring pipe length) between two nodes; returns ordered [{node, link}] */
export function findPath(net, a, b) {
  const adj = new Map(net.nodes.map((n) => [n.id, []])); net.links.forEach((l) => { adj.get(l.from)?.push([l.to, l]); adj.get(l.to)?.push([l.from, l]); });
  const dist = new Map([[a, 0]]); const prev = new Map(); const Q = [[0, a]]; const w = (l) => (l.type === 'pipe' ? l.pipe.L : 0.001);
  while (Q.length) { Q.sort((x, y) => x[0] - y[0]); const [d, u] = Q.shift(); if (u === b) break; if (d > (dist.get(u) ?? Infinity)) continue; for (const [v, l] of adj.get(u) || []) { const nd = d + w(l); if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, [u, l]); Q.push([nd, v]); } } }
  if (!dist.has(b)) return null; const path = [{ node: b, link: null }]; let c = b;
  while (c !== a) { const [u, l] = prev.get(c); path.unshift({ node: u, link: l }); c = u; } // link = link from this node to the next one
  return path;
}
/** HGL / EGL / elevation profile along a node path. */
export function profile(net, res, a, b) {
  const path = findPath(net, a, b); if (!path) return null; const pts = []; let x = 0; const byId = new Map(net.nodes.map((n) => [n.id, n]));
  for (let i = 0; i < path.length; i++) {
    const n = byId.get(path[i].node); const H = res.nodes[n.id].H;
    const lin = path[i].link; const linPrev = i > 0 ? path[i - 1].link : null;
    const vh = (l) => (l && res.links[l.id] && res.links[l.id].V != null ? res.links[l.id].V ** 2 / (2 * G) : 0);
    if (i > 0) pts.push({ x, H, E: H + vh(linPrev), z: n.z, label: n.label, node: n.id });
    if (lin) { pts.push({ x, H, E: H + vh(lin), z: n.z, label: i === 0 ? n.label : '', node: n.id, start: true }); x += lin.type === 'pipe' ? lin.pipe.L : 0; }
    else if (i === 0) pts.push({ x, H, E: H, z: n.z, label: n.label, node: n.id });
  }
  return { path, pts };
}

const PARAMS = {
  'pipe.D': (net, id, v) => { net.links.find((l) => l.id === id).pipe.D = v; },
  'pipe.L': (net, id, v) => { net.links.find((l) => l.id === id).pipe.L = v; },
  'pipe.eps': (net, id, v) => { net.links.find((l) => l.id === id).pipe.eps = v; },
  'pump.speed': (net, id, v) => { net.links.find((l) => l.id === id).pump.speed = v; },
  'valve.opening': (net, id, v) => { net.links.find((l) => l.id === id).valve.opening = v; },
  'node.demand': (net, id, v) => { net.nodes.find((n) => n.id === id).demand = v; },
  'node.level': (net, id, v) => { net.nodes.find((n) => n.id === id).level = v; },
  'node.z': (net, id, v) => { net.nodes.find((n) => n.id === id).z = v; },
  'fluid.T': (net, _id, v) => { net.fluid.T = v; },
};
export const SWEEP_PARAMS = Object.keys(PARAMS);
/** Parametric sweep: vary one parameter, record outputs [{kind:'link'|'node', id, field}] */
export function sweep(net, { param, target, from, to, steps = 10, outputs = [] }) {
  const rows = []; for (let i = 0; i <= steps; i++) {
    const v = from + ((to - from) * i) / steps; const n = clone(net); PARAMS[param](n, target, v);
    const r = run(n, { trace: false }); const row = { v, ok: r.ok, values: [] };
    for (const o of outputs) row.values.push(r.ok ? (o.kind === 'link' ? r.links[o.id] && r.links[o.id][o.field] : r.nodes[o.id] && r.nodes[o.id][o.field]) : NaN);
    rows.push(row);
  }
  return rows;
}

/** Step-by-step explanation of a solved network (structured; the UI renders formulas). */
export function explain(net, res) {
  const fl = res.fluid; const steps = [];
  steps.push({ title: 'Fluid properties', lines: [`Fluid: ${fl.label} at T = ${((fl.T ?? 293.15) - 273.15).toFixed(1)} °C (${fl.source || 'user'})`, `ρ = ${fl.rho.toFixed(2)} kg/m³,  μ = ${fl.mu.toExponential(4)} Pa·s,  ν = μ/ρ = ${(fl.mu / fl.rho).toExponential(4)} m²/s` + (Number.isFinite(fl.Pv) ? `,  p_v = ${(fl.Pv / 1000).toFixed(3)} kPa` : '')] });
  const hw = res.opts.headloss === 'HW';
  steps.push({ title: 'Governing equations', lines: [
    'Continuity at every junction:  Σ Q_in − Σ Q_out = demand',
    'Energy along every link:  H_from − H_to = h_L(Q)   (pumps: H_to − H_from = H_pump(Q))',
    hw ? 'Hazen–Williams:  h_f = 10.667 · L · Q^1.852 / (C^1.852 · D^4.871)' : 'Darcy–Weisbach:  h_f = f · (L/D) · V²/(2g),   V = Q / (πD²/4)',
    hw ? '' : (res.opts.friction === 'swamee' ? 'Swamee–Jain:  f = 0.25 / [log₁₀(ε/(3.7D) + 5.74/Re^0.9)]²' : 'Colebrook–White:  1/√f = −2 log₁₀( ε/(3.7D) + 2.51/(Re √f) )  (solved by Newton iteration)'),
    'Minor losses:  h_m = ΣK · V²/(2g);  laminar (Re < 2000):  f = 64/Re',
  ].filter(Boolean) });
  if (res.method === 'gga') steps.push({ title: `Newton global-gradient iterations (${res.iterations})`, table: { head: ['Iteration', 'Σ|ΔQ| / Σ|Q|'], rows: (res.trace || []).map((t) => [t.it, t.rel.toExponential(3)]) } });
  else steps.push({ title: `Hardy Cross iterations (${res.iterations}, ${res.loops} loop(s))`, hardy: (res.trace || []).slice(0, 6) });
  const pl = [];
  for (const l of net.links) {
    const r = res.links[l.id]; if (!r) continue;
    if (l.type === 'pipe') {
      const p = l.pipe; const A = area(p.D); const K = minorK(p);
      const lines = [`Q = ${(r.Q * 1000).toFixed(3)} L/s,  A = π·${p.D.toFixed(4)}²/4 = ${A.toExponential(4)} m²,  V = Q/A = ${r.V.toFixed(3)} m/s`];
      if (!hw) {
        lines.push(`Re = ρVD/μ = ${fl.rho.toFixed(1)}·${Math.abs(r.V).toFixed(3)}·${p.D.toFixed(4)}/${fl.mu.toExponential(3)} = ${r.Re.toFixed(0)}  → ${r.regime}`);
        if (r.regime === 'turbulent' && !p.fixedF) { const rr = (p.eps || 0) / p.D; const cb = colebrook(r.Re, rr, { history: true }); lines.push(`ε/D = ${rr.toExponential(3)};  Swamee–Jain start f₀ = ${swameeJain(r.Re, rr).toFixed(5)};  Colebrook converges to f = ${cb.f.toFixed(5)} in ${cb.iterations} iterations`); }
        else lines.push(`f = ${r.f.toFixed(5)}`);
        lines.push(`h_f = f·(L/D)·V²/(2g) = ${r.f.toFixed(5)}·(${p.L}/${p.D.toFixed(4)})·${(r.V ** 2 / (2 * G)).toFixed(4)} = ${r.hMajor.toFixed(4)} m`);
      } else lines.push(`h_f (Hazen–Williams, C = ${p.C}) = ${r.hMajor.toFixed(4)} m`);
      if (K) lines.push(`h_m = ΣK·V²/(2g) = ${K.toFixed(2)}·${(r.V ** 2 / (2 * G)).toFixed(4)} = ${r.hMinor.toFixed(4)} m`);
      lines.push(`h_L = ${r.hL.toFixed(4)} m,  Δp = ρ g h_L = ${(fl.rho * G * r.hL / 1000).toFixed(3)} kPa`);
      pl.push({ title: `Pipe ${l.label}`, lines });
    } else if (l.type === 'pump') {
      const lines = [`Curve: ${r.curveKind}${r.coef ? ' (' + Object.entries(r.coef).map(([k, v]) => `${k} = ${(+v).toPrecision(5)}`).join(', ') + ')' : ''}`, `Operating point: Q = ${(r.Q * 3600).toFixed(2)} m³/h, H = ${r.head.toFixed(3)} m`, `Hydraulic power P = ρ g Q H = ${(r.powerHyd / 1000).toFixed(3)} kW` + (Number.isFinite(r.eta) ? `;  η = ${(r.eta * 100).toFixed(1)} %  → shaft power ${(r.powerShaft / 1000).toFixed(3)} kW` : '')];
      lines.push(`NPSHa = (H_s − z_s) + (p_atm − p_v)/(ρg) = ${r.npsha.toFixed(3)} m` + (Number.isFinite(r.npshr) ? `;  NPSHr = ${r.npshr.toFixed(2)} m;  margin = ${r.npshMargin.toFixed(2)} m` : ''));
      pl.push({ title: `Pump ${l.label}`, lines });
    } else if (l.type === 'valve') pl.push({ title: `Valve ${l.label}`, lines: [`${l.valve.kind}, opening ${l.valve.opening ?? 100} % → K = ${r.K.toFixed(3)}`, `V = ${r.V.toFixed(3)} m/s,  h_L = K V²/(2g) = ${r.hL.toFixed(4)} m`] });
  }
  steps.push({ title: 'Link calculations at the solution', sub: pl });
  steps.push({ title: 'Node results', table: { head: ['Node', 'z (m)', 'H (m)', 'p (kPa g)'], rows: net.nodes.map((n) => [n.label, n.z.toFixed(2), res.nodes[n.id].H.toFixed(3), (res.nodes[n.id].p / 1000).toFixed(2)]) } });
  return steps;
}
