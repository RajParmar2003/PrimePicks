/* ================= ARENA — app logic =================
   Views + state. Game math lives in engine.js; data access behind
   api = createDemoApi() | createFirebaseApi() (same interface). */
const DATA_VERSION = 3; // bump when shipped fixture data supersedes DB state → triggers auto-migration
const DEMO = typeof FIREBASE_CONFIG === 'undefined' || !FIREBASE_CONFIG.projectId || /PASTE/i.test(FIREBASE_CONFIG.projectId);
if (!DEMO && typeof firebase === 'undefined'){
  document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('v-loading');
    if (el) el.textContent = "Can't reach the game servers — check your connection and refresh.";
  });
  throw new Error('firebase sdk failed to load');
}
const api = DEMO ? createDemoApi() : createFirebaseApi();

const COMPS = {
  epl:    { name: 'Premier League', short: 'EPL',    data: () => FIXTURES_EPL,    logo: 23 },
  liga:   { name: 'La Liga',        short: 'LALIGA', data: () => FIXTURES_LALIGA, logo: 15 },
  bund:   { name: 'Bundesliga',     short: 'BUNDESLIGA', data: () => FIXTURES_BUND, logo: 10 },
  seriea: { name: 'Serie A',        short: 'SERIE A',data: () => FIXTURES_SERIEA, logo: 12 },
  ligue1: { name: 'Ligue 1',        short: 'LIGUE 1',data: () => FIXTURES_LIGUE1, logo: 9  },
};
const leagueLogo = c => `<img class="compimg" src="https://a.espncdn.com/i/leaguelogos/soccer/500/${COMPS[c].logo}.png" onerror="this.style.display='none'" alt="">`;
const badgeUrl = (comp, team) => { const t = TEAMDATA[comp] && TEAMDATA[comp][team]; return t ? `https://a.espncdn.com/i/teamlogos/soccer/500/${t[0]}.png` : null; };
function teamColor(comp, team){
  const t = TEAMDATA[comp] && TEAMDATA[comp][team];
  if (!t) return TEAMCOL[team] || '#666';
  const lum = h => { const n = parseInt(h,16); return 0.299*(n>>16&255) + 0.587*(n>>8&255) + 0.114*(n&255); };
  const pick = lum(t[1]) > 200 ? (lum(t[2]) > 200 ? t[1] : t[2]) : t[1]; // avoid white-kit primaries
  return '#' + pick;
}
const inkFor = hex => { const n = parseInt(hex.replace('#',''),16); return (0.299*(n>>16&255)+0.587*(n>>8&255)+0.114*(n&255)) > 150 ? '#0a0f1d' : '#ffffff'; };
function buildFixtures(comp){
  return COMPS[comp].data().map((r, i) => ({ id: comp + '-' + (i + 1), comp, gw: r[0],
    kickoff: new Date(r[1].replace('Z', ':00Z')).toISOString(), home: r[2], away: r[3] }));
}

const TEAMCOL = {
  "Arsenal":"#EF0107","Aston Villa":"#670E36","Bournemouth":"#DA291C","Brentford":"#E30613","Brighton":"#0057B8",
  "Chelsea":"#034694","Coventry":"#5BB8E8","Crystal Palace":"#1B458F","Everton":"#003399","Fulham":"#6b6b6b",
  "Hull":"#F5A12D","Ipswich":"#3A64A3","Leeds":"#B8A200","Liverpool":"#C8102E","Man City":"#6CABDD","Man Utd":"#DA291C",
  "Newcastle":"#41505c","Nott'm Forest":"#DD0000","Spurs":"#132257","Sunderland":"#EB172B",
  "Athletic Club":"#EE2523","Atlético de Madrid":"#CB3524","CA Osasuna":"#0A346F","Celta":"#8AC3EE","Deportivo Alavés":"#0761AF",
  "Elche CF":"#05642c","FC Barcelona":"#A50044","Getafe CF":"#005999","Levante UD":"#005CA9","Málaga CF":"#2f7fc3",
  "R. Racing Club":"#00964b","RC Deportivo":"#0f4c93","RCD Espanyol de Barcelona":"#00529F","Rayo Vallecano":"#E53027",
  "Real Betis":"#00954C","Real Madrid":"#FEBE10","Real Sociedad":"#0067B1","Sevilla FC":"#D8091E","Valencia CF":"#EE8707","Villarreal CF":"#FFE667",
};
const PLAYINFO = {
  double: { icon:'<svg class="nico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    name:'Prime Time', desc:'a second banker',
    long:'Declare a second banker this gameweek — two games score double. For the weekends you can feel it coming.' },
  safety: { icon:'<svg class="nico" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    name:'Insurance', desc:'misses refund 1 pt',
    long:'Underwrite this gameweek: every wrong pick refunds 1 point (max +4, needs a filled card). For the weekends that smell like chaos.' },
  oracle: { icon:'<svg class="nico" viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    name:'The Oracle', desc:'see the pool first',
    long:'Reveal the group\'s live pick percentages for this gameweek before locking your own. Information is an edge.' },
};

/* ---------- modal ---------- */
function showModal(html){ $('modalcard').innerHTML = html; $('modal').classList.remove('hide'); $('modalcard').scrollTop = 0; document.body.classList.add('noscroll'); }
function closeModal(){ $('modal').classList.add('hide'); document.body.classList.remove('noscroll'); }
document.addEventListener('click', e => { if (e.target && e.target.id === 'modal') closeModal(); });

let S = { uid:null, me:null, myName:'', pool:null, myPools:[], profiles:[], picks:[], results:{}, live:{}, plays:[], counts:{}, seeded:true,
  comps:['epl','liga'], comp:'epl', fixtures:{}, view:'picks',
  gw:{}, gwHub:{}, gwAdmin:{}, tableMode:'comp', chart:null, authMode:'in', arming:null };
// invite deep-link (?join=CODE) — remember it across the sign-in step
try{
  const jm = location.search.match(/[?&]join=([A-Za-z0-9]{6})/);
  if (jm) sessionStorage.setItem('arena_join', jm[1].toUpperCase());
}catch(e){}

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const E = ENGINE;

/* ---------- computed state (memo per data version) ---------- */
let _memo = {}, _ver = 0;
function bump(){ _ver++; _memo = {}; }
function calc(comp){
  const k = comp + '|' + _ver;
  if (_memo[k]) return _memo[k];
  return _memo[k] = E.compute({
    fixtures: S.fixtures[comp],
    picks: S.picks.filter(p => p.comp === comp),
    results: S.results,
    profiles: S.profiles,
    plays: S.plays.filter(p => p.comp === comp),
    settings: S.pool ? S.pool.settings : null,
  });
}
function fixturesOfGw(comp, gw){
  // always chronological: nearest kickoff first, everywhere a gameweek is rendered
  return S.fixtures[comp].filter(f => f.gw === gw)
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff) || (a.id < b.id ? -1 : 1));
}
function kicked(f){ return Date.now() >= new Date(f.kickoff).getTime(); }
function myPick(fid){ return S.picks.find(p => p.fixture_id === fid && p.user_id === S.uid); }
function currentGw(comp){
  const next = S.fixtures[comp].filter(f => !kicked(f)).sort((a,b) => new Date(a.kickoff) - new Date(b.kickoff))[0];
  return next ? next.gw : maxGw(comp);
}
function gwDone(comp, gw){ return fixturesOfGw(comp, gw).every(f => S.results[f.id]); }
function nameOf(uid){ const p = S.profiles.find(x => x.id === uid); return p ? p.name : '?'; }

/* ---------- auth ---------- */
function authTab(m){ S.authMode = m;
  $('f-name').classList.toggle('hide', m === 'in');
  $('authgo').textContent = m === 'in' ? 'Sign in' : 'Join the league';
  $('tab-in').classList.toggle('primary', m === 'in');
  $('tab-up').classList.toggle('primary', m === 'up');
}
function dismissWelcome(){
  try{ localStorage.setItem('arena_intro_seen', '1'); }catch(e){}
  $('welcome').classList.add('hide');
  nav('picks');
}
async function doAuth(){
  const email = $('in-email').value.trim(), pass = $('in-pass').value;
  $('autherr').textContent = '';
  try{
    if (S.authMode === 'up'){
      const name = $('in-name').value.trim();
      if (!name) throw new Error('Pick a display name');
      await api.signUp(email, pass, name);
    } else await api.signIn(email, pass);
    boot();
  }catch(e){ $('autherr').textContent = e.message; }
}
async function doAuthGoogle(){
  $('autherr').textContent = '';
  try{ await api.signInGoogle(); boot(); }
  catch(e){ $('autherr').textContent = e.message; }
}
async function signOut(){
  if (DEMO){ alert("Demo mode — you're always Raj here. Connect Firebase (SETUP.md) for real accounts."); return; }
  await api.signOut(); location.reload();
}

/* ---------- data ---------- */
async function loadAll(){
  const d = await api.load();
  S.uid = d.uid; S.myName = d.myName || S.myName;
  if (d.noPool){ S.pool = null; return; }
  S.pool = d.pool; S.myPools = d.myPools || [d.pool.code];
  S.profiles = d.profiles; S.picks = d.picks; S.results = d.results; S.plays = d.plays;
  S.counts = d.counts || {}; S.seeded = d.seeded; S.comps = d.comps || ['epl','liga'];
  S.overrides = d.overrides || {};
  S.calendarVersion = S.overrides._v || 0;
  // build fixture calendars for ALL leagues (not just enabled ones): results sync stays
  // league-blind, so toggling a league off and on mid-season loses nothing
  Object.keys(COMPS).forEach(c => { if (!S.fixtures[c]) S.fixtures[c] = buildFixtures(c); });
  // apply DB overrides ONLY if they're from the current calendar generation — stale
  // overrides from before a data correction must never beat the verified shipped data
  if (DEMO || S.calendarVersion === DATA_VERSION) for (const fid in S.overrides){
    if (fid === '_v') continue;
    const c = fid.split('-')[0];
    const f = (S.fixtures[c] || []).find(x => x.id === fid); if (f) f.kickoff = S.overrides[fid];
  }
  S.comps.forEach(c => { if (!S.gw[c]){ const g = currentGw(c); S.gw[c] = g; S.gwHub[c] = g; S.gwAdmin[c] = g; } });
  if (!S.comps.includes(S.comp)) S.comp = S.comps[0];
  S.me = S.profiles.find(p => p.id === S.uid) || null;
  bump();
}

