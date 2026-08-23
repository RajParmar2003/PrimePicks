/* ================= ARENA — Firebase data layer (groups edition) =================
   Firestore layout:
     pools/{CODE}         {name, adminUid, comps, createdAt, members:{uid:{name,joinedAt}}}
     users/{uid}          {pools:[CODE], active:CODE}
     poolAdmins/{uid}     {pool:CODE}                       — registry for shared-fact writes
     fixtures/{fid}       {comp, gw, kickoff(Ts), home, away}
     meta/overrides       {fid: kickoffISO}
     profiles/{uid}       {name, createdAt}
     myPicks/{uid}        {fid:{pick,banker}}               — private mirror
     picksByFixture/{fid} {uid:{pick,banker}}               — revealed at kickoff by rules
     resultsGw/{comp-gw}  {fid:{h,a}}
     plays/{uid}          {"comp-gw":{play,fixture_id?}}
     counts/{fid}         {H,A,D,HD,AD}                     — Oracle aggregate */

function createFirebaseApi(){
  firebase.initializeApp(FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db = firebase.firestore();
  // offline persistence: pending writes are journaled to IndexedDB, so a pick made just
  // before the app is closed/killed is replayed automatically on the next open — nothing lost.
  // Must be called before any other Firestore use; degrades silently where unsupported.
  try { db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch(e){}
  const FV = firebase.firestore.FieldValue;
  let uid = null, myName = 'Player';

  const RAW = { epl: () => FIXTURES_EPL, liga: () => FIXTURES_LALIGA, bund: () => FIXTURES_BUND,
                seriea: () => FIXTURES_SERIEA, ligue1: () => FIXTURES_LIGUE1 };
  const FEED = { epl: 'epl-2026', liga: 'la-liga-2026', bund: 'bundesliga-2026', seriea: 'serie-a-2026', ligue1: 'ligue-1-2026' };
  const ESPN_CODE = { epl: 'eng.1', liga: 'esp.1', bund: 'ger.1', seriea: 'ita.1', ligue1: 'fra.1' };
  const baseFixtures = comp => RAW[comp]().map((r, i) => ({ id: comp+'-'+(i+1), comp, gw: r[0],
    kickoff: new Date(r[1].replace('Z', ':00Z')).toISOString(), home: r[2], away: r[3] }));

  const CK = 'arena_pbf_v1';
  const cacheGet = () => { try{ return JSON.parse(localStorage.getItem(CK)) || {}; }catch(e){ return {}; } };
  const cachePut = c => { try{ localStorage.setItem(CK, JSON.stringify(c)); }catch(e){} };

  async function loadProfileName(){
    try{ const s = await db.doc('profiles/'+uid).get(); if (s.exists) myName = s.data().name; }catch(e){}
  }
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
  const newCode = () => [...Array(6)].map(() => CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join('');

  return {
    demo: false,

    async init(){
      // complete a redirect-based Google sign-in if we're returning from one
      try{
        const rr = await auth.getRedirectResult();
        if (rr && rr.user){
          const prof = await db.doc('profiles/'+rr.user.uid).get();
          if (!prof.exists) await db.doc('profiles/'+rr.user.uid).set({
            name: (rr.user.displayName || 'Player').split(' ')[0].slice(0, 20), createdAt: FV.serverTimestamp() });
        }
      }catch(e){}
      const user = await new Promise(res => { const off = auth.onAuthStateChanged(u => { off(); res(u); }); });
      uid = user ? user.uid : null;
      if (uid) await loadProfileName();
      return uid;
    },

    async signUp(email, pass, name){
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      uid = cred.user.uid; myName = name;
      await db.doc('profiles/'+uid).set({ name, createdAt: FV.serverTimestamp() });
    },
    async signIn(email, pass){ const c = await auth.signInWithEmailAndPassword(email, pass); uid = c.user.uid; await loadProfileName(); },
    async signInGoogle(){
      let c;
      try{ c = await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
      catch(e){
        // in-app browsers (WhatsApp/Instagram/Messenger webviews) block popups —
        // fall back to full-page redirect so invite links from the group chat still work
        const code = String(e.code || '');
        if (code.includes('popup-blocked') || code.includes('operation-not-supported') || code.includes('cancelled-popup-request')){
          await auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider());
          return; // page navigates away; init() completes the sign-in on return
        }
        throw e;
      }
      uid = c.user.uid;
      const prof = await db.doc('profiles/'+uid).get();
      if (!prof.exists){
        myName = (c.user.displayName || 'Player').split(' ')[0].slice(0, 20);
        await db.doc('profiles/'+uid).set({ name: myName, createdAt: FV.serverTimestamp() });
      } else myName = prof.data().name;
    },
    async signOut(){ await auth.signOut(); },
    async ensureProfile(name){ myName = name; await db.doc('profiles/'+uid).set({ name, createdAt: FV.serverTimestamp() }, { merge:true }); },

    /* ---- groups ---- */
    async createPool(name, comps){
      let code = newCode();
      for (let tries = 0; tries < 4; tries++){
        const clash = await db.doc('pools/'+code).get();
        if (!clash.exists) break;
        code = newCode();
      }
      await db.doc('pools/'+code).set({
        name: name.slice(0, 30), adminUid: uid, comps: (comps && comps.length ? comps : ['epl']),
        createdAt: FV.serverTimestamp(),
        settings: { duels: true, bold: true, plays: true, perfect: true, locked: false },
        members: { [uid]: { name: myName, joinedAt: Date.now() } },
      });
      await db.doc('poolAdmins/'+uid).set({ pool: code });
      await db.doc('users/'+uid).set({ pools: FV.arrayUnion(code), active: code }, { merge:true });
      return code;
    },
    async joinPool(code){
      code = code.trim().toUpperCase();
      const snap = await db.doc('pools/'+code).get();
      if (!snap.exists) throw new Error('No group found with that code — check it with whoever made the group.');
      if (snap.data().settings && snap.data().settings.locked && snap.data().adminUid !== uid)
        throw new Error('That group is locked — ask the admin to unlock it in group settings.');
      await db.doc('pools/'+code).set({ members: { [uid]: { name: myName, joinedAt: Date.now() } } }, { merge:true });
      await db.doc('users/'+uid).set({ pools: FV.arrayUnion(code), active: code }, { merge:true });
      return code;
    },
    async setActivePool(code){ await db.doc('users/'+uid).set({ active: code }, { merge:true }); },
    async listPools(codes){
      const snaps = await Promise.all((codes || []).map(c => db.doc('pools/'+c).get().catch(() => null)));
      return snaps.map((s, i) => s && s.exists ? { code: codes[i], name: s.data().name, adminUid: s.data().adminUid } : null).filter(Boolean);
    },
    async updatePool(code, patch){ await db.doc('pools/'+code).set(patch, { merge:true }); },
    async removeMember(code, memberUid){
      await db.doc('pools/'+code).update({ ['members.'+memberUid]: FV.delete() });
    },
    async leavePool(code){
      await db.doc('pools/'+code).update({ ['members.'+uid]: FV.delete() });
      await db.doc('users/'+uid).set({ pools: FV.arrayRemove(code), active: FV.delete() }, { merge:true });
    },

    async load(){
      const userSnap = await db.doc('users/'+uid).get();
      const u = userSnap.exists ? userSnap.data() : null;
      if (!u || !u.pools || !u.pools.length)
        return { noPool: true, uid, myName };
      const active = u.active && u.pools.includes(u.active) ? u.active : u.pools[0];

      const [poolSnap, ovSnap, resSnap, mineSnap, playsSnap] = await Promise.all([
        db.doc('pools/'+active).get(),
        db.doc('meta/overrides').get(),
        db.collection('resultsGw').get(),
        db.doc('myPicks/'+uid).get(),
        db.collection('plays').get(),
      ]);
      if (!poolSnap.exists) return { noPool: true, uid, myName };
      // removed from this group? don't crash into a half-loaded state — send them to the
      // group gate (they can rejoin with the code or switch to another of their groups)
      if (!poolSnap.data().members || !poolSnap.data().members[uid]){
        const others = u.pools.filter(c => c !== active);
        if (others.length){ await db.doc('users/'+uid).set({ active: others[0] }, { merge:true }); return this.load(); }
        return { noPool: true, uid, myName };
      }
      const pool = { code: active, ...poolSnap.data() };
      const comps = pool.comps || ['epl','liga'];
      const seeded = ovSnap.exists;
      const overrides = ovSnap.exists ? ovSnap.data() : {};
      const memberIds = Object.keys(pool.members || {});
      const profiles = memberIds.map(id => ({ id, name: pool.members[id].name, avatar: pool.members[id].avatar || '',
        is_admin: id === pool.adminUid,
        created_at: '' + (pool.members[id].joinedAt || 0) })).sort((a,b) => a.created_at < b.created_at ? -1 : 1);

      const results = {};
      resSnap.docs.forEach(d => { const m = d.data(); for (const fid in m) results[fid] = m[fid]; });
      const plays = [];
      playsSnap.docs.forEach(d => {
        if (!memberIds.includes(d.id)) return; // only this group's plays matter
        const m = d.data();
        for (const key in m){
          const dash = key.lastIndexOf('-');
          plays.push({ user_id: d.id, comp: key.slice(0, dash), gw: +key.slice(dash+1), play: m[key].play, fixture_id: m[key].fixture_id || undefined });
        }
      });

      const fixturesAll = [];
      for (const c of comps) for (const f of baseFixtures(c))
        fixturesAll.push(overrides[f.id] ? { ...f, kickoff: overrides[f.id] } : f);
      const byId = {}; fixturesAll.forEach(f => byId[f.id] = f);
      const kicked = f => Date.now() >= new Date(f.kickoff).getTime();

      const picks = [];
      const mine = mineSnap.exists ? mineSnap.data() : {};
      const cache = cacheGet();
      const byFid = {};
      const need = fixturesAll.filter(f => kicked(f) && !cache[f.id]);
      const fetched = await Promise.all(need.map(f => db.doc('picksByFixture/'+f.id).get().catch(() => null)));
      fetched.forEach((s, i) => { if (s && s.exists) byFid[need[i].id] = s.data(); });
      let dirty = false;
      for (const f of fixturesAll){
        if (cache[f.id]) byFid[f.id] = cache[f.id];
        else if (byFid[f.id] && results[f.id]){ cache[f.id] = byFid[f.id]; dirty = true; }
      }
      if (dirty) cachePut(cache);
      const seen = {};
      for (const fid in byFid) for (const u2 in byFid[fid]){
        if (!memberIds.includes(u2)) continue; // scope picks to this group
        const e = byFid[fid][u2];
        picks.push({ user_id: u2, fixture_id: fid, comp: byId[fid].comp, gw: byId[fid].gw, pick: e.pick, banker: !!e.banker });
        seen[u2+'|'+fid] = 1;
      }
      for (const fid in mine) if (!seen[uid+'|'+fid] && byId[fid])
        picks.push({ user_id: uid, fixture_id: fid, comp: byId[fid].comp, gw: byId[fid].gw, pick: mine[fid].pick, banker: !!mine[fid].banker });

      const counts = {};
      const myOracles = plays.filter(p => p.user_id === uid && p.play === 'oracle');
      const needCount = fixturesAll.filter(f => !kicked(f) && myOracles.some(o => o.comp === f.comp && o.gw === f.gw));
      const cSnaps = await Promise.all(needCount.map(f => db.doc('counts/'+f.id).get().catch(() => null)));
      cSnaps.forEach((s, i) => { if (s && s.exists) counts[needCount[i].id] = s.data(); });

      return { profiles, picks, results, plays, counts, seeded, uid, comps, overrides,
               pool: { code: pool.code, name: pool.name, adminUid: pool.adminUid,
                       settings: Object.assign({ duels:true, bold:true, plays:true, perfect:true, locked:false }, pool.settings || {}) },
               myPools: u.pools, adminUid: pool.adminUid };
    },

    async savePick(fid, pick, banker){
      const old = await db.doc('myPicks/'+uid).get().then(s => s.exists ? (s.data()[fid] || null) : null).catch(() => null);
      const b = db.batch();
      b.set(db.doc('myPicks/'+uid), { [fid]: { pick, banker: !!banker } }, { merge:true });
      b.set(db.doc('picksByFixture/'+fid), { [uid]: { pick, banker: !!banker } }, { merge:true });
      const inc = {}; inc[pick] = FV.increment(1);
      if (old && old.pick !== pick) inc[old.pick] = FV.increment(-1);
      if (!old || old.pick !== pick) b.set(db.doc('counts/'+fid), inc, { merge:true });
      await b.commit();
    },
    async clearPick(fid){
      const old = await db.doc('myPicks/'+uid).get().then(s => s.exists ? (s.data()[fid] || null) : null).catch(() => null);
      const b = db.batch();
      b.set(db.doc('myPicks/'+uid), { [fid]: FV.delete() }, { merge:true });
      b.set(db.doc('picksByFixture/'+fid), { [uid]: FV.delete() }, { merge:true });
      if (old) b.set(db.doc('counts/'+fid), { [old.pick]: FV.increment(-1) }, { merge:true });
      await b.commit();
    },
    async setBanker(fid, pick, oldFid, oldPick){
      const b = db.batch();
      if (oldFid){
        b.set(db.doc('myPicks/'+uid), { [oldFid]: { pick: oldPick, banker: false } }, { merge:true });
        b.set(db.doc('picksByFixture/'+oldFid), { [uid]: { pick: oldPick, banker: false } }, { merge:true });
      }
      b.set(db.doc('myPicks/'+uid), { [fid]: { pick, banker: true } }, { merge:true });
      b.set(db.doc('picksByFixture/'+fid), { [uid]: { pick, banker: true } }, { merge:true });
      await b.commit();
    },
    async clearBanker(fid, pick){
      const b = db.batch();
      b.set(db.doc('myPicks/'+uid), { [fid]: { pick, banker: false } }, { merge:true });
      b.set(db.doc('picksByFixture/'+fid), { [uid]: { pick, banker: false } }, { merge:true });
      await b.commit();
    },

    async usePlay({ comp, gw, play, fixture_id }){
      const entry = { play }; if (fixture_id) entry.fixture_id = fixture_id;
      await db.doc('plays/'+uid).set({ [comp+'-'+gw]: entry }, { merge:true });
    },
    async clearPlay(comp, gw){
      await db.doc('plays/'+uid).set({ [comp+'-'+gw]: FV.delete() }, { merge:true });
    },
    googlePhoto(){ return auth.currentUser && auth.currentUser.photoURL ? auth.currentUser.photoURL : null; },
    async updateProfile(name, avatar, poolCode){
      myName = name;
      await db.doc('profiles/'+uid).set({ name, avatar: avatar || '' }, { merge:true });
      if (poolCode) await db.doc('pools/'+poolCode).update({
        ['members.'+uid+'.name']: name, ['members.'+uid+'.avatar']: avatar || '' });
    },

    async saveResults(comp, gw, rows){
      await db.doc('resultsGw/'+comp+'-'+gw).set(rows, { merge:true });
    },

    /* ---- automatic results: ESPN public scoreboard (CORS-open, ~1 min delay) ----
       Runs on every app load for every user. Finals are persisted by admins,
       overlaid locally for everyone else. Live games returned for display only. */
    async autoSync({ fixturesAll, results, isAdmin }){
      const now = Date.now(), H = 3600e3;
      // scores: kicked without a result in the last 4 days, or kicking off within 12h
      const wanted = fixturesAll.filter(f => {
        const t = new Date(f.kickoff).getTime();
        return (t <= now && !results[f.id] && now - t < 96 * H) || (t > now && t - now < 12 * H);
      });
      // reschedule watch: everything we THINK happens in the next 30 days
      // (cup clashes, weather, TV moves — corrections land well before they matter)
      const upcoming = fixturesAll.filter(f => {
        const t = new Date(f.kickoff).getTime();
        return t > now && t - now < 30 * 24 * H;
      });
      if (!wanted.length && !upcoming.length)
        return { finals: {}, live: {}, kicks: {}, report: { at: Date.now(), events: 0, comps: 0, ok: true, idle: true } };
      const comps = [...new Set([...wanted, ...upcoming].map(f => f.comp))];
      const events = [];
      const grab = async (comp, datesParam) => {
        try{
          const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/'+ESPN_CODE[comp]+'/scoreboard?dates='+datesParam);
          if (!r.ok) return;
          const j = await r.json();
          for (const e of (j.events || [])){
            const c = e.competitions && e.competitions[0]; if (!c) continue;
            const home = c.competitors.find(t => t.homeAway === 'home'), away = c.competitors.find(t => t.homeAway === 'away');
            if (!home || !away) continue;
            events.push({ comp, kick: new Date(e.date).getTime(), state: e.status.type.state,
              completed: !!e.status.type.completed, minute: e.status.displayClock, detail: e.status.type.shortDetail,
              hName: home.team.displayName, aName: away.team.displayName, h: +home.score, a: +away.score });
          }
        }catch(err){ /* source down → other layers cover */ }
      };
      const ymd = t => new Date(t).toISOString().slice(0,10).replace(/-/g,'');
      for (const comp of comps){
        const w = wanted.filter(f => f.comp === comp);
        if (w.length){
          // one RANGE query covers all pending results ±1 day — robust even if our
          // stored kickoff dates are off (feed timezone bugs, TV moves we missed)
          const times = w.map(f => new Date(f.kickoff).getTime());
          await grab(comp, ymd(Math.min(...times) - 24*H) + '-' + ymd(now + 24*H));
        }
        if (upcoming.some(f => f.comp === comp)){
          // two range queries per league cover the 30-day reschedule window
          await grab(comp, ymd(now) + '-' + ymd(now + 15*24*H));
          await grab(comp, ymd(now + 15*24*H) + '-' + ymd(now + 30*24*H));
        }
      }
      if (!events.length) return { finals: {}, live: {}, kicks: {}, report: { at: Date.now(), events: 0, comps: comps.length, ok: false } };
      // fuzzy pair-matching: normalized token overlap on BOTH teams + kickoff within 3h
      const ALIAS = { man:'manchester', utd:'united', nottm:'nottingham', spurs:'tottenham', wolves:'wolverhampton' };
      const STOP = new Set(['fc','cf','afc','cd','ud','rcd','rc','ca','de','la','club','sc','cp']);
      const toks = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,' ')
        .split(/\s+/).filter(w => w && !STOP.has(w)).map(w => ALIAS[w] || w);
      const overlap = (x, y) => { const a = toks(x), b = new Set(toks(y)); return a.filter(w => b.has(w)).length; };
      const finals = {}, live = {}, kicks = {};
      for (const f of wanted){
        const t = new Date(f.kickoff).getTime();
        // match primarily by BOTH team names (unique within the window); kickoff time is a
        // tiebreaker, not a gate — a wrong stored time can no longer hide a real result
        let best = null, bestScore = 0, bestDt = Infinity;
        for (const e of events){
          if (e.comp !== f.comp) continue;
          const s = overlap(e.hName, f.home) + overlap(e.aName, f.away);
          const dt = Math.abs(e.kick - t);
          if (s > bestScore || (s === bestScore && s > 0 && dt < bestDt)){ bestScore = s; best = e; bestDt = dt; }
        }
        if (!best) continue;
        const confident = bestScore >= 2 || (bestScore >= 1 && bestDt <= 3 * H);
        if (!confident) continue;
        if (best.completed){
          finals[f.id] = { h: best.h, a: best.a };
          // self-heal the stored kickoff from the source of truth
          if (bestDt > 20 * 60e3 && bestDt < 21 * 24 * H) kicks[f.id] = new Date(best.kick).toISOString();
        }
        else if (best.state === 'in') live[f.id] = { h: best.h, a: best.a, minute: best.minute, detail: best.detail };
        else if (best.state === 'pre' && best.kick > now + 30 * 60e3 && bestScore >= 2){
          // our data says this game already kicked off, ESPN says it's in the FUTURE:
          // it was moved/postponed — heal the date so it stops showing as locked/awaiting
          kicks[f.id] = new Date(best.kick).toISOString();
        }
      }
      // reschedule detection: upcoming games matched by TEAMS (time-free) within the window;
      // if the official kickoff differs >20 min from ours, that's a TV move — record it
      for (const f of upcoming){
        const t = new Date(f.kickoff).getTime();
        let best = null, bestScore = 0;
        for (const e of events){
          if (e.comp !== f.comp || e.completed) continue;
          const s = overlap(e.hName, f.home) + overlap(e.aName, f.away);
          if (s > bestScore){ bestScore = s; best = e; }
        }
        if (!best || bestScore < 2) continue;                       // need BOTH teams to agree for a time-free match
        if (Math.abs(best.kick - t) > 20 * 60e3 && Math.abs(best.kick - t) < 21 * 24 * H)
          kicks[f.id] = new Date(best.kick).toISOString();
      }
      // admins quietly persist finals + kickoff corrections for the whole group
      if (isAdmin){
        const byId = {}; fixturesAll.forEach(f => byId[f.id] = f);
        if (Object.keys(finals).length){
          const byGw = {};
          for (const fid in finals){ const f = byId[fid]; (byGw[f.comp+'-'+f.gw] = byGw[f.comp+'-'+f.gw] || {})[fid] = finals[fid]; }
          for (const key in byGw){ try{ await db.doc('resultsGw/'+key).set(byGw[key], { merge:true }); }catch(e){} }
        }
        if (Object.keys(kicks).length){
          try{
            const b = db.batch();
            for (const fid in kicks){
              // set+merge (not update): works even for leagues whose fixture docs were never seeded
              b.set(db.doc('fixtures/'+fid), { kickoff: firebase.firestore.Timestamp.fromDate(new Date(kicks[fid])) }, { merge:true });
              b.set(db.doc('meta/overrides'), { [fid]: kicks[fid] }, { merge:true });
            }
            await b.commit();
          }catch(e){}
        }
      }
      return { finals, live, kicks,
        report: { at: Date.now(), events: events.length, comps: comps.length, ok: events.length > 0 } };
    },
    async syncResults(comp){
      let data;
      try{
        const r = await fetch('https://fixturedownload.com/feed/json/'+FEED[comp]);
        if (!r.ok) return null;
        data = await r.json();
      }catch(e){ return null; }
      const base = baseFixtures(comp);
      const found = {}, byGw = {};
      data.forEach(m => {
        if (m.HomeTeamScore === null || m.AwayTeamScore === null) return;
        const f = base.find(x => x.gw === m.RoundNumber && x.home === m.HomeTeam && x.away === m.AwayTeam);
        if (!f) return;
        found[f.id] = { h: m.HomeTeamScore, a: m.AwayTeamScore };
        (byGw[f.gw] = byGw[f.gw] || {})[f.id] = found[f.id];
      });
      for (const gw of Object.keys(byGw))
        await db.doc('resultsGw/'+comp+'-'+gw).set(byGw[gw], { merge:true });
      return found;
    },
    async reschedule(fid, iso){
      const b = db.batch();
      b.update(db.doc('fixtures/'+fid), { kickoff: firebase.firestore.Timestamp.fromDate(new Date(iso)) });
      b.set(db.doc('meta/overrides'), { [fid]: iso }, { merge:true });
      await b.commit();
    },
    async seedFixtures(comps, opts){
      // SAFETY: seeding must never regress kickoff times that were rescheduled mid-season —
      // read the overrides first and seed with the corrected times baked in.
      // (fresh:true = a calendar migration: the shipped data is newer truth, ignore old overrides)
      const fresh = opts && opts.fresh;
      const ovSnap = fresh ? null : await db.doc('meta/overrides').get().catch(() => null);
      const ov = ovSnap && ovSnap.exists ? ovSnap.data() : {};
      for (const comp of (comps || Object.keys(RAW))){
        const b = db.batch();
        for (const f of baseFixtures(comp)) b.set(db.doc('fixtures/'+f.id), {
          comp, gw: f.gw, home: f.home, away: f.away,
          kickoff: firebase.firestore.Timestamp.fromDate(new Date((!fresh && ov[f.id]) || f.kickoff)),
        });
        await b.commit(); // ≤380 ops per league, under the 500 limit
      }
      if (!fresh) await db.doc('meta/overrides').set({}, { merge:true });
    },
    /* one-time calendar migration: shipped data supersedes stale DB state.
       Re-seeds every league's fixture docs from the (ESPN-verified) static data and
       resets overrides — future TV moves land as fresh overrides via auto-sync. */
    async repairCalendar(version){
      await this.seedFixtures(null, { fresh: true });
      await db.doc('meta/overrides').set({ _v: version });
    },

    /* full season backup — everything readable, as one JSON object */
    async exportBackup(activePoolCode){
      const out = { format: 'primepicks-arena-backup', version: 1, exported: new Date().toISOString(), uid };
      const [poolSnap, ovSnap, resSnap, playsSnap, profSnap, mineSnap, userSnap] = await Promise.all([
        activePoolCode ? db.doc('pools/'+activePoolCode).get() : Promise.resolve(null),
        db.doc('meta/overrides').get(),
        db.collection('resultsGw').get(),
        db.collection('plays').get(),
        db.collection('profiles').get(),
        db.doc('myPicks/'+uid).get(),
        db.doc('users/'+uid).get(),
      ]);
      if (poolSnap && poolSnap.exists) out.pool = { code: activePoolCode, ...poolSnap.data(), createdAt: null };
      out.overrides = ovSnap.exists ? ovSnap.data() : {};
      out.resultsGw = {}; resSnap.docs.forEach(d => out.resultsGw[d.id] = d.data());
      out.plays = {}; playsSnap.docs.forEach(d => out.plays[d.id] = d.data());
      out.profiles = {}; profSnap.docs.forEach(d => { const p = d.data(); out.profiles[d.id] = { name: p.name, avatar: p.avatar || '' }; });
      out.myPicks = mineSnap.exists ? mineSnap.data() : {};
      out.user = userSnap.exists ? userSnap.data() : {};
      // revealed picks for every kicked-off fixture (pre-kickoff picks are unreadable by design;
      // they become part of the next backup once their games start)
      const comps = out.pool && out.pool.comps ? out.pool.comps : Object.keys(RAW);
      const kicked = [];
      for (const c of comps) for (const f of baseFixtures(c)){
        const ko = new Date(out.overrides[f.id] || f.kickoff).getTime();
        if (ko <= Date.now()) kicked.push(f.id);
      }
      out.picksByFixture = {};
      const chunks = [];
      for (let i = 0; i < kicked.length; i += 30) chunks.push(kicked.slice(i, i + 30));
      for (const chunk of chunks){
        const snaps = await Promise.all(chunk.map(fid => db.doc('picksByFixture/'+fid).get().catch(() => null)));
        snaps.forEach((s, i) => { if (s && s.exists) out.picksByFixture[chunk[i]] = s.data(); });
      }
      return out;
    },
    onChange(cb){
      let skip = 3;
      const h = () => { if (skip > 0){ skip--; return; } cb(); };
      db.collection('resultsGw').onSnapshot(h, () => {});
      db.collection('plays').onSnapshot(h, () => {});
      db.doc('users/'+uid).onSnapshot(h, () => {});
    },
  };
}


