# PrimePicks ARENA — design document

## The problem (research-backed)

Season-long fantasy/prediction leagues die in the middle. FPL data shows ~63% of managers
stop making transfers for 5+ gameweeks by midseason ("midseason apathy"). Once standings
settle, players without a realistic shot check out — exactly what happened to Raj's Sleeper
league by week 10–15. Games that survive this (League of Legends ranked, Superbru pools)
share three properties: **fresh starts on a short cycle**, **multiple things to win**, and
**catch-up mechanics that reward skill rather than gifting points**.

## The fix — Arena's four pillars

### 1. Monthly splits: nobody is ever more than a few weeks from a fresh start
Every **calendar month** is its own race with its own champion and trophy (derived from
each competition's real fixture calendar — a gameweek belongs to the month it starts in).
The season's **final month is the Championship**. A horror month costs you that month,
not your season. (Modeled on LoL's split system + football's own Manager of the Month.)

### 2. Weekly Duels: every single week has personal stakes
Each GW you're auto-paired head-to-head against a pool mate (round-robin rotation).
Beat their GW score → duel win (3 duel pts; draw 1). Separate duel table, W-D-L records,
season "Duelist" title. Even 12th place vs 13th place has something real to play for on a
random Tuesday. (This is the one thing Sleeper got right — kept, without the roster grind.)

### 3. Bold Calls: the crowd sets the odds, underdogs pay more
After a game kicks off, the pool's pick distribution for it is revealed. A correct
**outright** pick that ≤25% of the pool made earns **+1 Bold bonus**. No external odds
feed needed — your own league is the market. Trailing players can chase bold picks to
close gaps; leaders protecting a lead get pulled toward safe consensus picks. Self-balancing
rubber band that never gifts points (research warning: rubber-banding done wrong "makes
good play meaningless" — Bold Calls only ever pay for being right).

### 4. Plays: a hand of cards, not a wallet of boosts
Every player gets **3 Plays per split**, each usable once, max one per GW:
- 🎯 **Double Down** — declare a second banker this GW (two games score ×2)
- 🛡️ **Safety Net** — declare before kickoff: each wrong pick this GW refunds 1pt (max +4, needs 8+ picks made)
- 🔮 **Oracle** — see the pool's live pick percentages for one GW before locking yours
**Catch-up:** bottom half of the previous split's table gets one extra Double Down —
better tools, not free points.

## Scoring (unchanged core — the boys already know it)
3 pts outright (H/D/A) · 1 pt double chance (H/D, A/D) · ⭐ banker doubles one game ·
💯 Perfect 10 = +5 · plus Bold bonuses and Plays above.

## Season titles (five ways to win something)
- **Arena Champion** — the Championship (GW36–38) is a fresh 3-week sprint; each split
  title you won banks a +2 head start. Split winners are favorites but everyone's alive.
- **Points King** — most total points across all 38 GWs (the classic race still exists)
- **The Duelist** — most duel points
- **The Maverick** — most Bold Calls landed
- **The Sniper** — best outright hit rate (min ⅔ of games picked)
Split trophies + titles live in each player's Trophy Case.

## Multiple leagues
Competitions are first-class: ships with **Premier League 26/27** and **La Liga 26/27**
(380 real fixtures each). A pool enables one or both; each competition runs its own boards
(splits, duels, tables) plus a combined "Overall" view. Architecture takes any future
league as a single data file (UCL 26/27 gets added when the league-phase draw happens
— feed not yet published).

## Data accuracy — layered, self-healing
- Fixtures from fixturedownload.com feeds (real dates/kickoffs).
- **Auto-results (layer 1):** every app load, by any user, pulls ESPN's public scoreboard
  (CORS-verified live in-browser; ~1-min delay). Finals are silently persisted by group
  admins' devices and overlaid locally for everyone else; in-play games show a ● LIVE
  score on the card, refreshed every 2 minutes while games are on. Live scores never
  enter the scoring engine — only finals count.
- **Feed sync (layer 2):** admin's ⟳ button pulls the fixturedownload feed.
- **Manual entry (layer 3):** the admin result inputs always work, whatever the internet does.
- Fuzzy pair-matching (normalized team-name tokens + kickoff proximity) maps ESPN events
  onto our fixtures, so "Nott'm Forest"/"Nottingham Forest" style mismatches can't break it.
- Kickoff times for later rounds are TV-placeholder; admin reschedule tool handles moves.
- Known data caveats: EPL match 380 + La Liga rounds 36–38 partially reconstructed from
  round-robin constraints (source feed truncation); pairings are provably correct, La Liga
  round-37/38 grouping and dates are provisional → fixable in-app when confirmed.

## Platforms
One responsive codebase: phones get a bottom tab bar + thumb-sized pick buttons;
desktop (≥920px) gets a sidebar + two-column dashboard with the live table always
in view. PWA manifest so it installs to a home screen like an app.

## Stack
Static HTML/JS (Netlify Drop) + Firebase free tier (auth + Firestore + security rules
enforcing kickoff locks, pick privacy, admin-only results — same model as v1, extended
with plays and duel data). Pure-logic `engine.js` is dependency-free and unit-tested.

## Sources
- ECAL fantasy drop-off retention analysis — https://ecal.com/stop-fantasy-drop-off-ecal-retention-solution/
- 4for4: keeping leagues engaged (awards beyond W/L) — https://www.4for4.com/2025/preseason/9-ways-keep-managers-engaged-your-fantasy-football-league
- Superbru scoring & Slam points — https://www.superbru.com/news/introducing-the-slam-point
- LoL ranked splits rationale — https://www.leagueoflegends.com/en-us/news/dev/dev-ranked-schedule-changes/
- Rubber-banding as design requirement — https://www.gamedeveloper.com/design/rubber-banding-as-a-design-requirement
