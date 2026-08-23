/* Curated, fact-checked club colours — the historically resonant primary for every club.
   Rewrites ../data-teams.js: slot 1 becomes the curated colour (ESPN alt kept as slot 2 for
   clash fallbacks) and appends the pairwise clash resolver used by the app.
   Run: node color-audit.js */
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'data-teams.js');

/* club → historically resonant primary (mixed-colour clubs: the colour most identified with them) */
const CURATED = {
epl: {
  "Arsenal":"EF0107","Aston Villa":"670E36","Bournemouth":"DA291C","Brentford":"E30613","Brighton":"0057B8",
  "Chelsea":"034694","Coventry":"5BB8E8","Crystal Palace":"1B458F","Everton":"003399","Fulham":"3D4148",
  "Hull":"F5A12D","Ipswich":"3A64A3","Leeds":"FFCC00","Liverpool":"C8102E","Man City":"6CABDD",
  "Man Utd":"DA291C","Newcastle":"31353B","Nott'm Forest":"DD0000","Spurs":"132257","Sunderland":"EB172B",
},
liga: {
  "Athletic Club":"EE2523","Atlético de Madrid":"CB3524","CA Osasuna":"D91A21","Celta":"8AC3EE",
  "Deportivo Alavés":"0761AF","Elche CF":"05642C","FC Barcelona":"A50044","Getafe CF":"005999",
  "Levante UD":"B4053F","Málaga CF":"2F7FC3","R. Racing Club":"00964B","RC Deportivo":"0F4C93",
  "RCD Espanyol de Barcelona":"00529F","Rayo Vallecano":"E53027","Real Betis":"00954C","Real Madrid":"FEBE10",
  "Real Sociedad":"0067B1","Sevilla FC":"D8091E","Valencia CF":"EE8707","Villarreal CF":"FFE667",
},
bund: {
  "1. FC Köln":"ED1C24","1. FC Union Berlin":"EB1923","1. FSV Mainz 05":"C3141E","Bayer 04 Leverkusen":"E32221",
  "Borussia Dortmund":"FDE100","Borussia Mönchengladbach":"1B9E4B","Eintracht Frankfurt":"E1000F",
  "FC Augsburg":"BA3733","FC Bayern München":"DC052D","FC Schalke 04":"004D9D","Hamburger SV":"0A3F86",
  "RB Leipzig":"DD0741","SC Paderborn 07":"005CA9","SV Elversberg":"0072BC","SV Werder Bremen":"1D9053",
  "Sport-Club Freiburg":"E32219","TSG Hoffenheim":"1961B5","VfB Stuttgart":"DA1F3D",
},
seriea: {
  "Atalanta":"1E71B8","Bologna":"A21C26","Cagliari":"AD1F2B","Como":"0B2545","Fiorentina":"582C83",
  "Frosinone":"FFD400","Genoa":"AD1919","Inter":"0068A8","Juventus":"1A1A1A","Lazio":"87D8F7",
  "Lecce":"F8D71C","Milan":"FB090B","Monza":"E20613","Napoli":"12A0D7","Parma":"F6C50A",
  "Roma":"8E1F2F","Sassuolo":"00A752","Torino":"881F19","Udinese":"2B2B2B","Venezia":"F86C1B",
},
ligue1: {
  "AJ Auxerre":"1F4E9C","AS Monaco":"E51B22","Angers SCO":"2E2E30","Estac Troyes":"1D4E9B",
  "FC Lorient":"F36E21","Havre Athletic Club":"14295C","LOSC Lille":"E01E13","Le Mans FC":"D62B11",
  "OGC Nice":"CC0000","Olympique Lyonnais":"1B4498","Olympique de Marseille":"2FAEE0","Paris FC":"1B2D53",
  "Paris Saint-Germain":"004170","RC Lens":"F3C300","RC Strasbourg Alsace":"2394D3","Stade Brestois 29":"E30613",
  "Stade Rennais FC":"E13327","Toulouse FC":"5F259F",
},
};

/* load existing registry (for ids + ESPN alts) */
const src = fs.readFileSync(FILE, 'utf8');
const TEAMDATA = eval('(' + src.split('// badge url')[0].replace('const TEAMDATA =', '').trim().replace(/;$/, '') + ')');

let changed = 0, report = [];
for (const comp of Object.keys(CURATED)){
  for (const [team, hex] of Object.entries(CURATED[comp])){
    if (!TEAMDATA[comp] || !TEAMDATA[comp][team]) { report.push(`!! ${comp}/${team} missing from registry`); continue; }
    const old = TEAMDATA[comp][team][1].toUpperCase();
    if (old !== hex.toUpperCase()){ changed++; report.push(`${comp}: ${team} ${old} → ${hex} (curated historical primary)`); }
    TEAMDATA[comp][team][1] = hex.toUpperCase();
  }
  // completeness both directions
  for (const team of Object.keys(TEAMDATA[comp] || {}))
    if (!CURATED[comp][team]) report.push(`!! ${comp}/${team} has no curated colour`);
}

/* write registry + clash resolver */
let out = 'const TEAMDATA = ' + JSON.stringify(TEAMDATA, null, 0).replace(/\],"/g, '],\n"').replace(/\},"/g, '\n},\n"') + ';\n';
out += `// badge url: https://a.espncdn.com/i/teamlogos/soccer/500/<id>.png
// slot 1 = curated, fact-checked historical primary · slot 2 = ESPN alternate (clash fallback)

/* ---- pairwise kit-clash resolution ----
   Home always wears its true colour. If the away colour is too close (same-family clash,
   e.g. Liverpool red vs Man Utd red), away falls back to its alternate; if that is also
   unusable or clashing, a neutral slate. No matchup can ever show the same colour twice. */
function _tcDist(x, y){
  const a = parseInt(x.replace('#',''), 16), b = parseInt(y.replace('#',''), 16);
  const dr = (a>>16&255)-(b>>16&255), dg = (a>>8&255)-(b>>8&255), db = (a&255)-(b&255);
  return Math.sqrt(dr*dr + dg*dg + db*db);
}
function _tcUsable(hex){
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return false;
  const n = parseInt(hex, 16), l = 0.299*(n>>16&255) + 0.587*(n>>8&255) + 0.114*(n&255);
  return l >= 25 && l <= 225;
}
const TEAM_CLASH_MIN = 92;
function TEAMRESOLVE(comp, home, away){
  const P = TEAMDATA[comp] || {};
  const hp = P[home], ap = P[away];
  const h = hp ? '#' + hp[1] : '#666666';
  if (!ap) return { h, a: '#7D8AA5' };
  let a = '#' + ap[1];
  if (_tcDist(h, a) < TEAM_CLASH_MIN){
    const alt = ap[2];
    a = (_tcUsable(alt) && _tcDist(h, '#' + alt) >= TEAM_CLASH_MIN) ? '#' + alt : '#7D8AA5';
    if (_tcDist(h, a) < TEAM_CLASH_MIN) a = '#7D8AA5';
    if (_tcDist(h, '#7D8AA5') < TEAM_CLASH_MIN && a === '#7D8AA5') a = '#E8B84B'; // home itself slate-ish → amber
  }
  return { h, a };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { TEAMDATA, TEAMRESOLVE, _tcDist, _tcUsable };
`;
fs.writeFileSync(FILE, out);
console.log(report.join('\n') || 'no changes');
console.log(`\n${changed} colours corrected to curated historical primaries; resolver appended.`);


