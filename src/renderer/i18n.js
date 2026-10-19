// Tiny i18n: English source strings are the keys; Swedish / Arabic in i18n-data.js. Arabic switches the UI to RTL.
import { DICT } from './i18n-data.js';
let lang = 'en';
export function setLang(l) { lang = DICT[l] || l === 'en' ? l : 'en'; document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; }
export const getLang = () => lang;
export function t(s, vars) { let r = (lang !== 'en' && DICT[lang] && DICT[lang][s]) || s; if (vars) for (const [k, v] of Object.entries(vars)) r = r.replaceAll('{' + k + '}', v); return r; }
export function missing(l) { return Object.keys(DICT.sv || {}).filter((k) => !DICT[l] || !DICT[l][k]); }
