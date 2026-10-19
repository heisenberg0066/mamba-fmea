// Steady-state pipe-network solver (incompressible): Newton global-gradient method (Todini–Pilati, as used in
// EPANET) and the classic Hardy Cross loop method. Units are SI internally: m, m³/s, Pa, kg/m³.
import { G, pipeLoss, area } from './friction.js';
import { valveK } from './catalog.js';

export const P_ATM = 101325;
export const NODE_TYPES = ['junction', 'reservoir', 'tank', 'nozzle'];
export const LINK_TYPES = ['pipe', 'pump', 'valve', 'resistance'];
const R_CLOSED = 1e8;

export function newNetwork(name = 'Network') {
  return { id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, units: 'SI', fluid: { id: 'Water', T: 293.15, P: P_ATM }, headloss: 'DW', friction: 'colebrook', solver: 'gga', Patm: P_ATM, nodes: [], links: [], notes: '' };
}
let nseq = 0; const nid = (p) => p + (++nseq).toString(36) + Math.random().toString(36).slice(2, 5);
export function addNode(net, type, x, y, props = {}) {
  const n = { id: props.id || nid('N'), type, x, y, z: 0, demand: 0, label: '', ...props };
  if (type === 'reservoir' && n.level == null) n.level = 10;
  if (type === 'tank' && n.level == null) n.level = 2;
  if (type === 'nozzle' && !n.nozzle) n.nozzle = { d: 0.01, Cd: 0.95 };
  if (!n.label) n.label = labelFor(net, type);
  net.nodes.push(n); return n;
}
export function addLink(net, type, from, to, props = {}) {
  const l = { id: props.id || nid('L'), type, from, to, label: '', status: 'open', ...props };
  if (type === 'pipe') l.pipe = { L: 100, D: 0.1023, eps: 0.045e-3, C: 120, material: 'steel', size: 'nps100-40', fittings: [], Kextra: 0, ...(props.pipe || {}) };
  if (type === 'pump') l.pump = { curve: [[0, 32], [0.00333, 28], [0.00611, 18.5]], npshr: [], eff: [], speed: 1, on: true, ...(props.pump || {}) };
  if (type === 'valve') l.valve = { kind: 'gate', opening: 100, D: 0.1, ...(props.valve || {}) };
  if (type === 'resistance') l.res = { r: 1, n: 2, ...(props.res || {}) };
  if (!l.label) l.label = labelFor(net, type);
  net.links.push(l); return l;
}
function labelFor(net, type) { const pre = { junction: 'J', reservoir: 'R', tank: 'T', nozzle: 'N', pipe: 'P', pump: 'PU', valve: 'V', resistance: 'X' }[type] || 'X'; const all = [...net.nodes, ...net.links].map((x) => x.label); let i = 1; while (all.includes(pre + i)) i++; return pre + i; }
export function removeNode(net, id) { net.nodes = net.nodes.filter((n) => n.id !== id); net.links = net.links.filter((l) => l.from !== id && l.to !== id); }
export function removeLink(net, id) { net.links = net.links.filter((l) => l.id !== id); }
export const isFixed = (n) => n.type === 'reservoir' || n.type === 'tank';

