# Third-party components

| Component | Use | License |
|---|---|---|
| Electron | app runtime | MIT |
| CoolProp 6.6 (WASM build, `src/vendor/coolprop`) | fluid properties | MIT, © Ian Bell and the CoolProp contributors |
| engsuite core `props.js`, `units.js` (`src/vendor/engsuite-core`) | shared property layer | same author, MIT |
| ExcelJS (bundled into `src/gen/xlsx.bundle.cjs` at build time) | Excel import/export | MIT |
| EPANET 2.2 via epanet-js (tests only, not shipped) | solver cross-check | MIT |

AIAG‑VDA FMEA is a method published by AIAG and VDA. This app implements the method and the Action Priority logic. The rating criteria texts are original and are not taken from the handbook.
