import { FIREBASE_CONFIG } from './firebase-config.js';

const hasFirebase = !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL);
export const mode = hasFirebase ? 'firebase' : 'local';
let impl;

if (hasFirebase) {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const { getDatabase, ref, set, update, onValue, get } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
  const db = getDatabase(initializeApp(FIREBASE_CONFIG));
  impl = {
    set: (p, v) => set(ref(db, p), v),
    update: (p, o) => update(ref(db, p), o),
    get: async p => (await get(ref(db, p))).val(),
    on: (p, cb) => onValue(ref(db, p), s => cb(s.val()))
  };
} else {
  const KEY = 'is_local_db';
  const bc = new BroadcastChannel('is_local');
  const subs = new Set();
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = d => localStorage.setItem(KEY, JSON.stringify(d));
  const parts = p => p.split('/').filter(Boolean);
  const getAt = (d, p) => parts(p).reduce((o, k) => (o == null ? undefined : o[k]), d);
  const setAt = (d, p, v) => {
    const ks = parts(p); let o = d;
    for (let i = 0; i < ks.length - 1; i++) { if (typeof o[ks[i]] !== 'object' || o[ks[i]] === null) o[ks[i]] = {}; o = o[ks[i]]; }
    const last = ks[ks.length - 1];
    if (v === null || v === undefined || (Array.isArray(v) && !v.length)) delete o[last];
    else o[last] = JSON.parse(JSON.stringify(v));
  };
  const emit = () => { const d = load(); subs.forEach(s => s.cb(structuredClone(getAt(d, s.p) ?? null))); };
  const changed = () => { bc.postMessage(1); setTimeout(emit, 0); };
  bc.onmessage = () => setTimeout(emit, 0);
  impl = {
    set: async (p, v) => { const d = load(); setAt(d, p, v); save(d); changed(); },
    update: async (p, o) => { const d = load(); for (const k in o) setAt(d, p + '/' + k, o[k]); save(d); changed(); },
    get: async p => structuredClone(getAt(load(), p) ?? null),
    on: (p, cb) => { const s = { p, cb }; subs.add(s); setTimeout(() => cb(structuredClone(getAt(load(), p) ?? null)), 0); return () => subs.delete(s); }
  };
}

export const store = impl;
