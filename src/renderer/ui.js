// DOM helpers, dialogs, toasts, small widgets.
import { t } from './i18n.js';
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'html') e.innerHTML = v;
    else if (k === 'value') e.value = v; else if (k === 'checked' || k === 'selected' || k === 'disabled') e[k] = !!v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const SVGNS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v === undefined || v === null || v === false) continue; if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
export function esc(x) { return String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
let toastEl;
export function toast(msg, kind = '') {
  if (!toastEl) { toastEl = h('div', { class: 'toast' }); document.body.append(toastEl); }
  toastEl.textContent = msg; toastEl.className = 'toast show ' + kind; clearTimeout(toastEl._t); toastEl._t = setTimeout(() => (toastEl.className = 'toast ' + kind), kind === 'error' ? 5000 : 2600);
}
/** Modal dialog. buttons: [{label, value, primary}] → resolves with value (or null on cancel). */
export function modal(title, body, buttons = [{ label: 'OK', value: true, primary: true }], opts = {}) {
  return new Promise((resolve) => {
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); if (e.key === 'Enter' && opts.enter !== false && e.target.tagName !== 'TEXTAREA') { const p = buttons.find((b) => b.primary); if (p) close(typeof p.value === 'function' ? p.value() : p.value); } };
    const box = h('div', { class: 'modal' + (opts.wide ? ' wide' : '') }, h('div', { class: 'modal-head' }, h('b', {}, title), h('button', { class: 'x', onclick: () => close(null) }, '×')), h('div', { class: 'modal-body' }, body),
      h('div', { class: 'modal-foot' }, h('button', { class: 'btn', onclick: () => close(null) }, t('Cancel')), buttons.map((b) => h('button', { class: 'btn' + (b.primary ? ' primary' : ''), onclick: () => close(typeof b.value === 'function' ? b.value() : b.value) }, b.label))));
    const back = h('div', { class: 'modal-back', onmousedown: (e) => { if (e.target === back) close(null); } }, box);
    document.body.append(back); document.addEventListener('keydown', onKey);
    setTimeout(() => { const i = box.querySelector('input,textarea,select'); if (i) { i.focus(); i.select?.(); } }, 30);
  });
}
export async function ask(title, label, value = '', opts = {}) {
  const inp = opts.multiline ? h('textarea', { rows: 4, style: { width: '100%' } }) : h('input', { type: 'text', style: { width: '100%' } }); inp.value = value;
  const r = await modal(title, h('div', { class: 'form' }, h('label', {}, label), inp), [{ label: t('OK'), value: () => inp.value, primary: true }]);
  return r == null ? null : String(r).trim();
}
export async function confirmBox(title, text) { return !!(await modal(title, h('p', {}, text), [{ label: t('OK'), value: true, primary: true }])); }
export function apBadge(ap, extra = '') { return h('span', { class: 'ap ap-' + (ap || 'none') + ' ' + extra, title: ap ? t('Action priority') + ': ' + ap : t('Not rated') }, ap || '–'); }
export function field(label, input, hint) { return h('label', { class: 'field' }, h('span', { class: 'field-l' }, label), input, hint ? h('span', { class: 'hint' }, hint) : null); }
export function input(value, onchange, attrs = {}) { const e = h('input', { type: 'text', ...attrs }); e.value = value ?? ''; e.addEventListener('change', () => onchange(e.type === 'number' ? (e.value === '' ? null : +e.value) : e.value)); return e; }
export function textarea(value, onchange, attrs = {}) { const e = h('textarea', { rows: 2, ...attrs }); e.value = value ?? ''; e.addEventListener('change', () => onchange(e.value)); return e; }
export function select(value, options, onchange, attrs = {}) {
  const e = h('select', attrs, options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v }, l); }));
  e.value = value ?? ''; e.addEventListener('change', () => onchange(e.value)); return e;
}
export function tabs(items, active, on) { return h('div', { class: 'tabs' }, items.map(([id, label]) => h('button', { class: 'tab' + (id === active ? ' active' : ''), 'data-tab': id, onclick: () => on(id) }, label))); }
export function download(name, text) { const a = h('a', { href: URL.createObjectURL(new Blob([text])), download: name }); a.click(); }
export const debounce = (fn, ms) => { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; };
