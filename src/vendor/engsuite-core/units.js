// Unit engine: dimension vectors [m, kg, s, K, mol, A], scale factor to SI, offset (for absolute temperatures).
// EES-style unit strings: "kJ/kg-K" = kJ/(kg*K), "W/m^2-K", "m^3/kg", "kPa", "C" (absolute °C).
export const DIM_NAMES = ['m', 'kg', 's', 'K', 'mol', 'A'];
const D = (m = 0, kg = 0, s = 0, K = 0, mol = 0, A = 0) => [m, kg, s, K, mol, A];
export const DIMLESS = D();

// base units: [factor, dims, offset]
const BASE = {
  '1': [1, D()], '-': [1, D()], '%': [0.01, D()], rad: [1, D()], deg: [Math.PI / 180, D()],
  m: [1, D(1)], cm: [0.01, D(1)], mm: [1e-3, D(1)], um: [1e-6, D(1)], km: [1000, D(1)], in: [0.0254, D(1)], ft: [0.3048, D(1)], mi: [1609.344, D(1)],
  L: [1e-3, D(3)], liter: [1e-3, D(3)], gal: [3.785411784e-3, D(3)],
  kg: [1, D(0, 1)], g: [1e-3, D(0, 1)], t: [1000, D(0, 1)], lbm: [0.45359237, D(0, 1)], lb: [0.45359237, D(0, 1)], slug: [14.593903, D(0, 1)],
  s: [1, D(0, 0, 1)], sec: [1, D(0, 0, 1)], min: [60, D(0, 0, 1)], h: [3600, D(0, 0, 1)], hr: [3600, D(0, 0, 1)], day: [86400, D(0, 0, 1)], yr: [31557600, D(0, 0, 1)],
  Hz: [1, D(0, 0, -1)], rpm: [2 * Math.PI / 60, D(0, 0, -1)], 'rev/min': [2 * Math.PI / 60, D(0, 0, -1)],
  K: [1, D(0, 0, 0, 1)], R: [5 / 9, D(0, 0, 0, 1)], C: [1, D(0, 0, 0, 1), 273.15], F: [5 / 9, D(0, 0, 0, 1), 459.67 * 5 / 9],
  degC: [1, D(0, 0, 0, 1), 273.15], degF: [5 / 9, D(0, 0, 0, 1), 459.67 * 5 / 9], deltaC: [1, D(0, 0, 0, 1)], deltaF: [5 / 9, D(0, 0, 0, 1)],
  mol: [1, D(0, 0, 0, 0, 1)], kmol: [1000, D(0, 0, 0, 0, 1)], lbmol: [453.59237, D(0, 0, 0, 0, 1)],
  A: [1, D(0, 0, 0, 0, 0, 1)],
  N: [1, D(1, 1, -2)], kN: [1e3, D(1, 1, -2)], MN: [1e6, D(1, 1, -2)], lbf: [4.4482216152605, D(1, 1, -2)], kip: [4448.2216152605, D(1, 1, -2)],
  Pa: [1, D(-1, 1, -2)], kPa: [1e3, D(-1, 1, -2)], MPa: [1e6, D(-1, 1, -2)], GPa: [1e9, D(-1, 1, -2)], bar: [1e5, D(-1, 1, -2)], mbar: [100, D(-1, 1, -2)],
  atm: [101325, D(-1, 1, -2)], psi: [6894.757293168, D(-1, 1, -2)], psia: [6894.757293168, D(-1, 1, -2)], ksi: [6894757.293168, D(-1, 1, -2)], kpsi: [6894757.293168, D(-1, 1, -2)], Mpsi: [6894757293.168, D(-1, 1, -2)],
  J: [1, D(2, 1, -2)], kJ: [1e3, D(2, 1, -2)], MJ: [1e6, D(2, 1, -2)], GJ: [1e9, D(2, 1, -2)], Wh: [3600, D(2, 1, -2)], kWh: [3.6e6, D(2, 1, -2)], Btu: [1055.05585262, D(2, 1, -2)], cal: [4.1868, D(2, 1, -2)], kcal: [4186.8, D(2, 1, -2)],
  W: [1, D(2, 1, -3)], kW: [1e3, D(2, 1, -3)], MW: [1e6, D(2, 1, -3)], hp: [745.69987158227, D(2, 1, -3)], ton: [3516.8528, D(2, 1, -3)],
  V: [1, D(2, 1, -3, 0, 0, -1)], ohm: [1, D(2, 1, -3, 0, 0, -2)],
};