/* ---------- groups ---------- */
async function createGroup(){
  $('ggerr').textContent = '';
  const name = $('gg-poolname').value.trim();
  if (!name){ $('ggerr').textContent = 'Give your group a name.'; return; }
  const comps = Object.keys(COMPS).filter(c => { const el = $('gg-comp-'+c); return el && el.checked; });
  if (!comps.length){ $('ggerr').textContent = 'Pick at least one league.'; return; }
  try{
    await api.createPool(name, comps);
    if (!DEMO){ toast('Loading fixtures for your leagues…'); await api.seedFixtures(comps); }
    await enterApp();
  }
  catch(e){ $('ggerr').textContent = e.message; }
}
async function joinGroup(codeArg){
  $('ggerr').textContent = '';
  const code = (codeArg || $('gg-code').value).trim().toUpperCase();
  if (code.length !== 6){ $('ggerr').textContent = 'Codes are 6 characters.'; return; }
  try{ await api.joinPool(code); sessionStorage.removeItem('arena_join'); await enterApp(); }
  catch(e){ $('ggerr').textContent = e.message; }
}
async function saveGroupSettings(force){
  $('gserr').textContent = '';
  const comps = Object.keys(COMPS).filter(c => { const el = $('gs-comp-'+c); return el && el.checked; });
  if (!comps.length){ $('gserr').textContent = 'Keep at least one competition on.'; return; }
  // SAFETY: removing a league mid-season hides its tables — make sure that's intended
  const removed = S.comps.filter(c => !comps.includes(c));
  if (removed.length && !force){
    const hasData = removed.some(c => S.picks.some(p => p.comp === c) || Object.keys(S.results).some(fid => fid.startsWith(c + '-')));
    showModal(`<div class="playmeta">Careful</div><h3>Removing ${removed.map(c => COMPS[c].name).join(' + ')}?</h3>
      <p class="msub">${hasData ? 'This league has picks and/or results in it. ' : ''}Nothing is deleted — all picks and results stay stored — but its tables, duels and trophies disappear from everyone's app until you re-enable it here.</p>
      <div class="mrow"><button class="btn" onclick="closeModal();renderAdmin()">Keep it</button>
      <button class="btn mag" onclick="closeModal();saveGroupSettings(true)">Hide league${removed.length>1?'s':''}</button></div>`);
    return;
  }
  const name = $('gs-name').value.trim();
  if (!name){ $('gserr').textContent = 'The group needs a name.'; return; }
  try{
    const added = comps.filter(c => !S.comps.includes(c));
    await api.updatePool(S.pool.code, { name, comps,
      settings: { duels: $('gs-duels').checked, bold: $('gs-bold').checked, plays: $('gs-plays').checked,
                  perfect: $('gs-perfect').checked, locked: $('gs-locked').checked } });
    if (added.length && !DEMO){ toast('Loading fixtures for ' + added.length + ' new league(s)…'); await api.seedFixtures(added); }
    await loadAll(); toast('Group settings saved'); render();
    $('sideuser').innerHTML = $('sideuser').innerHTML.replace(/<div class="tag".*/, '<div class="tag" style="margin-top:4px">' + esc(S.pool.name) + '</div>');
  }catch(e){ $('gserr').textContent = friendly(e); }
}
async function removeMember(uid2){
  if (!confirm('Remove ' + nameOf(uid2) + ' from the group? Their picks stay saved if they rejoin.')) return;
  try{ await api.removeMember(S.pool.code, uid2); await loadAll(); toast('Removed'); render(); }
  catch(e){ $('memerr').textContent = friendly(e); }
}
async function leaveGroup(){
  if (S.me.is_admin){ alert("You run this group — you can't leave it. (Delete it from Firebase console if you really must.)"); return; }
  if (!confirm('Leave ' + S.pool.name + '? You can rejoin later with the invite code.')) return;
  try{ await api.leavePool(S.pool.code); location.reload(); }
  catch(e){ alert(friendly(e)); }
}
/* ---------- iPhone install (nobody wants Safari) ---------- */
function isIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function isStandalone(){ return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || !!navigator.standalone; }
function iosInstallModal(manual){
  const ios = isIOS();
  showModal(`<div class="playmeta">Get the app feel</div><h3>📲 Put PrimePicks on your Home Screen</h3>
    <p class="msub">One time, ~15 seconds. After this it opens full-screen like a real app, with its own icon, and you stay signed in — no Safari, no typing URLs.</p>
    <div class="iossteps">
      ${ios ? `1. Tap the <b>Share</b> button ( <svg style="width:14px;height:14px;vertical-align:-2px;fill:none;stroke:currentColor;stroke-width:2" viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/></svg> ) at the bottom of Safari<br>
      2. Scroll down → tap <b>Add to Home Screen</b><br>
      3. Tap <b>Add</b> — done. Open it from the icon from now on.`
      : `On iPhone: open this site in <b>Safari</b> → Share button → <b>Add to Home Screen</b>.<br>On Android: Chrome menu (⋮) → <b>Add to Home screen</b>.`}
    </div>
    <div class="mrow"><button class="btn primary" onclick="closeModal();try{localStorage.setItem('arena_ios_hint','1')}catch(e){}">Got it</button></div>`);
  if (!manual){ try{ localStorage.setItem('arena_ios_hint', '1'); }catch(e){} }
}
function maybeOfferInstall(){
  let seen = null; try{ seen = localStorage.getItem('arena_ios_hint'); }catch(e){}
  if (isIOS() && !isStandalone() && !seen) setTimeout(() => { if ($('modal').classList.contains('hide')) iosInstallModal(false); }, 2500);
}

/* ---------- theme ---------- */
function setTheme(t){
  document.body.classList.toggle('light', t === 'light');
  try{ localStorage.setItem('arena_theme', t); }catch(e){}
  if (S.uid && S.pool) render(); // charts re-read the tokens
}
try{ if (localStorage.getItem('arena_theme') === 'light') document.body.classList.add('light'); }catch(e){}

/* ---------- user menu (tap your name anywhere) ---------- */
function userMenu(){
  const light = document.body.classList.contains('light');
  showModal(`<div class="playmeta">${esc(S.pool ? S.pool.name : '')}</div><h3>${esc(S.me.name)}</h3>
    <div class="umenu">
      <button class="btn" onclick="closeModal();setTheme('${light ? 'dark' : 'light'}');toast('${light ? 'Dark' : 'Light'} mode on')">${light ? '🌙 Switch to dark mode' : '☀️ Switch to light mode'}</button>
      <button class="btn" onclick="closeModal();editProfile()">✏️ Edit name & avatar</button>
      <button class="btn" onclick="closeModal();rulesPage()">📖 How the game works</button>
      <button class="btn" onclick="closeModal();iosInstallModal(true)">📲 Install on your phone</button>
      <button class="btn" onclick="closeModal();signOut()">🚪 Sign out</button>
    </div>`);
}

/* ---------- rulebook (settings-aware: sections for disabled modules disappear) ----------
   Single source of truth: rulesHtml() feeds both the modal (rulesPage) and the Rules view (renderRules). */
function rulesHtml(){
  const cfg = Object.assign({ duels:true, bold:true, plays:true, perfect:true }, (S.pool && S.pool.settings) || {});
  const sec = (title, body) => `<div class="rsec"><h4>${title}</h4>${body}</div>`;
  let html = '';

  html += sec('The picks', `
    <p>Every gameweek, call each match before it kicks off:</p>
    <p><b>Outright</b> — home win, draw, or away win. Hits pay <b>3 pts</b>.</p>
    <p><b>Double chance</b> — cover two results (home-or-draw / away-or-draw). Hits pay <b>1 pt</b>.</p>
    <p>Miss either way: 0. <b>Each pick locks individually at that match's kickoff</b> — not when the
    gameweek starts. Later games in the same week stay open until their own kickoffs. Everyone's picks
    are hidden until each game kicks off, so there's no copying.</p>`);

  html += sec('The Banker ⭐', `
    <p>Star one game per gameweek. Whatever it earns is <b>doubled</b> — 6 for a correct outright,
    2 for a correct double chance, still 0 for a miss. Star two games in one week and <b>both are void</b>.
    The star locks with its game.</p>`);

  if (cfg.bold) html += sec('Bold Calls 🎲', `
    <p>A correct <b>outright</b> pick that <b>25% or fewer</b> of the group made earns <b>+1 bonus</b>
    (needs 4+ picks on the game; double chance never qualifies). Fade the crowd, get paid.</p>`);

  if (cfg.perfect) html += sec('Perfect 10 💯', `
    <p>Every game in a gameweek correct — outright or double chance — on a full card of 6+ games:
    <b>+5 bonus</b>. You must have picked every game.</p>`);

  if (cfg.duels) html += sec('Weekly Duels ⚔️', `
    <p>A separate side competition. Each week you're auto-matched 1v1 — rotating so you face everyone.
    Higher gameweek score wins: <b>3</b> duel pts for the win, <b>1</b> each for a tie, <b>0</b> for the loss
    (bye week counts as a draw). Duels settle once the whole gameweek is final.</p>
    <p><b>Two leaderboards, never merged:</b> the main standings count pick points only
    (picks + banker${cfg.bold ? ' + bold calls' : ''}${cfg.perfect ? ' + Perfect 10' : ''}) and decide trophies
    and the Points King. The duel table counts only duel points and decides only the Duelist title.</p>`);

  html += sec('Months & the Championship 🏆', `
    <p>The season is split into <b>calendar months</b>. Top scorer each month takes that month's trophy,
    then everyone resets to zero — a bad month never buries your season. The final month is the
    <b>Championship</b>: every monthly trophy you won gives you a <b>+2 head start</b> in it.</p>`);

  html += sec('House rules', `
    <p><b>Locks are absolute</b> — enforced server-side, no 89th-minute edits.</p>
    <p><b>Postponed games:</b> fixtures sync automatically; your pick carries over and the lock follows
    the new kickoff. You'll see moves in the notification bell.</p>
    <p><b>Results are automatic</b> — live official data, no manual entry, no arguments.</p>
    <p><b>No pick = 0.</b> Set your card early; everything is changeable until each kickoff.</p>
    <p><b>Ties</b> at the top of a month: both take the trophy (and the head start).</p>`);

  return html;
}
function rulesPage(){
  showModal(`<div class="playmeta">${esc(S.pool ? S.pool.name : 'PrimePicks Arena')} · Official rules</div><h3>📖 How the game works</h3>
    <div class="rules">${rulesHtml()}</div>
    <div class="mrow"><button class="btn primary" onclick="closeModal()">✕ Close</button></div>`);
}
function renderRules(){ $('rulesbody').innerHTML = rulesHtml(); }

