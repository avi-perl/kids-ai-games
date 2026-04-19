const UserDB = (() => {
  const KU = 'hj_users', KS = 'hj_scores', KC = 'hj_current';
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  return {
    users()       { return load(KU, []); },
    current()     { return load(KC, null); },
    setCurrent(n) { save(KC, n); },
    addUser(name) {
      const list = this.users();
      if (!list.some(u => u.name === name)) list.push({ name, createdAt: Date.now() });
      save(KU, list);
      this.setCurrent(name);
    },
    // Saves a score entry and returns it (with playedAt set)
    addScore({ name, score, distance, airtime, boops }) {
      const entry = { name, score, distance, airtime, boops, playedAt: Date.now() };
      const list  = load(KS, []);
      list.push(entry);
      list.sort((a, b) => b.score - a.score);
      if (list.length > 100) list.length = 100;
      save(KS, list);
      return entry;
    },
    scores(n = 20) { return load(KS, []).slice(0, n); },
    rank(entry) {
      const i = load(KS, []).findIndex(
        s => s.name === entry.name && s.score === entry.score && s.playedAt === entry.playedAt
      );
      return i >= 0 ? i + 1 : null;
    },
  };
})();

let currentUser = UserDB.current();

const SB_KEY = 'sb_publishable_p6YpYEk1sDGkXtor_YtkOA_QgHrsEH4';
const SB_URL = 'https://xdxeahnkmdfwzxvgmnvq.supabase.co';

async function sbPostScore(entry) {
  try {
    await fetch(`${SB_URL}/rest/v1/scores`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name:      entry.name,
        score:     entry.score,
        distance:  entry.distance,
        airtime:   entry.airtime,
        boops:     entry.boops,
        played_at: new Date(entry.playedAt).toISOString(),
      }),
    });
  } catch {}
}

async function sbFetchScores(n = 50) {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/scores?select=name,score,distance,airtime,boops,played_at&order=score.desc&limit=${n}`,
      { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows.map(r => ({
      name:     r.name,
      score:    r.score,
      distance: r.distance,
      airtime:  r.airtime,
      boops:    r.boops,
      playedAt: new Date(r.played_at).getTime(),
    }));
  } catch { return null; }
}

async function sbNameTaken(name) {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/scores?select=name&name=ilike.${encodeURIComponent(name)}&limit=1`,
      { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
    );
    if (!res.ok) return false;
    const rows = await res.json();
    return rows.length > 0;
  } catch { return false; }
}
