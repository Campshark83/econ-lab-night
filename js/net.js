// Sync layer. Same API over Firebase Realtime Database or a local mock
// (localStorage + BroadcastChannel) used for offline testing with ?mock=1.

import { FIREBASE_CONFIG } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

export async function createNet() {
  const forceMock = new URLSearchParams(location.search).has('mock');
  if (!forceMock && FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL) {
    return firebaseNet();
  }
  return mockNet();
}

async function firebaseNet() {
  const app = await import(`${SDK}/firebase-app.js`);
  const db = await import(`${SDK}/firebase-database.js`);
  const fb = app.initializeApp(FIREBASE_CONFIG);
  const d = db.getDatabase(fb);
  let offset = 0;
  db.onValue(db.ref(d, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });
  let connected = true;
  const connListeners = new Set();
  db.onValue(db.ref(d, '.info/connected'), s => {
    connected = !!s.val();
    connListeners.forEach(f => f(connected));
  });
  const r = p => db.ref(d, p);
  return {
    kind: 'firebase',
    serverNow: () => Date.now() + offset,
    onConnection: f => { connListeners.add(f); f(connected); return () => connListeners.delete(f); },
    subscribe(path, cb) { return db.onValue(r(path), s => cb(s.val())); },
    get: async path => (await db.get(r(path))).val(),
    set: (path, v) => db.set(r(path), v),
    update: (path, v) => db.update(r(path), v),
    remove: path => db.remove(r(path)),
    async transaction(path, fn) {
      const res = await db.runTransaction(r(path), cur => fn(cur));
      return res.committed;
    },
    onDisconnectUpdate: (path, v) => db.onDisconnect(r(path)).update(v),
  };
}

function mockNet() {
  const KEY = 'eln-mock-db';
  const chan = 'BroadcastChannel' in window ? new BroadcastChannel('eln-mock') : null;
  const subs = new Set();
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const parts = p => p.split('/').filter(Boolean);
  const getAt = (obj, p) => parts(p).reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const clean = v => (v === undefined ? null : JSON.parse(JSON.stringify(v ?? null)));
  function setAt(obj, p, v) {
    const ks = parts(p);
    let o = obj;
    for (let i = 0; i < ks.length - 1; i++) {
      if (typeof o[ks[i]] !== 'object' || o[ks[i]] === null) o[ks[i]] = {};
      o = o[ks[i]];
    }
    const last = ks[ks.length - 1];
    if (v === null || v === undefined) delete o[last]; else o[last] = v;
  }
  function write(mut) {
    const db = load();
    mut(db);
    localStorage.setItem(KEY, JSON.stringify(db));
    notify();
    chan && chan.postMessage('change');
  }
  function notify() {
    const db = load();
    subs.forEach(s => s.cb(clean(getAt(db, s.path))));
  }
  chan && (chan.onmessage = notify);
  window.addEventListener('storage', e => { if (e.key === KEY) notify(); });
  return {
    kind: 'mock',
    serverNow: () => Date.now(),
    onConnection: f => { f(true); return () => {}; },
    subscribe(path, cb) {
      const s = { path, cb };
      subs.add(s);
      setTimeout(() => cb(clean(getAt(load(), path))), 0);
      return () => subs.delete(s);
    },
    get: async path => clean(getAt(load(), path)),
    set: async (path, v) => write(db => setAt(db, path, clean(v))),
    update: async (path, v) => write(db => {
      for (const [k, val] of Object.entries(v)) setAt(db, `${path}/${k}`, clean(val));
    }),
    remove: async path => write(db => setAt(db, path, null)),
    async transaction(path, fn) {
      let committed = false;
      write(db => {
        const next = fn(clean(getAt(db, path)));
        if (next !== undefined) { setAt(db, path, clean(next)); committed = true; }
      });
      return committed;
    },
    onDisconnectUpdate: async () => {},
  };
}
