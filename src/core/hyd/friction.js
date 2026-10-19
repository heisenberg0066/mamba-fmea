// Friction-factor and head-loss correlations (SI).
export const G = 9.80665;

/** Colebrook–White, solved by Newton iteration on x = 1/√f. Returns {f, iterations, history}. */
export function colebrook(Re, rr, { tol = 1e-12, maxIt = 50, history = false } = {}) {
  if (!(Re > 0)) return { f: NaN, iterations: 0 };
  let x = 1 / Math.sqrt(swameeJain(Re, rr)); const hist = [];
  for (let i = 1; i <= maxIt; i++) {
    const a = rr / 3.7 + 2.51 * x / Re; const F = x + 2 * Math.log10(a); const dF = 1 + 2 / Math.LN10 * (2.51 / Re) / a;
    const nx = x - F / dF; if (history) hist.push({ i, f: 1 / (nx * nx) });
    if (Math.abs(nx - x) < tol * Math.abs(x)) { x = nx; return { f: 1 / (x * x), iterations: i, history: hist }; }
    x = nx;
  }
  return { f: 1 / (x * x), iterations: maxIt, history: hist };
}
/** Swamee–Jain explicit approximation (5e3 < Re < 1e8, 1e-6 < ε/D < 1e-2). */
export function swameeJain(Re, rr) { return 0.25 / Math.pow(Math.log10(rr / 3.7 + 5.74 / Math.pow(Re, 0.9)), 2); }
export function haaland(Re, rr) { return 1 / Math.pow(-1.8 * Math.log10(Math.pow(rr / 3.7, 1.11) + 6.9 / Re), 2); }

/**
 * Darcy friction factor for any Re: laminar 64/Re below 2000, turbulent correlation above 4000,
 * and a smooth cubic blend in the transition zone (same idea as EPANET's Dunlop interpolation).
 */
export function frictionFactor(Re, rr, method = 'colebrook') {
  if (!(Re > 0)) return { f: 0, regime: 'none' };
  const turb = (R) => (method === 'swamee' ? swameeJain(R, rr) : method === 'haaland' ? haaland(R, rr) : colebrook(R, rr).f);
  if (Re < 2000) return { f: 64 / Re, regime: 'laminar' };
  if (Re > 4000) return { f: turb(Re), regime: 'turbulent' };
  // Dunlop (1991) cubic interpolation between f(2000)=0.032 (laminar) and the turbulent curve at 4000
  const Y2 = rr / 3.7 + 5.74 / Math.pow(4000, 0.9); const Y3 = -0.86859 * Math.log(rr / 3.7 + 5.74 / Math.pow(4000, 0.9));
  const FA = Math.pow(Y3, -2); const FB = FA * (2 - 0.00514215 / (Y2 * Y3));
  const R = Re / 2000; const X1 = 7 * FA - FB, X2 = 0.128 - 17 * FA + 2.5 * FB, X3 = -0.128 + 13 * FA - 2 * FB, X4 = R * (0.032 - 3 * FA + 0.5 * FB);
  return { f: X1 + R * (X2 + R * (X3 + X4)), regime: 'transitional' };
}

/** Hazen–Williams head loss (SI, EPANET constants): h = 10.667 L Q^1.852 / (C^1.852 D^4.871). */
export function hazenWilliams(L, D, C, Q) { const a = Math.abs(Q); return Math.sign(Q) * 10.667 * L * Math.pow(a, 1.852) / (Math.pow(C, 1.852) * Math.pow(D, 4.871)); }

export const area = (D) => Math.PI * D * D / 4;

/**
 * Head loss across a pipe for flow Q (m³/s, signed). Includes fittings / minor losses (ΣK).
 * Returns {h, V, Re, f, regime, hMajor, hMinor}.
 */
export function pipeLoss(p, Q, fluid, opts = {}) {
  const D = p.D, L = p.L, A = area(D); const V = Q / A; const aV = Math.abs(V);
  const K = minorK(p); const hMinor = K * V * aV / (2 * G);
  const method = opts.headloss || 'DW';
  if (method === 'HW' && !fluid.gas) { const h = hazenWilliams(L, D, p.C || 130, Q); return { h: h + hMinor, V, Re: fluid.rho * aV * D / fluid.mu, f: NaN, regime: 'Hazen-Williams', hMajor: h, hMinor, K }; }
  const Re = fluid.rho * aV * D / fluid.mu;
  let f, regime;
  if (p.fixedF) { f = p.fixedF; regime = 'fixed f'; }
  else ({ f, regime } = frictionFactor(Re, (p.eps || 0) / D, opts.friction || 'colebrook'));
  const hMajor = f * L / D * V * aV / (2 * G);
  return { h: hMajor + hMinor, V, Re, f, regime, hMajor, hMinor, K };
}
export function minorK(p) { return (p.fittings || []).reduce((s, x) => s + (x.K || 0) * (x.qty ?? 1), 0) + (p.Kextra || 0); }
