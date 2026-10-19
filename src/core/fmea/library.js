// Built-in library of reusable functions, failure modes, causes and effects (own engineering wording).
// Applying an entry to a structure node creates functions + failure modes on the node, causes on child elements
// (created or reused by name) and effects on the parent node — i.e. complete FE–FM–FC chains.
import { addFunction, addFailure, addNode, addChar, linkCause, linkEffect, functionsOf } from './model.js';

const E = (text, S) => ({ text, S });
const C = (element, text, m4) => ({ element, text, m4 });
export const LIBRARY = [
  // ---------------- design ----------------
  { id: 'lib-bolt', cat: 'design', name: 'Bolted joint', functions: [{ text: 'Clamp the parts together with the required preload', req: 'Preload within design range, no slip, no loosening', chars: [{ name: 'Preload', spec: 'per joint calculation', cls: 'SC' }, { name: 'Thread engagement', spec: '≥ 1.0 × d' }],
    failures: [{ text: 'Preload too low', effects: [E('Joint slips or opens under load', 8), E('Fastener loosens / fatigue fracture', 9)], causes: [C('Fastener', 'Bolt grade / size too small for the load'), C('Interface', 'Embedding and relaxation of clamped surfaces not considered'), C('Specification', 'Tightening torque specified too low or friction range wrong')] },
      { text: 'Preload too high', effects: [E('Bolt yields or thread strips', 7)], causes: [C('Specification', 'Torque specified without friction scatter'), C('Fastener', 'Thread length too short')] }] }] },
  { id: 'lib-shaft', cat: 'design', name: 'Shaft', functions: [{ text: 'Transmit torque and carry bending loads', req: 'Static and fatigue safety ≥ required factor', chars: [{ name: 'Diameter', spec: 'per drawing', cls: 'SC' }, { name: 'Fillet radius', spec: 'r ≥ 1 mm' }, { name: 'Surface finish', spec: 'Ra ≤ 0.8 µm' }],
    failures: [{ text: 'Fatigue crack at shoulder', effects: [E('Loss of drive', 8), E('Sudden fracture with debris', 9)], causes: [C('Geometry', 'Fillet radius too small (stress concentration)'), C('Material', 'Endurance limit lower than assumed'), C('Load case', 'Load spectrum underestimated')] },
      { text: 'Excessive deflection', effects: [E('Gear / bearing misalignment, noise', 5)], causes: [C('Geometry', 'Diameter too small for span'), C('Supports', 'Bearing span too long')] }] }] },
  { id: 'lib-bearing', cat: 'design', name: 'Rolling bearing', functions: [{ text: 'Support the shaft and allow rotation with low friction', req: 'L10 life ≥ required hours', chars: [{ name: 'Fit (shaft / housing)', spec: 'k5 / H7' }, { name: 'Lubricant viscosity', spec: 'κ ≥ 1' }],
    failures: [{ text: 'Premature fatigue (spalling)', effects: [E('Noise and vibration', 5), E('Seizure, loss of function', 8)], causes: [C('Selection', 'Dynamic load rating too low for the load'), C('Lubricant', 'Viscosity too low at operating temperature'), C('Seal', 'Contamination enters the bearing')] },
      { text: 'Fretting / creep of ring', effects: [E('Wear of seat, play', 6)], causes: [C('Fit', 'Interference fit too loose')] }] }] },
  { id: 'lib-gear', cat: 'design', name: 'Spur gear pair', functions: [{ text: 'Transmit torque at the required ratio', req: 'Contact and bending safety ≥ 1.2', chars: [{ name: 'Module', spec: '' }, { name: 'Face width', spec: '' }, { name: 'Case depth', spec: '', cls: 'SC' }],
    failures: [{ text: 'Tooth root fracture', effects: [E('Loss of drive', 8)], causes: [C('Geometry', 'Module too small for the torque'), C('Heat treatment', 'Case depth not specified correctly')] },
      { text: 'Pitting of flanks', effects: [E('Noise, vibration, later loss of drive', 6)], causes: [C('Lubricant', 'Oil film too thin'), C('Geometry', 'Contact stress above allowable')] }] }] },
  { id: 'lib-seal', cat: 'design', name: 'O-ring / static seal', functions: [{ text: 'Seal the fluid at the joint', req: 'No leakage at max pressure and temperature', chars: [{ name: 'Squeeze', spec: '15–30 %', cls: 'SC' }, { name: 'Elastomer compound', spec: 'compatible with fluid' }],
    failures: [{ text: 'External leakage', effects: [E('Fluid loss, environment / slip hazard', 7), E('Loss of pressure, function lost', 8)], causes: [C('Groove', 'Squeeze too low / gland too deep'), C('Material', 'Elastomer swells or hardens in this fluid'), C('Extrusion gap', 'Gap too large for pressure')] }] }] },
  { id: 'lib-weld', cat: 'design', name: 'Welded joint (design)', functions: [{ text: 'Join the parts and carry the design loads', req: 'Weld size per calculation, fatigue class met', chars: [{ name: 'Throat thickness a', spec: 'per drawing', cls: 'SC' }],
    failures: [{ text: 'Weld fatigue crack', effects: [E('Structural failure', 9)], causes: [C('Detail', 'Weld at high-stress location / poor detail category'), C('Size', 'Throat thickness too small')] }] }] },
  { id: 'lib-spring', cat: 'design', name: 'Compression spring', functions: [{ text: 'Provide the required force over the stroke', req: 'Force within ±10 % at working length', chars: [{ name: 'Spring rate', spec: '' }, { name: 'Free length', spec: '' }],
    failures: [{ text: 'Force too low (relaxation)', effects: [E('Mechanism does not return / function degraded', 6)], causes: [C('Material', 'Shear stress too close to the limit'), C('Temperature', 'Operating temperature causes relaxation')] }] }] },
  { id: 'lib-housing', cat: 'design', name: 'Housing / casing', functions: [{ text: 'Locate internal parts and protect them from the environment', req: 'IP rating, stiffness', chars: [{ name: 'Bore position', spec: '' }, { name: 'Wall thickness', spec: '' }],
    failures: [{ text: 'Housing cracks', effects: [E('Fluid leakage, loss of function', 8)], causes: [C('Wall', 'Wall too thin at ribs'), C('Load', 'Mounting loads not considered')] }] }] },
  // ---------------- process ----------------
  { id: 'lib-p-torque', cat: 'process', name: 'Tighten fasteners', kind: 'step', functions: [{ text: 'Tighten fasteners to the specified torque / angle', chars: [{ name: 'Tightening torque', spec: 'per work instruction', cls: 'SC' }],
    failures: [{ text: 'Torque below specification', effects: [E('Joint loosens in service', 8)], causes: [C('Nutrunner', 'Tool out of calibration', 'Machine'), C('Operator', 'Tightening sequence not followed', 'Man'), C('Fastener', 'Wrong fastener / lubricated thread', 'Material')] },
      { text: 'Fastener missing', effects: [E('Joint fails / part detaches', 9)], causes: [C('Operator', 'Fastener not fitted', 'Man'), C('Fixture', 'No presence check', 'Machine')] }] }] },
  { id: 'lib-p-turn', cat: 'process', name: 'CNC turning', kind: 'step', functions: [{ text: 'Turn the diameter to size and finish', chars: [{ name: 'Diameter', spec: '±0.01 mm', cls: 'SC' }, { name: 'Surface roughness', spec: 'Ra 0.8' }],
    failures: [{ text: 'Diameter oversize', effects: [E('Part does not assemble; scrap', 6)], causes: [C('Cutting tool', 'Tool wear not compensated', 'Machine'), C('Program', 'Wrong offset', 'Method'), C('Gauge', 'Gauge not zeroed', 'Measurement')] },
      { text: 'Diameter undersize', effects: [E('Loose fit in service', 7)], causes: [C('Program', 'Wrong offset', 'Method'), C('Machine', 'Thermal drift at start-up', 'Machine')] }] }] },
  { id: 'lib-p-weld', cat: 'process', name: 'MIG/MAG welding', kind: 'step', functions: [{ text: 'Deposit a sound weld of the required size', chars: [{ name: 'Weld size', spec: 'a5', cls: 'SC' }, { name: 'Wire feed / voltage', spec: 'per WPS' }],
    failures: [{ text: 'Lack of fusion', effects: [E('Weld cracks in service', 9)], causes: [C('Welding set', 'Current too low', 'Machine'), C('Welder', 'Wrong torch angle / speed', 'Man'), C('Material', 'Surface contaminated (oil, mill scale)', 'Material')] },
      { text: 'Porosity', effects: [E('Reduced strength, rework', 6)], causes: [C('Shielding gas', 'Gas flow too low / draught', 'Environment')] }] }] },
  { id: 'lib-p-press', cat: 'process', name: 'Press-fit bearing', kind: 'step', functions: [{ text: 'Press the bearing to depth without damage', chars: [{ name: 'Press-in depth', spec: '±0.1 mm', cls: 'SC' }, { name: 'Press force', spec: 'force window' }],
    failures: [{ text: 'Bearing not fully seated', effects: [E('Axial play, noise, early failure', 7)], causes: [C('Press', 'Stroke limit set wrong', 'Machine'), C('Part', 'Housing bore oversize', 'Material')] },
      { text: 'Bearing damaged during pressing', effects: [E('Early bearing failure', 7)], causes: [C('Tool', 'Force applied through the rolling elements', 'Method')] }] }] },
  { id: 'lib-p-paint', cat: 'process', name: 'Painting / coating', kind: 'step', functions: [{ text: 'Apply coating of the required thickness', chars: [{ name: 'Dry film thickness', spec: '60–90 µm' }],
    failures: [{ text: 'Coating too thin', effects: [E('Corrosion in service', 6)], causes: [C('Spray gun', 'Nozzle worn / pressure low', 'Machine'), C('Pre-treatment', 'Surface not cleaned', 'Method')] }] }] },
  { id: 'lib-p-inspect', cat: 'process', name: 'Final inspection / test', kind: 'step', stepType: 'inspection', functions: [{ text: 'Detect non-conforming product before shipment', chars: [{ name: 'Leak rate', spec: '≤ 1 cm³/min', cls: 'CC' }],
    failures: [{ text: 'Leaking part passes test', effects: [E('Customer receives leaking product', 8)], causes: [C('Test rig', 'Leak tester out of calibration', 'Measurement'), C('Operator', 'Test skipped', 'Man')] }] }] },
  // ---------------- hydraulic components (also used by the hydraulics → FMEA link) ----------------
  { id: 'hyd-pipe', cat: 'hydraulic', name: 'Pipe', hyd: 'pipe', functions: [{ text: 'Convey the fluid at the design flow with acceptable pressure loss', chars: [{ name: 'Inner diameter', spec: '' }, { name: 'Wall thickness', spec: '', cls: 'SC' }],
    failures: [{ text: 'Pipe leaks or bursts', effects: [E('Loss of fluid / spill, possible injury', 8)], causes: [C('Wall', 'Corrosion / erosion thins the wall'), C('Pressure', 'Water hammer exceeds pressure rating'), C('Supports', 'Vibration fatigue at supports')] },
      { text: 'Flow lower than required (high pressure drop)', effects: [E('Consumers starved; process degraded', 6)], causes: [C('Sizing', 'Diameter too small for the flow'), C('Inner surface', 'Scaling / fouling increases roughness')] }] }] },
  { id: 'hyd-pump', cat: 'hydraulic', name: 'Centrifugal pump', hyd: 'pump', functions: [{ text: 'Deliver the design flow at the required head', chars: [{ name: 'Duty point (Q, H)', spec: '' }, { name: 'NPSH margin', spec: 'NPSHa ≥ NPSHr + 0.5 m', cls: 'SC' }],
    failures: [{ text: 'Cavitation', effects: [E('Noise, impeller erosion, flow drops', 7)], causes: [C('Suction line', 'NPSH available too low (suction losses, high fluid temperature)'), C('Selection', 'Pump runs far right of BEP')] },
      { text: 'Pump delivers too little head / flow', effects: [E('System under-supplied', 6)], causes: [C('Selection', 'Duty point not matched to system curve'), C('Impeller', 'Impeller wear / wrong trim')] },
      { text: 'Mechanical seal leaks', effects: [E('Fluid leakage', 6)], causes: [C('Seal', 'Dry running / seal faces overheated')] }] }] },
  { id: 'hyd-valve', cat: 'hydraulic', name: 'Valve', hyd: 'valve', functions: [{ text: 'Isolate or throttle the flow on demand', chars: [{ name: 'Kv / Cv', spec: '' }],
    failures: [{ text: 'Valve does not close (passes)', effects: [E('Cannot isolate section; maintenance hazard', 7)], causes: [C('Seat', 'Seat eroded or debris on seat'), C('Actuator', 'Actuator torque too low')] },
      { text: 'Valve sticks closed', effects: [E('No flow to consumers', 7)], causes: [C('Stem', 'Stem corrosion / packing too tight')] }] }] },
  { id: 'hyd-check', cat: 'hydraulic', name: 'Check valve', hyd: 'check', functions: [{ text: 'Prevent reverse flow', chars: [] }],
    failures: [] },
  { id: 'hyd-tank', cat: 'hydraulic', name: 'Tank / reservoir', hyd: 'tank', functions: [{ text: 'Store fluid and keep the level / pressure in range', chars: [{ name: 'Level range', spec: '' }],
    failures: [{ text: 'Tank overflows', effects: [E('Spill, environmental damage', 7)], causes: [C('Level control', 'Level switch fails'), C('Inflow', 'Inflow larger than outflow at shutdown')] },
      { text: 'Tank runs dry', effects: [E('Pump runs dry, damage', 7)], causes: [C('Level control', 'Low-level alarm missing')] }] }] },
  { id: 'hyd-nozzle', cat: 'hydraulic', name: 'Nozzle / spray', hyd: 'nozzle', functions: [{ text: 'Discharge fluid at the required flow and pattern', chars: [{ name: 'Orifice diameter', spec: '' }],
    failures: [{ text: 'Nozzle blocked', effects: [E('No discharge at that point', 6)], causes: [C('Fluid', 'Particles in fluid, no strainer')] }] }] },
  { id: 'hyd-fitting', cat: 'hydraulic', name: 'Fitting / joint', hyd: 'fitting', functions: [{ text: 'Connect pipes without leakage', chars: [] }],
    failures: [{ text: 'Joint leaks', effects: [E('Fluid loss', 6)], causes: [C('Assembly', 'Joint not tightened / gasket damaged'), C('Thermal', 'Thermal cycling loosens the joint')] }] }] },
];
LIBRARY.find((x) => x.id === 'hyd-check').functions[0].failures = [{ text: 'Check valve fails to close', effects: [E('Reverse flow drains the system / pump spins backwards', 7)], causes: [C('Disc', 'Disc or hinge stuck by debris')] }];
LIBRARY.forEach((x) => { x.functions.forEach((f) => { f.failures = f.failures || []; }); });

