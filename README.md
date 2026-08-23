# PrimePicks Arena ⚽

A season-long football prediction league for friend groups, built because every fantasy league I've ever been in was dead by week 12.

Live in production for a private 6-player league across the 2026-27 season: EPL, La Liga, Bundesliga, Serie A, and Ligue 1. No frameworks, no build step, no server to maintain: a static site on Netlify talking to Firebase, with live results syncing themselves from real match data.

## The problem it solves

Prediction and fantasy leagues don't die from bad features; they die from **mid-season boredom** (one player runs away with it, everyone else checks out) and **broken trust** (wrong fixtures, missing results, "I'll update the spreadsheet later"). Every design decision here attacks one of those two failure modes.

**Against boredom:** the season is split into calendar-month races with their own trophies, so a bad month never buries you. Weekly auto-paired head-to-head duels give every gameweek personal stakes on a separate ladder. Bold-call bonuses (+1 for a correct outright pick ≤25% of the group dared to make) reward going against the crowd. The final month is a Championship where each monthly trophy banks a +2 head start: mid-table players stay alive until May.

**Against broken trust:** fixtures were audited game-by-game against live sports data before launch (108 kickoff corrections and one home/away reversal in the official feed caught and fixed). Results sync automatically from ESPN's live scoreboard on every app open plus a 2-minute matchday ticker. A 30-day watch detects TV reschedules and postponements, moves the fixture, carries your pick over, and notifies you. Picks lock server-side at each match's kickoff and stay hidden from other players until then, enforced by Firestore security rules, not the UI, so no client can cheat around it.

## Architecture

```
index.html + app.js      UI: vanilla JS single-page app, phone-first, installable PWA
engine.js                pure scoring engine: no DOM, no network, fully unit-tested
firebase-api.js          data layer (swappable: demo.js provides a fake backend)
data-*.js                1,752 fixtures across 5 leagues (ids are stable row-indices)
data-teams.js            96 clubs: ESPN ids + curated colours + kit-clash resolver
firestore.rules          the fair-play law: kickoff locks, hidden picks, admin gates
qa/                      197 automated checks (engine / UI-in-jsdom / data integrity)
```

Deliberate choices, not accidents:

- **No build step / no framework.** The app is ~4 files of plain JS pinned to CDN'd Firebase compat SDK. Anyone can read it, deploy it by drag-and-drop, and nothing bit-rots in a bundler. For a two-screen app with one maintainer, a framework buys complexity, not capability.
- **Pure scoring engine.** `engine.js` recomputes everything from raw picks + results on every render (memoized). No score is ever stored, so no score can ever be *wrong* in a way that can't be fixed by correcting the inputs.
- **Optimistic writes with real guarantees.** Taps paint instantly; Firebase catches up in the background. Rapid taps coalesce into one write of the final choice. Pending writes flush the moment the app is backgrounded, Firestore offline persistence journals them through app kills, and a rejected write visibly rolls back to the last confirmed state; the UI never lies about what saved.
- **Every failure is loud.** Result sync reports what it did in the admin panel; postponements surface in a notification bell with each player's pick fate; locked cards say why they're locked.

## Data integrity war stories

The three bugs that shaped the pipeline, each found by cross-checking against a second source rather than trusting the first:

1. **The +10h timezone bug.** The fixture feed served Australian-Eastern times labeled as UTC. Every La Liga result silently failed to match (kickoffs were "wrong" by 10 hours). Fix: shifted 380 kickoffs, and rebuilt the matcher to pair teams first and use kickoff time only as a tiebreaker.
2. **The reversed fixture.** ESPN's audit revealed the feed had PSG @ Rennes flipped (wrong home team). Swapping it broke a round-robin integrity test (because the *return* leg then duplicated), which caught that both legs needed flipping. The test suite catching the knock-on effect of a manual fix is exactly why the test suite exists.
3. **The phantom lock.** A postponed match still carried its old date, showing LOCKED for a game a week away. Fix: postponement healing. When live data shows a matched fixture is actually in the future, the kickoff self-corrects and picks reopen.

## Security model

Everything that matters is enforced in Firestore security rules, server-side: picks immutable after kickoff (validated against stored kickoff timestamps), picks unreadable by other players before kickoff, results/fixtures writable only by group admins, group deletion impossible via the API, member documents shape-validated, avatar URLs restricted to a trusted host.

Known, documented limitations (fine for a private friends league; the roadmap if it ever grows): results are shared across groups rather than isolated per group, there's no App Check bot protection on the free tier, and result persistence rides on admin devices opening the app.

## Run it

```
git clone <repo> && cd arena
python3 -m http.server 8080    # → http://localhost:8080 in demo mode (fake players, no backend)
```

To go live: create a free Firebase project, copy `config.example.js` → `config.js` with your keys, publish `firestore.rules`, follow `SETUP.md` (~10 minutes), drag the folder to Netlify. `setup-check.html` verifies every step and tells you what you forgot.

Tests: `cd qa && npm i jsdom && node engine-test.js && node data-test.js && node ui-test.js`: 197 checks covering scoring edge cases (double-banker voiding, catch-up allowances, tie handling), full-season data integrity (round-robin correctness, kit-clash-proof colours for all 1,752 fixtures, chronological ordering of all 182 gameweeks), and UI behavior in jsdom (optimistic write coalescing, rollback on rejection, settings-aware rendering).

## What I'd do differently

TypeScript from day one: the engine's shape-passing is exactly where types pay for themselves. Real-device test coverage: the one bug that shipped through a fully green suite (laggy pick taps) was a mobile-network-feel problem jsdom can't see. Per-group result isolation in the schema from the start, since retrofitting it is the roadmap's hardest item. And push notifications ("your picks lock in 2 hours") before any other feature: retention is the product's whole thesis, and reminders are retention's sharpest tool.

## Honest footnote

Built in collaboration with AI (Anthropic's Claude) over an intense few weeks: the architecture decisions, QA direction, fact-checking discipline, and product design came from iterating on real failures with real users (my friends, who are ruthless bug reporters). Every line has been read, every tradeoff can be defended.

MIT licensed. Not affiliated with any football league, club, or data provider.
