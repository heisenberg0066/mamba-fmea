// Action Priority (AP) and classic RPN logic.
// The AP logic follows the AIAG-VDA (2019) method: a lookup over severity, occurrence (or frequency)
// and detection (or monitoring) bands. The bands are encoded here as data, not copied text.

const band = (v, edges) => { for (let i = 0; i < edges.length; i++) if (v >= edges[i]) return i; return edges.length; };

// DFMEA / PFMEA. Bands: S [9-10, 7-8, 4-6, 2-3, 1], O [8-10, 6-7, 4-5, 2-3, 1], D [7-10, 5-6, 2-4, 1]
const S_E = [9, 7, 4, 2], O_E = [8, 6, 4, 2], D_E = [7, 5, 2];
const AP_DP = [
  // S 9-10
  ['HHHH', 'HHHH', 'HHHM', 'HMLL', 'LLLL'],
  // S 7-8
  ['HHHH', 'HHHM', 'HMMM', 'MMLL', 'LLLL'],
  // S 4-6
  ['HHMM', 'MMML', 'MLLL', 'LLLL', 'LLLL'],
  // S 2-3
  ['MMLL', 'LLLL', 'LLLL', 'LLLL', 'LLLL'],
  // S 1
  ['LLLL', 'LLLL', 'LLLL', 'LLLL', 'LLLL'],
];

export function validRating(v) { return Number.isInteger(v) && v >= 1 && v <= 10; }

/** AP for DFMEA/PFMEA. Returns 'H' | 'M' | 'L' or '' if any rating is missing. */
export function apDP(S, O, D) {
  if (!validRating(S) || !validRating(O) || !validRating(D)) return '';
  return AP_DP[band(S, S_E)][band(O, O_E)][band(D, D_E)];
}

// FMEA-MSR: severity S, frequency F, monitoring M.
// Encoded as rules per severity band: list of [Fmin, Fmax, [[Mmin, Mmax, AP], ...]]
const MSR = {
  10: [[5, 10, [[1, 10, 'H']]], [4, 4, [[2, 10, 'H'], [1, 1, 'M']]], [3, 3, [[4, 10, 'H'], [2, 3, 'M'], [1, 1, 'L']]], [2, 2, [[4, 10, 'M'], [1, 3, 'L']]], [1, 1, [[1, 10, 'L']]]],
  9: [[4, 10, [[1, 10, 'H']]], [2, 3, [[2, 10, 'H'], [1, 1, 'L']]], [1, 1, [[1, 10, 'L']]]],
  7: [[6, 10, [[1, 10, 'H']]], [5, 5, [[5, 10, 'H'], [1, 4, 'M']]], [4, 4, [[7, 10, 'H'], [4, 6, 'M'], [1, 3, 'L']]], [3, 3, [[9, 10, 'H'], [7, 8, 'M'], [1, 6, 'L']]], [2, 2, [[7, 10, 'M'], [1, 6, 'L']]], [1, 1, [[1, 10, 'L']]]],
  4: [[7, 10, [[1, 10, 'H']]], [5, 6, [[6, 10, 'H'], [1, 5, 'M']]], [2, 4, [[7, 10, 'M'], [1, 6, 'L']]], [1, 1, [[1, 10, 'L']]]],
  2: [[7, 10, [[1, 10, 'H']]], [5, 6, [[7, 10, 'M'], [1, 6, 'L']]], [1, 4, [[1, 10, 'L']]]],
  1: [[1, 10, [[1, 10, 'L']]]],
};
/** AP for FMEA-MSR. When M = 1 the severity of the mitigated effect (sMitigated) is used, if given. */
export function apMSR(S, F, M, sMitigated) {
  if (!validRating(S) || !validRating(F) || !validRating(M)) return '';
  const s = M === 1 && validRating(sMitigated) ? sMitigated : S;
  const key = s >= 10 ? 10 : s >= 9 ? 9 : s >= 7 ? 7 : s >= 4 ? 4 : s >= 2 ? 2 : 1;
  for (const [f0, f1, rows] of MSR[key]) if (F >= f0 && F <= f1) for (const [m0, m1, ap] of rows) if (M >= m0 && M <= m1) return ap;
  return 'L';
}

export function rpn(S, O, D) { return validRating(S) && validRating(O) && validRating(D) ? S * O * D : 0; }

/** Unified evaluation for a risk row. mode: 'AP' | 'RPN'; type: 'DFMEA' | 'PFMEA' | 'MSR'. */
export function evaluate({ type, mode = 'AP', S, O, D, F, M, sMitigated, rpnHigh = 200, rpnMedium = 100 }) {
  if (type === 'MSR') {
    const ap = apMSR(S, F, M, sMitigated);
    return { ap, rpn: rpn(S, F, M), level: ap };
  }
  const ap = apDP(S, O, D); const r = rpn(S, O, D);
  if (mode === 'RPN') {
    const level = !r ? '' : (r >= rpnHigh || (S >= 9 && O >= 4)) ? 'H' : r >= rpnMedium ? 'M' : 'L';
    return { ap, rpn: r, level };
  }
  return { ap, rpn: r, level: ap };
}

export const AP_WEIGHT = { H: 3, M: 2, L: 1, '': 0 };

/** Full 10x10x10 matrix (for the AP matrix view and tests). */
export function apCube() { const out = []; for (let s = 1; s <= 10; s++) for (let o = 1; o <= 10; o++) for (let d = 1; d <= 10; d++) out.push([s, o, d, apDP(s, o, d)]); return out; }