// ---------------- pump curves ----------------
/** Fit H(Q) for a pump. 1 point → EPANET-style design-point curve; 3 points from Q=0 → power function; else quadratic LSQ. */
export function pumpCurve(pump) {
  const pts = (pump.curve || []).map(([q, h]) => [+q, +h]).filter(([q, h]) => Number.isFinite(q) && Number.isFinite(h)).sort((a, b) => a[0] - b[0]);
  const s = pump.speed ?? 1;
  let base;
  if (pts.length === 1) { const [q1, h1] = pts[0]; const A = 4 / 3 * h1, B = (1 / 3) * h1 / (q1 * q1); base = { kind: 'design point', f: (q) => A - B * q * q, d: (q) => -2 * B * q, shutoff: A, qmax: 2 * q1, coef: { A, B, C: 2 } }; }
  else if (pts.length === 3 && pts[0][0] === 0) {
    const [[, h0], [q1, h1], [q2, h2]] = pts; const h4 = h0 - h1, h5 = h0 - h2; const C = Math.log(h5 / h4) / Math.log(q2 / q1); const B = h4 / Math.pow(q1, C);
    base = { kind: 'power', f: (q) => h0 - B * Math.pow(Math.max(q, 0), C), d: (q) => -B * C * Math.pow(Math.max(q, 1e-12), C - 1), shutoff: h0, qmax: Math.pow(h0 / B, 1 / C), coef: { A: h0, B, C } };
  } else if (pts.length >= 2) {
    // least squares H = a + bQ + cQ² (or linear for 2 points)
    let a, b, c = 0;
    if (pts.length === 2) { b = (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0]); a = pts[0][1] - b * pts[0][0]; }
    else {
      const S = [0, 0, 0, 0, 0], T = [0, 0, 0]; for (const [q, h] of pts) { for (let k = 0; k < 5; k++) S[k] += q ** k; for (let k = 0; k < 3; k++) T[k] += h * q ** k; }
      const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]]; [a, b, c] = solveDense(M, T);
    }
    const f = (q) => a + b * q + c * q * q; const qmax = c < 0 ? (-b - Math.sqrt(Math.max(b * b - 4 * a * c, 0))) / (2 * c) : b < 0 ? -a / b : pts[pts.length - 1][0] * 1.5;
    base = { kind: 'quadratic', f, d: (q) => b + 2 * c * q, shutoff: a, qmax, coef: { a, b, c } };
  } else base = { kind: 'none', f: () => 0, d: () => 0, shutoff: 0, qmax: 0 };
  // affinity laws for speed ratio s: H(Q) = s² H₀(Q/s)
  return { ...base, speed: s, H: (q) => s * s * base.f(q / s), dH: (q) => s * base.d(q / s), shutoffS: s * s * base.shutoff, qmaxS: s * base.qmax, points: pts };
}
export function interp(pts, x) { const p = (pts || []).map(([a, b]) => [+a, +b]).sort((a, b) => a[0] - b[0]); if (!p.length) return NaN; if (x <= p[0][0]) return p.length > 1 ? p[0][1] + (p[1][1] - p[0][1]) * (x - p[0][0]) / (p[1][0] - p[0][0] || 1) : p[0][1]; for (let i = 1; i < p.length; i++) if (x <= p[i][0]) return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * (x - p[i - 1][0]) / (p[i][0] - p[i - 1][0]); const n = p.length; return n > 1 ? p[n - 1][1] + (p[n - 1][1] - p[n - 2][1]) * (x - p[n - 1][0]) / (p[n - 1][0] - p[n - 2][0] || 1) : p[n - 1][1]; }

// ---------------- dense linear algebra ----------------
export function solveDense(A, b) {
  const n = b.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) throw new Error('Singular system');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (!f) continue; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = Array(n).fill(0); for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; } return x;
}