export function parseUnit(str) {
  // returns {f, d, off} ; throws on unknown
  let s = String(str ?? '').trim();
  if (!s || s === '-' || s === '1') return { f: 1, d: DIMLESS.slice(), off: 0 };
  if (BASE[s]) { const b = BASE[s]; return { f: b[0], d: b[1].slice(), off: b[2] || 0 }; }
  s = s.replace(/\s+/g, '').replace(/·/g, '*').replace(/°/g, '').replace(/µ/g, 'u');
  // EES style: everything after first '/' is the denominator, '-' and '*' multiply
  const tokens = [];
  let i = 0, sign = 1, depth = 0;
  // simple recursive descent with parentheses
  function parseProduct(str, sgn, out) {
    let parts = [];
    let cur = '', lvl = 0;
    let curSign = sgn;
    for (let k = 0; k < str.length; k++) {
      const ch = str[k];
      if (ch === '(') lvl++;
      if (ch === ')') lvl--;
      if (lvl === 0 && (ch === '*' || (ch === '-' && str[k - 1] !== '^') || ch === '/')) {
        if (cur) parts.push([cur, curSign]);
        cur = '';
        if (ch === '/') curSign = -sgn; // EES: denominator from here on
        continue;
      }
      cur += ch;
    }
    if (cur) parts.push([cur, curSign]);
    for (const [p, sg] of parts) {
      let m = p.match(/^\((.*)\)(?:\^(-?[\d.]+))?$/);
      if (m) { const pw = m[2] ? +m[2] : 1; parseProduct(m[1], sg * pw, out); continue; }
      m = p.match(/^([A-Za-z%][A-Za-z0-9_%]*?)(?:\^?(-?\d+(?:\.\d+)?))?$/);
      if (!m) throw new Error('Unknown unit: ' + p);
      let name = m[1], pw = m[2] !== undefined ? +m[2] : 1;
      if (!BASE[name]) {
        // try "m2" written without ^ (e.g. m2, m3)
        throw new Error('Unknown unit: ' + name);
      }
      out.push([name, pw * sg]);
    }
  }
  const out = [];
  parseProduct(s, 1, out);
  let f = 1; const d = DIMLESS.slice();
  for (const [name, pw] of out) { const b = BASE[name]; f *= Math.pow(b[0], pw); for (let k = 0; k < 6; k++) d[k] += b[1][k] * pw; }
  return { f, d, off: 0 };
}

export function toSI(value, unit) { const u = parseUnit(unit); return value * u.f + (u.off || 0); }
export function fromSI(value, unit) { const u = parseUnit(unit); return (value - (u.off || 0)) / u.f; }
export function dimEq(a, b) { if (!a || !b) return true; for (let k = 0; k < 6; k++) if (Math.abs(a[k] - b[k]) > 1e-9) return false; return true; }
export function dimMul(a, b, s = 1) { if (!a || !b) return null; return a.map((x, k) => x + s * b[k]); }
export function dimPow(a, p) { if (!a) return null; return a.map(x => x * p); }
export function dimIsZero(a) { return a && a.every(x => Math.abs(x) < 1e-9); }
export function dimToString(d) {
  if (!d) return '?';
  const num = [], den = [];
  d.forEach((x, k) => { if (Math.abs(x) < 1e-9) return; const n = DIM_NAMES[k]; const a = Math.abs(x); (x > 0 ? num : den).push(a === 1 ? n : n + '^' + +a.toFixed(3)); });
  if (!num.length && !den.length) return '-';
  return (num.join('-') || '1') + (den.length ? '/' + den.join('-') : '');
}
export function sameDim(unitA, unitB) { try { return dimEq(parseUnit(unitA).d, parseUnit(unitB).d); } catch { return false; } }

// default display units by dimension, per unit system
export const UNIT_SYSTEMS = {
  SI: { pressure: 'kPa', temperature: 'C', energy: 'kJ', power: 'kW', specEnergy: 'kJ/kg', specEntropy: 'kJ/kg-K', specVolume: 'm^3/kg', density: 'kg/m^3', massFlow: 'kg/s', length: 'm', mass: 'kg', force: 'N', area: 'm^2', volume: 'm^3', time: 's', velocity: 'm/s', conductivity: 'W/m-K', htc: 'W/m^2-K', stress: 'MPa', heatFlux: 'W/m^2', viscosity: 'Pa-s', torque: 'N-m' },
  US: { pressure: 'psia', temperature: 'F', energy: 'Btu', power: 'hp', specEnergy: 'Btu/lbm', specEntropy: 'Btu/lbm-R', specVolume: 'ft^3/lbm', density: 'lbm/ft^3', massFlow: 'lbm/s', length: 'ft', mass: 'lbm', force: 'lbf', area: 'ft^2', volume: 'ft^3', time: 's', velocity: 'ft/s', conductivity: 'Btu/h-ft-R', htc: 'Btu/h-ft^2-R', stress: 'kpsi', heatFlux: 'Btu/h-ft^2', viscosity: 'lbm/ft-s', torque: 'lbf-ft' },
};
const KIND_DIMS = {
  pressure: D(-1, 1, -2), temperature: D(0, 0, 0, 1), energy: D(2, 1, -2), power: D(2, 1, -3), specEnergy: D(2, 0, -2), specEntropy: D(2, 0, -2, -1),
  specVolume: D(3, -1), density: D(-3, 1), massFlow: D(0, 1, -1), length: D(1), mass: D(0, 1), force: D(1, 1, -2), area: D(2), volume: D(3), time: D(0, 0, 1),
  velocity: D(1, 0, -1), conductivity: D(1, 1, -3, -1), htc: D(0, 1, -3, -1), heatFlux: D(0, 1, -3), viscosity: D(-1, 1, -1),
};
export function defaultUnitFor(d, system = 'SI') {
  if (!d) return '';
  if (dimIsZero(d)) return '-';
  const us = UNIT_SYSTEMS[system] || UNIT_SYSTEMS.SI;
  for (const [kind, kd] of Object.entries(KIND_DIMS)) if (dimEq(kd, d)) return us[kind];
  return dimToString(d);
}
export function unitLabel(u) {
  if (!u || u === '-') return '';
  return u.replace(/^C$/, '°C').replace(/^F$/, '°F').replace(/\^2/g, '²').replace(/\^3/g, '³');
}
export function knownUnits() { return Object.keys(BASE); }
