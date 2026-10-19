// Shared fluid-property layer (SI: K, Pa, kg/m³, Pa·s, J/kg-K).
// API is call-compatible with the Mamba Engineering / ThermoStudio property engine:
//   prop(out, fluid, { T, P })  with out ∈ 'rho' | 'mu' | 'nu' | 'Pv' | 'cp' | 'k' | 'a'
// Back-ends, in order: an external engine registered with useEngine() (e.g. ThermoStudio's props.js),
// CoolProp (WASM) registered with setCoolProp(), and built-in correlations (always available, offline, no WASM).
// Fluid ids follow CoolProp names where one exists (field `cp`), so the same ids work in both apps.

const R_U = 8.314462618;
let CP = null, ENGINE = null; let backend = 'auto'; // 'auto' | 'builtin' | 'coolprop'
export function setCoolProp(cp) { CP = cp; }
export function useEngine(engine) { ENGINE = engine; }
export function setBackend(b) { backend = b; }
export function backendInfo() { return { backend, coolprop: !!CP, engine: !!ENGINE }; }

// ---------- correlations ----------
// Water: density from Kell (1975) 0–150 °C; viscosity Vogel form; saturation pressure IAPWS-IF97 region 4.
function waterRho(T) { const t = T - 273.15; return (999.83952 + 16.945176 * t - 7.9870401e-3 * t * t - 46.170461e-6 * t ** 3 + 105.56302e-9 * t ** 4 - 280.54253e-12 * t ** 5) / (1 + 16.879850e-3 * t); }
function waterMu(T) { return 2.414e-5 * Math.pow(10, 247.8 / (T - 140)); }
const IF97 = [0.11670521452767e4, -0.72421316598579e6, -0.17073846940092e2, 0.12020824702470e5, -0.32325550322333e7, 0.14915108613530e2, -0.48232657361591e4, 0.40511340542057e6, -0.23855557567849, 0.65017534844798e3];
export function waterPsat(T) {
  const n = IF97; const th = T + n[8] / (T - n[9]); const A = th * th + n[0] * th + n[1], B = n[2] * th * th + n[3] * th + n[4], C = n[5] * th * th + n[6] * th + n[7];
  return 1e6 * Math.pow(2 * C / (-B + Math.sqrt(B * B - 4 * A * C)), 4);
}
// Sutherland viscosity for gases
const suth = (mu0, T0, S) => (T) => mu0 * Math.pow(T / T0, 1.5) * (T0 + S) / (T + S);
// Walther / ASTM D341 kinematic viscosity from two points (cSt at T1, T2) → m²/s
function walther(nu1, T1, nu2, T2) {
  const z = (nu) => Math.log10(Math.log10(nu + 0.7)); const B = (z(nu1) - z(nu2)) / (Math.log10(T2) - Math.log10(T1)); const A = z(nu1) + B * Math.log10(T1);
  return (T) => (Math.pow(10, Math.pow(10, A - B * Math.log10(T))) - 0.7) * 1e-6;
}
// Andrade fit ln(mu) = a + b/T from two points
function andrade(mu1, T1, mu2, T2) { const b = Math.log(mu1 / mu2) / (1 / T1 - 1 / T2); const a = Math.log(mu1) - b / T1; return (T) => Math.exp(a + b / T); }
const linRho = (rho0, T0, beta) => (T) => rho0 / (1 + beta * (T - T0));
// Antoine (Pa, K): log10(P[mmHg]) = A - B/(C + t[°C])
const antoine = (A, B, C) => (T) => Math.pow(10, A - B / (C + T - 273.15)) * 133.322;