// ---------------- compile network into solver elements ----------------
function compile(net, fluid, opts) {
  const rho = fluid.rho, g = G; const nodes = net.nodes.map((n) => ({ ...n })); const links = [];
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const H0 = (n) => n.z + (n.level || 0) + (n.pressure || 0) / (rho * g);
  nodes.forEach((n) => { n.fixed = isFixed(n); if (n.fixed) n.H0 = H0(n); n.q = n.fixed ? 0 : (n.demand || 0); });
  for (const l of net.links) {
    if (!idx.has(l.from) || !idx.has(l.to)) continue;
    const e = { id: l.id, src: l, type: l.type, i: idx.get(l.from), j: idx.get(l.to), closed: l.status === 'closed', check: false };
    if (l.type === 'pipe') { const p = { ...l.pipe }; e.F = (Q) => pipeLoss(p, Q, fluid, opts).h; e.detail = (Q) => pipeLoss(p, Q, fluid, opts); e.check = !!l.pipe.check; }
    else if (l.type === 'resistance') { const { r, n } = l.res; e.F = (Q) => r * Math.pow(Math.abs(Q), n - 1) * Q; e.detail = (Q) => ({ h: e.F(Q) }); }
    else if (l.type === 'valve') { const D = l.valve.D || 0.1; const K = valveK(l.valve); const A = area(D); e.K = K; e.F = (Q) => K * (Q / A) * Math.abs(Q / A) / (2 * g); e.detail = (Q) => ({ h: e.F(Q), V: Q / A, K }); const def = l.valve.check || /check/.test(l.valve.kind); e.check = !!def; if ((l.valve.opening ?? 100) <= 0) e.closed = true; }
    else if (l.type === 'pump') { const pc = pumpCurve(l.pump); e.pc = pc; e.F = (Q) => -pc.H(Q); e.dF = (Q) => Math.max(-pc.dH(Math.max(Q, 0)), 1e-6); e.check = true; if (l.pump.on === false) e.closed = true; e.detail = (Q) => ({ h: -pc.H(Q), head: pc.H(Q) }); }
    links.push(e);
  }
  // nozzles: hidden link to an atmospheric fixed node at the nozzle elevation
  for (const n of nodes.filter((x) => x.type === 'nozzle')) {
    const d = (n.nozzle && n.nozzle.d) || 0.01, Cd = (n.nozzle && n.nozzle.Cd) || 0.95; const A = area(d); const k = 1 / (2 * g * Cd * Cd * A * A);
    const atm = { id: n.id + '~atm', type: 'atmosphere', hidden: true, fixed: true, H0: n.z, z: n.z, q: 0 }; nodes.push(atm); idx.set(atm.id, nodes.length - 1);
    links.push({ id: n.id + '~jet', type: 'jet', hidden: true, nozzleOf: n.id, i: idx.get(n.id), j: nodes.length - 1, check: true, closed: false, F: (Q) => k * Q * Math.abs(Q), detail: (Q) => ({ h: k * Q * Math.abs(Q), V: Q / (Cd * A) }), k });
  }
  // fixed-flow links (system curve): remove from equations, convert to nodal demands
  if (opts.fixedFlows) for (const [lid, Q] of Object.entries(opts.fixedFlows)) { const e = links.find((x) => x.id === lid); if (!e) continue; e.fixedQ = Q; nodes[e.i].q += Q; nodes[e.j].q -= Q; }
  return { nodes, links, idx };
}
function deriv(e, Q) { if (e.dF) return e.dF(Q); const dq = Math.max(1e-9, Math.abs(Q) * 1e-5); return (e.F(Q + dq) - e.F(Q - dq)) / (2 * dq); }

function connectivity(nodes, links) {
  const adj = nodes.map(() => []); links.forEach((e, k) => { if (e.fixedQ != null) return; adj[e.i].push(e.j); adj[e.j].push(e.i); });
  const seen = new Set(); const st = []; nodes.forEach((n, i) => { if (n.fixed) { seen.add(i); st.push(i); } });
  while (st.length) { const i = st.pop(); for (const j of adj[i]) if (!seen.has(j)) { seen.add(j); st.push(j); } }
  return nodes.map((n, i) => (seen.has(i) ? null : n)).filter(Boolean);
}

