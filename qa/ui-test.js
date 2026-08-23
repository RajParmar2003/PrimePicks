/* ARENA UI smoke test — boots index.html + app.js in jsdom in DEMO mode.
   Run: npm i jsdom, then node ui-test.js (with the arena files one level up). */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const A = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL: ') + n); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const html = A('index.html').replace(/<script src="[^"]*"><\/script>/g, '').replace(/<link rel="manifest"[^>]*>/, '');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://arena.test/' });
const w = dom.window;
w.alert = m => (w.__alerts = w.__alerts || []).push(String(m));
w.confirm = () => true;
w.Element.prototype.scrollIntoView = () => {};
w.Chart = class { constructor(el, c){ w.__chart = c; } destroy(){} };
w.html2canvas = async () => ({ toDataURL: () => 'data:,' });
w.HTMLAnchorElement.prototype.click = function(){};
w.firebase = { initializeApp: () => { throw new Error('firebase must not init in demo'); } };
w.eval('var FIREBASE_CONFIG = { projectId: "PASTE_FORCES_DEMO" };'); // always test demo mode, whatever config.js holds
for (const f of ['data-epl.js','data-laliga.js','data-bundesliga.js','data-seriea.js','data-ligue1.js','data-teams.js']) w.eval(A(f).replace(/^const /gm, 'var '));
for (const f of ['engine.js', 'demo.js', 'firebase-api.js']) w.eval(A(f));
w.eval(A('app.js') + ';window.S = S; window.__api = api;');
w.eval('PICK_FLUSH_MS = 20;'); // fast debounce for tests

