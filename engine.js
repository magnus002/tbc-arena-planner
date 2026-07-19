'use strict';
/*
 * engine.js — domenemotoren for TBC Arena Lagplanlegger.
 *
 * VIKTIG: Denne fila deles av appen (index.html laster den før app.js) og
 * testene (tests/verify.js require-er den). Ikke kopier logikk herfra inn i
 * app eller tester — endre HER, og kjør `npm test` + `npm run smoke`.
 */

const CLASSES = {
  warr:   { label: 'Warrior', color: '#C79C6E', healer: false },
  pala:   { label: 'Pala',    color: '#F58CBA', healer: true  },
  hunter: { label: 'Hunter',  color: '#ABD473', healer: false },
  rogue:  { label: 'Rogue',   color: '#FFF569', healer: false },
  priest: { label: 'Priest',  color: '#EDEDED', healer: true  },
  sham:   { label: 'Sham',    color: '#4A8FE7', healer: true  },
  mage:   { label: 'Mage',    color: '#69CCF0', healer: false },
  druid:  { label: 'Druid',   color: '#FF7D0A', healer: true  },
};
const CLASS_KEYS = Object.keys(CLASSES);
const MAX_RESULTS = 800;
const DISPEL = ['pala', 'priest']; // dispellers (Cleanse / Dispel Magic)

/*
 * TBC-spec-katalog. IKKE koblet på UI/motor ennå — se PLAN.md punkt 2
 * (spec-modellen skal erstatte dagens healer/dps/begge-registrering).
 * role: 'healer' | 'dps'. Feral/Prot o.l. er forenklet til 'dps' i arena-kontekst.
 */
const SPECS = {
  warr:   [{ key: 'arms', label: 'Arms', role: 'dps' }, { key: 'fury', label: 'Fury', role: 'dps' }, { key: 'prot', label: 'Prot', role: 'dps' }],
  pala:   [{ key: 'holy', label: 'Holy', role: 'healer' }, { key: 'prot', label: 'Prot', role: 'dps' }, { key: 'ret', label: 'Ret', role: 'dps' }],
  hunter: [{ key: 'bm', label: 'BM', role: 'dps' }, { key: 'mm', label: 'MM', role: 'dps' }, { key: 'surv', label: 'Surv', role: 'dps' }],
  rogue:  [{ key: 'assa', label: 'Assa', role: 'dps' }, { key: 'combat', label: 'Combat', role: 'dps' }, { key: 'sub', label: 'Sub', role: 'dps' }],
  priest: [{ key: 'disc', label: 'Disc', role: 'healer' }, { key: 'holy', label: 'Holy', role: 'healer' }, { key: 'shadow', label: 'Shadow', role: 'dps' }],
  sham:   [{ key: 'ele', label: 'Ele', role: 'dps' }, { key: 'enh', label: 'Enh', role: 'dps' }, { key: 'resto', label: 'Resto', role: 'healer' }],
  mage:   [{ key: 'arcane', label: 'Arcane', role: 'dps' }, { key: 'fire', label: 'Fire', role: 'dps' }, { key: 'frost', label: 'Frost', role: 'dps' }],
  druid:  [{ key: 'balance', label: 'Balance', role: 'dps' }, { key: 'feral', label: 'Feral', role: 'dps' }, { key: 'resto', label: 'Resto', role: 'healer' }],
};

const DEFAULT_ROSTER = [
  { name: 'Magnus',  classes: ['warr', 'sham', 'mage', 'priest'] },
  { name: 'Johnny',  classes: ['pala', 'rogue'] },
  { name: 'Runar',   classes: ['rogue', 'hunter'] },
  { name: 'Brynjar', classes: ['druid', 'pala'] },
  { name: 'Andre',   classes: ['rogue', 'mage', 'sham'] },
  { name: 'Tobias',  classes: ['pala'] },
];

function is70(p, cls) {
  return !(p.not70 || []).includes(cls);
}