/** Solve a network. opts: {fluid (state), headloss, friction, solver:'gga'|'hardy', fixedFlows, tol, maxIter, trace} */
export function solve(net, fluid, opts = {}) {
  opts = { headloss: net.headloss || 'DW', friction: net.friction || 'colebrook', solver: net.solver || 'gga', tol: 1e-8, maxIter: 200, ...opts };
  const C = compile(net, fluid, opts);
  if (!C.nodes.some((n) => n.fixed)) return { ok: false, error: 'The network needs at least one reservoir or tank (a fixed head).', code: 'no-fixed' };
  const lost = connectivity(C.nodes, C.links).filter((n) => !n.hidden);
  if (lost.length) return { ok: false, error: `Not connected to any reservoir/tank: ${lost.map((n) => n.label || n.id).join(', ')}`, code: 'disconnected', nodes: lost.map((n) => n.id) };
  const run = opts.solver === 'hardy' ? hardyCross : gga;
  let res; const statusLog = [];
  for (let round = 0; round < 12; round++) {
    res = run(C, opts); if (!res.ok && !res.Q) break;
    // status checks: check valves, pumps (no reverse flow), nozzles (no inflow)
    let changed = false;
    C.links.forEach((e, k) => {
      if (!e.check || e.fixedQ != null) return; const Q = res.Q[k]; const Hi = res.H[e.i], Hj = res.H[e.j];
      if (!e.closed && Q < -1e-9) { e.closed = true; changed = true; statusLog.push(`${e.src ? e.src.label : e.id}: closed (reverse flow)`); }
      else if (e.closed && e.src && (e.src.status !== 'closed') && !(e.type === 'pump' && e.src.pump.on === false) && !(e.type === 'valve' && (e.src.valve.opening ?? 100) <= 0)) {
        const gain = e.type === 'pump' ? e.pc.H(0) : 0; if (Hi + gain - Hj > 1e-6) { e.closed = false; changed = true; statusLog.push(`${e.src.label}: re-opened`); }
      } else if (e.closed && e.type === 'jet' && Hi - Hj > 1e-6) { e.closed = false; changed = true; }
    });
    if (!changed) break;
  }
  if (!res.ok) { delete res.Q; delete res.H; return res; }
  return finish(net, C, res, fluid, opts, statusLog);
}

// ---- Global gradient (Newton) method ----
function gga(C, opts) {
  const { nodes, links } = C; const free = []; const map = new Map(); nodes.forEach((n, i) => { if (!n.fixed) { map.set(i, free.length); free.push(i); } });
  const nf = free.length; const act = links.map((e) => e.fixedQ == null);
  const Fx = (e, Q) => (e.closed ? R_CLOSED * Q : e.F(Q)); const dFx = (e, Q) => (e.closed ? R_CLOSED : Math.max(deriv(e, Q), 1e-7));
  let Q = links.map((e) => (e.fixedQ != null ? e.fixedQ : e.prevQ ?? (e.type === 'pump' ? (Number.isFinite(e.pc.qmaxS) && e.pc.qmaxS > 0 ? e.pc.qmaxS * 0.5 : 1e-3) : e.src && e.src.pipe ? area(e.src.pipe.D) * 1.0 : 1e-3)));
  let H = nodes.map((n) => (n.fixed ? n.H0 : 0)); const avgH = nodes.filter((n) => n.fixed).reduce((s, n) => s + n.H0, 0) / Math.max(1, nodes.filter((n) => n.fixed).length); free.forEach((i) => (H[i] = avgH));
  const trace = []; let it = 0, rel = 1;
  for (it = 1; it <= opts.maxIter; it++) {
    const A = Array.from({ length: nf }, () => Array(nf).fill(0)); const b = Array(nf).fill(0);
    // continuity residual: A21 Q - q  ; inflow positive at 'to' node
    const cont = Array(nodes.length).fill(0); links.forEach((e, k) => { if (!act[k]) return; cont[e.j] += Q[k]; cont[e.i] -= Q[k]; });
    free.forEach((i, r) => (b[r] = cont[i] - nodes[i].q));
    const Dinv = links.map((e, k) => (act[k] ? 1 / dFx(e, Q[k]) : 0)); const Fk = links.map((e, k) => (act[k] ? Fx(e, Q[k]) : 0));
    links.forEach((e, k) => {
      if (!act[k]) return; const w = Dinv[k]; const ri = map.get(e.i), rj = map.get(e.j);
      // energy residual term r_k = F + A12 H_fixed (A12: -1 at from, +1 at to)
      let r = Fk[k]; if (ri == null) r -= H[e.i]; if (rj == null) r += H[e.j];
      // assemble A21 D⁻¹ A12 and rhs  −A21 D⁻¹ r
      if (ri != null) { A[ri][ri] += w; b[ri] += w * r * 1; }
      if (rj != null) { A[rj][rj] += w; b[rj] -= w * r * 1; }
      if (ri != null && rj != null) { A[ri][rj] -= w; A[rj][ri] -= w; }
    });
    // Solve (A21 D⁻¹ A12) H = A21 Q − q − A21 D⁻¹ r  (signs folded into b above with A21 = A12ᵀ)
    let x; try { x = solveDense(A, b); } catch (err) { return { ok: false, error: 'Network matrix is singular – check for isolated sections or closed paths. ' + err.message }; }
    free.forEach((i, r) => (H[i] = x[r]));
    let sdq = 0, sq = 0;
    const Qn = Q.map((q, k) => { if (!act[k]) return q; const e = links[k]; const dq = -Dinv[k] * (Fk[k] - H[e.i] + H[e.j]); sdq += Math.abs(dq); sq += Math.abs(q + dq); return q + dq; });
    Q = Qn; rel = sdq / Math.max(sq, 1e-12);
    if (opts.trace !== false) trace.push({ it, rel, sumQ: sq });
    if (rel < opts.tol) break;
  }
  links.forEach((e, k) => (e.prevQ = Q[k]));
  if (rel > 1e-4) return { ok: false, Q, H, error: `Solver did not converge (relative flow change ${rel.toExponential(2)} after ${opts.maxIter} iterations).` };
  return { ok: true, Q, H, iterations: Math.min(it, opts.maxIter), trace, rel, method: 'gga' };
}

