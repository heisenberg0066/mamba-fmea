// EPANET .inp export / import (SI: LPS flow units, metres). Water-type networks only (EPANET is water-based).
import { newNetwork, addNode, addLink, pumpCurve } from './network.js';
import { valveK } from './catalog.js';
import { minorK } from './friction.js';

const safe = (s) => String(s).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 31);
export function toInp(net, { headloss = net.headloss || 'DW', viscosityRel = 1 } = {}) {
  const L = []; const lab = new Map(); const used = new Set();
  const nm = (x) => { if (lab.has(x.id)) return lab.get(x.id); let s = safe(x.label || x.id); while (used.has(s)) s += '_'; used.add(s); lab.set(x.id, s); return s; };
  L.push('[TITLE]', net.name, '');
  L.push('[JUNCTIONS]', ';ID Elev Demand');
  for (const n of net.nodes.filter((x) => x.type === 'junction' || x.type === 'nozzle')) L.push(`${nm(n)} ${n.z} ${(n.demand || 0) * 1000}`);
  L.push('', '[RESERVOIRS]'); for (const n of net.nodes.filter((x) => x.type === 'reservoir')) L.push(`${nm(n)} ${n.z + (n.level || 0)}`);
  L.push('', '[TANKS]', ';ID Elev InitLvl MinLvl MaxLvl Diam MinVol'); for (const n of net.nodes.filter((x) => x.type === 'tank')) L.push(`${nm(n)} ${n.z} ${n.level || 0} 0 ${Math.max(10, (n.level || 0) * 2)} ${n.diameter || 10} 0`);
  L.push('', '[EMITTERS]'); for (const n of net.nodes.filter((x) => x.type === 'nozzle')) { const d = n.nozzle.d, Cd = n.nozzle.Cd; const k = Cd * Math.PI * d * d / 4 * Math.sqrt(2 * 9.80665) * 1000; L.push(`${nm(n)} ${k}`); }
  L.push('', '[PIPES]', ';ID N1 N2 Length Diam Rough Minor Status');
  const curves = [];
  for (const l of net.links.filter((x) => x.type === 'pipe')) { const p = l.pipe; const r = headloss === 'HW' ? p.C : p.eps * 1000; L.push(`${nm(l)} ${nm(net.nodes.find((n) => n.id === l.from))} ${nm(net.nodes.find((n) => n.id === l.to))} ${p.L} ${p.D * 1000} ${r} ${minorK(p)} ${l.status === 'closed' ? 'Closed' : p.check ? 'CV' : 'Open'}`); }
  L.push('', '[PUMPS]');
  for (const l of net.links.filter((x) => x.type === 'pump')) { const c = 'C_' + nm(l); curves.push([c, l.pump.curve]); L.push(`${nm(l)} ${nm(net.nodes.find((n) => n.id === l.from))} ${nm(net.nodes.find((n) => n.id === l.to))} HEAD ${c} SPEED ${l.pump.speed ?? 1}`); }
  L.push('', '[VALVES]', ';ID N1 N2 Diam Type Setting Minor');
  for (const l of net.links.filter((x) => x.type === 'valve')) L.push(`${nm(l)} ${nm(net.nodes.find((n) => n.id === l.from))} ${nm(net.nodes.find((n) => n.id === l.to))} ${(l.valve.D || 0.1) * 1000} TCV ${valveK(l.valve)} 0`);
  L.push('', '[CURVES]'); for (const [c, pts] of curves) for (const [q, h] of pts) L.push(`${c} ${q * 1000} ${h}`);
  L.push('', '[STATUS]'); for (const l of net.links.filter((x) => x.type === 'pump' && x.pump.on === false)) L.push(`${nm(l)} Closed`);
  L.push('', '[OPTIONS]', 'Units LPS', `Headloss ${headloss === 'HW' ? 'H-W' : 'D-W'}`, `Viscosity ${viscosityRel}`, 'Specific Gravity 1.0', 'Trials 200', 'Accuracy 0.0000001', 'Unbalanced Stop', '');
  L.push('[TIMES]', 'Duration 0', '', '[COORDINATES]'); for (const n of net.nodes) L.push(`${nm(n)} ${n.x} ${-n.y}`);
  L.push('', '[END]');
  return { text: L.join('\n'), names: lab };
}

