'use strict';
/*
 * Oracle-test: verifiserer engine.findComps mot en uavhengig brute-force-
 * enumerering som genererer ALT og filtrerer til slutt. Kjør: npm test
 *
 * Prinsipp: hver ny regel i motoren MÅ også legges til i brute() her —
 * de to implementasjonene skal være uavhengige av hverandre.
 */
const { CLASSES, DISPEL, DEFAULT_ROSTER, is70, regOf, findComps } = require('../engine.js');

/* ---- Uavhengig oracle ---- */
function brute(people, opts) {
  const { teamSize, mustHave, healerWanted, only70, caps, needDispel } = opts;
  const roleMode = healerWanted !== null && healerWanted !== undefined;
  const capOf = cls => (caps && caps[cls] !== undefined) ? caps[cls] : Infinity;
  const candidates = people.filter(p => !p.benched);
  let count = 0;

  function personOptions(p) {
    const locked = !!(p.sel && p.sel.length); // valgt på tavla = må med
    const out = [];
    if (!locked) out.push(null); // kan stå over — valgte personer kan ikke
    const clsList = locked ? p.sel : p.classes;
    for (const cls of clsList) {
      const reg = regOf(p, cls);
      // rollevalget på tavla utelukker classes som ikke kan spille rollen
      if (locked && p.healerRole === true && reg === 'dps') continue;
      if (locked && p.healerRole === false && reg === 'healer') continue;
      let roles;
      if (reg === 'healer') roles = [true];
      else if (reg === 'dps') roles = [false];
      else if (locked && p.healerRole === true) roles = [true];
      else if (locked && p.healerRole === false) roles = [false];
      else roles = roleMode ? [true, false] : [false];
      for (const heal of roles) out.push({ name: p.name, cls, heal });
    }
    return out;
  }

  function rec(i, picked) {
    if (i === candidates.length) {
      const team = picked.filter(Boolean);
      if (team.length !== teamSize) return;
      if (only70) {
        for (const x of team) {
          const p = candidates.find(c => c.name === x.name);
          if (!is70(p, x.cls)) return;
        }
      }
      const cnt = {};
      for (const x of team) cnt[x.cls] = (cnt[x.cls] || 0) + 1;
      for (const cls of Object.keys(cnt)) if (cnt[cls] > capOf(cls)) return;
      for (const c of mustHave) if (!(cnt[c] > 0)) return;
      if (needDispel && !team.some(x => DISPEL.includes(x.cls))) return;
      if (roleMode && team.filter(x => x.heal === true).length !== healerWanted) return;
      count++;
      return;
    }
    for (const o of personOptions(candidates[i])) {
      picked.push(o);
      rec(i + 1, picked);
      picked.pop();
    }
  }

  rec(0, []);
  return count;
}

function roster(overrides = {}) {
  return DEFAULT_ROSTER.map(p => ({
    ...p, classes: [...p.classes],
    benched: false, sel: [], healerRole: null, not70: [], roles: {},
    ...(overrides[p.name] || {}),
  }));
}

function validate(results, opts, people) {
  const capOf = cls => (opts.caps && opts.caps[cls] !== undefined) ? opts.caps[cls] : Infinity;
  const byName = new Map(people.map(p => [p.name, p]));
  const roleMode = opts.healerWanted !== null && opts.healerWanted !== undefined;
  const seen = new Set();
  for (const team of results) {
    if (team.length !== opts.teamSize) return 'feil størrelse';
    const cnt = {};
    for (const t of team) cnt[t.cls] = (cnt[t.cls] || 0) + 1;
    for (const cls of Object.keys(cnt)) if (cnt[cls] > capOf(cls)) return 'tak brutt: ' + cls;
    if (opts.needDispel && !team.some(t => DISPEL.includes(t.cls))) return 'mangler dispeller';
    if (roleMode && team.filter(t => t.heal === true).length !== opts.healerWanted) return 'feil healer-antall';
    for (const t of team) {
      if (t.heal && !CLASSES[t.cls].healer) return 'dps-class som healer';
      const reg = regOf(byName.get(t.name), t.cls);
      if (roleMode && reg === 'healer' && t.heal !== true) return '✚-char uten heal';
      if (reg === 'dps' && t.heal !== false) return '⚔-char med heal';
    }
    const key = team.map(t => t.name + ':' + t.cls + ':' + (t.heal ? 1 : 0)).sort().join('|');
    if (seen.has(key)) return 'duplikat';
    seen.add(key);
  }
  return null;
}