// Registrert rolle for en char: hybrids (heal-capable classes) default 'both', andre alltid 'dps'
function regOf(p, cls) {
  if (!CLASSES[cls].healer) return 'dps';
  return (p.roles && p.roles[cls]) || 'both';
}

/*
 * findComps(people, opts) → { results, capped }
 *
 * people: [{ name, classes[], benched, assigned, healerRole(true|false|null), not70[], roles{} }]
 * opts:   { teamSize, mustHave(Set), healerWanted(null|int), only70(bool),
 *           caps({cls: maks} — class uten oppføring = ubegrenset), needDispel(bool) }
 *
 * Regler: tak per class, valgfritt dispeller-krav (minst 1 pala/priest) og
 * valgfritt eksakt antall healers. roleMode (healer-filter aktivt):
 * 'healer'-chars teller alltid som healer, 'dps'-chars aldri, '✚⚔'-chars
 * grenes i begge roller — med mindre rollen er valgt på tavla (healerRole).
 * Uten filter genereres hvert class-oppsett én gang; heal-flagget settes da
 * kun for 'healer'-registrerte (visning). Låste (assigned) personer er harde
 * føringer: de er alltid med, på den classen.
 */
function findComps(people, opts) {
  const { teamSize, mustHave, healerWanted, only70, caps, needDispel } = opts;
  const roleMode = healerWanted !== null && healerWanted !== undefined;
  const capOf = cls => (caps && caps[cls] !== undefined) ? caps[cls] : Infinity;
  const candidates = people.filter(p => !p.benched);
  const results = [];
  let capped = false;
  const n = candidates.length;
  const counts = {};

  function roleOptions(p, cls, locked) {
    const reg = regOf(p, cls);
    if (reg === 'healer') return [true];
    if (reg === 'dps') return [false];
    // '✚⚔':
    if (locked && p.healerRole === true) return [true];
    if (locked && p.healerRole === false) return [false];
    return roleMode ? [true, false] : [false];
  }

  function rec(i, team, healCount) {
    if (results.length >= MAX_RESULTS) { capped = true; return; }
    if (team.length > teamSize) return;
    if (roleMode && healCount > healerWanted) return;
    if (i === n) {
      if (team.length === teamSize) {
        for (const c of mustHave) if (!(counts[c] > 0)) return;
        if (needDispel && !team.some(t => DISPEL.includes(t.cls))) return;
        if (roleMode && healCount !== healerWanted) return;
        results.push(team.map(t => ({ ...t })));
      }
      return;
    }
    const p = candidates[i];
    if (p.assigned) {
      if ((counts[p.assigned] || 0) >= capOf(p.assigned) || team.length >= teamSize) return;
      if (only70 && !is70(p, p.assigned)) return;
      for (const heal of roleOptions(p, p.assigned, true)) {
        team.push({ name: p.name, cls: p.assigned, heal });
        counts[p.assigned] = (counts[p.assigned] || 0) + 1;
        rec(i + 1, team, healCount + (heal ? 1 : 0));
        team.pop();
        counts[p.assigned]--;
      }
    } else {
      if (team.length < teamSize) {
        for (const c of p.classes) {
          if ((counts[c] || 0) >= capOf(c)) continue;
          if (only70 && !is70(p, c)) continue;
          for (const heal of roleOptions(p, c, false)) {
            team.push({ name: p.name, cls: c, heal });
            counts[c] = (counts[c] || 0) + 1;
            rec(i + 1, team, healCount + (heal ? 1 : 0));
            team.pop();
            counts[c]--;
          }
        }
      }
      rec(i + 1, team, healCount); // personen står over
    }
  }

  rec(0, [], 0);
  return { results, capped };
}

// Node-eksport for testene; ignoreres i nettleseren.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CLASSES, CLASS_KEYS, MAX_RESULTS, DISPEL, SPECS, DEFAULT_ROSTER, is70, regOf, findComps };
}
