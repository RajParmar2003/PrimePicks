/* ARENA data integrity test — every league's fixtures + registry, fact-checked structurally.
   Run: node data-test.js (from arena/qa/) */
const fs = require('fs');
const path = require('path');
const load = f => { const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); return eval(code + ';({FIXTURES_EPL:typeof FIXTURES_EPL!=="undefined"&&FIXTURES_EPL,FIXTURES_LALIGA:typeof FIXTURES_LALIGA!=="undefined"&&FIXTURES_LALIGA,FIXTURES_BUND:typeof FIXTURES_BUND!=="undefined"&&FIXTURES_BUND,FIXTURES_SERIEA:typeof FIXTURES_SERIEA!=="undefined"&&FIXTURES_SERIEA,FIXTURES_LIGUE1:typeof FIXTURES_LIGUE1!=="undefined"&&FIXTURES_LIGUE1,TEAMDATA:typeof TEAMDATA!=="undefined"&&TEAMDATA})'); };
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL: ') + n); };

const files = {
  epl:    { file: 'data-epl.js',        key: 'FIXTURES_EPL',    teams: 20, rounds: 38, perRound: 10 },
  liga:   { file: 'data-laliga.js',     key: 'FIXTURES_LALIGA', teams: 20, rounds: 38, perRound: 10 },
  bund:   { file: 'data-bundesliga.js', key: 'FIXTURES_BUND',   teams: 18, rounds: 34, perRound: 9  },
  seriea: { file: 'data-seriea.js',     key: 'FIXTURES_SERIEA', teams: 20, rounds: 38, perRound: 10 },
  ligue1: { file: 'data-ligue1.js',     key: 'FIXTURES_LIGUE1', teams: 18, rounds: 34, perRound: 9  },
};
const TEAMDATA = load('data-teams.js').TEAMDATA;
ok(!!TEAMDATA && Object.keys(TEAMDATA).length === 5, 'team registry covers 5 leagues');

for (const [comp, spec] of Object.entries(files)){
  const rows = load(spec.file)[spec.key];
  const total = spec.rounds * spec.perRound;
  ok(Array.isArray(rows) && rows.length === total, `${comp}: ${total} fixtures (got ${rows.length})`);
  const teams = new Set(); const byRound = {};
  let dateOk = true, pairSet = new Set(), dupPair = false;
  for (const [gw, dt, h, a] of rows){
    teams.add(h); teams.add(a);
    byRound[gw] = (byRound[gw] || 0) + 1;
    if (isNaN(Date.parse(dt.replace('Z', ':00Z')))) dateOk = false;
    const pk = h + '|' + a; if (pairSet.has(pk)) dupPair = true; pairSet.add(pk);
  }
  ok(teams.size === spec.teams, `${comp}: ${spec.teams} teams (got ${teams.size})`);
  ok(Object.keys(byRound).length === spec.rounds && Object.values(byRound).every(v => v === spec.perRound),
     `${comp}: ${spec.rounds} rounds × ${spec.perRound} games`);
  ok(dateOk, `${comp}: all kickoff dates parse`);
  // season bounds: any date outside Jul 2026 – Jun 2027 means timezone/feed corruption
  const inSeason = rows.every(([g, dt]) => { const t = Date.parse(dt.replace('Z', ':00Z'));
    return t >= Date.parse('2026-07-01') && t <= Date.parse('2027-06-30'); });
  ok(inSeason, `${comp}: every kickoff inside the 2026-27 season window`);
  ok(!dupPair, `${comp}: no duplicate home/away pairings (full double round-robin)`);
  // registry coverage: every fixture team has an ESPN id + two colours
  const reg = TEAMDATA[comp] || {};
  const missing = [...teams].filter(t => !reg[t]);
  ok(missing.length === 0, `${comp}: every team in badge/colour registry` + (missing.length ? ' — MISSING: ' + missing.join(', ') : ''));
  const badVals = Object.values(reg).filter(v => !/^\d+$/.test(v[0]) || !/^[0-9A-Fa-f]{6}$/.test(v[1]) || !/^[0-9A-Fa-f]{6}$/.test(v[2]));
  ok(badVals.length === 0, `${comp}: registry values well-formed (id + 2 hex colours)`);
}

/* ---- kit-clash proof: every fixture in every league must resolve to two distinct colours ---- */
const reg = require('../data-teams.js');
let checked = 0, clashes = [], fallbacks = 0;
for (const [comp, spec] of Object.entries(files)){
  const rows = load(spec.file)[spec.key];
  for (const [gw, dt, h, a] of rows){
    const r = reg.TEAMRESOLVE(comp, h, a);
    checked++;
    if (reg._tcDist(r.h, r.a) < 92) clashes.push(`${comp} GW${gw}: ${h} v ${a} → ${r.h}/${r.a}`);
    if (r.a.toUpperCase() !== '#' + reg.TEAMDATA[comp][a][1].toUpperCase()) fallbacks++;
  }
}
ok(clashes.length === 0, `no same-colour matchup in any of ${checked} fixtures across 5 leagues` + (clashes.length ? '\n' + clashes.slice(0,5).join('\n') : ''));
console.log(`  (info: ${fallbacks} fixtures use the away side's fallback colour — e.g. red-v-red derbies)`);

console.log(`\nDATA: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

