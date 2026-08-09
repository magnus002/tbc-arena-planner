'use strict';
/*
 * Oracle test: verifies engine.findComps against an independent brute-force
 * enumeration that generates EVERYTHING and filters at the end. Run: npm test
 *
 * Principle: every new rule in the engine MUST also be added to brute() here —
 * the two implementations should be independent of each other.
 */
const { CLASSES, DISPEL, SPECS, META, DEFAULT_ROSTER, is70, regOf, findComps } = require('../engine.js');

/* ---- Independent oracle ---- */
function brute(people, opts) {
  const { teamSize, mustHave, healerWanted, only70, caps, needDispel } = opts;
  const roleMode = healerWanted !== null && healerWanted !== undefined;
  const capOf = cls => (caps && caps[cls] !== undefined) ? caps[cls] : Infinity;
  const candidates = people.filter(p => !p.benched);
  let count = 0;

  function personOptions(p) {
    const locked = !!(p.sel && p.sel.length); // selected on the board = must be included
    const out = [];
    if (!locked) out.push(null); // can sit out — selected people cannot
    const clsList = locked ? p.sel : p.classes;
    for (const cls of clsList) {
      const reg = regOf(p, cls);
      // the role choice on the board excludes classes that cannot play that role
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
    if (team.length !== opts.teamSize) return 'wrong size';
    const cnt = {};
    for (const t of team) cnt[t.cls] = (cnt[t.cls] || 0) + 1;
    for (const cls of Object.keys(cnt)) if (cnt[cls] > capOf(cls)) return 'cap broken: ' + cls;
    if (opts.needDispel && !team.some(t => DISPEL.includes(t.cls))) return 'missing dispeller';
    if (roleMode && team.filter(t => t.heal === true).length !== opts.healerWanted) return 'wrong healer count';
    for (const t of team) {
      if (t.heal && !CLASSES[t.cls].healer) return 'dps class as healer';
      const reg = regOf(byName.get(t.name), t.cls);
      if (roleMode && reg === 'healer' && t.heal !== true) return '✚ character without heal';
      if (reg === 'dps' && t.heal !== false) return '⚔ character with heal';
    }
    const key = team.map(t => t.name + ':' + t.cls + ':' + (t.heal ? 1 : 0)).sort().join('|');
    if (seen.has(key)) return 'duplicate';
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
  console.log((ok ? 'OK  ' : 'FAIL') + '  ' + name + ': ' + results.length + ' (oracle ' + oracle +
    (expectedLiteral !== undefined ? ', expected ' + expectedLiteral : '') + ')' +
    (bad ? ' [' + bad + ']' : '') + (capped ? ' [CAPPED]' : ''));
}

const ALL1 = { warr: 1, pala: 1, hunter: 1, rogue: 1, priest: 1, sham: 1, mage: 1, druid: 1 };
const base = { teamSize: 5, mustHave: new Set(), healerWanted: null, only70: true, caps: { rogue: 1, sham: 1 }, needDispel: true };

// Anchor: the original model (max 1 of everything, no dispel requirement) = hand-counted 62
scenario('5v5, all caps=1, no dispel requirement (original model)', roster(), { ...base, caps: ALL1, needDispel: false }, 62);

// Default rules
scenario('5v5, default rules (rogue×1, sham×1, dispel requirement)', roster(), base, 180);
scenario('5v5, default rules + exact 2 healers', roster(), { ...base, healerWanted: 2 }, 552);
scenario('5v5, caps only (no dispel requirement)', roster(), { ...base, needDispel: false }, 185);
scenario('5v5, pala capped at ×2', roster(), { ...base, caps: { rogue: 1, sham: 1, pala: 2 } });
scenario('5v5, pala ×1', roster(), { ...base, caps: { rogue: 1, sham: 1, pala: 1 } }, 65);

// Combinations: board selections, role registration, bench, 70 status, must-have, brackets
scenario('5v5, Magnus picked sham as healer + exact 2 healers', roster({ Magnus: { sel: ['sham'], healerRole: true } }), { ...base, healerWanted: 2 });
scenario('5v5, Brynjar-druid=✚, Andre-sham=⚔ + exact 2 healers', roster({ Brynjar: { roles: { druid: 'healer' } }, Andre: { roles: { sham: 'dps' } } }), { ...base, healerWanted: 2 });
scenario('5v5, Tobias benched + Runar-hunter not 70 + must have warr', roster({ Tobias: { benched: true }, Runar: { not70: ['hunter'] } }), { ...base, mustHave: new Set(['warr']) });
scenario('3v3, default rules + exact 1 healer', roster(), { ...base, teamSize: 3, healerWanted: 1 });
scenario('2v2, default rules without dispel requirement', roster(), { ...base, teamSize: 2, needDispel: false });

// Multi-select on the board: the person is always included, on one of the selected classes
scenario('5v5, Magnus picked sham OR priest', roster({ Magnus: { sel: ['sham', 'priest'] } }), base, 76);
scenario('5v5, Magnus sham/priest as healer + exact 2 healers', roster({ Magnus: { sel: ['sham', 'priest'], healerRole: true } }), { ...base, healerWanted: 2 }, 179);
scenario('5v5, Magnus sham/mage as healer (mage excluded) + 2 healers', roster({ Magnus: { sel: ['sham', 'mage'], healerRole: true } }), { ...base, healerWanted: 2 });
scenario('5v5, role choice excludes all selected classes → 0', roster({ Magnus: { sel: ['mage'], healerRole: true } }), base, 0);
scenario('5v5, two with multi-select (Magnus warr/sham, Andre rogue/mage)', roster({ Magnus: { sel: ['warr', 'sham'] }, Andre: { sel: ['rogue', 'mage'] } }), base);
scenario('3v3, Magnus sham/priest + exact 1 healer', roster({ Magnus: { sel: ['sham', 'priest'] } }), { ...base, teamSize: 3, healerWanted: 1 });

// The scenario from the screenshot discussion (pure ✚ registrations + must have sham) = 3
scenario('5v5, "why only 3?" scenario', roster({
  Magnus:  { roles: { sham: 'dps', priest: 'healer' } },
  Johnny:  { roles: { pala: 'healer' } },
  Brynjar: { roles: { druid: 'healer' }, not70: ['pala'] },
  Andre:   { roles: { sham: 'healer' } },
  Tobias:  { not70: ['pala'] },
}), { ...base, mustHave: new Set(['sham']), healerWanted: 2 }, 3);

/* ---- META integrity check (research data in the «Comps» tab) ----
 * Not oracle-vs-engine, but validation that the data is consistent with
 * the domain model: valid class/spec keys and healer counts that match
 * the spec roles. */
function metaCheck() {
  const errs = [];
  const clsOk = c => CLASSES[c] || META.extraClasses[c];
  const specRole = (c, key) => {
    const cat = SPECS[c] || (c === 'lock'
      ? [{ key: 'affli', role: 'dps' }, { key: 'demo', role: 'dps' }, { key: 'destro', role: 'dps' }]
      : []);
    const s = cat.find(x => x.key === key);
    return s ? s.role : null;
  };
  for (const size of Object.keys(META.comps)) {
    for (const comp of META.comps[size]) {
      const id = size + 'v' + size + ' «' + comp.name + '»';
      if (comp.classes.length !== Number(size)) errs.push(id + ': wrong number of classes');
      if (comp.specs.length !== comp.classes.length) errs.push(id + ': specs do not match classes');
      if (!['S', 'A', 'B'].includes(comp.tier)) errs.push(id + ': unknown tier');
      let heal = 0;
      comp.classes.forEach((c, i) => {
        if (!clsOk(c)) { errs.push(id + ': unknown class ' + c); return; }
        const role = specRole(c, comp.specs[i]);
        if (role === null) errs.push(id + ': unknown spec ' + comp.specs[i] + ' for ' + c);
        if (role === 'healer') heal++;
      });
      if (heal !== comp.healers) errs.push(id + ': healers=' + comp.healers + ' but the spec roles give ' + heal);
    }
  }
  for (const r of META.rules) {
    if (!['hard', 'soft'].includes(r.type)) errs.push('guideline «' + r.rule + '»: unknown type');
    if (!['5v5', '3v3', '2v2', 'all'].includes(r.scope)) errs.push('guideline «' + r.rule + '»: unknown scope');
    if (!['healerFilter', 'caps', 'mustHave', 'needDispel', 'new-concept'].includes(r.hint)) errs.push('guideline «' + r.rule + '»: unknown hint');
  }
  for (const c of Object.keys(META.dispel.defensive)) if (!clsOk(c)) errs.push('dispel.defensive: unknown class ' + c);
  for (const c of META.dispel.offensive) if (!clsOk(c)) errs.push('dispel.offensive: unknown class ' + c);
  for (const c of META.ms.classes) if (!clsOk(c)) errs.push('ms.classes: unknown class ' + c);
  for (const s of META.sources) if (!/^https:\/\//.test(s.url)) errs.push('source without https URL: ' + s.title);

  const n = Object.values(META.comps).reduce((a, l) => a + l.length, 0);
  if (errs.length) fail++;
  console.log((errs.length ? 'FAIL' : 'OK  ') + '  META integrity: ' + n + ' comps, ' + META.rules.length + ' guidelines' +
    (errs.length ? ' [' + errs.join('; ') + ']' : ''));
}
metaCheck();

process.exit(fail ? 1 : 0);
