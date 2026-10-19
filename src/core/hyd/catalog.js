// Pipe materials, standard sizes, fittings, valves and example pumps. Values are common engineering data.
export const MATERIALS = [
  { id: 'steel', label: 'Commercial steel (new)', eps: 0.045e-3, C: 120 },
  { id: 'steel-old', label: 'Steel, rusted', eps: 0.5e-3, C: 100 },
  { id: 'stainless', label: 'Stainless steel', eps: 0.015e-3, C: 140 },
  { id: 'galvanized', label: 'Galvanised iron', eps: 0.15e-3, C: 120 },
  { id: 'castiron', label: 'Cast iron', eps: 0.26e-3, C: 100 },
  { id: 'asphalted', label: 'Asphalted cast iron', eps: 0.12e-3, C: 110 },
  { id: 'ductile', label: 'Ductile iron, cement-lined', eps: 0.03e-3, C: 140 },
  { id: 'copper', label: 'Copper / drawn tubing', eps: 0.0015e-3, C: 140 },
  { id: 'pvc', label: 'PVC / plastic', eps: 0.0015e-3, C: 150 },
  { id: 'pe', label: 'PE / HDPE', eps: 0.007e-3, C: 150 },
  { id: 'concrete', label: 'Concrete', eps: 1.0e-3, C: 120 },
  { id: 'riveted', label: 'Riveted steel', eps: 3.0e-3, C: 100 },
  { id: 'glass', label: 'Glass', eps: 0.0003e-3, C: 150 },
  { id: 'rubber', label: 'Rubber hose (smooth)', eps: 0.01e-3, C: 135 },
];
// ASME B36.10M / B36.19M nominal pipe sizes: [NPS label, DN, OD mm, wall Sch10, Sch40, Sch80]
const NPS = [
  ['1/2"', 15, 21.3, 2.11, 2.77, 3.73], ['3/4"', 20, 26.7, 2.11, 2.87, 3.91], ['1"', 25, 33.4, 2.77, 3.38, 4.55], ['1-1/4"', 32, 42.2, 2.77, 3.56, 4.85],
  ['1-1/2"', 40, 48.3, 2.77, 3.68, 5.08], ['2"', 50, 60.3, 2.77, 3.91, 5.54], ['2-1/2"', 65, 73.0, 3.05, 5.16, 7.01], ['3"', 80, 88.9, 3.05, 5.49, 7.62],
  ['4"', 100, 114.3, 3.05, 6.02, 8.56], ['5"', 125, 141.3, 3.40, 6.55, 9.53], ['6"', 150, 168.3, 3.40, 7.11, 10.97], ['8"', 200, 219.1, 3.76, 8.18, 12.70],
  ['10"', 250, 273.0, 4.19, 9.27, 15.09], ['12"', 300, 323.8, 4.57, 10.31, 17.48], ['14"', 350, 355.6, 6.35, 11.13, 19.05], ['16"', 400, 406.4, 6.35, 12.70, 21.44],
  ['18"', 450, 457.0, 6.35, 14.27, 23.83], ['20"', 500, 508.0, 6.35, 15.09, 26.19], ['24"', 600, 610.0, 6.35, 17.48, 30.96],
];
const COPPER = [[12, 1.0], [15, 1.0], [18, 1.0], [22, 1.0], [28, 1.2], [35, 1.5], [42, 1.5], [54, 2.0], [76.1, 2.0], [108, 2.5]];
const PE = [20, 25, 32, 40, 50, 63, 75, 90, 110, 125, 160, 200, 250, 315, 400];
export const SIZES = [];
for (const [nps, dn, od, s10, s40, s80] of NPS) for (const [sch, w] of [['10', s10], ['40', s40], ['80', s80]]) SIZES.push({ id: `nps${dn}-${sch}`, family: `Steel NPS Sch ${sch}`, label: `NPS ${nps} (DN${dn}) Sch ${sch}`, OD: od / 1000, wall: w / 1000, D: (od - 2 * w) / 1000 });
for (const [od, w] of COPPER) SIZES.push({ id: `cu${od}`, family: 'Copper EN 1057', label: `Cu ${od} × ${w}`, OD: od / 1000, wall: w / 1000, D: (od - 2 * w) / 1000 });
for (const od of PE) for (const sdr of [11, 17]) { const w = Math.max(2.0, +(od / sdr).toFixed(1)); SIZES.push({ id: `pe${od}-${sdr}`, family: `PE100 SDR ${sdr}`, label: `PE ${od} SDR ${sdr}`, OD: od / 1000, wall: w / 1000, D: (od - 2 * w) / 1000 }); }
export const SIZE_FAMILIES = [...new Set(SIZES.map((s) => s.family))];