// ---- Hardy Cross loop method ----
function hardyCross(C, opts) {
  const { nodes, links } = C; const N = nodes.length; const Gi = N; // virtual ground node index
  const L = links.map((e, k) => ({ e, k, i: e.i, j: e.j, F: (Q) => (e.closed ? R_CLOSED * Q : e.F(Q)), dF: (Q) => (e.closed ? R_CLOSED : Math.max(deriv(e, Q), 1e-9)) }));
  nodes.forEach((n, i) => { if (n.fixed) L.push({ virtual: true, i: Gi, j: i, F: () => -n.H0, dF: () => 0 }); });
  const act = L.map((l) => !(l.e && l.e.fixedQ != null));
  // spanning tree by BFS from ground (virtual links first)
  const adj = Array.from({ length: N + 1 }, () => []); L.forEach((l, m) => { if (!act[m]) return; adj[l.i].push(m); adj[l.j].push(m); });
  const parent = Array(N + 1).fill(-1), plink = Array(N + 1).fill(-1), depth = Array(N + 1).fill(-1); depth[Gi] = 0; const queue = [Gi]; const inTree = new Set();
  while (queue.length) { const u = queue.shift(); for (const m of adj[u]) { const l = L[m]; const v = l.i === u ? l.j : l.i; if (depth[v] >= 0) continue; depth[v] = depth[u] + 1; parent[v] = u; plink[v] = m; inTree.add(m); queue.push(v); } }
  // initial flows: cotree 0, tree by continuity (post-order)
  const Q = L.map((l, m) => (!act[m] ? l.e.fixedQ : 0));
  const need = Array(N + 1).fill(0); nodes.forEach((n, i) => (need[i] = n.fixed ? 0 : n.q));
  const order = [...Array(N + 1).keys()].filter((v) => depth[v] >= 0).sort((a, b) => depth[b] - depth[a]);
  for (const v of order) { if (v === Gi) continue; const m = plink[v]; const l = L[m]; const req = need[v]; Q[m] = l.j === v ? req : -req; need[parent[v]] += req; }
  // loops from cotree links
  const loops = [];
  L.forEach((l, m) => {
    if (!act[m] || inTree.has(m)) return; const path = [[m, +1]];
    let a = l.j, b = l.i; const up = [], down = [];
    while (a !== b) { if (depth[a] >= depth[b]) { const t = plink[a]; up.push([t, L[t].i === a ? +1 : -1]); a = parent[a]; } else { const t = plink[b]; down.push([t, L[t].j === b ? +1 : -1]); b = parent[b]; } }
    loops.push({ id: l.e ? l.e.id : 'v', links: [...path, ...up, ...down.reverse()] });
  });
  const trace = []; let it = 0, maxdq = 0;
  for (it = 1; it <= Math.max(opts.maxIter, 500); it++) {
    maxdq = 0; const rec = opts.trace !== false && it <= 30 ? [] : null;
    for (const lp of loops) {
      let num = 0, den = 0; const rows = rec ? [] : null;
      for (const [m, s] of lp.links) { const f = L[m].F(Q[m]); num += s * f; den += L[m].dF(Q[m]); if (rows) rows.push({ link: L[m].virtual ? 'fixed head' : (L[m].e.src ? L[m].e.src.label : L[m].e.id), Q: s * Q[m], h: s * f, d: L[m].dF(Q[m]) }); }
      const dq = den > 0 ? -num / den : 0; for (const [m, s] of lp.links) Q[m] += s * dq;
      maxdq = Math.max(maxdq, Math.abs(dq)); if (rec) rec.push({ loop: lp.id, rows, sumH: num, sumD: den, dQ: dq });
    }
    const sq = Q.reduce((s, q) => s + Math.abs(q), 0) || 1; if (rec) trace.push({ it, loops: rec, rel: maxdq / sq });
    if (!loops.length || maxdq / sq < opts.tol) break;
  }
  // heads from the tree
  const H = Array(N + 1).fill(NaN); H[Gi] = 0;
  const bfs = [...Array(N + 1).keys()].filter((v) => depth[v] >= 0).sort((a, b) => depth[a] - depth[b]);
  for (const v of bfs) { if (v === Gi) continue; const m = plink[v]; const l = L[m]; const f = l.F(Q[m]); if (l.j === v) H[v] = H[l.i] - f; else H[v] = H[l.j] + f; }
  const sq = Q.reduce((s, q) => s + Math.abs(q), 0) || 1;
  if (maxdq / sq > 1e-4) return { ok: false, error: `Hardy Cross did not converge (max correction ${maxdq.toExponential(2)} m³/s).` };
  return { ok: true, Q: Q.slice(0, links.length), H: H.slice(0, N), iterations: it, trace, loops: loops.length, method: 'hardy' };
}

