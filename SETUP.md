# PrimePicks ARENA — Setup (one-time, ~10 minutes)

No coding needed. Two free accounts: Firebase (database + logins, never pauses, no card) and Netlify (hosting).

## 0. Try it first
Local preview with fake data — from this folder:
```
python3 -m http.server 8000
```
Open http://localhost:8000 — demo mode runs automatically while `config.js` has placeholder keys. You're mid-Split 4 with 5 fake rivals: poke at Plays, duels, both leagues.

## 1. Create the Firebase project  *(matches the 2026 console layout)*
1. https://console.firebase.google.com → **Create a new Firebase project** (`primepicks-arena`). Skip/disable Analytics if offered.
2. **Enable logins:** left sidebar → **Authentication** (under *Project shortcuts*) → **Get started** → pick **Email/Password** from the provider list → Enable → Save.
3. **Create the database:** left sidebar → **Databases & Storage** → **Firestore** (under *NoSQL*) → **Create database** → keep **production mode** (locked rules) → pick a nearby location → Create.
4. **Paste the security rules:** still in Firestore → **Rules** tab → select everything there, replace with ALL of `firestore.rules` from this folder → **Publish**. *(If the rules file ever changes, re-paste and re-publish — the pre-flight page will tell you if you're out of date.)*
5. **Register the web app & get keys:** **Project Overview** (top of sidebar) → **+ Add app** → **Web (</>)** → nickname `arena` → Register (skip hosting) → in the code snippet shown, copy the `apiKey` and `projectId` values. (Find them again later: **Settings → Project settings → Your apps**.)

## 2. Point the app at your database
Edit `config.js`: paste the two values (projectId also goes into authDomain). Save. Demo mode switches off automatically.

## 2½. PRE-FLIGHT CHECK (don't skip)
With the local server still running, open **http://localhost:8000/setup-check.html**.
It tests your actual Firebase project: keys pasted, rules published (it tries to break in anonymously — and must fail), sign-in enabled, and later, fixtures loaded + admin protection. **Fix any red item before moving on.** Re-run it after every remaining step until it says ALL CLEAR.

## 3. Put it online (Netlify)
1. https://app.netlify.com/drop → drag these files: `index.html`, `app.js`, `engine.js`, `config.js`, `demo.js`, `firebase-api.js`, `data-epl.js`, `data-laliga.js`, `data-bundesliga.js`, `data-seriea.js`, `data-ligue1.js`, `data-teams.js`, `manifest.json`, `setup-check.html`.
2. Back in Firebase → **Authentication** → **Settings** tab → **Authorized domains** → Add domain → your `something.netlify.app`.
3. Open `https://your-site.netlify.app/setup-check.html` — everything must be green **on the live URL too** (this catches the forgotten-domain mistake).

## 4. First run
1. Open your URL → sign in (**Continue with Google** is the quick way).
2. **Create your group** — name it and you get a 6-character invite code. Whoever creates the group runs it (enters results, fixes kickoffs).
3. You'll land on Admin → press **⚽ Load fixtures** (loads both leagues, ~10 seconds).
4. **Invite the boys:** Arena tab → **🔗 Copy invite link** → paste in the group chat. They open it, sign in, and they're joined automatically (or they type the code under "Join a group"). Phones: "Add to Home Screen" makes it feel like an app.

## Season safety (read once)
- **Nothing destructive is one click.** Removing a league or rewriting a saved result opens a confirmation explaining exactly what happens; group deletion isn't possible from the app at all (Firebase console only, by design). Removing a league never deletes its data — re-enable it and everything returns.
- **Back up monthly:** Admin → 🗄️ **Download season backup** saves the whole season (group, results, revealed picks, plays, profiles) as one JSON file. Do it after each month's final gameweek and before experimenting with anything.
- Re-seeding fixtures is override-aware — it can never undo TV reschedules.

## Weekly admin (~30 seconds)
After games finish: Admin tab → **⟳ Sync from feed** (auto-fills scores). If the feed is unreachable, type them in — the inputs are right there. Fix kickoff times when TV moves games (later rounds ship with placeholder times until TV picks are announced).

## Fair play (server-enforced)
Picks lock at each game's kickoff · nobody sees your picks until kickoff · only admin writes results · two bankers in a week voids both · play limits enforced deterministically by the shared engine.

## Data caveats (honest)
EPL match 380 and La Liga's last rounds were reconstructed from round-robin constraints (source feed truncation) — pairings are provably right; La Liga's round-37/38 grouping and dates are provisional. Fix via the reschedule tool when confirmed. UCL isn't included yet because the 26/27 league-phase draw hasn't happened — it's a one-file add later.

