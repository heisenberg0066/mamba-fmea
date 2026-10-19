// Property engine: CoolProp (MIT, WASM build) + built-in ideal-gas fluids (cold-air standard).
// All inputs/outputs in SI base units (Pa, K, J/kg, J/kg-K, m^3/kg, kg/m^3).
let CP = null;
const cache = new Map();
export const settings = { waterBackend: 'HEOS', refState: 'IIR' }; // refState: IIR (CoolProp default) | ASHRAE (h=s=0 sat. liquid at -40 °C)

export async function initProps(loader) { CP = await loader(); return CP; }
export function setCoolProp(cp) { CP = cp; }
export function propsReady() { return !!CP; }

export const FLUIDS = [
  { id: 'Water', cp: 'Water', label: 'Water / steam', aliases: ['Steam', 'H2O'] },
  { id: 'R134a', cp: 'R134a', label: 'R-134a', refrigerant: true },
  { id: 'R410A', cp: 'R410A', label: 'R-410A (pseudo-pure)', refrigerant: true },
  { id: 'R1234yf', cp: 'R1234yf', label: 'R-1234yf', refrigerant: true },
  { id: 'R1234zeE', cp: 'R1234ze(E)', label: 'R-1234ze(E)', refrigerant: true },
  { id: 'R744', cp: 'CO2', label: 'R-744 (CO₂)', aliases: ['CO2', 'CarbonDioxide'], refrigerant: true },
  { id: 'R290', cp: 'n-Propane', label: 'R-290 (propane)', aliases: ['Propane'], refrigerant: true },
  { id: 'R600a', cp: 'IsoButane', label: 'R-600a (isobutane)', aliases: ['Isobutane'], refrigerant: true },
  { id: 'R717', cp: 'Ammonia', label: 'R-717 (ammonia)', aliases: ['Ammonia', 'NH3'], refrigerant: true },
  { id: 'R32', cp: 'R32', label: 'R-32', refrigerant: true },
  { id: 'R22', cp: 'R22', label: 'R-22 (legacy)', refrigerant: true },
  { id: 'R404A', cp: 'R404A', label: 'R-404A (pseudo-pure)', refrigerant: true },
  { id: 'R407C', cp: 'R407C', label: 'R-407C (pseudo-pure)', refrigerant: true },
  { id: 'Air', cp: 'Air', label: 'Air (real gas, CoolProp)' },
  { id: 'Nitrogen', cp: 'Nitrogen', label: 'Nitrogen', aliases: ['N2'] },
  { id: 'Air_cold', ideal: { cp: 1005, cv: 718, R: 287 }, label: 'Air, cold-air standard (cp=1.005, k=1.4)', aliases: ['AirCold', 'Air_ideal_const'] },
];
const byName = new Map();
for (const f of FLUIDS) { byName.set(f.id.toLowerCase(), f); (f.aliases || []).forEach(a => byName.set(a.toLowerCase(), f)); }
export function fluidInfo(name) {
  if (name && typeof name === 'object' && name.id) return name;
  const f = byName.get(String(name).replace(/^['"]|['"]$/g, '').toLowerCase());
  if (!f) throw new PropError(`Unknown fluid "${name}". Known: ${FLUIDS.map(x => x.id).join(', ')}`);
  return f;
}
export class PropError extends Error {}

function cpName(f) {
  if (f.id === 'Water' && settings.waterBackend === 'IF97') return 'IF97::Water';
  return f.cp;
}
const KEYMAP = { T: 'T', P: 'P', h: 'H', s: 'S', x: 'Q', q: 'Q', u: 'U', rho: 'D', d: 'D', v: 'D' };
const OUTMAP = { T: 'T', P: 'P', h: 'H', s: 'S', x: 'Q', u: 'U', rho: 'D', v: 'D', cp: 'C', cv: 'O', mu: 'V', k: 'L', Pr: 'PRANDTL', a: 'A', M: 'M', phase: 'Phase', Tcrit: 'Tcrit', Pcrit: 'Pcrit', Ttriple: 'Ttriple', Tmin: 'Tmin', Tmax: 'Tmax' };

// reference-state offsets (refrigerants only)
function refOffset(f) {
  if (settings.refState !== 'ASHRAE' || !f.refrigerant || f.ideal) return { h: 0, s: 0 };
  const key = 'ref|' + f.id;
  if (cache.has(key)) return cache.get(key);
  let o = { h: 0, s: 0 };
  try {
    const n = cpName(f);
    o = { h: -raw('H', 'T', 233.15, 'Q', 0, n), s: -raw('S', 'T', 233.15, 'Q', 0, n) };
  } catch { /* fluid triple point above -40 °C (e.g. CO2): keep IIR */ }
  cache.set(key, o); return o;
}
function raw(out, k1, v1, k2, v2, name) {
  const r = CP.PropsSI(out, k1, v1, k2, v2, name);
  if (!Number.isFinite(r)) {
    let msg = ''; try { msg = CP.get_global_param_string('errstring'); } catch {}
    throw new PropError(msg || `CoolProp could not evaluate ${out}(${k1}=${v1}, ${k2}=${v2}, ${name})`);
  }
  return r;
}

// prop('h', 'Water', {P: 8e6, T: 753.15})
export function prop(out, fluid, args) {
  const f = typeof fluid === 'string' ? fluidInfo(fluid) : fluid;
  const keys = Object.keys(args);
  const key = out + '|' + f.id + '|' + settings.waterBackend + '|' + settings.refState + '|' + keys.map(k => k + '=' + args[k]).join(',');
  if (cache.has(key)) return cache.get(key);
  let r;
  if (out === 'nu') r = prop('mu', f, args) / prop('rho', f, args); // kinematic viscosity (shared API with Mamba FMEA hydraulics)
  else if (out === 'Pv') { if (f.ideal) throw new PropError(`${f.id}: no vapour pressure for an ideal gas`); r = prop('P', f, { T: args.T, x: 0 }); } // vapour pressure at T
  else if (f.ideal) r = idealProp(out, f, args);
  else r = coolProp(out, f, args, keys);
  if (cache.size > 200000) cache.clear();
  cache.set(key, r);
  return r;
}
function coolProp(out, f, args, keys) {
  if (!CP) throw new PropError('Property engine not loaded');
  const n = cpName(f);
  const off = refOffset(f);
  const trivial = { Tcrit: 1, Pcrit: 1, Ttriple: 1, Tmin: 1, Tmax: 1, M: 1 };
  if (trivial[out]) return raw(OUTMAP[out], '', 0, '', 0, n);
  if (keys.length !== 2) throw new PropError(`${out}(${f.id}): exactly two independent properties are needed, got ${keys.join(', ') || 'none'}`);
  const inp = keys.map(k => {
    const ck = KEYMAP[k]; if (!ck) throw new PropError('Unknown property argument ' + k);
    let v = args[k];
    if (k === 'v') v = 1 / v;
    if (k === 'h' || k === 'u') v -= off.h;
    if (k === 's') v -= off.s;
    if (k === 'x' && (v < -1e-9 || v > 1 + 1e-9)) throw new PropError(`Quality x=${v} outside 0..1`);
    return [ck, v];
  });
  if (out === 'x') {
    // quality: -1 from CoolProp outside two-phase → report 0/1 bounded with phase info via phaseName
    const q = raw('Q', inp[0][0], inp[0][1], inp[1][0], inp[1][1], n);
    return q;
  }
  const oc = OUTMAP[out]; if (!oc) throw new PropError('Unknown property ' + out);
  let r = raw(oc, inp[0][0], inp[0][1], inp[1][0], inp[1][1], n);
  if (out === 'v') r = 1 / r;
  if (out === 'h' || out === 'u') r += off.h;
  if (out === 's') r += off.s;
  return r;
}
export function satProp(out, fluid, by, value, x) {
  // saturation property: by = 'T' or 'P'; x = 0 (liquid) / 1 (vapor)
  const a = {}; a[by] = value; a.x = x; return prop(out, fluid, a);
}
export function Tsat(fluid, P) { return prop('T', fluid, { P, x: 0 }); }
export function Psat(fluid, T) { return prop('P', fluid, { T, x: 0 }); }
export function crit(fluid) { const f = fluidInfo(fluid); if (f.ideal) return null; return { T: prop('Tcrit', f, {}), P: prop('Pcrit', f, {}) }; }

// --- ideal gas with constant cp (cold-air standard) ---
const T0 = 298.15, P0 = 101325;
function idealTP(f, a) {
  const { cp, cv, R } = f.ideal;
  let T = a.T, P = a.P;
  const v = a.v ?? (a.rho !== undefined ? 1 / a.rho : undefined);
  if (T === undefined && a.h !== undefined) T = a.h / cp;
  if (T === undefined && a.u !== undefined) T = a.u / cv;
  if (T === undefined && P !== undefined && v !== undefined) T = P * v / R;
  if (T === undefined && a.s !== undefined && P !== undefined) T = T0 * Math.exp((a.s + R * Math.log(P / P0)) / cp);
  if (T === undefined && a.s !== undefined && v !== undefined) { // s = cv ln(T/T0) + R ln(v/v0)
    const v0 = R * T0 / P0; T = T0 * Math.exp((a.s - R * Math.log(v / v0)) / cv);
  }
  if (P === undefined && T !== undefined) {
    if (v !== undefined) P = R * T / v;
    else if (a.s !== undefined) P = P0 * Math.exp((cp * Math.log(T / T0) - a.s) / R);
  }
  return { T, P };
}
function idealProp(out, f, a) {
  const { cp, cv, R } = f.ideal;
  if (out === 'M') return 8.314462618 / R;
  if (a.x !== undefined) throw new PropError('Quality is not defined for an ideal gas');
  const { T, P } = idealTP(f, a);
  if (T === undefined || !(T > 0)) throw new PropError(`${f.id}: cannot determine T from ${Object.keys(a).join(',')}`);
  switch (out) {
    case 'T': return T;
    case 'h': return cp * T;
    case 'u': return cv * T;
    case 'cp': return cp;
    case 'cv': return cv;
    case 'a': return Math.sqrt(cp / cv * R * T);
    case 'phase': return 5;
  }
  if (P === undefined || !(P > 0)) throw new PropError(`${f.id}: ${out} needs pressure (or v) as well as temperature`);
  switch (out) {
    case 'P': return P;
    case 'v': return R * T / P;
    case 'rho': return P / (R * T);
    case 's': return cp * Math.log(T / T0) - R * Math.log(P / P0);
  }
  throw new PropError(`${out} is not available for ${f.id}`);
}

export function phaseName(fluid, args) {
  const f = typeof fluid === 'string' ? fluidInfo(fluid) : fluid;
  if (f.ideal) return 'ideal gas';
  try {
    const ph = Math.round(prop('phase', f, args));
    if (ph === 2 || ph === 1) { // CoolProp calls T > Tcrit "supercritical gas"; textbooks say superheated vapour when P < Pcrit
      const P = args.P ?? prop('P', f, args); if (P < prop('Pcrit', f, {})) return 'superheated vapor';
    }
    if (ph === 3) { const P = args.P ?? prop('P', f, args); const T = args.T ?? prop('T', f, args); if (P > prop('Pcrit', f, {}) && T < prop('Tcrit', f, {})) return 'compressed liquid'; }
    return ({ 0: 'compressed liquid', 1: 'supercritical', 2: 'supercritical gas', 3: 'supercritical liquid', 4: 'critical point', 5: 'superheated vapor', 6: 'saturated mixture' })[Math.round(ph)] || 'unknown';
  } catch { return 'unknown'; }
}

// full state from two inputs
export function state(fluid, args) {
  const f = typeof fluid === 'string' ? fluidInfo(fluid) : fluid;
  const st = { fluid: f.id };
  for (const p of ['T', 'P', 'h', 's', 'v', 'u']) { try { st[p] = args[p] ?? prop(p, f, args); } catch (e) { st[p] = NaN; } }
  if (!f.ideal) { try { const x = prop('x', f, args); st.x = (x >= 0 && x <= 1) ? x : NaN; } catch { st.x = NaN; } }
  st.phase = phaseName(f, args);
  return st;
}
export function clearCache() { cache.clear(); }