// ---------------- results ----------------
function finish(net, C, res, fluid, opts, statusLog) {
  const { nodes, links } = C; const rho = fluid.rho, g = G; const Patm = net.Patm || P_ATM;
  const nodeRes = {}; const linkRes = {}; const warnings = [...(fluid.warn || [])];
  const net_in = Array(nodes.length).fill(0); links.forEach((e, k) => { net_in[e.j] += res.Q[k]; net_in[e.i] -= res.Q[k]; });
  nodes.forEach((n, i) => {
    if (n.hidden) return; const H = res.H[i]; const p = rho * g * (H - n.z);
    nodeRes[n.id] = { H, p, pAbs: p + Patm, outflow: n.fixed ? -net_in[i] : n.q, demand: n.q };
    if (!n.fixed && p + Patm < (fluid.Pv || 0)) warnings.push(`${n.label}: pressure below vapour pressure (cavitation / column separation)`);
    else if (!n.fixed && p < -0.5 * Patm) warnings.push(`${n.label}: strong vacuum (${(p / 1000).toFixed(1)} kPa gauge)`);
  });
  links.forEach((e, k) => {
    const Q = res.Q[k];
    if (e.type === 'jet') { const d = e.detail(Q); const nr = nodeRes[e.nozzleOf]; if (nr) { nr.jet = { Q, V: d.V }; nr.outflow = (nr.demand || 0) + Q; } return; }
    const r = { Q, hL: res.H[e.i] - res.H[e.j], closed: !!e.closed, status: e.closed ? 'closed' : 'open', type: e.type };
    if (e.type === 'pipe') { const d = e.detail(Q); Object.assign(r, { V: d.V, Re: d.Re, f: d.f, regime: d.regime, hMajor: d.hMajor, hMinor: d.hMinor, K: d.K, gradient: (res.H[e.i] - res.H[e.j]) / e.src.pipe.L }); if (Math.abs(d.V) > (fluid.gas ? 30 : 3)) warnings.push(`${e.src.label}: high velocity ${Math.abs(d.V).toFixed(2)} m/s`); }
    if (e.type === 'valve') { const d = e.detail(Q); Object.assign(r, { V: d.V, K: e.K }); }
    if (e.type === 'pump') {
      const head = res.H[e.j] - res.H[e.i]; const P = rho * g * Math.max(Q, 0) * head; const pump = e.src.pump; const s = pump.speed ?? 1;
      const eta = interp(pump.eff, Q / s) / 100; const npshr = (pump.npshr || []).length ? interp(pump.npshr, Q / s) * s * s : NaN;
      // NPSH available at the suction node. Node heads follow the EPANET convention (velocity heads are not carried
      // separately), so the suction head is treated as the total head: NPSHa = (H_s − z_s) + (p_atm − p_v)/(ρg).
      // This equals the textbook energy balance from the supply surface and never credits the velocity head twice.
      const sn = nodes[e.i]; const pS = rho * g * (res.H[e.i] - sn.z) + Patm;
      let Vs = 0; links.forEach((x, m) => { if (x.type === 'pipe' && (x.j === e.i || x.i === e.i) && m !== k) { const v = Math.abs(res.Q[m]) / area(x.src.pipe.D); if (v > Vs) Vs = v; } });
      if (pump.Dsuction) Vs = Math.abs(Q) / area(pump.Dsuction);
      const npsha = (pS - (fluid.Pv || 0)) / (rho * g);
      Object.assign(r, { head, powerHyd: P, eta: Number.isFinite(eta) && eta > 0 ? eta : NaN, powerShaft: Number.isFinite(eta) && eta > 0 ? P / eta : NaN, npsha, npshr, npshMargin: npsha - npshr, shutoff: e.pc.shutoffS, curveKind: e.pc.kind, coef: e.pc.coef, suctionV: Vs });
      if (!e.closed && Number.isFinite(npshr) && npsha < npshr + 0.5) warnings.push(`${e.src.label}: NPSH margin only ${(npsha - npshr).toFixed(2)} m (NPSHa ${npsha.toFixed(2)} m, NPSHr ${npshr.toFixed(2)} m) – cavitation risk`);
      if (!e.closed && Q > e.pc.qmaxS * 1.0) warnings.push(`${e.src.label}: operating beyond the end of its curve`);
      if (e.closed && e.src.pump.on !== false) warnings.push(`${e.src.label}: cannot overcome the system head – no flow (shut-off ${e.pc.shutoffS.toFixed(1)} m)`);
    }
    linkRes[e.id] = r;
  });
  if (fluid.gas) { const ps = Object.values(nodeRes).map((x) => x.pAbs); const pmin = Math.min(...ps), pmax = Math.max(...ps); if ((pmax - pmin) / pmax > 0.1) warnings.push(`Pressure varies by ${(((pmax - pmin) / pmax) * 100).toFixed(0)} % – the incompressible-flow assumption is no longer accurate for this gas network`); }
  return { ok: true, method: res.method, iterations: res.iterations, trace: res.trace, loops: res.loops, nodes: nodeRes, links: linkRes, warnings, statusLog, fluid, opts: { headloss: opts.headloss, friction: opts.friction } };
}