export const FLUIDS = [
  { id: 'Water', cp: 'Water', label: 'Water', phase: 'liquid', range: [274, 423], rho: waterRho, mu: waterMu, Pv: waterPsat, cpv: 4182, k: 0.6 },
  { id: 'SeaWater', label: 'Sea water (3.5 % salinity)', phase: 'liquid', range: [272, 363], rho: (T) => waterRho(T) * 1.0265, mu: (T) => waterMu(T) * 1.09, Pv: (T) => waterPsat(T) * 0.981, cpv: 3990 },
  { id: 'MEG30', label: 'Ethylene glycol 30 % (water mix)', phase: 'liquid', range: [258, 373], rho: linRho(1040, 293.15, 4.5e-4), mu: andrade(2.25e-3, 293.15, 0.80e-3, 353.15), Pv: (T) => waterPsat(T) * 0.9, cpv: 3700 },
  { id: 'MEG50', label: 'Ethylene glycol 50 % (water mix)', phase: 'liquid', range: [240, 373], rho: linRho(1069, 293.15, 5.2e-4), mu: andrade(3.8e-3, 293.15, 1.1e-3, 353.15), Pv: (T) => waterPsat(T) * 0.8, cpv: 3300 },
  { id: 'MPG30', label: 'Propylene glycol 30 % (water mix)', phase: 'liquid', range: [260, 373], rho: linRho(1027, 293.15, 4.8e-4), mu: andrade(2.9e-3, 293.15, 0.85e-3, 353.15), Pv: (T) => waterPsat(T) * 0.9, cpv: 3800 },
  { id: 'ISOVG32', label: 'Hydraulic oil ISO VG 32', phase: 'liquid', range: [253, 373], rho: linRho(870, 288.15, 6.5e-4), nu: walther(32, 313.15, 5.4, 373.15), Pv: () => 1, cpv: 1900 },
  { id: 'ISOVG46', label: 'Hydraulic oil ISO VG 46', phase: 'liquid', range: [253, 373], rho: linRho(875, 288.15, 6.5e-4), nu: walther(46, 313.15, 6.8, 373.15), Pv: () => 1, cpv: 1900 },
  { id: 'ISOVG68', label: 'Hydraulic / gear oil ISO VG 68', phase: 'liquid', range: [258, 373], rho: linRho(880, 288.15, 6.5e-4), nu: walther(68, 313.15, 8.6, 373.15), Pv: () => 1, cpv: 1900 },
  { id: 'Diesel', label: 'Diesel fuel (EN 590)', phase: 'liquid', range: [258, 353], rho: linRho(835, 288.15, 8.3e-4), nu: walther(3.0, 313.15, 1.2, 373.15), Pv: () => 400, cpv: 2000 },
  { id: 'Gasoline', label: 'Gasoline / petrol', phase: 'liquid', range: [243, 323], rho: linRho(745, 288.15, 1.2e-3), mu: andrade(0.62e-3, 288.15, 0.40e-3, 323.15), Pv: antoine(6.9, 1100, 230), cpv: 2220 },
  { id: 'Kerosene', label: 'Kerosene / Jet A-1', phase: 'liquid', range: [243, 373], rho: linRho(800, 288.15, 9.9e-4), nu: walther(2.4, 293.15, 0.9, 373.15), Pv: () => 700, cpv: 2010 },
  { id: 'Ethanol', cp: 'Ethanol', label: 'Ethanol', phase: 'liquid', range: [250, 345], rho: linRho(789, 293.15, 1.1e-3), mu: andrade(1.20e-3, 293.15, 0.59e-3, 333.15), Pv: antoine(8.20417, 1642.89, 230.3), cpv: 2440 },
  { id: 'Methanol', cp: 'Methanol', label: 'Methanol', phase: 'liquid', range: [250, 335], rho: linRho(792, 293.15, 1.2e-3), mu: andrade(0.59e-3, 293.15, 0.35e-3, 333.15), Pv: antoine(8.08097, 1582.271, 239.726), cpv: 2530 },
  { id: 'Glycerol', label: 'Glycerol (glycerine)', phase: 'liquid', range: [283, 373], rho: linRho(1261, 293.15, 5.0e-4), mu: andrade(1.41, 293.15, 0.0142, 373.15), Pv: () => 0.1, cpv: 2430 },
  { id: 'Air', cp: 'Air', label: 'Air', phase: 'gas', M: 0.0289647, range: [150, 1000], mu: suth(1.716e-5, 273.15, 110.4), cpv: 1005, k: 0.026 },
  { id: 'Nitrogen', cp: 'Nitrogen', label: 'Nitrogen', phase: 'gas', M: 0.0280134, range: [100, 1000], mu: suth(1.663e-5, 273.15, 107), cpv: 1040 },
  { id: 'Oxygen', cp: 'Oxygen', label: 'Oxygen', phase: 'gas', M: 0.0319988, range: [100, 1000], mu: suth(1.919e-5, 273.15, 139), cpv: 918 },
  { id: 'CarbonDioxide', cp: 'CO2', label: 'Carbon dioxide', phase: 'gas', M: 0.0440095, range: [220, 1000], mu: suth(1.370e-5, 273.15, 222), cpv: 844 },
  { id: 'Methane', cp: 'Methane', label: 'Methane / natural gas (approx.)', phase: 'gas', M: 0.0160425, range: [150, 800], mu: suth(1.024e-5, 273.15, 164), cpv: 2220 },
  { id: 'Hydrogen', cp: 'Hydrogen', label: 'Hydrogen', phase: 'gas', M: 0.00201588, range: [100, 1000], mu: suth(8.411e-6, 273.15, 97), cpv: 14300 },
  { id: 'Helium', cp: 'Helium', label: 'Helium', phase: 'gas', M: 0.0040026, range: [50, 1000], mu: suth(1.87e-5, 273.15, 79.4), cpv: 5193 },
  { id: 'Steam', cp: 'Water', label: 'Steam (superheated, ideal-gas approx.)', phase: 'gas', M: 0.01801528, range: [373, 900], mu: suth(1.12e-5, 350, 1064), cpv: 2010 },
];
const BY = new Map(FLUIDS.map((f) => [f.id.toLowerCase(), f])); BY.set('co2', BY.get('carbondioxide')); BY.set('h2o', BY.get('water'));
export function fluidInfo(id) { if (id && typeof id === 'object') return id.id ? id : null; const f = BY.get(String(id).toLowerCase()); if (!f) throw new Error(`Unknown fluid "${id}"`); return f; }

