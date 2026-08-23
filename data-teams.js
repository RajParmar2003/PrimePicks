const TEAMDATA = {"epl":{"Arsenal":["359","EF0107","003399"],
"Aston Villa":["362","670E36","333333"],
"Bournemouth":["349","DA291C","0000CC"],
"Brentford":["337","E30613","F8CED9"],
"Brighton":["331","0057B8","FFDD00"],
"Chelsea":["363","034694","FFFFFF"],
"Coventry":["388","5BB8E8","FFFFFF"],
"Crystal Palace":["384","1B458F","FFDD00"],
"Everton":["368","003399","132257"],
"Fulham":["370","3D4148","00CC00"],
"Hull":["306","F5A12D","FFFFFF"],
"Ipswich":["373","3A64A3","CD1937"],
"Leeds":["357","FFCC00","0000FF"],
"Liverpool":["364","C8102E","FFFFFF"],
"Man City":["382","6CABDD","000000"],
"Man Utd":["360","DA291C","FFFFFF"],
"Newcastle":["361","31353B","FFFFFF"],
"Nott'm Forest":["393","DD0000","132257"],
"Spurs":["367","132257","000000"],
"Sunderland":["366","EB172B","87CCED"]
},
"liga":{"Athletic Club":["93","EE2523","0000FF"],
"Atlético de Madrid":["1068","CB3524","000099"],
"CA Osasuna":["97","D91A21","FFFFFF"],
"Celta":["85","8AC3EE","004996"],
"Deportivo Alavés":["96","0761AF","C3C3C3"],
"Elche CF":["3751","05642C","288A00"],
"FC Barcelona":["83","A50044","FCE38A"],
"Getafe CF":["2922","005999","C8142F"],
"Levante UD":["1538","B4053F","000000"],
"Málaga CF":["99","2F7FC3","FFFF00"],
"R. Racing Club":["87","00964B","0EB214"],
"RC Deportivo":["90","0F4C93","B9E8F0"],
"RCD Espanyol de Barcelona":["88","00529F","C8142F"],
"Rayo Vallecano":["101","E53027","CD0000"],
"Real Betis":["244","00954C","CCFF00"],
"Real Madrid":["86","FEBE10","00529F"],
"Real Sociedad":["89","0067B1","FFDD00"],
"Sevilla FC":["243","D8091E","D81022"],
"Valencia CF":["94","EE8707","004996"],
"Villarreal CF":["102","FFE667","6CACE4"]
},
"bund":{"1. FC Köln":["122","ED1C24","DA0308"],
"1. FC Union Berlin":["598","EB1923","D4D4D4"],
"1. FSV Mainz 05":["2950","C3141E","000055"],
"Bayer 04 Leverkusen":["131","E32221","F9FBFC"],
"Borussia Dortmund":["124","FDE100","272726"],
"Borussia Mönchengladbach":["268","1B9E4B","03915C"],
"Eintracht Frankfurt":["125","E1000F","272726"],
"FC Augsburg":["3841","BA3733","03915C"],
"FC Bayern München":["132","DC052D","1A1A1A"],
"FC Schalke 04":["133","004D9D","FFFFFF"],
"Hamburger SV":["127","0A3F86","1A1A1A"],
"RB Leipzig":["11420","DD0741","740C14"],
"SC Paderborn 07":["3307","005CA9","FFFFFF"],
"SV Elversberg":["10388","0072BC","FFFFFF"],
"SV Werder Bremen":["137","1D9053","FFFFFF"],
"Sport-Club Freiburg":["126","E32219","FFFFFF"],
"TSG Hoffenheim":["7911","1961B5","000055"],
"VfB Stuttgart":["134","DA1F3D","DA0308"]
},
"seriea":{"Atalanta":["105","1E71B8","FFFFFF"],
"Bologna":["107","A21C26","FFFFFF"],
"Cagliari":["2925","AD1F2B","FFFFFF"],
"Como":["2572","0B2545","FFFFFF"],
"Fiorentina":["109","582C83","FFFFFF"],
"Frosinone":["4057","FFD400","FFFFFF"],
"Genoa":["3263","AD1919","FFFFFF"],
"Inter":["110","0068A8","FFFFFF"],
"Juventus":["111","1A1A1A","FFEF32"],
"Lazio":["112","87D8F7","FFEF32"],
"Lecce":["113","F8D71C","08305D"],
"Milan":["103","FB090B","FFFFFF"],
"Monza":["4007","E20613","FFFFFF"],
"Napoli":["114","12A0D7","FFFFFF"],
"Parma":["115","F6C50A","FFDD30"],
"Roma":["104","8E1F2F","EAE9E7"],
"Sassuolo":["3997","00A752","000000"],
"Torino":["239","881F19","FFFFFF"],
"Udinese":["118","2B2B2B","FFEF32"],
"Venezia":["17530","F86C1B","FFFFFF"]
},
"ligue1":{"AJ Auxerre":["172","1F4E9C","1A1A1A"],
"AS Monaco":["174","E51B22","004C37"],
"Angers SCO":["7868","2E2E30","FFFFFF"],
"Estac Troyes":["170","1D4E9B","FAFAFC"],
"FC Lorient":["273","F36E21","1A1A1A"],
"Havre Athletic Club":["3236","14295C","EDEDED"],
"LOSC Lille":["166","E01E13","E2D3D7"],
"Le Mans FC":["2697","D62B11","FFDD00"],
"OGC Nice":["2502","CC0000","E2D3D7"],
"Olympique Lyonnais":["167","1B4498","1A1A1A"],
"Olympique de Marseille":["176","2FAEE0","011F68"],
"Paris FC":["6851","1B2D53","FFFFFF"],
"Paris Saint-Germain":["160","004170","FFFFFF"],
"RC Lens":["175","F3C300","004C37"],
"RC Strasbourg Alsace":["180","2394D3","FFFFFF"],
"Stade Brestois 29":["6997","E30613","FFFFFF"],
"Stade Rennais FC":["169","E13327","FFFFFF"],
"Toulouse FC":["179","5F259F","FFFF00"]}};
// badge url: https://a.espncdn.com/i/teamlogos/soccer/500/<id>.png
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


