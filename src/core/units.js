// Display units for the hydraulics module (internal values are SI).
export const UNITS = {
  SI: { len: ['m', 1], dia: ['mm', 1e-3], rough: ['mm', 1e-3], flow: ['m³/h', 1 / 3600], flowS: ['L/s', 1e-3], head: ['m', 1], press: ['kPa', 1e3], vel: ['m/s', 1], temp: ['°C', 1, 273.15], power: ['kW', 1e3], visc: ['mPa·s', 1e-3], dens: ['kg/m³', 1] },
  US: { len: ['ft', 0.3048], dia: ['in', 0.0254], rough: ['in', 0.0254], flow: ['gpm', 6.30901964e-5], flowS: ['ft³/s', 0.0283168466], head: ['ft', 0.3048], press: ['psi', 6894.757293168], vel: ['ft/s', 0.3048], temp: ['°F', 5 / 9, 459.67 * 5 / 9], power: ['hp', 745.69987158227], visc: ['cP', 1e-3], dens: ['lb/ft³', 16.01846337] },
};
/** to display: v_SI → user units */
export function toU(sys, q, v) { const u = UNITS[sys][q]; if (v == null || !Number.isFinite(v)) return v; return u[2] != null ? v / u[1] - u[2] / u[1] : v / u[1]; }
export function fromU(sys, q, v) { const u = UNITS[sys][q]; if (v == null || !Number.isFinite(v)) return v; return u[2] != null ? (v + u[2] / u[1]) * u[1] : v * u[1]; }
export const uLabel = (sys, q) => UNITS[sys][q][0];
export function fmt(v, d = 3) { if (v == null || !Number.isFinite(v)) return '–'; const a = Math.abs(v); if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(2); return v.toFixed(d); }
