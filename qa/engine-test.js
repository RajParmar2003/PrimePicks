/* ARENA engine unit tests — run: node engine-test.js (from arena/qa/, engine.js one level up) */
const E = require('../engine.js');
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL: ') + n); };

/* ---- structure: calendar-month splits ---- */
const bs = E.buildSplits({
  1: [{ id:'a', kickoff:'2026-08-21T19:00:00.000Z' }],
  2: [{ id:'b', kickoff:'2026-08-31T19:00:00.000Z' }, { id:'c', kickoff:'2026-09-02T19:00:00.000Z' }], // spans boundary → August (first game)
  3: [{ id:'d', kickoff:'2026-09-12T14:00:00.000Z' }],
  4: [{ id:'e', kickoff:'2027-05-23T15:00:00.000Z' }],
});
ok(bs.count === 3 && bs.champIdx === 3, 'months derived from fixtures (Aug, Sep, May)');
ok(bs.sOf(1) === 1 && bs.sOf(2) === 1 && bs.sOf(3) === 2 && bs.sOf(4) === 3, 'boundary-spanning GW belongs to its first game\'s month');
ok(bs.names[1] === 'August' && bs.short[2] === 'SEP', 'month names + shorts');
const pr = {}; for (let g = 1; g <= 3; g++){ pr[g] = E.pairings(['a','b','c','d'], g); ok(Object.keys(pr[g]).length === 4 && pr[g][pr[g]['a']] === 'a', 'gw' + g + ' pairing symmetric'); }
ok(new Set([pr[1]['a'], pr[2]['a'], pr[3]['a']]).size === 3, 'round robin: a meets all 3 over 3 gws');
ok(Object.values(E.pairings(['a','b','c','d','e'], 1)).filter(v => v === null).length === 1, 'odd pool → exactly one bye');

/* ---- scoring scenario (hand-verified) ----
   GW1, 5 fixtures, outcomes H D A H D; 4 players. */
const fx = [1,2,3,4,5].map(i => ({ id: 'epl-' + i, gw: 1, kickoff: '2026-08-0' + i + 'T12:00:00Z', home: 'H' + i, away: 'A' + i }));
const res = { 'epl-1': {h:2,a:0}, 'epl-2': {h:1,a:1}, 'epl-3': {h:0,a:1}, 'epl-4': {h:3,a:0}, 'epl-5': {h:2,a:2} };
const profiles = ['u1','u2','u3','u4'].map(id => ({ id, name: id }));
const P = (u,i,p,b=false) => ({ user_id: u, fixture_id: 'epl-'+i, gw: 1, comp: 'epl', pick: p, banker: b });
const picks = [
  // u1: all outright + banker f1; bold on f3 (A 1/4) and f5 (D 1/4) → 6+3+4+3+4 = 20, +5 perfect = 25
  P('u1',1,'H',true), P('u1',2,'D'), P('u1',3,'A'), P('u1',4,'H'), P('u1',5,'D'),
  // u2: 3+1+0(banker miss)+1+0 = 5
  P('u2',1,'H'), P('u2',2,'AD'), P('u2',3,'H',true), P('u2',4,'HD'), P('u2',5,'A'),
  // u3: 1+3+0+6(banker)+1 = 11
  P('u3',1,'HD'), P('u3',2,'D'), P('u3',3,'HD'), P('u3',4,'H',true), P('u3',5,'AD'),
  // u4: 0+1+0+3+1 = 5
  P('u4',1,'A'), P('u4',2,'HD'), P('u4',3,'H'), P('u4',4,'H'), P('u4',5,'HD'),
];
const r = E.compute({ fixtures: fx, picks, results: res, profiles, plays: [] });
ok(r.totals.u1 === 20, 'u1 = 20 (5-fixture week: no Perfect bonus by design) (got ' + r.totals.u1 + ')');
ok(r.totals.u2 === 5 && r.totals.u3 === 11 && r.totals.u4 === 5, 'u2/u3/u4 = 5/11/5');
ok(r.bold.u1 === 2 && r.bold.u2 === 0, 'bold calls: u1 has 2 (f3, f5 at exactly 25%)');
ok(r.perfects.u1 === 0, 'no perfect bonus on a 5-game card (needs a real 10-game week)');
ok(r.duels.u1.w === 1, 'u1 wins their duel');
ok(Object.values(r.duels).reduce((s,d) => s + d.pts, 0) === 6, 'duel pts fully distributed');

/* ---- plays ---- */
const r2 = E.compute({ fixtures: fx, picks, results: res, profiles, plays: [{ user_id:'u4', comp:'epl', gw:1, play:'safety' }] });
ok(r2.totals.u4 === 5, 'safety net inert under 8 picks');
const r3 = E.compute({ fixtures: fx, picks, results: res, profiles, plays: [{ user_id:'u4', comp:'epl', gw:1, play:'double', fixture_id:'epl-4' }] });
ok(r3.totals.u4 === 8, 'double down: 5 → 8');
const r3b = E.compute({ fixtures: fx, picks, results: res, profiles, plays: [{ user_id:'u4', comp:'epl', gw:1, play:'oracle' }] });
ok(r3b.totals.u4 === 5, 'oracle never changes scores');
// two plays same gw: only first counts
const r3c = E.compute({ fixtures: fx, picks, results: res, profiles, plays: [
  { user_id:'u4', comp:'epl', gw:1, play:'double', fixture_id:'epl-4' },
  { user_id:'u4', comp:'epl', gw:1, play:'safety' }] });
ok(r3c.plays.length === 1 && r3c.totals.u4 === 8, 'one play per gameweek enforced');