// Minor-loss coefficients K (based on the pipe velocity head).
export const FITTINGS = [
  { id: 'elbow90', label: '90° elbow, standard (flanged / welded)', K: 0.3 }, { id: 'elbow90lr', label: '90° elbow, long radius', K: 0.2 }, { id: 'elbow90thr', label: '90° elbow, threaded', K: 1.5 },
  { id: 'elbow45', label: '45° elbow (flanged)', K: 0.2 }, { id: 'elbow45thr', label: '45° elbow, threaded', K: 0.4 }, { id: 'bend180', label: '180° return bend', K: 0.2 },
  { id: 'teeLine', label: 'Tee, flow through run', K: 0.2 }, { id: 'teeBranch', label: 'Tee, flow through branch', K: 1.0 },
  { id: 'entrSharp', label: 'Entrance, sharp-edged', K: 0.5 }, { id: 'entrRound', label: 'Entrance, well rounded', K: 0.04 }, { id: 'entrReentrant', label: 'Entrance, re-entrant (projecting)', K: 0.8 },
  { id: 'exit', label: 'Exit into a tank', K: 1.0 }, { id: 'strainer', label: 'Y-strainer (clean)', K: 2.0 }, { id: 'meter', label: 'Flow meter (turbine)', K: 3.0 },
  { id: 'reducer', label: 'Concentric reducer (gradual)', K: 0.1 }, { id: 'expander', label: 'Gradual expansion (15°)', K: 0.2 }, { id: 'union', label: 'Union / coupling', K: 0.08 },
];
// Sudden expansion / contraction from the diameter ratio (K on the smaller-pipe velocity)
export const suddenExpansionK = (d1, d2) => Math.pow(1 - Math.pow(d1 / d2, 2), 2);
export const suddenContractionK = (d1, d2) => 0.42 * (1 - Math.pow(d2 / d1, 2));

// Valves: fully-open K and inherent characteristic (relative flow coefficient vs opening)
export const VALVES = [
  { id: 'gate', label: 'Gate valve', Kopen: 0.15, char: 'quick' }, { id: 'globe', label: 'Globe valve', Kopen: 6.0, char: 'equal' }, { id: 'ball', label: 'Ball valve', Kopen: 0.05, char: 'equal' },
  { id: 'butterfly', label: 'Butterfly valve', Kopen: 0.3, char: 'equal' }, { id: 'plug', label: 'Plug valve', Kopen: 0.4, char: 'linear' }, { id: 'diaphragm', label: 'Diaphragm valve', Kopen: 2.3, char: 'quick' },
  { id: 'swingcheck', label: 'Swing check valve', Kopen: 2.0, char: 'linear', check: true }, { id: 'liftcheck', label: 'Lift check valve', Kopen: 12, char: 'linear', check: true }, { id: 'needle', label: 'Needle / control valve', Kopen: 4.0, char: 'linear' },
];
/** Relative flow coefficient φ(x) for opening x∈[0,1]. K(x) = Kopen / φ². */
export function relCv(char, x) { x = Math.min(1, Math.max(0, x)); if (char === 'quick') return Math.sqrt(x); if (char === 'equal') return x <= 0 ? 0 : Math.pow(50, x - 1) * Math.min(1, x * 8); return x; }
export function valveK(v) { const def = VALVES.find((x) => x.id === v.kind) || VALVES[0]; const open = (v.opening ?? 100) / 100; const phi = relCv(def.char, open); const Ko = v.Kopen ?? def.Kopen; return phi <= 1e-6 ? 1e12 : Ko / (phi * phi); }

// Example pump curves (Q m³/h, H m, NPSHr m, η %) — generic end-suction centrifugal pumps at 2900 rpm
export const PUMPS = [
  { id: 'cp32-160', label: 'End-suction 32-160 @2900 rpm (generic)', curve: [[0, 32], [6, 31], [12, 28], [18, 23], [22, 18.5]], npshr: [[2, 1.0], [8, 1.3], [14, 1.9], [20, 3.0]], eff: [[2, 22], [8, 48], [14, 58], [20, 52]] },
  { id: 'cp50-200', label: 'End-suction 50-200 @2900 rpm (generic)', curve: [[0, 56], [20, 55], [40, 51], [60, 43], [75, 34]], npshr: [[10, 1.5], [30, 2.0], [50, 3.0], [70, 5.0]], eff: [[10, 35], [30, 62], [50, 72], [70, 66]] },
  { id: 'cp80-250', label: 'End-suction 80-250 @1450 rpm (generic)', curve: [[0, 22], [40, 21.5], [80, 19.5], [120, 16], [150, 12.5]], npshr: [[20, 1.2], [60, 1.6], [100, 2.4], [140, 3.6]], eff: [[20, 40], [60, 70], [100, 78], [140, 72]] },
  { id: 'cp100-315', label: 'End-suction 100-315 @1450 rpm (generic)', curve: [[0, 36], [60, 35], [120, 32], [180, 26.5], [220, 21]], npshr: [[30, 1.5], [90, 2.0], [150, 3.0], [210, 4.6]], eff: [[30, 42], [90, 72], [150, 80], [210, 75]] },
];
