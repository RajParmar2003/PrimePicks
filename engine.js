/* ================= ARENA engine =================
   Pure game logic — no DOM, no network. Runs in browser and Node (unit tests).
   Scoring: 3 outright / 1 double-chance · banker ×2 · Perfect 10 +5
   Arena layer: splits · duels · bold calls · plays (double/safety/oracle) · championship */
(function (root) {

  const BONUS_PERFECT = 5;
  const BOLD_MAX_SHARE = 0.25;   // correct outright pick made by ≤25% of pool
  const BOLD_MIN_PICKS = 4;      // ...only when at least 4 picks exist on the game
  const SAFETY_MAX = 4;          // safety net refunds at most 4 pts
  const SAFETY_MIN_PICKS = 8;    // ...and needs a mostly-filled card
  const CHAMP_HEADSTART = 2;     // +2 championship pts per split title
  const DUEL_WIN = 3, DUEL_DRAW = 1;

  const MONTH_NAMES = ['', 'January','February','March','April','May','June','July','August','September','October','November','December'];
  /* splits = calendar months, derived from the fixture list itself.
     A gameweek belongs to the month its first game kicks off in.
     The season's final month is the Championship. */
  function buildSplits(fxOfGw){
    const gws = Object.keys(fxOfGw).map(Number).sort((a, b) => a - b);
    const monthOf = {};
    for (const g of gws){
      const first = fxOfGw[g].slice().sort((x, y) => new Date(x.kickoff) - new Date(y.kickoff))[0];
      monthOf[g] = first.kickoff.slice(0, 7); // YYYY-MM
    }
    const keys = [...new Set(gws.map(g => monthOf[g]))].sort();
    const sOf = g => keys.indexOf(monthOf[g]) + 1;
    const nameOfKey = k => MONTH_NAMES[+k.slice(5)];
    const names = ['', ...keys.map(nameOfKey)];
    const short = ['', ...keys.map(k => nameOfKey(k).slice(0, 3).toUpperCase())];
    const champIdx = keys.length;
    const gwsOf = i => gws.filter(g => sOf(g) === i);
    return { keys, monthOf, sOf, names, short, champIdx, count: keys.length, gwsOf };
  }

  const outcome = r => r.h > r.a ? 'H' : r.h < r.a ? 'A' : 'D';
  const basePts = (pick, out) => pick === out ? 3 : (pick.length === 2 && pick.includes(out)) ? 1 : 0;

  /* round-robin duel pairings: deterministic from sorted uids + gw (Berger tables) */
  function pairings(uids, gw) {
    const ids = [...uids].sort();
    if (ids.length < 2) return {};
    const odd = ids.length % 2 === 1;
    if (odd) ids.push(null); // bye marker
    const n = ids.length, rounds = n - 1;
    const r = (gw - 1) % rounds;
    // circle method: fix ids[0], rotate the rest by r
    const rest = ids.slice(1);
    const rot = rest.slice(rest.length - r).concat(rest.slice(0, rest.length - r));
    const line = [ids[0], ...rot];
    const out = {};
    for (let i = 0; i < n / 2; i++) {
      const a = line[i], b = line[n - 1 - i];
      if (a !== null && b !== null) { out[a] = b; out[b] = a; }
      else { const solo = a === null ? b : a; out[solo] = null; } // bye
    }
    return out;
  }

  /* normalize plays: max one play per (uid, gw); each play type once per split —
     except one extra 'double' for uids in catchup set. First by gw wins; ties by array order. */
  function validPlays(plays, catchupDoubles, sOf) {
    catchupDoubles = catchupDoubles || {}; // {uid: {splitIdx: true}}
    sOf = sOf || (gw => 1);
    const byUidGw = {}, used = {}; // used[uid|split|play] = count
    const ok = [];
    const sorted = [...plays].sort((a, b) => a.gw - b.gw);
    for (const p of sorted) {
      if (!['double', 'safety', 'oracle'].includes(p.play)) continue;
      const kGw = p.user_id + '|' + p.comp + '|' + p.gw;
      if (byUidGw[kGw]) continue;                       // one play per gameweek
      const s = sOf(p.gw);
      const kU = p.user_id + '|' + p.comp + '|' + s + '|' + p.play;
      const allowance = p.play === 'double' && catchupDoubles[p.user_id] && catchupDoubles[p.user_id][s] ? 2 : 1;
      if ((used[kU] || 0) >= allowance) continue;       // each play once per split (+catchup double)
      byUidGw[kGw] = 1; used[kU] = (used[kU] || 0) + 1;
      ok.push(p);
    }
    return ok;
  }

  /* main computation for one competition.
     settings (all default ON): {duels, bold, plays, perfect} — admin-configurable per group */
  function compute({ fixtures, picks, results, profiles, plays, settings }) {
    const CFG = Object.assign({ duels: true, bold: true, plays: true, perfect: true }, settings || {});
    plays = CFG.plays ? (plays || []) : [];
    const P = profiles.map(p => p.id);
    const fixIdx = {}; fixtures.forEach(f => fixIdx[f.id] = f);
    const pickIdx = {}; picks.forEach(p => pickIdx[p.user_id + '|' + p.fixture_id] = p);
    const fxOfGw = {}; fixtures.forEach(f => (fxOfGw[f.gw] = fxOfGw[f.gw] || []).push(f));

    /* ---- effective multipliers ---- */
    // base banker: exactly one per (uid,gw) or all void (anti-cheat)
    const bankCount = {};
    for (const p of picks) if (p.banker) { const k = p.user_id + '|' + p.gw; bankCount[k] = (bankCount[k] || 0) + 1; }
    const bankerOK = pk => pk.banker && bankCount[pk.user_id + '|' + pk.gw] === 1;

    /* ---- calendar-month splits, derived from this competition's fixtures ---- */
    const SP = buildSplits(fxOfGw);

    // catch-up doubles: bottom half of previous split gets +1 double allowance (computed later needs standings…
    // resolved two-pass: pass 1 without catchup to get split tables, pass 2 grants allowances)
    let vPlays = validPlays(plays, {}, SP.sOf);
    const doubleOn = {}, safetyOn = {}, oracleOn = {};
    const indexPlays = () => {
      for (const k in doubleOn) delete doubleOn[k];
      for (const k in safetyOn) delete safetyOn[k];
      for (const k in oracleOn) delete oracleOn[k];
      for (const p of vPlays) {
        if (p.play === 'double' && p.fixture_id) doubleOn[p.user_id + '|' + p.fixture_id] = true;
        if (p.play === 'safety') safetyOn[p.user_id + '|' + p.gw] = true;
        if (p.play === 'oracle') oracleOn[p.user_id + '|' + p.gw] = true;
      }
    };
    indexPlays();

    /* ---- pick distribution per fixture (bold calls + oracle display) ---- */
    const dist = {};
    for (const f of fixtures) {
      const d = { H: 0, A: 0, D: 0, HD: 0, AD: 0, total: 0 };
      for (const uid of P) { const pk = pickIdx[uid + '|' + f.id]; if (pk) { d[pk.pick]++; d.total++; } }
      dist[f.id] = d;
    }
    const isBold = (pk, out) => {
      if (!CFG.bold || pk.pick !== out) return false;       // outright hits only
      const d = dist[pk.fixture_id];
      return d.total >= BOLD_MIN_PICKS && d[pk.pick] / d.total <= BOLD_MAX_SHARE;
    };

    /* ---- core scoring pass ---- */
    const played = fixtures.filter(f => results[f.id]).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff) || (a.id < b.id ? -1 : 1));
    const mk = () => { const o = {}; P.forEach(u => o[u] = 0); return o; };
    const totals = mk(), outright = mk(), dchits = mk(), bankhits = mk(), bold = mk(), perfects = mk(), safetyPts = mk();
    const gwPts = {}; P.forEach(u => gwPts[u] = {});
    const picksInGw = {};
    const seq = {}; P.forEach(u => seq[u] = []);

    function scorePass() {
      for (const u of P) { totals[u]=0;outright[u]=0;dchits[u]=0;bankhits[u]=0;bold[u]=0;perfects[u]=0;safetyPts[u]=0;gwPts[u]={};seq[u]=[]; }
      for (const k in picksInGw) delete picksInGw[k];
      for (const p of picks) { const k = p.user_id + '|' + p.gw; picksInGw[k] = (picksInGw[k] || 0) + 1; }
      for (const f of played) {
        const out = outcome(results[f.id]);
        for (const u of P) {
          const pk = pickIdx[u + '|' + f.id];
          if (!pk) { seq[u].push(0); continue; }
          const b = basePts(pk.pick, out);
          let mult = 1;
          if (bankerOK(pk)) mult *= 2;
          if (doubleOn[u + '|' + f.id]) mult *= 2;
          let pts = b * mult;
          if (isBold(pk, out)) { pts += 1; bold[u]++; }
          gwPts[u][f.gw] = (gwPts[u][f.gw] || 0) + pts;
          totals[u] += pts;
          if (b === 3) outright[u]++; if (b === 1) dchits[u]++;
          if ((bankerOK(pk) || doubleOn[u + '|' + f.id]) && b > 0) bankhits[u]++;
          seq[u].push(b > 0 ? 1 : 0);
        }
      }
      // safety net refunds (per gw, capped)
      for (const u of P) for (const gw in gwPts[u]) {
        if (!safetyOn[u + '|' + gw]) continue;
        if ((picksInGw[u + '|' + gw] || 0) < SAFETY_MIN_PICKS) continue;
        const fs = (fxOfGw[gw] || []).filter(f => results[f.id]);
        let misses = 0;
        for (const f of fs) { const pk = pickIdx[u + '|' + f.id]; if (pk && basePts(pk.pick, outcome(results[f.id])) === 0) misses++; }
        const refund = Math.min(misses, SAFETY_MAX);
        gwPts[u][gw] += refund; totals[u] += refund; safetyPts[u] += refund;
      }
      // perfect 10 (only meaningful on a real card — guards synthetic/short gameweeks)
      for (const gw in fxOfGw) {
        if (!CFG.perfect) break;
        const fs = fxOfGw[gw];
        if (fs.length < 6 || !fs.every(f => results[f.id])) continue;
        for (const u of P) {
          const all = fs.every(f => { const pk = pickIdx[u + '|' + f.id]; return pk && basePts(pk.pick, outcome(results[f.id])) > 0; });
          if (all) { gwPts[u][gw] = (gwPts[u][gw] || 0) + BONUS_PERFECT; totals[u] += BONUS_PERFECT; perfects[u]++; }
        }
      }
    }
    scorePass();

    /* ---- split tables (one table per month) ---- */
    const splitPts = {};
    const buildSplitPts = () => { P.forEach(u => { splitPts[u] = {}; for (let s = 1; s <= SP.count; s++) splitPts[u][s] = 0; for (const gw in gwPts[u]) splitPts[u][SP.sOf(+gw)] += gwPts[u][gw]; }); };
    buildSplitPts();
    const splitDone = s => { const gs = SP.gwsOf(s); return gs.length > 0 && gs.every(g => (fxOfGw[g] || []).every(f => results[f.id])); };
    const splitWinners = {};
    for (let s = 1; s < SP.champIdx; s++) if (splitDone(s)) {
      const max = Math.max(...P.map(u => splitPts[u][s]));
      splitWinners[s] = P.filter(u => splitPts[u][s] === max && max > 0);
    }

    /* ---- catch-up pass: bottom half of previous completed split → +1 double allowance ---- */
    const catchup = {};
    for (let s = 2; s <= SP.champIdx; s++) {
      const prev = s - 1;
      if (!splitDone(prev)) continue;
      const order = [...P].sort((a, b) => splitPts[b][prev] - splitPts[a][prev]);
      const bottom = order.slice(Math.ceil(order.length / 2));
      for (const u of bottom) { catchup[u] = catchup[u] || {}; catchup[u][s] = true; }
    }
    const vPlays2 = validPlays(plays, catchup, SP.sOf);
    if (vPlays2.length !== vPlays.length) { vPlays = vPlays2; indexPlays(); scorePass(); buildSplitPts(); }

    /* ---- duels ---- */
    const duels = {}; P.forEach(u => duels[u] = { w: 0, d: 0, l: 0, pts: 0 });
    const duelOf = {};
    for (const gw in fxOfGw) {
      if (!CFG.duels) break;
      const fs = fxOfGw[gw];
      duelOf[gw] = pairings(P, +gw);
      if (!fs.every(f => results[f.id])) continue; // resolve only completed gameweeks
      const seen = {};
      for (const u of P) {
        const opp = duelOf[gw][u];
        if (opp === null || opp === undefined) { if (opp === null) { duels[u].d++; duels[u].pts += DUEL_DRAW; } continue; } // bye = draw
        if (seen[u] || seen[opp]) continue; seen[u] = seen[opp] = 1;
        const a = gwPts[u][gw] || 0, b = gwPts[opp][gw] || 0;
        if (a > b) { duels[u].w++; duels[u].pts += DUEL_WIN; duels[opp].l++; }
        else if (b > a) { duels[opp].w++; duels[opp].pts += DUEL_WIN; duels[u].l++; }
        else { duels[u].d++; duels[opp].d++; duels[u].pts += DUEL_DRAW; duels[opp].pts += DUEL_DRAW; }
      }
    }

    /* ---- championship table (final month + head starts from month titles) ---- */
    const champ = {};
    P.forEach(u => {
      const titles = Object.values(splitWinners).filter(ws => ws.includes(u)).length;
      champ[u] = titles * CHAMP_HEADSTART + (splitPts[u][SP.champIdx] || 0);
    });

    /* ---- streaks ---- */
    const streaks = {};
    P.forEach(u => { let cur = 0, best = 0, run = 0;
      for (const h of seq[u]) { run = h ? run + 1 : 0; best = Math.max(best, run); }
      for (let i = seq[u].length - 1; i >= 0 && seq[u][i]; i--) cur++;
      streaks[u] = { cur, best };
    });

    /* ---- season titles (live leaders) ---- */
    const playedCount = played.length;
    const lead = obj => { let bu = null, bv = -1; for (const u of P) if (obj[u] > bv) { bv = obj[u]; bu = u; } return bv > 0 ? { uid: bu, v: bv } : null; };
    const sniperEligible = P.filter(u => picks.filter(p => p.user_id === u && results[p.fixture_id]).length >= Math.ceil(playedCount * 2 / 3));
    let sniper = null;
    for (const u of sniperEligible) {
      const mine = picks.filter(p => p.user_id === u && results[p.fixture_id]);
      const rate = mine.length ? outright[u] / mine.length : 0;
      if (!sniper || rate > sniper.v) sniper = { uid: u, v: rate };
    }
    const titles = {
      pointsKing: lead(totals),
      duelist: lead(Object.fromEntries(P.map(u => [u, duels[u].pts]))),
      maverick: lead(bold),
      sniper: sniper && { uid: sniper.uid, v: Math.round(sniper.v * 100) },
    };

    /* ---- rank history for chart/movement ---- */
    const gws = Object.keys(fxOfGw).map(Number).sort((a, b) => a - b);
    const cum = {}; P.forEach(u => { cum[u] = {}; let t = 0; for (const g of gws) { t += gwPts[u][g] || 0; cum[u][g] = t; } });

    return { gwPts, splitPts, totals, outright, dchits, bankhits, bold, perfects, safetyPts,
             splitWinners, splitDone, duels, duelOf, champ, streaks, titles, cum, dist,
             pickIdx, fxOfGw, plays: vPlays, catchup, splits: SP, cfg: CFG };
  }

  const api = { compute, pairings, validPlays, buildSplits, outcome, basePts,
                BONUS_PERFECT, BOLD_MAX_SHARE, BOLD_MIN_PICKS, SAFETY_MAX, SAFETY_MIN_PICKS, CHAMP_HEADSTART };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ENGINE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);


