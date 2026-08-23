/* ================= ARENA DEMO MODE =================
   Fake in-browser backend, same interface as firebase-api.js.
   Season time-shifted to mid-GW17 (Split 4) — the exact stretch where
   fantasy leagues die — so you can see splits/duels/plays keeping it alive.
   You are Raj (admin). Resets on reload. */

function createDemoApi(){
  let _s = 47202627;
  const rnd = () => { _s |= 0; _s = _s + 0x6D2B79F5 | 0; let t = Math.imul(_s ^ _s >>> 15, 1 | _s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pickFrom = a => a[Math.floor(rnd() * a.length)];
  const NOW = Date.now();
  const ME = 'u-raj';

  /* ---- fixtures for both comps, weekend-spread + time-shifted ---- */
  const spread = [-2.5, 0, 0, 0, 0, 0, 2.5, 23, 23, 25.5].map(h => h * 3600e3);
  function prep(comp, raw){
    const base = raw.map((r, i) => ({ id: comp + '-' + (i + 1), comp, gw: r[0], kickoff: new Date(r[1].replace('Z', ':00Z')).getTime(), home: r[2], away: r[3] }));
    const byGw = {};
    base.forEach(f => (byGw[f.gw] = byGw[f.gw] || []).push(f));
    for (const g in byGw) if (new Set(byGw[g].map(f => f.kickoff)).size <= 1)
      byGw[g].sort((a,b)=>a.id<b.id?-1:1).forEach((f, i) => { f.kickoff += spread[i % 10] || 0; });
    return base;
  }
  const DEMO_COMPS = ['epl', 'liga', 'bund', 'seriea', 'ligue1'];
  const RAWD = { epl: FIXTURES_EPL, liga: FIXTURES_LALIGA, bund: FIXTURES_BUND, seriea: FIXTURES_SERIEA, ligue1: FIXTURES_LIGUE1 };
  const eplRaw = prep('epl', FIXTURES_EPL);
  // anchor: EPL GW17's Saturday-evening game kicked off 1h ago
  const anchor = eplRaw.filter(f => f.gw === 17).map(f => f.kickoff).sort((a, b) => a - b)[6];
  const offset = (NOW - 3600e3) - anchor;
  const fixtures = {};
  for (const c of DEMO_COMPS){
    const raw = c === 'epl' ? eplRaw : prep(c, RAWD[c]);
    fixtures[c] = raw.map(f => ({ ...f, kickoff: new Date(f.kickoff + offset).toISOString() }));
  }
  const allFx = DEMO_COMPS.flatMap(c => fixtures[c]);
  const fxById = {}; allFx.forEach(f => fxById[f.id] = f);
  const kicked = fid => Date.now() >= new Date(fxById[fid].kickoff).getTime();

  /* ---- players ---- */
  const roster = [
    ['u-raj', 'Raj', .47], ['u-dev', 'Dev', .45], ['u-sam', 'Sam', .41],
    ['u-jords', 'Jords', .38], ['u-moe', 'Moe', .35], ['u-vik', 'Vik', .43],
  ];
  const profiles = roster.map(([id, name], i) => ({ id, name, is_admin: id === ME, created_at: new Date(NOW - (40 - i) * 864e5).toISOString() }));

  /* ---- results for everything already kicked off ---- */
  const results = {};
  const G = () => { const r = rnd(); return r < .35 ? 0 : r < .70 ? 1 : r < .88 ? 2 : r < .97 ? 3 : 4; };
  for (const f of allFx) if (new Date(f.kickoff).getTime() < NOW) results[f.id] = { h: G(), a: G() };
  // the most recently kicked-off EPL game is still in play (demos the live layer)
  const liveFx = fixtures.epl.filter(f => new Date(f.kickoff).getTime() < NOW)
    .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff))[0];
  const liveScore = liveFx ? { h: results[liveFx.id].h, a: results[liveFx.id].a, minute: "64'", detail: '2nd Half' } : null;
  if (liveFx) delete results[liveFx.id];
  const outOf = fid => { const r = results[fid]; return !r ? null : r.h > r.a ? 'H' : r.h < r.a ? 'A' : 'D'; };

  /* ---- picks: everyone plays both comps up to current gw ---- */
  const picks = [];
  const wrongOf = { H: ['A', 'D', 'AD'], A: ['H', 'D', 'HD'], D: ['H', 'A'] };
  for (const comp of DEMO_COMPS){
    const maxGw = Math.max(...fixtures[comp].filter(f => new Date(f.kickoff).getTime() < NOW + 6 * 864e5).map(f => f.gw));
    for (const [uid, , skill] of roster){
      for (let gw = 1; gw <= maxGw; gw++){
        if (uid === 'u-sam' && comp === 'epl' && gw === 7) continue;   // Sam's lost weekend
        if (uid === 'u-moe' && comp === 'liga' && gw % 9 === 0) continue;
        const mine = [];
        for (const f of fixtures[comp].filter(x => x.gw === gw)){
          const out = outOf(f.id);
          let pick;
          if (out === null){ if (uid !== ME && rnd() < .4) continue; pick = pickFrom(['H','HD','D','AD','A']); }
          else if (rnd() < skill) pick = out;
          else if (rnd() < .40) pick = out === 'D' ? pickFrom(['HD','AD']) : (out === 'H' ? 'HD' : 'AD');
          else pick = pickFrom(wrongOf[out]);
          const row = { user_id: uid, fixture_id: f.id, comp, gw, pick, banker: false };
          mine.push(row); picks.push(row);
        }
        if (mine.length) pickFrom(mine).banker = true;
      }
    }
  }

  /* ---- plays history: splits 1-3 saw action; Raj has a full hand for split 4 ---- */
  const plays = [];
  for (const comp of ['epl']){
    for (const [uid] of roster){
      if (uid === ME) continue;
      for (let s = 1; s <= 3; s++){
        for (const kind of ['double', 'safety', 'oracle']){
          if (rnd() < .55){
            const gw = 5 * s - 4 + Math.floor(rnd() * 5);
            if (plays.some(p => p.user_id === uid && p.comp === comp && p.gw === gw)) continue;
            const play = { user_id: uid, comp, gw, play: kind };
            if (kind === 'double'){
              const mine = picks.filter(p => p.user_id === uid && p.comp === comp && p.gw === gw && !p.banker);
              if (!mine.length) continue;
              play.fixture_id = pickFrom(mine).fixture_id;
            }
            plays.push(play);
          }
        }
      }
    }
  }
  // Raj used exactly one play so far (oracle in split 2) — full hand for the live split
  plays.push({ user_id: ME, comp: 'epl', gw: 8, play: 'oracle' });

  /* ---- oracle aggregate counts (pre-kickoff pick distribution) ---- */
  function counts(){
    const c = {};
    for (const p of picks){ c[p.fixture_id] = c[p.fixture_id] || { H:0,A:0,D:0,HD:0,AD:0 }; c[p.fixture_id][p.pick]++; }
    return c;
  }

  const myRow = fid => picks.find(p => p.user_id === ME && p.fixture_id === fid);
  const assertOpen = fid => { if (kicked(fid)) throw new Error('Locked — the game has kicked off.'); };

  return {
    demo: true,
    async init(){ return ME; },
    async signUp(){ throw new Error('Demo mode — connect Firebase (SETUP.md) for real accounts.'); },
    async signIn(){ throw new Error('Demo mode — connect Firebase (SETUP.md) for real accounts.'); },
    async signInGoogle(){ throw new Error('Demo mode — connect Firebase (SETUP.md) for real accounts.'); },
    async signOut(){},
    async ensureProfile(){},
    async createPool(){ throw new Error('Demo mode — connect Firebase (SETUP.md) to make a real group.'); },
    async joinPool(){ throw new Error('Demo mode — connect Firebase (SETUP.md) to join a real group.'); },
    async setActivePool(){},
    async listPools(){ return [{ code: 'DEMO26', name: 'The Boys (demo)', adminUid: ME }]; },
    async updatePool(){ throw new Error('Demo mode — group settings work once Firebase is connected.'); },
    async removeMember(){ throw new Error('Demo mode — member management works once Firebase is connected.'); },
    async leavePool(){ throw new Error('Demo mode.'); },
    async load(){
      const visible = picks.filter(p => p.user_id === ME || kicked(p.fixture_id));
      return {
        profiles: JSON.parse(JSON.stringify(profiles)),
        picks: JSON.parse(JSON.stringify(visible)),
        results: JSON.parse(JSON.stringify(results)),
        plays: JSON.parse(JSON.stringify(plays)),
        counts: counts(),
        adminUid: ME, seeded: true, uid: ME, myName: 'Raj', comps: DEMO_COMPS.slice(),
        pool: { code: 'DEMO26', name: 'The Boys (demo)', adminUid: ME,
                settings: { duels: true, bold: true, plays: true, perfect: true, locked: false } },
        myPools: ['DEMO26'],
        overrides: Object.fromEntries(allFx.map(f => [f.id, f.kickoff])), // time-shifted season
      };
    },
    async savePick(fid, pick, banker){
      assertOpen(fid);
      const r = myRow(fid);
      if (r){ r.pick = pick; r.banker = !!banker; }
      else picks.push({ user_id: ME, fixture_id: fid, comp: fxById[fid].comp, gw: fxById[fid].gw, pick, banker: !!banker });
    },
    async clearPick(fid){
      assertOpen(fid);
      const i = picks.findIndex(p => p.user_id === ME && p.fixture_id === fid);
      if (i >= 0) picks.splice(i, 1);
    },
    async setBanker(fid, pick, oldFid){
      assertOpen(fid);
      if (oldFid){ assertOpen(oldFid); const o = myRow(oldFid); if (o) o.banker = false; }
      const r = myRow(fid);
      if (!r) throw new Error('Make a pick on that game first.');
      r.banker = true;
    },
    async clearBanker(fid){ assertOpen(fid); const r = myRow(fid); if (r) r.banker = false; },
    async usePlay(p){
      if (fixturesEveryKicked(p.comp, p.gw)) throw new Error('That gameweek is locked.');
      if (p.fixture_id) assertOpen(p.fixture_id);
      plays.push({ user_id: ME, ...p });
    },
    async saveResults(comp, gw, rows){
      for (const fid in rows){
        if (!kicked(fid)) throw new Error('That game has not kicked off yet.');
        results[fid] = { h: rows[fid].h, a: rows[fid].a };
      }
    },
    async syncResults(comp){
      // demo: pretend the feed answered for any finished-but-unentered games
      const found = {};
      for (const f of fixtures[comp]) if (kicked(f.id) && !results[f.id]){ results[f.id] = { h: G(), a: G() }; found[f.id] = results[f.id]; }
      return found;
    },
    async reschedule(fid, iso){ fxById[fid].kickoff = iso; },
    async seedFixtures(){},
    async autoSync(){ return { finals: {}, live: liveFx ? { [liveFx.id]: liveScore } : {}, kicks: {},
      report: { at: Date.now(), events: 1, comps: 1, ok: true } }; },
    async clearPlay(comp, gw){
      const i = plays.findIndex(p => p.user_id === ME && p.comp === comp && p.gw === gw);
      if (i >= 0) plays.splice(i, 1);
    },
    googlePhoto(){ return null; },
    async exportBackup(){
      return { format: 'primepicks-arena-backup', version: 1, exported: new Date().toISOString(),
        demo: true, pool: { code: 'DEMO26', name: 'The Boys (demo)' },
        resultsGw: { note: 'demo backup — connect Firebase for the real thing' } };
    },
    async updateProfile(name, avatar){
      const p = profiles.find(x => x.id === ME);
      if (p){ p.name = name; p.avatar = avatar; }
    },
    onChange(){},
  };
  function fixturesEveryKicked(comp, gw){ return fixtures[comp].filter(f => f.gw === gw).every(f => kicked(f.id)); }
}