/* ---------- profile ---------- */
const AVCOL = ['#22ff88','#2ee6ff','#ff2e88','#ffcf40','#8b6ad1','#ff8c42','#0057B8','#C8102E','#00954C','#EE8707','#132257','#A50044'];
// character avatars — code 'e<i>' pairs a character with a colour
const AVCHARS = ['⚽','🦁','🦅','🐺','🦊','🐉','👑','🎯','🔥','❄️','⚡','🧤','🥅','🛡️','🚀','🏆'];
function avatarHtml(p, size){
  const dim = size || 26;
  // defense in depth: only render photo avatars from Google's own host (rules enforce this
  // too) — an arbitrary URL would leak viewers' IPs to whoever controls it
  if (p.avatar && p.avatar.startsWith('g:https://lh3.googleusercontent.com/'))
    return `<span class="avatar" style="width:${dim}px;height:${dim}px"><img src="${esc(p.avatar.slice(2))}" referrerpolicy="no-referrer" onerror="this.remove()"></span>`;
  // character avatar ('e<i>') — a mascot on a colour
  if (p.avatar && /^e\d+$/.test(p.avatar)){
    const i = +p.avatar.slice(1) % AVCHARS.length;
    return `<span class="avatar" style="width:${dim}px;height:${dim}px;font-size:${Math.round(dim*.58)}px;background:${AVCOL[i % AVCOL.length]}">${AVCHARS[i]}</span>`;
  }
  // legacy colour-initial ('c<i>') or default from name
  const i = p.avatar && /^c\d+$/.test(p.avatar) ? +p.avatar.slice(1) % AVCOL.length : (p.name || 'x').charCodeAt(0) % AVCOL.length;
  const col = AVCOL[i];
  return `<span class="avatar" style="width:${dim}px;height:${dim}px;font-size:${Math.round(dim*.45)}px;background:${col};color:${inkFor(col)};font-weight:900">${esc((p.name||'?')[0].toUpperCase())}</span>`;
}
function editProfile(){
  const g = api.googlePhoto ? api.googlePhoto() : null;
  const cur = S.me.avatar || '';
  showModal(`<div class="playmeta">Your profile</div><h3>Edit profile</h3>
    <label>Display name</label><input id="pf-name" maxlength="20" value="${esc(S.me.name)}">
    <label>Avatar</label>
    <div class="avgrid">
      ${g ? `<div class="av ${cur==='g:'+g?'on':''}" data-av="g:${esc(g)}" onclick="pickAv(this)"><img src="${esc(g)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" referrerpolicy="no-referrer"></div>` : ''}
      ${AVCHARS.map((ch,i) => `<div class="av ${cur==='e'+i?'on':''}" data-av="e${i}" style="background:${AVCOL[i % AVCOL.length]}" onclick="pickAv(this)">${ch}</div>`).join('')}
    </div>
    <div class="mrow"><button class="btn" onclick="closeModal()">Cancel</button>
    <button class="btn primary" onclick="saveProfile()">Save profile</button></div>
    <div class="err" id="pferr"></div>`);
}
function pickAv(el){ document.querySelectorAll('.av').forEach(a => a.classList.remove('on')); el.classList.add('on'); }
async function saveProfile(){
  const name = $('pf-name').value.trim();
  if (!name){ $('pferr').textContent = 'Name required.'; return; }
  const sel = document.querySelector('.av.on');
  const avatar = sel ? sel.dataset.av : (S.me.avatar || '');
  try{
    await api.updateProfile(name.slice(0,20), avatar, S.pool.code);
    closeModal(); await loadAll(); toast('Profile updated'); render();
    const badge = esc(S.me.name) + (S.me.is_admin ? ' <span class="chip ice">ADMIN</span>' : '') + (DEMO ? ' <span class="chip fire">DEMO</span>' : '');
    $('username').innerHTML = badge;
    $('sideuser').innerHTML = badge + '<div class="tag" style="margin-top:4px">' + esc(S.pool.name) + '</div>';
  }catch(e){ $('pferr').textContent = friendly(e); }
}

function copyInvite(){
  const link = location.origin + location.pathname + '?join=' + S.pool.code;
  const done = () => toast('Invite link copied');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => prompt('Copy this link:', link));
  else prompt('Copy this link:', link);
}