/** Apply a library entry to a node. Returns the created ids. */
export function applyEntry(doc, nodeId, entry, opts = {}) {
  const node = doc.nodes[nodeId]; const created = { functions: [], failures: [], nodes: [] };
  const parent = node.parent ? doc.nodes[node.parent] : null;
  let parentFn = parent ? functionsOf(doc, parent.id)[0] : null;
  for (const fdef of entry.functions) {
    const fn = addFunction(doc, nodeId, fdef.text, { req: fdef.req || '', lib: entry.id }); created.functions.push(fn.id);
    (fdef.chars || []).forEach((c) => addChar(doc, fn.id, c.name, { spec: c.spec || '', cls: c.cls || '' }));
    for (const fl of fdef.failures || []) {
      const fm = addFailure(doc, fn.id, fl.text); created.failures.push(fm.id);
      if (opts.effects !== false && (fl.effects || []).length) {
        if (!parent) { fm.S = Math.max(...fl.effects.map((e) => e.S || 0)) || null; }
        else {
          if (!parentFn) { parentFn = addFunction(doc, parent.id, opts.parentFnText || `Function of ${parent.name}`); created.functions.push(parentFn.id); }
          for (const e of fl.effects) {
            let fe = Object.values(doc.failures).find((x) => x.fn === parentFn.id && x.text === e.text);
            if (!fe) { fe = addFailure(doc, parentFn.id, e.text, { S: e.S ?? null }); created.failures.push(fe.id); }
            linkEffect(doc, fm.id, fe.id);
          }
        }
      }
      if (opts.causes !== false) for (const c of fl.causes || []) {
        let child = node.children.map((id) => doc.nodes[id]).find((n) => n.name === c.element);
        if (!child) { child = addNode(doc, nodeId, c.element, undefined, c.m4 ? { m4: c.m4 } : {}); created.nodes.push(child.id); }
        let cfn = functionsOf(doc, child.id)[0];
        if (!cfn) { cfn = addFunction(doc, child.id, `${c.element}: ${opts.supportText || 'fulfils its contribution to'} "${fdef.text}"`); created.functions.push(cfn.id); }
        let fc = Object.values(doc.failures).find((x) => x.fn === cfn.id && x.text === c.text);
        if (!fc) { fc = addFailure(doc, cfn.id, c.text); created.failures.push(fc.id); }
        linkCause(doc, fm.id, fc.id);
      }
    }
  }
  return created;
}

/** Turn a node (with its functions, failures, causes and effects) into a reusable library entry. */
export function entryFromNode(doc, nodeId, cat = 'user') {
  const n = doc.nodes[nodeId];
  return {
    id: 'u' + Date.now().toString(36), cat, name: n.name, kind: n.kind, functions: functionsOf(doc, nodeId).map((f) => ({
      text: f.text, req: f.req, chars: f.chars.map((c) => ({ name: c.name, spec: c.spec, cls: c.cls })),
      failures: Object.values(doc.failures).filter((x) => x.fn === f.id).map((x) => ({
        text: x.text, effects: x.effects.map((e) => doc.failures[e]).filter(Boolean).map((e) => ({ text: e.text, S: e.S })),
        causes: x.causes.map((c) => doc.failures[c]).filter(Boolean).map((c) => ({ element: doc.nodes[c.node].name, text: c.text, m4: doc.nodes[c.node].m4 })),
      })),
    })),
  };
}