/* ---- anti-cheat ---- */
const cheat = picks.map(p => ({ ...p }));
cheat.find(p => p.user_id === 'u1' && p.fixture_id === 'epl-4').banker = true;
const r4 = E.compute({ fixtures: fx, picks: cheat, results: res, profiles, plays: [] });
ok(r4.totals.u1 === 17, 'two base bankers void both: 20 → 17');

/* ---- safety net with a full card (10 fixtures) ---- */
const fx10 = [...Array(10)].map((_, i) => ({ id: 'epl-1' + i, gw: 2, kickoff: '2026-09-01T12:00:00Z', home: 'h', away: 'a' }));
const res10 = {}; fx10.forEach(f => res10[f.id] = { h: 1, a: 0 });         // all H
const picks10 = fx10.map(f => ({ user_id: 'u1', fixture_id: f.id, gw: 2, comp: 'epl', pick: 'A', banker: false })); // all miss
const r5 = E.compute({ fixtures: fx10, picks: picks10, results: res10, profiles: [{ id:'u1', name:'u1' }],
  plays: [{ user_id:'u1', comp:'epl', gw:2, play:'safety' }] });
ok(r5.totals.u1 === E.SAFETY_MAX, 'safety net caps at +' + E.SAFETY_MAX + ' on a disaster week');

/* ---- monthly splits, catch-up, championship ----
   Two players, 38 weekly gws from Aug 8 2026 → months:
   Aug g1-4 · Sep g5-8 · Oct g9-13 · Nov g14-17 · Dec g18-21 · Jan g22-26 · Feb g27-30 · Mar g31-34 · Apr g35-38 (=Championship).
   uA right up to gw26 (wins Aug–Jan, 6 titles); uB right from gw27 (wins Feb + Mar + the April sprint). */
const fxs = [], resS = {}, picksS = [];
for (let gw = 1; gw <= 38; gw++){
  const id = 's-' + gw;
  fxs.push({ id, gw, kickoff: new Date(Date.parse('2026-08-01') + gw * 7 * 864e5).toISOString(), home: 'x', away: 'y' });
  resS[id] = { h: 1, a: 0 };
  const bWins = gw >= 27;
  picksS.push({ user_id: 'uA', fixture_id: id, gw, comp: 'epl', pick: bWins ? 'A' : 'H', banker: false });
  picksS.push({ user_id: 'uB', fixture_id: id, gw, comp: 'epl', pick: bWins ? 'H' : 'A', banker: false });
}
const profS = [{ id:'uA', name:'A' }, { id:'uB', name:'B' }];
const rs = E.compute({ fixtures: fxs, picks: picksS, results: resS, profiles: profS, plays: [] });
ok(rs.splits.count === 9 && rs.splits.champIdx === 9 && rs.splits.names[9] === 'April', '9 months, April is the Championship');
ok([1,2,3,4,5,6].every(s => rs.splitWinners[s][0] === 'uA'), 'uA takes Aug–Jan (6 month titles)');
ok(rs.splitWinners[7][0] === 'uB' && rs.splitWinners[8][0] === 'uB', 'uB takes Feb + Mar');
ok(rs.champ.uB === 4 * 3 + 2 * E.CHAMP_HEADSTART && rs.champ.uA === 6 * E.CHAMP_HEADSTART,
   'championship: uB ' + rs.champ.uB + ' (April sprint + 2 titles) beats uA ' + rs.champ.uA + ' (6 head starts)');
ok(rs.perfects.uA === 0 && rs.perfects.uB === 0, 'no perfect bonus on short synthetic gameweeks');
ok(rs.totals.uA > rs.totals.uB, 'points king still uA — two different winners, by design');
// catch-up: uB (bottom half of August) may use double twice in September (g5-8)
const cuPlays = [
  { user_id: 'uB', comp: 'epl', gw: 6, play: 'double', fixture_id: 's-6' },
  { user_id: 'uB', comp: 'epl', gw: 7, play: 'double', fixture_id: 's-7' },
  { user_id: 'uA', comp: 'epl', gw: 6, play: 'double', fixture_id: 's-6' },
  { user_id: 'uA', comp: 'epl', gw: 7, play: 'double', fixture_id: 's-7' },
];
const rc = E.compute({ fixtures: fxs, picks: picksS, results: resS, profiles: profS, plays: cuPlays });
ok(rc.plays.filter(p => p.user_id === 'uB' && p.play === 'double').length === 2, 'catch-up: bottom-half player gets 2nd double in the next month');
ok(rc.plays.filter(p => p.user_id === 'uA' && p.play === 'double').length === 1, 'leader stays capped at 1 double');

/* ---- group settings toggles ---- */
const rOff = E.compute({ fixtures: fx, picks, results: res, profiles, plays: [], settings: { bold: false, duels: false } });
ok(rOff.totals.u1 === 18, 'bold off: u1 loses both bold bonuses (20 → 18)');
ok(Object.values(rOff.duels).every(d => d.pts === 0 && d.w === 0), 'duels off: no duel points');
const rNoPlay = E.compute({ fixtures: fx, picks, results: res, profiles,
  plays: [{ user_id:'u4', comp:'epl', gw:1, play:'double', fixture_id:'epl-4' }], settings: { plays: false } });
ok(rNoPlay.totals.u4 === 5 && rNoPlay.plays.length === 0, 'plays off: double down ignored');
const rNoPerf = E.compute({ fixtures: fx10, picks: fx10.map(f => ({ user_id:'u1', fixture_id:f.id, gw:2, comp:'epl', pick:'H', banker:false })),
  results: res10, profiles: [{ id:'u1', name:'u1' }], plays: [], settings: { perfect: false } });
ok(rNoPerf.perfects.u1 === 0 && rNoPerf.totals.u1 === 30, 'perfect off: 10 hits = 30, no bonus');

console.log('\\nENGINE: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