export function fromInp(text, name = 'Imported') {
  const net = newNetwork(name); const sec = {}; let cur = null;
  for (const raw of text.split(/\r?\n/)) { const line = raw.replace(/;.*$/, '').trim(); if (!line) continue; const m = line.match(/^\[(\w+)\]/); if (m) { cur = m[1].toUpperCase(); sec[cur] = sec[cur] || []; continue; } if (cur) sec[cur].push(line.split(/\s+/)); }
  const opt = Object.fromEntries((sec.OPTIONS || []).map((t) => [t[0].toUpperCase(), t.slice(1).join(' ')]));
  const units = (opt.UNITS || 'GPM').toUpperCase(); const flowF = { LPS: 1e-3, LPM: 1e-3 / 60, MLD: 1e3 / 86400, CMH: 1 / 3600, CMD: 1 / 86400, CFS: 0.0283168, GPM: 6.30902e-5, MGD: 0.0438126, IMGD: 0.0526168, AFD: 0.0142764 }[units] || 1e-3;
  const us = ['CFS', 'GPM', 'MGD', 'IMGD', 'AFD'].includes(units); const lenF = us ? 0.3048 : 1, diaF = us ? 0.0254 : 1e-3, roughF = us ? 0.3048e-3 : 1e-3;
  net.headloss = /H-W/i.test(opt.HEADLOSS || 'H-W') ? 'HW' : 'DW';
  const coords = Object.fromEntries((sec.COORDINATES || []).map((t) => [t[0], [+t[1], -t[2]]]));
  const ids = new Map(); const pos = (id, i) => coords[id] || [100 + (i % 10) * 80, 100 + Math.floor(i / 10) * 80];
  (sec.JUNCTIONS || []).forEach((t, i) => { const [x, y] = pos(t[0], i); ids.set(t[0], addNode(net, 'junction', x, y, { label: t[0], z: +t[1] * lenF, demand: (+t[2] || 0) * flowF }).id); });
  (sec.RESERVOIRS || []).forEach((t, i) => { const [x, y] = pos(t[0], i); ids.set(t[0], addNode(net, 'reservoir', x, y, { label: t[0], z: +t[1] * lenF, level: 0 }).id); });
  (sec.TANKS || []).forEach((t, i) => { const [x, y] = pos(t[0], i); ids.set(t[0], addNode(net, 'tank', x, y, { label: t[0], z: +t[1] * lenF, level: +t[2] * lenF, diameter: +t[5] * lenF }).id); });
  const curves = {}; (sec.CURVES || []).forEach((t) => { (curves[t[0]] = curves[t[0]] || []).push([+t[1] * flowF, +t[2] * lenF]); });
  (sec.PIPES || []).forEach((t) => { const st = (t[7] || 'Open').toUpperCase(); addLink(net, 'pipe', ids.get(t[1]), ids.get(t[2]), { label: t[0], status: st === 'CLOSED' ? 'closed' : 'open', pipe: { L: +t[3] * lenF, D: +t[4] * diaF, eps: net.headloss === 'DW' ? +t[5] * roughF : 0.045e-3, C: net.headloss === 'HW' ? +t[5] : 130, Kextra: +t[6] || 0, check: st === 'CV', material: 'custom', size: '' } }); });
  (sec.PUMPS || []).forEach((t) => { const kv = {}; for (let i = 3; i < t.length; i += 2) kv[t[i].toUpperCase()] = t[i + 1]; addLink(net, 'pump', ids.get(t[1]), ids.get(t[2]), { label: t[0], pump: { curve: curves[kv.HEAD] || [[0, 30], [0.01, 20]], npshr: [], eff: [], speed: +(kv.SPEED || 1), on: true } }); });
  (sec.VALVES || []).forEach((t) => { addLink(net, 'valve', ids.get(t[1]), ids.get(t[2]), { label: t[0], valve: { kind: 'needle', opening: 100, D: +t[3] * diaF, Kopen: t[4].toUpperCase() === 'TCV' ? +t[5] : 1 } }); });
  (sec.EMITTERS || []).forEach((t) => { const n = net.nodes.find((x) => x.id === ids.get(t[0])); if (!n) return; const k = +t[1] * flowF; const Cd = 0.95; const A = k / (Cd * Math.sqrt(2 * 9.80665) * (us ? Math.sqrt(0.3048 * 0.433) : 1)); n.type = 'nozzle'; n.nozzle = { d: Math.sqrt(4 * A / Math.PI), Cd }; });
  void pumpCurve;
  return net;
}