function builtin(out, f, T, P) {
  if (f.phase === 'gas') {
    const rho = P * f.M / (R_U * T);
    switch (out) { case 'rho': return rho; case 'mu': return f.mu(T); case 'nu': return f.mu(T) / rho; case 'Pv': return f.id === 'Steam' ? waterPsat(Math.min(T, 647)) : NaN; case 'cp': return f.cpv; case 'k': return f.k ?? NaN; case 'a': { const R = R_U / f.M; const k = f.cpv / (f.cpv - R); return Math.sqrt(k * R * T); } }
  } else {
    const rho = f.rho(T); const mu = f.mu ? f.mu(T) : f.nu(T) * rho;
    switch (out) { case 'rho': return rho; case 'mu': return mu; case 'nu': return mu / rho; case 'Pv': return f.Pv ? f.Pv(T) : NaN; case 'cp': return f.cpv; case 'k': return f.k ?? NaN; case 'a': return 1450; }
  }
  throw new Error('Unknown property ' + out);
}
const CPOUT = { rho: 'D', mu: 'V', cp: 'C', k: 'L', a: 'A' };
function coolprop(out, f, T, P) {
  if (out === 'nu') return coolprop('mu', f, T, P) / coolprop('rho', f, T, P);
  if (out === 'Pv') { const r = CP.PropsSI('P', 'T', T, 'Q', 0, f.cp); return r; }
  const r = CP.PropsSI(CPOUT[out], 'T', T, 'P', P, f.cp); return r;
}

// Shared engine (engsuite / ThermoStudio core, props.js): prop(out, fluid, {T, P}) with out in rho mu nu Pv cp k a.
// Fluids the engine does not know (or states it cannot evaluate) fall through to direct CoolProp, then built-in.
const ENGINE_OUT = new Set(['rho', 'mu', 'nu', 'Pv', 'cp', 'k', 'a']);
function engineProp(out, f, T, P) {
  if (!ENGINE_OUT.has(out)) return NaN;
  try { return ENGINE.prop(out, f.cp, out === 'Pv' ? { T } : { T, P }); } catch (_) { return NaN; }
}
export function engineKnows(fluid) { const f = fluidInfo(fluid); if (!ENGINE || !f.cp) return false; return Number.isFinite(engineProp('rho', f, 293.15, 101325)); }

/** prop('rho', 'Water', {T: 293.15, P: 101325}) */
export function prop(out, fluid, args = {}) {
  const f = fluidInfo(fluid); const T = args.T ?? 293.15, P = args.P ?? 101325;
  if (f.custom) { const c = f.custom; if (out === 'rho') return c.rho; if (out === 'mu') return c.mu ?? c.nu * c.rho; if (out === 'nu') return c.nu ?? c.mu / c.rho; if (out === 'Pv') return c.Pv ?? 2339; return NaN; }
  if (backend !== 'builtin' && f.cp) {
    if (ENGINE && ENGINE.prop) { const v = engineProp(out, f, T, P); if (Number.isFinite(v) && v > 0) return v; }
    if (CP && !(f.phase === 'gas' && f.id === 'Steam' && out === 'Pv')) { try { const v = coolprop(out, f, T, P); if (Number.isFinite(v) && v > 0) return v; } catch (_) { /* fall through */ } }
    if (backend === 'coolprop' && !CP && !ENGINE) throw new Error('CoolProp backend not loaded');
  }
  return builtin(out, f, T, P);
}
/** All properties needed by the hydraulics solver. */
export function fluidState(fluid, T = 293.15, P = 101325) {
  const f = fluidInfo(fluid); const rho = prop('rho', f, { T, P }); const mu = prop('mu', f, { T, P });
  let Pv = NaN; try { Pv = prop('Pv', f, { T, P }); } catch (_) {}
  const warn = []; if (f.range && (T < f.range[0] || T > f.range[1])) warn.push(`${f.label}: T = ${(T - 273.15).toFixed(1)} °C outside correlation range ${(f.range[0] - 273.15).toFixed(0)}…${(f.range[1] - 273.15).toFixed(0)} °C`);
  if (f.phase === 'liquid' && Number.isFinite(Pv) && Pv > P) warn.push(`${f.label} boils at ${(T - 273.15).toFixed(1)} °C and ${(P / 1000).toFixed(1)} kPa (vapour pressure ${(Pv / 1000).toFixed(1)} kPa)`);
  return { id: f.id, label: f.label, phase: f.phase, T, P, rho, mu, nu: mu / rho, Pv, gas: f.phase === 'gas', warn, source: backend === 'builtin' || !f.cp ? 'built-in' : ENGINE && engineKnows(f) ? 'engsuite core (CoolProp)' : CP ? 'CoolProp' : 'built-in' };
}
/** A user-defined constant-property fluid. */
export function customFluid(id, label, { rho, mu, nu, Pv }) { const f = { id, label, phase: 'liquid', custom: { rho, mu, nu, Pv } }; BY.set(id.toLowerCase(), f); return f; }
