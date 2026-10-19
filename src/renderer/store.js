// Application state: the open project, selection, undo/redo, dirty flag and autosave.
import { newProject } from '../core/fmea/model.js';
import { debounce } from './ui.js';
export const store = {
  project: newProject('Untitled project'), filePath: null, dirty: false,
  ui: { lang: 'en', units: 'SI', page: 'home', docId: null, tab: 'planning', netId: null, sel: {}, filters: {}, sort: null },
  undo: [], redo: [], listeners: new Set(),
};
const snap = () => JSON.stringify(store.project);
let last = snap();
const autosave = debounce(() => { try { window.host?.autosave(JSON.stringify(store.project)); } catch {} }, 1500);
/** Call after every model mutation. Records an undo step, marks dirty, autosaves and re-renders listeners. */
export function commit(label = '', { render = true } = {}) {
  const now = snap(); if (now === last) { if (render) emit(); return; }
  store.undo.push(last); if (store.undo.length > 80) store.undo.shift(); store.redo = []; last = now;
  store.project.modified = new Date().toISOString(); store.dirty = true; autosave(); emit(render ? label : 'quiet');
}
export function setProject(p, filePath = null) { store.project = p; store.filePath = filePath; store.dirty = false; store.undo = []; store.redo = []; last = snap(); emit('load'); }
export function undo() { if (!store.undo.length) return false; store.redo.push(snap()); const s = store.undo.pop(); store.project = JSON.parse(s); last = s; store.dirty = true; emit('undo'); return true; }
export function redo() { if (!store.redo.length) return false; store.undo.push(snap()); const s = store.redo.pop(); store.project = JSON.parse(s); last = s; store.dirty = true; emit('redo'); return true; }
export function markSaved(fp) { store.filePath = fp; store.dirty = false; }
export function onChange(fn) { store.listeners.add(fn); return () => store.listeners.delete(fn); }
function emit(label) { for (const fn of store.listeners) fn(label); }
export const curDoc = () => store.project.docs.find((d) => d.id === store.ui.docId) || null;
export const curNet = () => store.project.networks.find((n) => n.id === store.ui.netId) || null;
export const settings = () => store.project.settings;