/* ---------- shared ui ---------- */
function crest(comp, t){
  const url = badgeUrl(comp, t);
  const fallback = `<span class="crest" style="background:${teamColor(comp,t)}">${esc(t.split(' ').map(w=>w[0]).join('').slice(0,3).toUpperCase())}</span>`;
  return url ? `<span class="crest img"><img src="${url}" alt="" loading="lazy" onerror="this.parentElement.outerHTML='${fallback.replace(/'/g,'&#39;').replace(/"/g,'&quot;')}'"></span>` : fallback;
}
function fmtKO(iso){
  const d = new Date(iso);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) // placeholder time from the feed — don't invent a kickoff
    return d.toLocaleDateString([], {weekday:'short',day:'numeric',month:'short'}) + ' · time TBC';
  return d.toLocaleString([], {weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
}
function maxGw(comp){ return S.fixtures[comp].reduce((m,f) => Math.max(m, f.gw), 0); }
function compBar(elId){
  const el = $(elId); el.innerHTML = '';
  for (const c of S.comps){
    const b = document.createElement('button');
    b.className = 'comp' + (c === S.comp ? ' on' : '');
    b.innerHTML = leagueLogo(c) + COMPS[c].short;
    b.onclick = () => { S.comp = c; S.arming = null; S.resEdit = false; render(); };
    el.appendChild(b);
  }
}
function gwBar(el, comp, sel, onpick){
  el.innerHTML = '';
  const sp = calc(comp).splits;
  for (let g = 1; g <= maxGw(comp); g++){
    const b = document.createElement('button');
    b.className = 'gwpill' + (g === sel ? ' on' : '') + (gwDone(comp, g) ? ' done' : '');
    const si = sp.sOf(g);
    b.innerHTML = `${g}<span class="sp">${si === sp.champIdx ? 'CH' : sp.short[si]}</span>`;
    b.onclick = () => onpick(g);
    el.appendChild(b);
  }
  // only auto-centre the bar when the selected GW actually changed — never yank the page mid-scroll
  if (el.dataset.sel !== String(sel)){
    el.dataset.sel = String(sel);
    const on = el.querySelector('.on'); if (on) on.scrollIntoView({inline:'center', block:'nearest'});
  }
}
function nav(v){
  S.view = v; S.arming = null;
  document.querySelectorAll('#mobilenav button,#side .snav').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  ['picks','arena','table','gw','stats','rules','admin'].forEach(x => $('v-' + x).classList.toggle('hide', x !== v));
  render();
}
function toast(msg){ const b = $('savebadge'); b.textContent = msg || 'Saved ✓'; b.classList.add('show'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show'), 1400); }
function friendly(e){ const m = String(e.message || e); return /permission|denied/i.test(m) ? 'Locked — the game has kicked off (or sign in again).' : m; }

/* ---------- plays ---------- */
function myPlays(comp){ return S.plays.filter(p => p.user_id === S.uid && p.comp === comp); }
function playUsedInSplit(comp, split, play){
  const mine = calc(comp).plays.filter(p => p.user_id === S.uid && p.play === play && calc(comp).splits.sOf(p.gw) === split);
  const allowance = play === 'double' && calc(comp).catchup[S.uid] && calc(comp).catchup[S.uid][split] ? 2 : 1;
  return { used: mine.length, allowance };
}
function playThisGw(comp, gw){ return calc(comp).plays.find(p => p.user_id === S.uid && p.gw === gw); }
function renderPlays(comp, gw){
  const el = $('playstrip'); el.innerHTML = '';
  const split = calc(comp).splits.sOf(gw);
  const gwPlay = playThisGw(comp, gw);
  const anyKicked = fixturesOfGw(comp, gw).some(kicked);
  const allKicked = fixturesOfGw(comp, gw).every(kicked);
  for (const key of ['double','safety','oracle']){
    const info = PLAYINFO[key];
    const { used, allowance } = playUsedInSplit(comp, split, key);
    const activeHere = gwPlay && gwPlay.play === key;
    const d = document.createElement('div');
    let cls = 'play', sub = info.desc;
    if (activeHere){ cls += ' active'; sub = anyKicked ? 'in play this GW' : 'active — tap to manage'; }
    else if (used >= allowance){ cls += ' used'; sub = 'used this month'; }
    else if (gwPlay){ cls += ' used'; sub = 'one play per GW'; }
    else if (allKicked){ cls += ' used'; sub = 'GW finished'; }
    if (S.arming === key) cls += ' arming';
    d.className = cls;
    d.innerHTML = `<div class="pi">${info.icon}</div><div class="pn">${info.name}</div><div class="ps">${sub}${used < allowance && allowance > 1 ? ' ('+(allowance-used)+' left)' : ''}</div>`;
    d.onclick = () => onPlayTap(key, comp, gw, { activeHere, used, allowance, gwPlay, anyKicked, allKicked });
    el.appendChild(d);
  }
}
function onPlayTap(key, comp, gw, ctx){
  const info = PLAYINFO[key];
  // any unusable state still explains itself — tap always answers "what IS this?"
  const explain = status => showModal(`<div class="playmeta">Play · one per league per month</div><h3>${info.icon} ${info.name}</h3>
    <p class="msub">${info.long}</p>
    <p class="msub"><b>Status:</b> ${status}. Plays can be withdrawn until the gameweek's first kickoff, and the admin can switch Plays off entirely in Group settings.</p>
    <div class="mrow"><button class="btn primary" onclick="closeModal()">Got it</button></div>`);
  // manage an active play — withdrawable until the gameweek's first kickoff
  if (ctx.activeHere){
    if (ctx.anyKicked){ explain('active this gameweek and locked in — the first game has kicked off'); return; }
    showModal(`<div class="playmeta">Active play · GW ${gw}</div><h3>${info.icon} ${info.name}</h3>
      <p class="msub">${info.long}</p>
      <p class="msub">You can withdraw it any time before the first game of GW ${gw} kicks off — it goes back into your hand for this month.</p>
      <div class="mrow"><button class="btn" onclick="closeModal()">Keep it</button>
      <button class="btn mag" onclick="withdrawPlay('${comp}',${gw})">Withdraw play</button></div>`);
    return;
  }
  if (ctx.allKicked){ explain('this gameweek has finished'); return; }
  if (ctx.gwPlay){ explain('you already have a play active this gameweek (one per GW)'); return; }
  if (ctx.used >= ctx.allowance){ explain('already used this month — your hand refreshes when the new month starts'); return; }
  if (key === 'double'){
    showModal(`<div class="playmeta">Play · one per month</div><h3>${info.icon} ${info.name}</h3>
      <p class="msub">${info.long}</p>
      <p class="msub">Next: choose which game carries it. Withdrawable until GW ${gw}'s first kickoff.</p>
      <div class="mrow"><button class="btn" onclick="closeModal()">Not now</button>
      <button class="btn primary" onclick="closeModal();S.arming='double';renderPicks();toast('Choose the game to double')">Choose the game</button></div>`);
    return;
  }
  showModal(`<div class="playmeta">Play · one per month</div><h3>${info.icon} ${info.name}</h3>
    <p class="msub">${info.long}</p>
    <p class="msub">Applies to GW ${gw}. Withdrawable until the first kickoff.</p>
    <div class="mrow"><button class="btn" onclick="closeModal()">Not now</button>
    <button class="btn primary" onclick="confirmPlay('${key}','${comp}',${gw})">Play it</button></div>`);
}
async function confirmPlay(key, comp, gw){
  closeModal();
  try{
    await api.usePlay({ comp, gw, play: key });
    S.plays.push({ user_id: S.uid, comp, gw, play: key }); bump();
    toast(PLAYINFO[key].name + ' is active');
    renderPicks();
  }catch(e){ alert(friendly(e)); }
}
async function withdrawPlay(comp, gw){
  closeModal();
  if (fixturesOfGw(comp, gw).some(kicked)){ toast('Too late — the gameweek has started'); return; }
  try{
    await api.clearPlay(comp, gw);
    S.plays = S.plays.filter(p => !(p.user_id === S.uid && p.comp === comp && p.gw === gw));
    bump(); toast('Play withdrawn — back in your hand');
    renderPicks();
  }catch(e){ alert(friendly(e)); }
}
async function armDouble(fid){
  const comp = S.comp, f = S.fixtures[comp].find(x => x.id === fid);
  if (kicked(f)){ toast('Game already kicked off'); return; }
  if (!myPick(fid)){ toast('Make a pick on it first'); return; }
  showModal(`<div class="playmeta">Prime Time · GW ${f.gw}</div><h3>${esc(f.home)} v ${esc(f.away)}</h3>
    <p class="msub">This game becomes your second banker and scores ×2. Your regular banker is unaffected. Withdrawable until the gameweek's first kickoff.</p>
    <div class="mrow"><button class="btn" onclick="closeModal()">Back</button>
    <button class="btn primary" onclick="confirmDouble('${fid}')">Make it Prime Time</button></div>`);
}
async function confirmDouble(fid){
  closeModal();
  const comp = S.comp, f = S.fixtures[comp].find(x => x.id === fid);
  try{
    await api.usePlay({ comp, gw: f.gw, play: 'double', fixture_id: fid });
    S.plays.push({ user_id: S.uid, comp, gw: f.gw, play: 'double', fixture_id: fid });
    S.arming = null; bump(); toast('Prime Time set'); renderPicks();
  }catch(e){ alert(friendly(e)); }
}

/* ---------- picks view ---------- */
function renderPicks(){
  compBar('comps-picks');
  const comp = S.comp, gw = S.gw[comp];
  gwBar($('gwbar-picks'), comp, gw, g => { S.gw[comp] = g; S.arming = null; renderPicks(); });
  if (S.pool && !S.pool.settings.plays) $('playstrip').innerHTML = '';
  else renderPlays(comp, gw);
  const fs = fixturesOfGw(comp, gw);
  const next = fs.filter(f => !kicked(f)).sort((a,b) => new Date(a.kickoff) - new Date(b.kickoff))[0];
  const scNow = calc(comp);
  const made = fs.filter(f => myPick(f.id)).length;
  const opp = (scNow.duelOf[gw] || E.pairings(S.profiles.map(p=>p.id), gw))[S.uid];
  const duelBit = opp ? ` · ⚔️ ${esc(nameOf(opp))} ${scNow.gwPts[S.uid][gw]||0}–${scNow.gwPts[opp] ? scNow.gwPts[opp][gw]||0 : 0}` : '';
  $('pickdeadline').innerHTML = !S.seeded
    ? '⚠️ League not set up yet — admin needs to load fixtures (Admin tab)'
    : `${splitLabel(scNow.splits, scNow.splits.sOf(gw))} · ${made}/${fs.length} picked${duelBit} · ${next ? 'first lock ' + fmtKO(next.kickoff) : 'all kicked off'}`;
  const sc = calc(comp);
  const oracle = sc.plays.some(p => p.user_id === S.uid && p.gw === gw && p.play === 'oracle');
  const myDouble = sc.plays.find(p => p.user_id === S.uid && p.gw === gw && p.play === 'double');
  const list = $('picklist'); list.innerHTML = '';
  for (const f of fs) list.appendChild(fxCard(comp, f, sc, oracle, myDouble));
}
/* one fixture card — built standalone so a pick can refresh JUST its own card in place */
function fxCard(comp, f, sc, oracle, myDouble){
  {
    const mine = myPick(f.id), res = S.results[f.id];
    const lv = !res && S.live ? S.live[f.id] : null;
    // lock if the clock says so OR reality says so (live/finished per ESPN) — a stale
    // stored kickoff can never leave a game pickable while it's actually being played
    const locked = kicked(f) || !!res || !!lv;
    const out = res ? E.outcome(res) : null;
    const isDD = myDouble && myDouble.fixture_id === f.id;
    const div = document.createElement('div');
    div.id = 'fx-' + f.id;
    div.className = 'fx' + (isDD ? ' dd' : '');
    const opts = [['H','Home'],['HD','H / D'],['D','Draw'],['AD','A / D'],['A','Away']];
    // oracle / post-kickoff percentages
    const cnt = locked ? sc.dist[f.id] : (oracle ? (S.counts[f.id] || null) : null);
    const pct = v => { if (!cnt) return ''; const t = Object.keys(cnt).filter(k=>k!=='total').reduce((s,k)=>s+cnt[k],0); return t ? `<span class="orc">${Math.round(100*(cnt[v]||0)/t)}%</span>` : ''; };
    const boldHit = res && mine && mine.pick === out && sc.dist[f.id].total >= E.BOLD_MIN_PICKS && sc.dist[f.id][mine.pick] / sc.dist[f.id].total <= E.BOLD_MAX_SHARE;
    const rc = TEAMRESOLVE(comp, f.home, f.away); // clash-proof: home keeps its colour, away adapts
    const hCol = rc.h, aCol = rc.a;
    // a game sitting far from the rest of its round was moved (cup clash / weather / TV):
    // label it so interleaved rounds read as intentional, not broken
    const roundTimes = fixturesOfGw(comp, f.gw).map(x => new Date(x.kickoff).getTime()).sort((a,b) => a-b);
    const median = roundTimes[Math.floor(roundTimes.length / 2)];
    const rearranged = Math.abs(new Date(f.kickoff).getTime() - median) > 5 * 24 * 3600e3;
    div.innerHTML = `
      ${boldHit ? '<span class="boldtag">BOLD +1</span>' : ''}
      <div class="meta"><span>GW ${f.gw} · ${fmtKO(f.kickoff)}${rearranged ? ' · <b style="color:var(--gold)">rearranged</b>' : ''}${isDD ? ' · <b style="color:var(--vio)">PRIME TIME ×2</b>' : ''}</span>
        <span>${S.arming === 'double' && !locked ? `<button class="btn small mag" onclick="armDouble('${f.id}')">◎ prime this</button>` :
          locked ? `${mine&&mine.banker?'<span title="Your banker">⭐</span> ':''}${res?'FT':lv?`<span class="livebadge">● LIVE ${esc(lv.minute||'')}</span>`:'<span class="locked">🔒 LOCKED</span>'}`
          : `<button class="bankbtn ${mine&&mine.banker?'on':''}" title="Banker — doubles this game" onclick="setBanker('${f.id}')">⭐</button>`}</span></div>
      <div class="teams">
        <div class="team">${crest(comp, f.home)}<span class="nm">${esc(f.home)}</span></div>
        ${res ? `<span class="score">${res.h} – ${res.a}</span>` : lv ? `<span class="score" style="color:var(--mag)">${lv.h} – ${lv.a}</span>` : `<span class="vs">vs</span>`}
        <div class="team away">${crest(comp, f.away)}<span class="nm">${esc(f.away)}</span></div>
      </div>
      <div class="pickrow">${opts.map(([v,l]) => {
        const sel = mine && mine.pick === v;
        let cls = 'pk' + (sel ? ' sel' : '') + (sel && v.length === 2 ? ' dc' : '');
        const miss = res && sel && E.basePts(v, out) === 0;
        if (res && sel) cls += miss ? ' miss' : ' hit';
        // selections carry the club's colours: home picks in home colours, away picks in away colours
        let style = '';
        if (sel && !miss){
          const col = v === 'H' || v === 'HD' ? hCol : v === 'A' || v === 'AD' ? aCol : null;
          if (col) style = `style="background:${col};border-color:${col};color:${inkFor(col)}"`;
        }
        return `<button class="${cls}" ${style} ${locked?'disabled':''} onclick="setPick('${f.id}','${v}')">${l}${pct(v)}<small>${v.length===2?'1 pt':'3 pts'}</small></button>`;
      }).join('')}</div>`;
    return div;
  }
}
/* colour of a given pick option on a given fixture: team colour for sides, silver for the draw */
function pickColor(comp, f, v){
  if (v === 'D') return getComputedStyle(document.documentElement).getPropertyValue('--draw').trim() || '#e8edf7';
  const rc = TEAMRESOLVE(comp, f.home, f.away);
  return (v === 'H' || v === 'HD') ? rc.h : rc.a;
}
/* refresh specific cards in place — no full re-render, no scroll movement, pick-coloured confirm pulse */
function refreshCards(fids, pulseFid, pulseColor){
  const comp = S.comp, gw = S.gw[comp], sc = calc(comp);
  const oracle = sc.plays.some(p => p.user_id === S.uid && p.gw === gw && p.play === 'oracle');
  const myDouble = sc.plays.find(p => p.user_id === S.uid && p.gw === gw && p.play === 'double');
  for (const fid of fids){
    const old = $('fx-' + fid);
    const f = S.fixtures[comp].find(x => x.id === fid);
    if (!old || !f) continue;
    const fresh = fxCard(comp, f, sc, oracle, myDouble);
    old.replaceWith(fresh);
    if (fid === pulseFid){
      if (pulseColor) fresh.style.setProperty('--pulse', pulseColor);
      fresh.classList.add('saved'); setTimeout(() => fresh.classList.remove('saved'), 1100);
    }
  }
}
/* ---------- optimistic pick engine ----------
   The screen updates the instant you tap; Firebase catches up in the background.
   Rapid taps on the same game coalesce — only your FINAL choice is written.
   If the server rejects (e.g. kickoff passed mid-tap), we roll back to the last
   confirmed state and tell you. */
var PICK_FLUSH_MS = 250;               // debounce window for tap bursts (tests may shorten)
const PW = {};                         // fid → { base, timer, inflight, dirty }
function pwSnapshot(fid){              // last server-confirmed state, captured before first local change
  const mine = myPick(fid);
  return mine ? { exists:true, pick: mine.pick, banker: !!mine.banker } : { exists:false };
}
function pwEnsure(fid){ return PW[fid] = PW[fid] || { base: pwSnapshot(fid) }; } // MUST run before the local mutation
function queuePickWrite(fid){
  const p = PW[fid] || pwEnsure(fid);
  p.dirty = true;
  clearTimeout(p.timer);
  p.timer = setTimeout(() => flushPickWrite(fid), PICK_FLUSH_MS);
}
/* if the phone backgrounds the app (home-screen PWA swipe, tab switch, screen lock),
   don't wait out the debounce — push every pending pick immediately */
function flushAllPicks(){ for (const fid in PW){ clearTimeout(PW[fid].timer); flushPickWrite(fid); } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAllPicks(); });
window.addEventListener('pagehide', flushAllPicks);
async function flushPickWrite(fid){
  const p = PW[fid];
  if (!p || p.inflight) return;        // an in-flight write re-flushes on landing if still dirty
  p.dirty = false; p.inflight = true;
  const mine = myPick(fid);            // desired end-state right now
  try{
    if (!mine) await api.clearPick(fid);
    else await api.savePick(fid, mine.pick, mine.banker || false);
    p.inflight = false;
    if (p.dirty) flushPickWrite(fid);  // choice changed while we were writing — send the newest
    else delete PW[fid];               // settled: local and server agree
  }catch(e){
    p.inflight = false;
    revertPick(fid, p.base); delete PW[fid];
    alert(friendly(e));
  }
}
function revertPick(fid, base){
  S.picks = S.picks.filter(x => !(x.fixture_id === fid && x.user_id === S.uid));
  if (base && base.exists){
    const comp = S.comp, f = S.fixtures[comp].find(x => x.id === fid);
    S.picks.push({ user_id: S.uid, fixture_id: fid, comp, gw: f ? f.gw : 0, pick: base.pick, banker: base.banker });
  }
  bump(); refreshCards([fid]);
}
function setPick(fid, val){
  const comp = S.comp, f = S.fixtures[comp].find(x => x.id === fid);
  const mine = myPick(fid);
  pwEnsure(fid);                       // capture the confirmed state BEFORE we touch it
  let pulse = null;
  if (mine && mine.pick === val){      // tap your own pick again = clear it
    S.picks = S.picks.filter(p => !(p.fixture_id === fid && p.user_id === S.uid));
  } else {
    if (mine) mine.pick = val;
    else S.picks.push({ user_id: S.uid, fixture_id: fid, comp, gw: f.gw, pick: val, banker: false });
    pulse = pickColor(comp, f, val);   // Man City home → the whole card pulses City blue
  }
  bump(); refreshCards([fid], fid, pulse);  // paint NOW
  queuePickWrite(fid);                      // write soon (coalesced)
}
async function setBanker(fid){
  const comp = S.comp, f = S.fixtures[comp].find(x => x.id === fid), mine = myPick(fid);
  if (!mine){ alert('Make a pick first, then star it.'); return; }
  // banker writes go immediately (they can touch two games) but the UI never waits
  if (mine.banker){
    const base = pwSnapshot(fid);
    mine.banker = false;
    bump(); refreshCards([fid], fid, pickColor(comp, f, mine.pick));
    try{ await api.clearBanker(fid, mine.pick); }
    catch(e){ revertPick(fid, base); alert(friendly(e)); }
  } else {
    const old = S.picks.find(p => p.user_id === S.uid && p.comp === comp && p.gw === f.gw && p.banker);
    if (old && kicked(S.fixtures[comp].find(x => x.id === old.fixture_id))){ alert('Your banker this week is already locked in.'); return; }
    const base = pwSnapshot(fid), oldBase = old ? pwSnapshot(old.fixture_id) : null, oldFid = old ? old.fixture_id : null;
    if (old) old.banker = false;
    mine.banker = true;
    bump(); refreshCards(oldFid ? [oldFid, fid] : [fid], fid, pickColor(comp, f, mine.pick));
    try{ await api.setBanker(fid, mine.pick, oldFid, old ? old.pick : null); }
    catch(e){
      revertPick(fid, base);
      if (oldFid) revertPick(oldFid, oldBase);
      alert(friendly(e));
    }
  }
}

/* ---------- arena view ---------- */
function splitLabel(sp, s){ return s === sp.champIdx ? 'Championship — ' + sp.names[s] : sp.names[s]; }
function renderArena(){
  compBar('comps-arena');
  $('poolname').textContent = S.pool ? S.pool.name : '';
  $('poolcode').textContent = S.pool ? S.pool.code : '';
  const comp = S.comp, sc = calc(comp);
  const gw = currentGw(comp), split = sc.splits.sOf(gw);
  // duel card (module can be off in group settings)
  $('duelcard').classList.toggle('hide', !sc.cfg.duels);
  $('duelcard2').classList.toggle('hide', !sc.cfg.duels);
  const opp = sc.cfg.duels ? (sc.duelOf[gw] || E.pairings(S.profiles.map(p=>p.id), gw))[S.uid] : undefined;
  const myPts = sc.gwPts[S.uid] ? (sc.gwPts[S.uid][gw] || 0) : 0;
  const opPts = opp && sc.gwPts[opp] ? (sc.gwPts[opp][gw] || 0) : 0;
  const rec = sc.duels[S.uid] || { w:0, d:0, l:0 };
  const mainDuel = opp === null || opp === undefined
    ? `<div class="tag">⚔️ Duel of the week — GW ${gw}</div><div style="margin-top:8px;font-weight:700">Bye week — automatic draw (+1)</div>`
    : `<div class="tag">⚔️ Duel of the week — GW ${gw} · your record ${rec.w}-${rec.d}-${rec.l}</div>
       <div class="duelrow">
         <div class="duelside"><div>${avatarHtml(S.me, 40)}</div><div class="dn">${esc(nameOf(S.uid))}</div><div class="dp">${myPts}</div></div>
         <div class="duelvs">VS</div>
         <div class="duelside"><div>${avatarHtml(S.profiles.find(x=>x.id===opp)||{name:'?'}, 40)}</div><div class="dn">${esc(nameOf(opp))}</div><div class="dp">${opPts}</div></div>
       </div>
       <div class="tag" style="margin-top:8px;text-align:center">${gwDone(comp, gw) ? 'Final' : 'Live — beat them for 3 duel pts'}</div>`;
  // every duel in the pool this gameweek — nobody plays in the dark
  let allDuels = '';
  if (sc.cfg.duels){
    const pairMap = sc.duelOf[gw] || E.pairings(S.profiles.map(p=>p.id), gw);
    const done = gwDone(comp, gw), seen = {}, rows = [];
    for (const p of S.profiles){
      const o = pairMap[p.id];
      if (o === null) { rows.push({ bye: p.id }); continue; }
      if (o === undefined || seen[p.id] || seen[o]) continue;
      seen[p.id] = seen[o] = 1;
      const a = sc.gwPts[p.id] ? (sc.gwPts[p.id][gw] || 0) : 0;
      const b = sc.gwPts[o] ? (sc.gwPts[o][gw] || 0) : 0;
      rows.push({ u: p.id, o, a, b });
    }
    if (rows.length) allDuels = `<div class="tag" style="margin-top:14px;margin-bottom:2px">All duels — GW ${gw} ${done ? '· final' : '· live'}</div>` +
      rows.map(r => r.bye !== undefined
        ? `<div class="adrow"><span class="adn">${avatarHtml(S.profiles.find(x=>x.id===r.bye)||{name:'?'}, 22)}${esc(nameOf(r.bye))}</span><span class="adbye">bye · auto-draw +1</span></div>`
        : `<div class="adrow">
             <span class="adn${!done && r.a>r.b ? ' lead' : done && r.a>r.b ? ' won' : ''}">${avatarHtml(S.profiles.find(x=>x.id===r.u)||{name:'?'}, 22)}${esc(nameOf(r.u))}</span>
             <span class="adscore">${r.a} – ${r.b}</span>
             <span class="adn right${!done && r.b>r.a ? ' lead' : done && r.b>r.a ? ' won' : ''}">${esc(nameOf(r.o))}${avatarHtml(S.profiles.find(x=>x.id===r.o)||{name:'?'}, 22)}</span>
           </div>`).join('');
  }
  $('duelcard').innerHTML = mainDuel + allDuels;
  // split strip (trophy shelf — one per month)
  const spGws = sc.splits.gwsOf(split);
  $('splitracetitle').textContent = `${splitLabel(sc.splits, split)} race — GW ${Math.min(...spGws)}–${Math.max(...spGws)}`;
  const strip = $('splitstrip'); strip.innerHTML = '';
  for (let s = 1; s <= sc.splits.count; s++){
    const d = document.createElement('div');
    d.className = 'strophy' + (s === split ? ' now' : '');
    const w = sc.splitWinners[s];
    const isCh = s === sc.splits.champIdx;
    d.innerHTML = `<div class="se">${isCh ? '👑' : '🏆'}</div><div class="sn">${(isCh ? 'CHAMPIONSHIP' : sc.splits.names[s].toUpperCase())}</div>
      <div class="sw">${w ? esc(w.map(nameOf).join(', ')) : s === split ? 'LIVE' : isCh ? sc.splits.names[s] : '—'}</div>`;
    strip.appendChild(d);
  }
  // split race bars
  const anyResults = Object.keys(S.results).some(fid => fid.startsWith(comp + '-'));
  $('splitrace').innerHTML = anyResults ? raceBars(comp, split)
    : '<div class="tag" style="padding:12px 0">The race lights up when the first results land. Get your picks in.</div>';
  // duel table
  const rows = [...S.profiles].sort((a,b) => sc.duels[b.id].pts - sc.duels[a.id].pts || sc.duels[b.id].w - sc.duels[a.id].w);
  $('dueltable').innerHTML = `<tr><th>#</th><th>Player</th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr>` +
    rows.map((p,i) => { const d = sc.duels[p.id];
      return `<tr class="${p.id===S.uid?'me':''}"><td>${i+1}</td><td>${esc(p.name)}</td><td>${d.w}</td><td>${d.d}</td><td>${d.l}</td><td class="pts">${d.pts}</td></tr>`; }).join('');
}
function raceBars(comp, split){
  const sc = calc(comp);
  const isCh = split === sc.splits.champIdx;
  const key = isCh ? sc.champ : Object.fromEntries(S.profiles.map(p => [p.id, sc.splitPts[p.id][split] || 0]));
  const rows = [...S.profiles].sort((a,b) => key[b.id] - key[a.id]);
  const max = Math.max(1, ...rows.map(p => key[p.id]));
  return rows.map((p,i) => `<div class="racerow"><span class="rn">${i+1}</span><span class="rname">${esc(p.name)}${isCh && Object.values(sc.splitWinners).some(w=>w.includes(p.id)) ? ' <span title="month titles head start">👑</span>':''}</span>
    <span class="racebar"><i style="width:${Math.round(100*key[p.id]/max)}%"></i></span><span class="rv">${key[p.id]}</span></div>`).join('');
}

/* ---------- standings ---------- */
function renderTable(){
  compBar('comps-table');
  const tabs = $('tabletabs'); tabs.innerHTML = '';
  const modes = [['comp', COMPS[S.comp].short + ' season'], ...(S.comps.length > 1 ? [['overall','Overall (all leagues)']] : [])];
  tabs.classList.toggle('hide', modes.length < 2); // one league = nothing to switch, no lonely button
  for (const [m, label] of modes){
    const b = document.createElement('button');
    b.className = 'subtab' + (S.tableMode === m ? ' on' : '');
    b.textContent = label; b.onclick = () => { S.tableMode = m; renderTable(); };
    tabs.appendChild(b);
  }
  const scs = S.tableMode === 'overall' ? S.comps.map(calc) : [calc(S.comp)];
  const tot = {}, out3 = {}, bold = {}, perf = {}, duel = {};
  for (const p of S.profiles){ tot[p.id]=0; out3[p.id]=0; bold[p.id]=0; perf[p.id]=0; duel[p.id]=0;
    for (const sc of scs){ tot[p.id]+=sc.totals[p.id]; out3[p.id]+=sc.outright[p.id]; bold[p.id]+=sc.bold[p.id]; perf[p.id]+=sc.perfects[p.id]; duel[p.id]+=sc.duels[p.id].pts; } }
  const sc0 = calc(S.comp);
  const gNow = currentGw(S.comp), gPrev = Math.max(1, gNow-1), gPrev2 = Math.max(1, gNow-2);
  const rows = [...S.profiles].sort((a,b) => tot[b.id]-tot[a.id] || out3[b.id]-out3[a.id] || a.name.localeCompare(b.name));
  const cfg = sc0.cfg; // columns follow group settings — no dead columns for disabled modules
  let html = `<tr><th>#</th><th></th><th>Player</th><th>Pts</th><th>3s</th>${cfg.bold?'<th>🎲</th>':''}${cfg.perfect?'<th>💯</th>':''}${cfg.duels?'<th>⚔️</th>':''}<th>🔥</th></tr>`;
  rows.forEach((p,i) => {
    const rank = g => [...S.profiles].sort((a,b) => (sc0.cum[b.id][g]||0)-(sc0.cum[a.id][g]||0)).findIndex(x=>x.id===p.id)+1;
    const d = rank(gPrev2) - rank(gPrev);
    const mv = S.tableMode==='overall' ? '' : d>0?`<span class="mv up">▲${d}</span>`:d<0?`<span class="mv dn">▼${-d}</span>`:`<span class="mv sm">–</span>`;
    const st = sc0.streaks[p.id];
    html += `<tr class="${p.id===S.uid?'me':''}"><td class="${i===0?'rank1':''}">${i+1}</td><td>${mv}</td>
      <td>${avatarHtml(p, 22)}${esc(p.name)}${i===0?' <span class="chip gold">LEADER</span>':''}${st.cur>=5&&S.tableMode!=='overall'?' <span class="chip fire">🔥'+st.cur+'</span>':''}</td>
      <td class="pts">${tot[p.id]}</td><td>${out3[p.id]}</td>${cfg.bold?`<td>${bold[p.id]}</td>`:''}${cfg.perfect?`<td>${perf[p.id]}</td>`:''}${cfg.duels?`<td>${duel[p.id]}</td>`:''}<td>${st.best}</td></tr>`;
  });
  $('lbtable').innerHTML = html;
  // legend — so nobody has to ask what the emojis mean
  $('lblegend').innerHTML = `<b>Pts</b> total points &nbsp;·&nbsp; <b>3s</b> outright results called`
    + (cfg.bold ? ` &nbsp;·&nbsp; <b>🎲</b> bold calls landed (+1s)` : '')
    + (cfg.perfect ? ` &nbsp;·&nbsp; <b>💯</b> perfect gameweeks (+5s)` : '')
    + (cfg.duels ? ` &nbsp;·&nbsp; <b>⚔️</b> duel points — separate race, not in Pts` : '')
    + ` &nbsp;·&nbsp; <b>🔥</b> longest hit streak` + (S.tableMode==='overall' ? '' : ` &nbsp;·&nbsp; <b>▲▼</b> places moved last GW`);
  // chart (current comp cumulative)
  const gws = Object.keys(sc0.fxOfGw).map(Number).filter(g => fixturesOfGw(S.comp, g).some(f => S.results[f.id])).sort((a,b)=>a-b);
  const noData = gws.length === 0;
  $('chartcard').classList.toggle('hide', noData);
  $('chartwait').classList.toggle('hide', !noData);
  if (typeof Chart === 'undefined'){ $('chartcard').innerHTML = '<div class="tag">Chart unavailable (offline) — table below is live.</div>'; }
  else if (!noData) {
  // data-vis palette: starts from the brand accents (--grn --cyn --mag --gold --vio), extended for up to 10 players
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const palette = [css('--grn'), css('--cyn'), css('--mag'), css('--gold'), css('--vio'), '#ff8c42', '#7ed6df', '#f78fb3', '#badc58', '#c7ecee'];
  const ds = rows.map((p,i) => ({ label:p.name, data:gws.map(g => sc0.cum[p.id][g]), borderColor:palette[i%10], backgroundColor:palette[i%10], tension:.3, pointRadius:2 }));
  if (S.chart) S.chart.destroy();
  S.chart = new Chart($('chart'), { type:'line', data:{ labels:gws.map(g=>'GW'+g), datasets:ds },
    options:{ plugins:{ legend:{ labels:{ color:css('--dim'), boxWidth:12, font:{size:11} } } },
      scales:{ x:{ ticks:{color:css('--dim')}, grid:{color:css('--grid')} }, y:{ ticks:{color:css('--dim')}, grid:{color:css('--grid')} } } } });
  }
}

/* ---------- gameweek hub ---------- */
function renderHub(){
  compBar('comps-gw');
  const comp = S.comp, gw = S.gwHub[comp];
  gwBar($('gwbar-hub'), comp, gw, g => { S.gwHub[comp] = g; renderHub(); });
  const fs = fixturesOfGw(comp, gw), sc = calc(comp);
  const vis = S.profiles;
  let html = `<tr><th style="text-align:left">Fixture</th>${vis.map(p=>`<th>${esc(p.name.slice(0,6))}</th>`).join('')}</tr>`;
  for (const f of fs){
    const res = S.results[f.id], out = res ? E.outcome(res) : null, ko = kicked(f);
    html += `<tr><td class="fxc">${esc(f.home)} ${res?`<b>${res.h}–${res.a}</b>`:'v'} ${esc(f.away)}</td>`;
    for (const p of vis){
      const pk = sc.pickIdx[p.id + '|' + f.id];
      if (!ko){ html += `<td><span class="pb">🔒</span></td>`; continue; }
      if (!pk){ html += `<td><span class="pb">—</span></td>`; continue; }
      const dd = sc.plays.some(x => x.user_id === p.id && x.play === 'double' && x.fixture_id === f.id);
      let cls = 'pb'; if (res){ const b = E.basePts(pk.pick, out); cls += b===3?' hit3':b===1?' hit1':' miss'; }
      html += `<td><span class="${cls}${pk.banker?' bank':''}${dd?' dd':''}">${pk.pick}</span></td>`;
    }
    html += '</tr>';
  }
  $('pgrid').innerHTML = html;
  // recap
  const pts = vis.map(p => ({ p, gw: sc.gwPts[p.id][gw] || 0 })).sort((a,b) => b.gw - a.gw);
  const anyRes = fs.some(f => S.results[f.id]);
  if (!anyRes){ $('recap').innerHTML = `<h3>${COMPS[comp].short} · Gameweek ${gw}</h3><div class="big">No results yet</div><div class="foot">PRIMEPICKS ARENA</div>`; return; }
  const top = pts[0], bottom = pts[pts.length-1];
  const duels = sc.duelOf[gw] || {};
  const perf = vis.filter(p => gwDone(comp, gw) && fs.every(f => { const pk = sc.pickIdx[p.id+'|'+f.id]; return pk && E.basePts(pk.pick, E.outcome(S.results[f.id])) > 0; }));
  $('recap').innerHTML = `<h3>${COMPS[comp].short} · Gameweek ${gw} · ${splitLabel(sc.splits, sc.splits.sOf(gw))} ${gwDone(comp,gw)?'· Final':'· Live'}</h3>
    <div class="big">🏅 ${esc(top.p.name)} takes the week</div>
    ${pts.map((x,i) => { const opp = duels[x.p.id];
      const duelBadge = gwDone(comp,gw) && opp ? ((sc.gwPts[x.p.id][gw]||0) > (sc.gwPts[opp][gw]||0) ? ' ⚔️W' : (sc.gwPts[x.p.id][gw]||0) < (sc.gwPts[opp][gw]||0) ? '' : ' ⚔️D') : '';
      return `<div class="rrow"><span>${i+1}. ${esc(x.p.name)}${perf.some(q=>q.id===x.p.id)?' 💯':''}${duelBadge}${x.p.id===bottom.p.id&&pts.length>2?' 🥄':''}</span><span class="p">+${x.gw}</span></div>`; }).join('')}
    <div class="foot">PRIMEPICKS ARENA${perf.length?` · PERFECT 10: ${perf.map(p=>esc(p.name)).join(', ')}`:''}</div>`;
}
async function downloadRecap(){
  if (typeof html2canvas === 'undefined'){ alert('Image export unavailable right now — screenshot the card instead.'); return; }
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#070b16';
  const c = await html2canvas($('recap'), { backgroundColor: bg, scale:2 });
  const a = document.createElement('a'); a.download = `arena-${S.comp}-gw${S.gwHub[S.comp]}.png`; a.href = c.toDataURL(); a.click();
}

/* ---------- trophies / stats ---------- */
function renderStats(){
  compBar('comps-stats');
  const comp = S.comp, sc = calc(comp);
  const t = sc.titles;
  $('stats-poolname').textContent = S.pool ? S.pool.name : '';
  $('stats-poolinfo').textContent = S.pool ? `code ${S.pool.code} · ${S.profiles.length} player${S.profiles.length===1?'':'s'}` : '';
  $('leavebtn').classList.toggle('hide', !!(S.me && S.me.is_admin));
  const line = (icon, name, hold, k) => `<div class="titlerow"><span>${icon} <b>${name}</b> <span class="tk">${k}</span></span><span>${hold ? esc(nameOf(hold.uid)) + ' · ' + hold.v + (name==='The Sniper'?'%':'') : '—'}</span></div>`;
  $('titles').innerHTML =
    line('👑','Arena Champion', null, 'decided in the final month') +
    line('⚽','Points King', t.pointsKing, 'total points') +
    (sc.cfg.duels ? line('⚔️','The Duelist', t.duelist, 'duel points') : '') +
    (sc.cfg.bold ? line('🎲','The Maverick', t.maverick, 'bold calls landed') : '') +
    line('🎯','The Sniper', t.sniper, 'outright hit rate');
  // trophy case per player
  $('trophies').innerHTML = S.profiles.map(p => {
    const cups = Object.entries(sc.splitWinners).filter(([s,w]) => w.includes(p.id)).map(([s]) => '🏆 ' + sc.splits.short[+s]).join(' ');
    return `<div class="monthrow"><span>${esc(p.name)}</span><span>${cups || '<span class="tag">no silverware yet</span>'}</span></div>`;
  }).join('');
  let bestGw = { v:0, who:'—', g:0 };
  for (const p of S.profiles) for (const g in sc.gwPts[p.id]) if (sc.gwPts[p.id][g] > bestGw.v) bestGw = { v: sc.gwPts[p.id][g], who: p.name, g };
  $('records').innerHTML = `
    <div class="stat"><div class="v">${bestGw.v}</div><div class="k">Best gameweek — ${esc(bestGw.who)} (GW${bestGw.g})</div></div>
    <div class="stat"><div class="v">${Math.max(0,...S.profiles.map(p=>sc.streaks[p.id].best))}</div><div class="k">Longest hit streak</div></div>
    ${sc.cfg.perfect ? `<div class="stat"><div class="v">${S.profiles.reduce((s,p)=>s+sc.perfects[p.id],0)}</div><div class="k">Perfect 10s (pool)</div></div>` : ''}
    ${sc.cfg.bold ? `<div class="stat"><div class="v">${S.profiles.reduce((s,p)=>s+sc.bold[p.id],0)}</div><div class="k">Bold calls landed (pool)</div></div>` : ''}`;
  $('streaks').innerHTML = S.profiles.map(p => {
    const st = sc.streaks[p.id];
    return `<div class="monthrow"><span>${esc(p.name)}</span><span>${st.cur>=3?'🔥':''} current ${st.cur} · best ${st.best}</span></div>`;
  }).join('') + `<div style="margin-top:10px;text-align:center"><button class="btn small" onclick="nav('rules')">📖 Rules</button></div>`;
  renderMyGroups();
}
/* all my groups, with per-group role — switch freely, join/create more */
async function renderMyGroups(){
  const el = $('mygroups'); if (!el || !S.pool) return;
  try{
    const info = await api.listPools(S.myPools || [S.pool.code]);
    el.innerHTML = '<div class="tag" style="margin:12px 0 4px">Your groups</div>' + info.map(p =>
      `<div class="memrow"><span>${esc(p.name)} <span class="chip ${p.adminUid === S.uid ? 'ice' : 'grn'}">${p.adminUid === S.uid ? 'ADMIN' : 'MEMBER'}</span></span>
       <span>${p.code === S.pool.code ? '<span class="tag">current</span>' : `<button class="btn small" onclick="switchGroup('${p.code}')">Switch</button>`}</span></div>`).join('') +
      `<div style="margin-top:8px"><button class="btn small" onclick="openGroupGate()">＋ Create or join another group</button></div>`;
  }catch(e){ el.innerHTML = ''; }
}

/* ---------- admin ---------- */
function toggleResEdit(){ S.resEdit = !S.resEdit; renderAdmin(); }
function renderAdmin(){
  compBar('comps-admin');
  $('seedcard').classList.toggle('hide', S.seeded);
  const comp = S.comp, gw = S.gwAdmin[comp];
  gwBar($('gwbar-admin'), comp, gw, g => { S.gwAdmin[comp] = g; S.resEdit = false; renderAdmin(); });
  const fs = fixturesOfGw(comp, gw);
  // SAFETY: scores are read-only until Edit mode is deliberately entered — no misclick
  // can ever touch a number that feeds the standings
  $('ressave').classList.toggle('hide', !S.resEdit);
  $('reseditbtn').textContent = S.resEdit ? '✕ Cancel editing' : '✏️ Edit results';
  $('restitle').innerHTML = S.resEdit ? '<span style="color:var(--mag)">EDITING RESULTS — these numbers set the standings</span>' : 'Results';
  $('rescard').style.borderColor = S.resEdit ? 'var(--mag)' : '';
  // the API report he can trust: what the last ESPN pass actually did
  $('syncreport').textContent = !S.lastSync ? '⟳ auto-sync: runs on every app open + every 2 min during games'
    : S.lastSync.idle ? '⟳ auto-sync idle — no games pending (next check on app open / matchday)'
    : !S.lastSync.ok ? '⚠ last auto-sync: ESPN unreachable — stored data shown; ⟳ or manual entry available'
    : `⟳ last auto-sync ${new Date(S.lastSync.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · ${S.lastSync.events} ESPN records · ${S.lastSync.nFinal} new result${S.lastSync.nFinal===1?'':'s'} · ${S.lastSync.nLive} live · ${S.lastSync.nKick} schedule fix${S.lastSync.nKick===1?'':'es'}`;
  $('reslist').innerHTML = fs.map(f => {
    const r = S.results[f.id], ko = kicked(f);
    if (!S.resEdit){
      return `<div class="resrow"><span class="nm">${esc(f.home)} v ${esc(f.away)}</span>
        <span class="score">${r ? r.h + ' – ' + r.a : ko ? '· – ·' : '<span class="locked" style="color:var(--dim)">not played yet</span>'}</span></div>`;
    }
    return `<div class="resrow"><span class="nm">${esc(f.home)} v ${esc(f.away)}${ko?'':' <span class="locked" style="color:var(--dim)">not played yet</span>'}</span>
      <input type="number" min="0" max="20" id="rh-${f.id}" value="${r?r.h:''}" placeholder="-" ${ko?'':'disabled'}>
      <span>–</span>
      <input type="number" min="0" max="20" id="ra-${f.id}" value="${r?r.a:''}" placeholder="-" ${ko?'':'disabled'}></div>`;
  }).join('');
  $('rs-fx').innerHTML = S.fixtures[comp].map(f => `<option value="${f.id}">GW${f.gw} · ${esc(f.home)} v ${esc(f.away)} · ${fmtKO(f.kickoff)}</option>`).join('');
  // group settings panel
  const st = S.pool.settings;
  $('gs-name').value = S.pool.name;
  $('gs-comps').innerHTML = Object.keys(COMPS).map(c =>
    `<label class="switch"><input type="checkbox" id="gs-comp-${c}" ${S.comps.includes(c)?'checked':''}> ${leagueLogo(c)}${COMPS[c].name}</label>`).join('');
  $('gs-duels').checked = st.duels; $('gs-bold').checked = st.bold; $('gs-plays').checked = st.plays;
  $('gs-perfect').checked = st.perfect; $('gs-locked').checked = st.locked;
  $('memberlist').innerHTML = S.profiles.map(p =>
    `<div class="memrow"><span>${avatarHtml(p, 24)}${esc(p.name)}${p.is_admin ? ' <span class="chip ice">ADMIN</span>' : ''}</span>` +
    (p.id !== S.uid ? `<button class="btn small" onclick="removeMember('${p.id}')">✕ Remove</button>` : '<span class="tag">you</span>') + '</div>').join('');
}
async function downloadBackup(){
  try{
    toast('Building backup…');
    const data = await api.exportBackup(S.pool.code);
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'primepicks-backup-' + new Date().toISOString().slice(0,10) + '.json';
    a.click(); URL.revokeObjectURL(a.href);
    toast('Backup downloaded — keep it somewhere safe');
  }catch(e){ alert(friendly(e)); }
}
async function doSeed(){
  $('seederr').textContent = '';
  try{ await api.seedFixtures(); S.seeded = true; toast('Fixtures loaded'); renderAdmin(); }
  catch(e){ $('seederr').textContent = e.message; }
}
async function saveResults(force){
  $('reserr').textContent = '';
  const comp = S.comp, rows = {}; let n = 0;
  for (const f of fixturesOfGw(comp, S.gwAdmin[comp])){
    if (!kicked(f)) continue;
    const h = $('rh-'+f.id).value, a = $('ra-'+f.id).value;
    if (h !== '' && a !== ''){ rows[f.id] = { h:+h, a:+a }; n++; }
  }
  if (!n){ $('reserr').textContent = 'Nothing to save.'; return; }
  // SAFETY: changing already-stored results rewrites history — confirm it
  const changed = Object.keys(rows).filter(fid => S.results[fid] && (S.results[fid].h !== rows[fid].h || S.results[fid].a !== rows[fid].a));
  if (changed.length && !force){
    showModal(`<div class="playmeta">Careful</div><h3>Changing ${changed.length} saved result${changed.length>1?'s':''}</h3>
      <p class="msub">These scores are already stored and counted in the standings. Saving will rewrite them and recalculate everyone's points. Only do this to fix a genuine mistake.</p>
      <div class="mrow"><button class="btn" onclick="closeModal();renderAdmin()">Leave as saved</button>
      <button class="btn mag" onclick="closeModal();saveResults(true)">Rewrite result${changed.length>1?'s':''}</button></div>`);
    return;
  }
  try{
    await api.saveResults(comp, S.gwAdmin[comp], rows);
    for (const fid in rows) S.results[fid] = rows[fid];
    S.resEdit = false; // drop back to read-only after every save
    bump(); toast(); renderAdmin();
  }catch(e){ $('reserr').textContent = friendly(e); }
}
async function syncResults(){
  $('reserr').textContent = '';
  try{
    const found = await api.syncResults(S.comp);
    if (!found){ $('reserr').textContent = 'Feed unreachable — enter results manually.'; return; }
    Object.assign(S.results, found);
    bump(); toast(Object.keys(found).length + ' results synced'); renderAdmin();
  }catch(e){ $('reserr').textContent = 'Sync failed (' + e.message + ') — manual entry still works.'; }
}
async function reschedule(){
  $('rserr').textContent = '';
  const fid = $('rs-fx').value, v = $('rs-dt').value;
  if (!v){ $('rserr').textContent = 'Pick a date & time.'; return; }
  const iso = new Date(v).toISOString();
  try{
    await api.reschedule(fid, iso);
    S.fixtures[S.comp].find(f => f.id === fid).kickoff = iso;
    bump(); toast(); renderAdmin();
  }catch(e){ $('rserr').textContent = friendly(e); }
}

/* ---------- notifications: results landing, scores corrected, games moved ----------
   Derived per-device by diffing league state against the last-seen snapshot.
   Picks always survive reschedules (they're keyed to the fixture, not the date). */
function loadNotifList(){ try{ return JSON.parse(localStorage.getItem('arena_notifs_v1')) || []; }catch(e){ return []; } }
function saveNotifList(l){ try{ localStorage.setItem('arena_notifs_v1', JSON.stringify(l.slice(0, 40))); }catch(e){} }
function updateNotifs(){
  if (!S.pool) return;
  let seen = null; try{ seen = JSON.parse(localStorage.getItem('arena_seen_v1')); }catch(e){}
  const cur = { results: {}, kicks: {} };
  const byId = {};
  for (const c of S.comps) for (const f of S.fixtures[c]){
    byId[f.id] = f;
    if (S.results[f.id]) cur.results[f.id] = S.results[f.id].h + '-' + S.results[f.id].a;
    cur.kicks[f.id] = f.kickoff;
  }
  if (seen){ // first run just snapshots silently — no spam
    const list = loadNotifList();
    const add = (icon, html) => list.unshift({ i: icon, t: html, at: Date.now(), read: false });
    for (const fid in cur.results){
      const f = byId[fid]; if (!f) continue;
      const score = cur.results[fid].replace('-', ' – ');
      const pk = myPick(fid);
      const out = E.outcome(S.results[fid]);
      const mine = !pk ? 'you didn’t pick this one'
        : E.basePts(pk.pick, out) > 0 ? `your <b>${pk.pick}</b> landed ✓${pk.banker ? ' (banker)' : ''}`
        : `your <b>${pk.pick}</b> missed`;
      if (!(fid in seen.results)) add('⚽', `<b>FT: ${esc(f.home)} ${score} ${esc(f.away)}</b> — ${mine}`);
      else if (seen.results[fid] !== cur.results[fid]) add('✏️', `<b>Score corrected: ${esc(f.home)} ${score} ${esc(f.away)}</b> — standings recalculated`);
    }
    for (const fid in cur.kicks){
      const f = byId[fid]; if (!f || !seen.kicks || !seen.kicks[fid]) continue;
      if (Math.abs(new Date(seen.kicks[fid]) - new Date(cur.kicks[fid])) > 30 * 60e3 && !cur.results[fid]){
        const pk = myPick(fid);
        add('📅', `<b>${esc(f.home)} v ${esc(f.away)} moved</b> to ${fmtKO(f.kickoff)}${pk ? ' — your pick carries over and locks at the new kickoff' : ''}`);
      }
    }
    saveNotifList(list);
  }
  try{ localStorage.setItem('arena_seen_v1', JSON.stringify(cur)); }catch(e){}
  renderBell();
}
function renderBell(){
  const n = loadNotifList().filter(x => !x.read).length;
  for (const id of ['bcount-m', 'bcount-d']){
    const el = $(id); if (!el) continue;
    el.textContent = n > 9 ? '9+' : n;
    el.classList.toggle('hide', n === 0);
  }
}
function showNotifs(){
  const list = loadNotifList();
  const when = t => { const m = Math.round((Date.now() - t) / 60e3);
    return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m/60) + 'h ago' : Math.round(m/1440) + 'd ago'; };
  showModal(`<div class="playmeta">Notifications</div><h3>What you missed</h3>
    ${list.length ? list.map(x => `<div class="nrow"><span class="ni">${x.i}</span><div><div class="nt">${x.t}</div><div class="nwhen">${when(x.at)}</div></div></div>`).join('')
      : '<p class="msub">Nothing yet — results, score corrections and schedule changes will land here automatically.</p>'}
    <div class="mrow"><button class="btn primary" onclick="closeModal()">Done</button></div>`);
  saveNotifList(list.map(x => ({ ...x, read: true })));
  renderBell();
}

/* ---------- automatic results (every load + every 2 min) ---------- */
let _syncTimer = null;
async function doAutoSync(){
  if (!S.pool) return;
  try{
    // ALL leagues, always — gameweek progress is preserved even for toggled-off leagues
    const fixturesAll = Object.keys(COMPS).flatMap(c => S.fixtures[c] || []);
    const { finals, live, kicks, report } = await api.autoSync({ fixturesAll, results: S.results, isAdmin: !!(S.me && S.me.is_admin) });
    const nFinal = Object.keys(finals).length;
    const nKick = Object.keys(kicks || {}).length;
    S.lastSync = Object.assign({}, report, { nFinal, nLive: Object.keys(live || {}).length, nKick });
    S.live = live || {};
    if (nFinal){ Object.assign(S.results, finals); toast('⟳ ' + nFinal + ' result' + (nFinal>1?'s':'') + ' updated'); }
    if (nKick){ // TV moved games — correct our calendar everywhere
      for (const fid in kicks){ const c = fid.split('-')[0]; const f = (S.fixtures[c]||[]).find(x => x.id === fid); if (f) f.kickoff = kicks[fid]; }
      toast('📺 ' + nKick + ' kickoff' + (nKick>1?'s':'') + ' rescheduled');
    }
    if (nFinal || nKick) bump();
    updateNotifs();
    if (nFinal || nKick || Object.keys(S.live).length){ if (!adminDirty()) render(); }
  }catch(e){ /* every layer below still works */ }
  // keep ticking while games are live or imminent (any league)
  clearTimeout(_syncTimer);
  const soon = Object.keys(COMPS).flatMap(c => S.fixtures[c] || []).some(f => {
    const t = new Date(f.kickoff).getTime(), now = Date.now();
    return (t <= now && !S.results[f.id] && now - t < 4 * 3600e3) || (t > now && t - now < 30 * 60e3);
  });
  if (soon) _syncTimer = setTimeout(doAutoSync, 120e3);
}

/* ---------- live refresh guard ---------- */
function adminDirty(){
  if (S.view !== 'admin') return false;
  // unsaved group-settings edits count too
  const st = S.pool ? S.pool.settings : null;
  if (st && $('gs-name') && (
      $('gs-name').value.trim() !== S.pool.name ||
      Object.keys(COMPS).some(c => { const el = $('gs-comp-'+c); return el && el.checked !== S.comps.includes(c); }) ||
      $('gs-duels').checked !== st.duels || $('gs-bold').checked !== st.bold ||
      $('gs-plays').checked !== st.plays || $('gs-perfect').checked !== st.perfect ||
      $('gs-locked').checked !== st.locked)) return true;
  return fixturesOfGw(S.comp, S.gwAdmin[S.comp]).some(f => {
    const h = $('rh-'+f.id), a = $('ra-'+f.id);
    if (!h || !a) return false;
    if (h.value === '' && a.value === '') return false;
    const r = S.results[f.id];
    return !r || +h.value !== r.h || +a.value !== r.a;
  });
}
async function onRemoteChange(){
  await loadAll();
  if (adminDirty()) return;
  render();
}

/* ---------- rail (desktop) ---------- */
function renderRail(){
  if (!S.uid || !S.pool) return;
  const comp = S.comp, sc = calc(comp), gw = currentGw(comp);
  $('rail-race').innerHTML = raceBars(comp, sc.splits.sOf(gw));
  if (!sc.cfg.duels){ $('rail-duel').innerHTML = '<span class="tag">duels off</span>'; return; }
  const opp = (sc.duelOf[gw] || E.pairings(S.profiles.map(p=>p.id), gw))[S.uid];
  $('rail-duel').innerHTML = opp ? `GW${gw}: <b>you ${sc.gwPts[S.uid][gw]||0}</b> — ${sc.gwPts[opp]?sc.gwPts[opp][gw]||0:0} ${esc(nameOf(opp))}` : 'Bye week';
}

/* ---------- render root ---------- */
function render(){
  if (S.view === 'picks') renderPicks();
  else if (S.view === 'arena') renderArena();
  else if (S.view === 'table') renderTable();
  else if (S.view === 'gw') renderHub();
  else if (S.view === 'stats') renderStats();
  else if (S.view === 'rules') renderRules();
  else if (S.view === 'admin') renderAdmin();
  renderRail();
}

/* ---------- boot ---------- */
async function boot(){
  $('v-loading').classList.remove('hide'); $('v-auth').classList.add('hide'); $('v-group').classList.add('hide');
  const uid = await api.init();
  if (!uid){ $('v-loading').classList.add('hide'); $('v-auth').classList.remove('hide'); authTab('up'); return; }
  S.uid = uid;
  await enterApp();
}
function showGroupGate(withBack){
  ['picks','arena','table','gw','stats','rules','admin'].forEach(x => $('v-' + x).classList.add('hide'));
  $('v-loading').classList.add('hide');
  $('v-group').classList.remove('hide');
  $('gg-back').classList.toggle('hide', !withBack);
  $('gg-name').textContent = S.myName || 'mate';
  $('gg-comps').innerHTML = Object.keys(COMPS).map(c =>
    `<label class="switch"><input type="checkbox" id="gg-comp-${c}" ${c === 'epl' ? 'checked' : ''}> ${leagueLogo(c)}${COMPS[c].name}</label>`).join('');
}
function openGroupGate(){ showGroupGate(true); }   // add/join another group, existing group intact
async function backToApp(){ await enterApp(); }
async function switchGroup(code){
  try{ await api.setActivePool(code); toast('Switching group…'); await enterApp(); }
  catch(e){ alert(friendly(e)); }
}
async function enterApp(){
  $('v-group').classList.add('hide'); $('v-loading').classList.remove('hide');
  try{ await loadAll(); }catch(e){ $('v-loading').textContent = 'Load failed: ' + e.message; return; }
  if (!S.pool){
    // signed in but no group yet → the group gate
    showGroupGate(false);
    let pending = null; try{ pending = sessionStorage.getItem('arena_join'); }catch(e){}
    if (pending){ $('gg-code').value = pending; joinGroup(pending); }
    return;
  }
  $('v-loading').classList.add('hide');
  $('side').classList.remove('hide');
  $('userbox').classList.remove('hide');
  const badge = esc(S.me.name) + (S.me.is_admin ? ' <span class="chip ice">ADMIN</span>' : '') + (DEMO ? ' <span class="chip fire">DEMO</span>' : '');
  $('username').innerHTML = badge;
  $('sideuser').innerHTML = badge + '<div class="tag" style="margin-top:4px">' + esc(S.pool.name) + '</div>';
  // your own name is the door to your menu — theme, profile, install, sign out
  for (const id of ['username', 'sideuser']){
    $(id).style.cursor = 'pointer'; $(id).title = 'Your menu';
    $(id).onclick = () => userMenu();
  }
  $('mobilenav').classList.remove('hide');
  if (S.me.is_admin){ $('adminbtn').classList.remove('hide'); $('adminbtn-d').classList.remove('hide'); }
  S.comp = S.comps[0];
  for (const c of S.comps){ const g = currentGw(c); S.gw[c] = g; S.gwHub[c] = g; S.gwAdmin[c] = g; }
  nav(S.me.is_admin && !S.seeded ? 'admin' : 'picks');
  // self-executing calendar migration: an admin device notices shipped data is newer
  // than the DB calendar and repairs fixture docs + overrides once, automatically
  if (!DEMO && S.me.is_admin && S.seeded && S.calendarVersion !== DATA_VERSION){
    toast('📅 Updating the fixture calendar…');
    try{ await api.repairCalendar(DATA_VERSION); await loadAll(); render(); toast('📅 Calendar verified & synced'); }
    catch(e){ /* next admin open retries */ }
  }
  updateNotifs(); // catch anything that changed since this device last looked
  maybeOfferInstall(); // iPhone users get the home-screen walkthrough once
  // first visit: quick how-it-works (admin skips straight to setup when unseeded)
  let seen = '1'; try{ seen = localStorage.getItem('arena_intro_seen'); }catch(e){}
  if (!seen && S.seeded) $('welcome').classList.remove('hide');
  let t = null;
  api.onChange(() => { clearTimeout(t); t = setTimeout(onRemoteChange, 400); });
  doAutoSync(); // fresh scores on every load, for every user
}
boot();
