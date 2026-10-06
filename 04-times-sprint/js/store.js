// Store — named profiles saved on this device: settings, learning model and the full sprint log.
//
// localStorage (small, read synchronously at start-up)
//   timesSprint.profiles       { v, lastId, profiles: [{ id, name, createdAt, settings }] }
//   timesSprint.model.<id>     Brain model for that profile
// IndexedDB "timesSprint" → store "sprints" (grows forever, so it needs IndexedDB's room)
//   { id, profileId, ...sprint log } — every card, every attempt, with timestamps
const Store = (() => {
  const INDEX_KEY = 'timesSprint.profiles';
  const LEGACY_KEY = 'timesSprint.v2'; // single-player save from before profiles
  const modelKey = id => `timesSprint.model.${id}`;

  const DEFAULT_SETTINGS = {
    sprintSecs: 120,
    maxTries: 3,      // wrong answers allowed before the answer is shown
    sound: true,
    hints: true,      // "↑ bigger / ↓ smaller" after a wrong answer
    disabled: [],     // fact keys like "7x8" switched off for this player
  };
  const SPRINT_CHOICES = [30, 60, 120, 180, 300];
  const TRIES_CHOICES = [1, 2, 3, 4, 5];
  const ALL_KEYS = [];
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) ALL_KEYS.push(`${a}x${b}`);

  let index = { v: 1, lastId: null, profiles: [] };

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // Returns false when the browser refuses (private mode, storage full).
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  function drop(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  const saveIndex = () => write(INDEX_KEY, index);
  const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function init() {
    const saved = read(INDEX_KEY);
    if (saved && Array.isArray(saved.profiles)) {
      index = saved;
    } else {
      // First run with profiles: move any earlier single-player progress into "Player 1".
      const legacy = read(LEGACY_KEY);
      if (legacy && legacy.cards) {
        const p = create('Player 1', { sound: !legacy.muted });
        write(modelKey(p.id), Brain.upgrade(legacy));
        drop(LEGACY_KEY);
      }
      saveIndex();
    }
    // Settings added in later versions get their defaults.
    index.profiles.forEach(p => { p.settings = { ...DEFAULT_SETTINGS, ...p.settings }; });
  }

  const list = () => index.profiles;
  const get = id => index.profiles.find(p => p.id === id) || null;
  const current = () => get(index.lastId) || index.profiles[0] || null;

  function select(id) {
    index.lastId = id;
    saveIndex();
  }

  function create(name, settings = {}) {
    const p = { id: newId(), name, createdAt: Date.now(), settings: { ...DEFAULT_SETTINGS, ...settings } };
    index.profiles.push(p);
    index.lastId = p.id;
    saveIndex();
    return p;
  }

  function update(id, name, settings) {
    const p = get(id);
    if (!p) return null;
    p.name = name;
    p.settings = { ...p.settings, ...settings };
    saveIndex();
    return p;
  }

  function remove(id) {
    index.profiles = index.profiles.filter(p => p.id !== id);
    if (index.lastId === id) index.lastId = index.profiles.length ? index.profiles[0].id : null;
    drop(modelKey(id));
    clearHistory(id);
    saveIndex();
  }

  const loadModel = id => Brain.upgrade(read(modelKey(id)));
  const saveModel = (id, model) => write(modelKey(id), model);
  const resetModel = id => drop(modelKey(id));

  // ── Sprint history (IndexedDB) ───────────────────────
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('timesSprint', 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('sprints', { keyPath: 'id' }).createIndex('profileId', 'profileId');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  // Runs fn(store) in a transaction; resolves with the result of the request fn returns, if any.
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction('sprints', mode);
      const req = fn(t.objectStore('sprints'));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = t.onabort = () => reject(t.error);
    });
  }

  // Oldest first. Resolves to [] if storage is unavailable.
  const loadHistory = id => tx('readonly', s => s.index('profileId').getAll(id))
    .then(rows => rows.sort((x, y) => x.startedAt - y.startedAt))
    .catch(() => []);

  // Resolves true once the sprint is safely stored.
  let askedPersist = false;
  function addSprint(id, log) {
    return tx('readwrite', s => { s.put({ ...log, profileId: id }); }).then(() => {
      // Ask the browser not to evict this data under storage pressure (secure origins only).
      if (!askedPersist && navigator.storage && navigator.storage.persist) {
        askedPersist = true;
        navigator.storage.persist().catch(() => {});
      }
      return true;
    }, () => false);
  }

  function clearHistory(id) {
    return tx('readwrite', s => {
      const req = s.index('profileId').openKeyCursor(IDBKeyRange.only(id));
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) { s.delete(cur.primaryKey); cur.continue(); }
      };
    }).catch(() => {});
  }

  function enabledKeys(settings) {
    const off = new Set(settings.disabled || []);
    return ALL_KEYS.filter(k => !off.has(k));
  }

  return {
    DEFAULT_SETTINGS, SPRINT_CHOICES, TRIES_CHOICES, ALL_KEYS,
    init, list, get, current, select, create, update, remove,
    loadModel, saveModel, resetModel, loadHistory, addSprint, clearHistory,
    enabledKeys,
  };
})();