(async () => {
  await sleep(300);
  const $ = id => w.document.getElementById(id);
  const q = s => [...w.document.querySelectorAll(s)];

  console.log('— boot & picks —');
  ok(!$('v-picks').classList.contains('hide'), 'boots into Picks');
  ok($('username').textContent.includes('Raj') && $('username').textContent.includes('DEMO'), 'Raj + DEMO badge');
  ok(w.S.comps.length === 5, 'all five competitions enabled in demo');
  ok($('comps-picks').children.length === 5, 'league switcher shows 5 leagues');
  ok(w.S.gw.epl === 17, 'EPL lands mid-GW17 (got ' + w.S.gw.epl + ')');
  const spEpl = w.calc('epl').splits;
  const curMonth = spEpl.names[spEpl.sOf(17)];
  ok($('pickdeadline').textContent.includes(curMonth) && $('pickdeadline').textContent.includes('⚔️'), 'status strip: month split + duel (' + curMonth + ')');
  const cards = q('#picklist .fx');
  ok(cards.length === 10, '10 fixture cards');
  const nLock = cards.filter(c => c.querySelector('.pk:disabled')).length;
  ok(nLock === 7 && cards.length - nLock === 3, 'GW17: 7 locked / 3 open');
  ok($('playstrip').children.length === 3, '3 play cards');
  ok(!!w.document.querySelector('.livebadge'), 'live game shows ● LIVE badge with minute');

  // notification centre: seed a snapshot, add a result + move a game, expect 2 notifs with pick fate
  {
    w.updateNotifs(); // first pass = silent snapshot
    const fLive = Object.keys(w.S.live)[0];
    w.S.results[fLive] = { h: 2, a: 1 }; // the live game finishes
    const fMove = w.S.fixtures.epl.find(f => f.gw === 19);
    fMove.kickoff = new Date(new Date(fMove.kickoff).getTime() + 48 * 3600e3).toISOString(); // TV move
    w.updateNotifs();
    const nl = JSON.parse(w.localStorage.getItem('arena_notifs_v1'));
    ok(nl.length === 2, 'result + reschedule generate notifications (' + nl.length + ')');
    ok(nl.some(x => x.t.includes('FT:')), 'result notification carries the score + your pick fate');
    ok(nl.some(x => x.t.includes('moved')), 'reschedule notification present');
    ok(!$('bcount-m').classList.contains('hide') && $('bcount-m').textContent === '2', 'bell badge shows 2 unread');
    w.showNotifs(); await sleep(20);
    ok($('modalcard').textContent.includes('What you missed'), 'notification panel opens');
    w.closeModal(); w.renderBell();
    ok($('bcount-m').classList.contains('hide'), 'opening panel marks all read');
    delete w.S.results[fLive]; w.updateNotifs(); // restore demo state for later tests
    w.localStorage.setItem('arena_notifs_v1', '[]'); w.renderBell();
    w.renderPicks();
  }

  // pick change on an open game (click a non-selected option)
  const open = cards.findIndex(c => !c.querySelector('.pk:disabled'));
  const btn = [...cards[open].querySelectorAll('.pk')].find(b => !b.className.includes('sel'));
  btn.click(); await sleep(50);
  ok(q('#picklist .fx')[open].querySelector('.pk.sel'), 'pick change registers');

  // badges + team-coloured selections
  ok(q('#picklist .crest.img img').length > 0, 'club badges render (ESPN images)');
  const selBtn = w.document.querySelector('#picklist .pk.sel[style*="background"]');
  ok(!!selBtn || !!w.document.querySelector('#picklist .pk.sel'), 'selections render (team-coloured when outright)');

  // The Oracle via premium modal
  [...$('playstrip').children][2].click(); await sleep(40);
  ok(!$('modal').classList.contains('hide') && $('modalcard').textContent.includes('The Oracle'), 'play modal opens with premium copy');
  w.document.querySelector('#modalcard .btn.primary').click(); await sleep(60);
  ok(w.S.plays.some(p => p.user_id === 'u-raj' && p.play === 'oracle' && p.gw === 17), 'The Oracle activated');
  ok(!!w.document.querySelector('#picklist .pk .orc'), 'pick % revealed after The Oracle');

  // Prime Time (second banker) flow on GW18 via modal
  w.S.gw.epl = 18; w.renderPicks(); await sleep(30);
  const c18 = q('#picklist .fx')[0];
  const pk18 = [...c18.querySelectorAll('.pk')].find(b => !b.className.includes('sel'));
  pk18.click(); await sleep(50);
  const fid18 = w.S.fixtures.epl.find(f => f.gw === 18).id;
  await w.armDouble(fid18); await sleep(30);
  ok($('modalcard').textContent.includes('Prime Time'), 'Prime Time modal shows fixture');
  w.document.querySelector('#modalcard .btn.primary').click(); await sleep(60);
  ok(w.S.plays.some(p => p.user_id === 'u-raj' && p.play === 'double' && p.fixture_id === fid18), 'Prime Time lands');
  ok(q('#picklist .fx')[0].className.includes('dd'), 'primed card highlighted');
  ok([...$('playstrip').children][1].className.includes('used'), 'second play same GW blocked');
  // withdraw before first kickoff → back in hand
  [...$('playstrip').children][0].click(); await sleep(30);
  ok($('modalcard').textContent.includes('Withdraw'), 'active play offers withdrawal');
  w.document.querySelector('#modalcard .btn.mag').click(); await sleep(60);
  ok(!w.S.plays.some(p => p.user_id === 'u-raj' && p.gw === 18), 'play withdrawn before kickoff');
  // re-play it, then confirm month lock on next GW
  await w.armDouble(fid18); await sleep(30);
  w.document.querySelector('#modalcard .btn.primary').click(); await sleep(60);
  w.S.gw.epl = 19; w.renderPicks(); await sleep(30);
  ok([...$('playstrip').children][0].className.includes('used'), 'Prime Time used up for the month');

  console.log('— arena —');
  w.nav('arena'); await sleep(30);
  ok($('poolname').textContent === 'The Boys (demo)' && $('poolcode').textContent === 'DEMO26', 'group card shows name + invite code');
  ok(w.S.pool && w.S.pool.adminUid === 'u-raj', 'pool admin wired through');
  ok($('duelcard').textContent.includes('Duel of the week'), 'duel card');
  ok($('splitstrip').children.length === spEpl.count, 'one trophy per month on the shelf (' + spEpl.count + ')');
  ok([...$('splitstrip').children].slice(0, 3).every(t => !t.textContent.includes('—')), 'first months crowned');
  ok($('splitracetitle').textContent.includes(curMonth), 'current month race is live (' + curMonth + ')');
  ok($('splitrace').querySelectorAll('.racerow').length === 6, 'race bars for 6 players');
  ok($('dueltable').querySelectorAll('tr').length === 7, 'duel table renders');

  console.log('— standings —');
  w.nav('table'); await sleep(30);
  ok($('lbtable').querySelectorAll('tr').length === 7, 'standings 6+header');
  ok($('tabletabs').children.length === 2, 'season + overall tabs');
  $('tabletabs').children[1].click(); await sleep(40);
  const pts = q('#lbtable .pts').map(e => +e.textContent);
  ok(pts.length === 6 && pts.every((v, i) => i === 0 || pts[i-1] >= v), 'overall table sorted desc');
  ok(w.__chart && w.__chart.data.datasets.length === 6, 'chart has 6 lines');

  console.log('— la liga —');
  w.nav('picks'); await sleep(20);
  $('comps-picks').children[1].click(); await sleep(40);
  ok(w.S.comp === 'liga', 'competition switch');
  ok(q('#picklist .fx').length === 10, 'La Liga card renders');

  console.log('— bundesliga / ligue 1 (34-GW seasons, full parity) —');
  $('comps-picks').children[2].click(); await sleep(40);
  ok(w.S.comp === 'bund', 'switch to Bundesliga');
  ok(q('#picklist .fx').length === 9, 'Bundesliga: 9-game card');
  ok(q('#gwbar-picks .gwpill').length === 34, 'Bundesliga: 34 gameweek pills');
  ok(q('#picklist .crest.img img').length > 0, 'Bundesliga badges render');
  ok($('playstrip').children.length === 3, 'Plays available in Bundesliga');
  const spB = w.calc('bund').splits;
  ok(spB.count >= 8 && spB.champIdx === spB.count, 'Bundesliga months derived + Championship = final month');
  w.nav('arena'); await sleep(30);
  ok($('duelcard').textContent.includes('Duel of the week'), 'Bundesliga duels run');
  ok($('splitstrip').children.length === spB.count, 'Bundesliga trophy shelf');
  w.nav('picks'); await sleep(20);
  $('comps-picks').children[4].click(); await sleep(40);
  ok(w.S.comp === 'ligue1' && q('#picklist .fx').length === 9 && q('#gwbar-picks .gwpill').length === 34, 'Ligue 1: 9-game card, 34 GWs');
  $('comps-picks').children[3].click(); await sleep(40);
  ok(w.S.comp === 'seriea' && q('#picklist .fx').length === 10, 'Serie A: 10-game card');
  w.nav('table'); await sleep(30);
  ok(q('#lbtable .pts').length === 6, 'Serie A standings render');

  console.log('— hub / stats / admin —');
  w.S.comp = 'epl'; w.nav('gw'); await sleep(30);
  ok($('pgrid').querySelectorAll('tr').length === 11, 'gameweek grid');
  ok($('recap').textContent.includes('takes the week'), 'recap card');
  await w.downloadRecap(); ok(true, 'recap export runs');
  w.nav('stats'); await sleep(30);
  ok($('titles').textContent.includes('Points King') && $('titles').textContent.includes('The Duelist'), 'titles board');
  ok($('trophies').textContent.includes('🏆'), 'trophy case populated');
  await sleep(60); // my-groups list loads async
  ok($('mygroups').textContent.includes('The Boys (demo)') && $('mygroups').textContent.includes('ADMIN'), 'my groups list shows per-group role');
  ok($('mygroups').textContent.includes('current'), 'active group marked');
  w.openGroupGate(); await sleep(20);
  ok(!$('v-group').classList.contains('hide') && !$('gg-back').classList.contains('hide'), 'add-another-group gate opens with a way back');
  await w.backToApp(); await sleep(120);
  ok($('v-group').classList.contains('hide'), 'back returns to the app');
  w.nav('stats'); await sleep(30);
  w.nav('admin'); await sleep(30);
  ok($('reslist').children.length === 10, 'admin result rows');
  ok($('seedcard').classList.contains('hide'), 'seed card hidden (demo seeded)');
  // score inputs must not exist until Edit mode is deliberately entered
  ok($('reslist').querySelector('input') === null, 'results are read-only by default (no inputs to misclick)');
  ok($('ressave').classList.contains('hide'), 'save button hidden outside edit mode');
  w.toggleResEdit(); await sleep(20);
  ok($('reslist').querySelectorAll('input').length === 20 && !$('ressave').classList.contains('hide'), 'edit mode reveals inputs + save');
  ok($('restitle').textContent.includes('EDITING'), 'edit mode is loudly labelled');
  w.toggleResEdit(); await sleep(20);
  ok($('reslist').querySelector('input') === null, 'cancel returns to read-only');
  // safety systems
  $('gs-comp-liga').checked = false;
  await w.saveGroupSettings(); await sleep(30);
  ok(!$('modal').classList.contains('hide') && $('modalcard').textContent.includes('Removing La Liga'), 'league removal asks for confirmation');
  w.closeModal(); w.renderAdmin(); await sleep(20);
  await w.downloadBackup(); await sleep(30);
  ok(true, 'season backup export runs');
  const beforeSync = Object.keys(w.S.results).length;
  await w.syncResults(); await sleep(30);
  ok(Object.keys(w.S.results).length >= beforeSync, 'results sync runs');

  console.log('— user menu / themes / avatars / play info —');
  {
    $('username').onclick(); await sleep(20);
    ok($('modalcard').textContent.includes('light mode') || $('modalcard').textContent.includes('dark mode'), 'name tap opens user menu with theme switch');
    ok($('modalcard').textContent.includes('Edit name & avatar') && $('modalcard').textContent.includes('Install on your phone'), 'menu has profile + install entries');
    w.closeModal();
    w.setTheme('light'); await sleep(20);
    ok(w.document.body.classList.contains('light'), 'light mode applies');
    w.setTheme('dark'); await sleep(20);
    ok(!w.document.body.classList.contains('light'), 'dark mode restores');
    w.editProfile(); await sleep(20);
    ok(q('#modalcard .av').filter(a => /^e\d+$/.test(a.dataset.av || '')).length === 16, 'avatar picker offers 16 character avatars');
    w.closeModal();
    ok(w.avatarHtml({ name:'X', avatar:'e1' }).includes('🦁'), 'character avatar renders its mascot');
    ok(w.avatarHtml({ name:'X', avatar:'g:https://evil.example/p.png' }).includes('>X<'), 'non-Google photo URL falls back to initial (IP-leak guard)');
    // a used/blocked play still explains itself on tap
    w.nav('picks'); w.S.comp = 'epl'; w.S.gw.epl = 19; w.renderPicks(); await sleep(20);
    [...$('playstrip').children][0].click(); await sleep(20);
    ok($('modalcard').textContent.includes('Status:'), 'blocked play tap opens explainer with status');
    w.closeModal();
    w.iosInstallModal(true); await sleep(20);
    ok($('modalcard').textContent.includes('Home Screen'), 'install walkthrough modal renders');
    w.closeModal();
  }

  console.log('— in-app rulebook —');
  {
    const meta = w.document.querySelector('meta[name="viewport"]').content;
    ok(meta.includes('user-scalable=no') && meta.includes('maximum-scale=1'), 'pinch-zoom disabled via viewport meta');
    ok(!!$('rules-m') && !$('userbox').classList.contains('hide'), 'mobile header has a dedicated rules button');
    $('rules-m').onclick(); await sleep(20);
    ok($('modalcard').textContent.includes('How the game works'), 'header rules button opens the rulebook');
    w.closeModal();
    $('username').onclick(); await sleep(20);
    ok($('modalcard').textContent.includes('How the game works'), 'user menu has rules entry');
    w.closeModal();
    w.rulesPage(); await sleep(20);
    const rt = $('modalcard').textContent;
    ok(rt.includes('Outright') && rt.includes('Double chance') && rt.includes('Banker'), 'rules cover picks + banker');
    ok(rt.includes('locks individually'), 'rules state per-match lock timing');
    ok(rt.includes('Bold Calls') && rt.includes('Perfect 10') && rt.includes('Weekly Duels'), 'rules cover bold/perfect/duels when enabled');
    ok(rt.includes('never merged'), 'rules explain separate duel leaderboard');
    ok(rt.includes('Championship') && rt.includes('+2 head start'), 'rules cover splits + championship');
    ok(!rt.includes('Prime Time') && !rt.includes('Insurance') && !rt.includes('Oracle'), 'rules never mention the hidden plays');
    w.closeModal();
    ok(w.document.body.classList.contains('noscroll') === false, 'closing modal unlocks background scroll');
    w.rulesPage(); await sleep(20);
    ok(w.document.body.classList.contains('noscroll'), 'open modal locks background scroll (mobile scroll fix)');
    ok($('modalcard').textContent.includes('Close'), 'rules modal has a close button at the bottom');
    w.closeModal();
    // legacy Rules view now feeds from the same generator (no stale plays copy)
    w.nav('rules'); await sleep(20);
    const rv = $('rulesbody').textContent;
    ok(rv.includes('locks individually') && rv.includes('never merged'), 'Rules view shows the new rulebook');
    ok(!rv.includes('Prime Time') && !rv.includes('Insurance') && !rv.includes('Oracle'), 'Rules view has no stale plays copy');
    // settings-aware: disabled modules vanish from the rules
    const savedSettings = w.S.pool.settings;
    w.S.pool.settings = { duels:false, bold:false, plays:false, perfect:true };
    w.rulesPage(); await sleep(20);
    const rt2 = $('modalcard').textContent;
    ok(!rt2.includes('Weekly Duels') && !rt2.includes('Bold Calls') && rt2.includes('Perfect 10'), 'rules hide sections for disabled modules');
    w.closeModal();
    w.S.pool.settings = savedSettings;
  }

  console.log('— settings-aware standings columns —');
  {
    w.nav('table'); await sleep(30);
    let head = $('lbtable').textContent;
    ok(head.includes('🎲') && head.includes('💯') && head.includes('⚔️'), 'all module columns show when everything enabled');
    const savedSettings = w.S.pool.settings;
    w.S.pool.settings = { duels:false, bold:false, plays:false, perfect:false };
    w.bump(); w.nav('table'); await sleep(30);
    head = $('lbtable').textContent;
    ok(!head.includes('🎲') && !head.includes('💯') && !head.includes('⚔️'), 'disabled module columns disappear from standings');
    w.nav('stats'); await sleep(30);
    ok(!$('records').textContent.includes('Bold calls') && !$('records').textContent.includes('Perfect 10s'), 'pool stats hide disabled modules');
    w.S.pool.settings = savedSettings; w.bump(); w.nav('table'); await sleep(30);
    ok($('lbtable').textContent.includes('⚔️'), 'columns restore when modules re-enabled');
    // legend + emoji consistency with the rulebook
    const lg = $('lblegend').textContent;
    ok(lg.includes('bold calls') && lg.includes('perfect gameweeks') && lg.includes('duel points') && lg.includes('streak'), 'legend explains every column');
    ok(lg.includes('separate race'), 'legend flags duel pts as a separate race');
    ok(w.rulesHtml().includes('Bold Calls 🎲') && w.rulesHtml().includes('Perfect 10 💯'), 'rulebook emojis match the table columns');
    // single league → the lonely subtab bar hides
    const savedComps = w.S.comps;
    w.S.comps = ['epl']; w.S.comp = 'epl'; w.nav('table'); await sleep(20);
    ok($('tabletabs').classList.contains('hide'), 'single league: no lonely season subtab');
    w.S.comps = savedComps; w.nav('table'); await sleep(20);
    ok(!$('tabletabs').classList.contains('hide'), 'multi league: season/overall subtabs return');
  }

  console.log('— optimistic picks: instant UI, coalesced writes, rollback on failure —');
  {
    w.nav('picks'); w.S.comp = 'epl'; w.renderPicks(); await sleep(20);
    let cards = q('#picklist .fx');
    const open = cards.findIndex(c => !c.querySelector('.pk[disabled]') && c.querySelector('.pk'));
    ok(open >= 0, 'found an open card to hammer');
    const fid = cards[open].id.replace('fx-', '');
    const clickOpt = i => { const c = q('#picklist .fx')[open]; const bs = [...c.querySelectorAll('.pk')]; if (bs[i]) bs[i].click(); };
    let saves = 0, clears = 0;
    const apiRef = w.__api; // api is a lexical binding inside app.js's eval — exported by the harness
    const realSave = apiRef.savePick, realClear = apiRef.clearPick;
    apiRef.savePick = (...a) => { saves++; return realSave.apply(apiRef, a); };
    apiRef.clearPick = (...a) => { clears++; return realClear.apply(apiRef, a); };
    // hammer four different options with zero delay — like alternating draw/hedge fast
    clickOpt(0); clickOpt(2); clickOpt(1); clickOpt(3);
    const selNow = q('#picklist .fx')[open].querySelector('.pk.sel');
    ok(!!selNow, 'UI shows the newest tap instantly — no waiting on the network');
    await sleep(300);
    ok(saves + clears <= 2 && saves >= 1, 'burst of 4 taps coalesced into ' + (saves + clears) + ' write(s), not 4');
    const settled = w.myPick(fid);
    ok(!!settled, 'final choice persisted after the burst');
    // server rejection → instant optimistic paint, then rollback + alert
    const goodPick = settled.pick;
    apiRef.savePick = () => Promise.reject(new Error('permission denied'));
    w.__alerts = [];
    clickOpt(goodPick === 'H' ? 4 : 0); // pick something different from the settled choice
    await sleep(300);
    const after = w.myPick(fid);
    ok(after && after.pick === goodPick, 'rejected write rolls the card back to the last confirmed pick');
    ok((w.__alerts || []).length > 0, 'user is told when a write is rejected');
    apiRef.savePick = realSave; apiRef.clearPick = realClear;
    // app backgrounded (tab closed / PWA swiped away) → pending writes flush immediately, not after the debounce
    w.eval('PICK_FLUSH_MS = 60000;'); // absurd debounce: only an explicit flush can save now
    saves = 0;
    apiRef.savePick = (...a) => { saves++; return realSave.apply(apiRef, a); };
    clickOpt(goodPick === 'H' ? 4 : 0); await sleep(30);
    ok(saves === 0, 'write still pending inside the debounce window');
    w.dispatchEvent(new w.Event('pagehide'));
    await sleep(60);
    ok(saves === 1, 'backgrounding the app flushes the pending pick instantly — nothing is lost');
    apiRef.savePick = realSave;
    w.eval('PICK_FLUSH_MS = 20;');
    w.renderPicks(); await sleep(20);
  }

  console.log('— all-duels board —');
  {
    w.nav('arena'); await sleep(30);
    const dc = $('duelcard').textContent;
    ok(dc.includes('All duels'), 'arena shows the all-duels board for the gameweek');
    const pairRows = w.document.querySelectorAll('#duelcard .adrow').length;
    const n = w.S.profiles.length;
    ok(pairRows === Math.floor(n/2) + (n % 2), 'every member appears: ' + pairRows + ' rows for ' + n + ' players (byes included)');
    const names = [...w.document.querySelectorAll('#duelcard .adrow')].map(r => r.textContent).join(' ');
    const covered = w.S.profiles.every(p => names.includes(p.name));
    ok(covered, 'no member missing from the duels board');
    ok(/\d+ – \d+/.test(names), 'duel rows show live scores');
  }

  console.log('— chronological ordering: every gameweek, every league —');
  {
    let unsorted = [];
    for (const comp of ['epl','liga','bund','seriea','ligue1']){
      const mx = w.maxGw(comp);
      for (let g = 1; g <= mx; g++){
        const times = w.fixturesOfGw(comp, g).map(f => new Date(f.kickoff).getTime());
        for (let i = 1; i < times.length; i++) if (times[i] < times[i-1]) unsorted.push(comp + ' GW' + g);
      }
    }
    ok(unsorted.length === 0, 'all ' + (38*3 + 34*2) + ' gameweeks render nearest-kickoff-first' + (unsorted.length ? ' — BAD: ' + unsorted.slice(0,5).join(', ') : ''));
  }

  console.log('— full sweep: every view × every league (hunting render crashes) —');
  let sweepErrors = [];
  for (const comp of ['epl','liga','bund','seriea','ligue1']){
    for (const view of ['picks','arena','table','gw','stats','admin']){
      try{ w.S.comp = comp; w.nav(view); await sleep(15); }
      catch(e){ sweepErrors.push(comp + '/' + view + ': ' + e.message); }
    }
  }
  ok(sweepErrors.length === 0, 'all 30 view×league combinations render without throwing' + (sweepErrors.length ? ' — ' + sweepErrors.join(' | ') : ''));
  // toggle-safety: disabling a league must not lose results, re-enabling restores them
  {
    const ligaResults = Object.keys(w.S.results).filter(k => k.startsWith('liga-')).length;
    w.S.comps = ['epl']; w.S.comp = 'epl'; w.nav('table'); await sleep(20);
    const stillStored = Object.keys(w.S.results).filter(k => k.startsWith('liga-')).length;
    ok(stillStored === ligaResults && ligaResults > 0, 'league toggled off: results remain stored (' + stillStored + ')');
    w.S.comps = ['epl','liga','bund','seriea','ligue1']; w.S.comp = 'liga'; w.nav('table'); await sleep(20);
    ok([...w.document.querySelectorAll('#lbtable .pts')].some(e => +e.textContent > 0), 're-enabled league standings rebuild from stored results');
  }

  console.log('\nARENA UI: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });

