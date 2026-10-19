# Core layer (shared, UI-free)

These modules are plain ES modules with no DOM and no Electron dependencies. They run unchanged in Node, in the renderer, or in another app; Mamba FMEA's pipe hydraulics is one consumer.

| Module | API |
|---|---|
| `units.js` | `parseUnit('kJ/kg-K')`, `toSI(v, unit)`, `fromSI(v, unit)`, `sameDim(a, b)`, `UNIT_SYSTEMS`, `defaultUnitFor(dim, 'SI'|'US')`. EES unit syntax; °C/°F literals are offset-aware |
| `props.js` | `initProps(loader)` or `setCoolProp(cp)`; then `prop(out, fluid, {two of T,P,h,s,x,u,v,rho})` in SI. `out` is one of `T P h s x u v rho cp cv mu nu k Pr a M Pv Tcrit Pcrit`. Also `state()`, `Tsat()`, `Psat()`, `crit()`, `FLUIDS`, `settings.{waterBackend, refState}` |
| `solver.js` | `solve(text, {varInfo})` solves EES-style equation systems (structural analysis, block decomposition, Newton) with unit checking |
| `parser.js`, `latex.js`, `steps.js`, `trace.js`, `tables.js` | equation parsing, LaTeX output, step-by-step builders, textbook-table generation |

Mamba FMEA's `fluids.js` can register this engine with `useEngine({ prop })`. The call signature `prop(out, fluid, { T, P })` and the fluid ids (CoolProp names) are the same in both apps.