let fail = 0;
function scenario(name, people, opts, expectedLiteral) {
  const { results, capped } = findComps(people, opts);
  const oracle = brute(people, opts);
  const bad = validate(results, opts, people);
  const litOk = expectedLiteral === undefined || results.length === expectedLiteral;
  const ok = results.length === oracle && !capped && !bad && litOk;
  if (!ok) fail++;
  console.log((ok ? 'OK  ' : 'FEIL') + '  ' + name + ': ' + results.length + ' (oracle ' + oracle +
    (expectedLiteral !== undefined ? ', fasit ' + expectedLiteral : '') + ')' +
    (bad ? ' [' + bad + ']' : '') + (capped ? ' [CAPPED]' : ''));
}

const ALL1 = { warr: 1, pala: 1, hunter: 1, rogue: 1, priest: 1, sham: 1, mage: 1, druid: 1 };
const base = { teamSize: 5, mustHave: new Set(), healerWanted: null, only70: true, caps: { rogue: 1, sham: 1 }, needDispel: true };

// Anker: den opprinnelige modellen (maks 1 av alt, uten dispel-krav) = håndregnet 62
scenario('5v5, alle tak=1, uten dispel-krav (opprinnelig modell)', roster(), { ...base, caps: ALL1, needDispel: false }, 62);

// Standardregler
scenario('5v5, standardregler (rogue×1, sham×1, dispel-krav)', roster(), base, 180);
scenario('5v5, standardregler + eksakt 2 healers', roster(), { ...base, healerWanted: 2 }, 552);
scenario('5v5, kun tak (uten dispel-krav)', roster(), { ...base, needDispel: false }, 185);
scenario('5v5, pala begrenset til ×2', roster(), { ...base, caps: { rogue: 1, sham: 1, pala: 2 } });
scenario('5v5, pala ×1', roster(), { ...base, caps: { rogue: 1, sham: 1, pala: 1 } }, 65);

// Kombinasjoner: valg på tavla, rolleregistrering, benk, 70-status, must-have, brackets
scenario('5v5, Magnus valgt sham som healer + eksakt 2 healers', roster({ Magnus: { sel: ['sham'], healerRole: true } }), { ...base, healerWanted: 2 });
scenario('5v5, Brynjar-druid=✚, Andre-sham=⚔ + eksakt 2 healers', roster({ Brynjar: { roles: { druid: 'healer' } }, Andre: { roles: { sham: 'dps' } } }), { ...base, healerWanted: 2 });
scenario('5v5, Tobias benket + Runar-hunter ikke 70 + må ha warr', roster({ Tobias: { benched: true }, Runar: { not70: ['hunter'] } }), { ...base, mustHave: new Set(['warr']) });
scenario('3v3, standardregler + eksakt 1 healer', roster(), { ...base, teamSize: 3, healerWanted: 1 });
scenario('2v2, standardregler uten dispel-krav', roster(), { ...base, teamSize: 2, needDispel: false });

// Flervalg på tavla: personen er alltid med, på en av de valgte classene
scenario('5v5, Magnus valgt sham ELLER priest', roster({ Magnus: { sel: ['sham', 'priest'] } }), base, 76);
scenario('5v5, Magnus sham/priest som healer + eksakt 2 healers', roster({ Magnus: { sel: ['sham', 'priest'], healerRole: true } }), { ...base, healerWanted: 2 }, 179);
scenario('5v5, Magnus sham/mage som healer (mage utelukkes) + 2 healers', roster({ Magnus: { sel: ['sham', 'mage'], healerRole: true } }), { ...base, healerWanted: 2 });
scenario('5v5, rollevalg utelukker alle valgte classes → 0', roster({ Magnus: { sel: ['mage'], healerRole: true } }), base, 0);
scenario('5v5, to med flervalg (Magnus warr/sham, Andre rogue/mage)', roster({ Magnus: { sel: ['warr', 'sham'] }, Andre: { sel: ['rogue', 'mage'] } }), base);
scenario('3v3, Magnus sham/priest + eksakt 1 healer', roster({ Magnus: { sel: ['sham', 'priest'] } }), { ...base, teamSize: 3, healerWanted: 1 });

// Scenarioet fra skjermbilde-diskusjonen (rene ✚-registreringer + må ha sham) = 3
scenario('5v5, «hvorfor bare 3?»-scenarioet', roster({
  Magnus:  { roles: { sham: 'dps', priest: 'healer' } },
  Johnny:  { roles: { pala: 'healer' } },
  Brynjar: { roles: { druid: 'healer' }, not70: ['pala'] },
  Andre:   { roles: { sham: 'healer' } },
  Tobias:  { not70: ['pala'] },
}), { ...base, mustHave: new Set(['sham']), healerWanted: 2 }, 3);

process.exit(fail ? 1 : 0);
