'use strict';
/*
 * engine.js — domain engine for the TBC Arena Team Planner.
 *
 * IMPORTANT: This file is shared by the app (index.html loads it before app.js) and
 * the tests (tests/verify.js requires it). Do not copy logic from here into
 * the app or tests — change it HERE, and run `npm test` + `npm run smoke`.
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
 * TBC spec catalog. NOT wired into the UI/engine yet — see PLAN.md item 2
 * (the spec model is meant to replace the current healer/dps/both registration).
 * role: 'healer' | 'dps'. Feral/Prot etc. are simplified to 'dps' in an arena context.
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

/*
 * META — research-based reference data about TBC arena comps (source: deep
 * research July 2026, see META.sources). Shown in the "Comps" tab. NOT wired
 * into the rules/generator yet — the guidelines are reference material until
 * Magnus decides which ones to enforce. 'lock' (Warlock) does not exist in
 * CLASSES (nobody in the crew plays it); comps that include lock are staffed
 * via random slots in the UI.
 */
const META = {
  extraClasses: { lock: { label: 'Lock', color: '#9482C9', healer: false } },
  comps: {
    5: [
      { name: 'Eurocomp (Triple Healer)', classes: ['warr', 'lock', 'sham', 'pala', 'priest'], specs: ['arms', 'affli', 'resto', 'holy', 'disc'], healers: 3, tier: 'S',
        why: 'The standard meta: three healers, Warr+Lock attrition, Mana Burn and Bloodlust as kill windows. Strongest in S3–S4.' },
      { name: 'Melee Cleave (Warr/Rogue/Lock)', classes: ['warr', 'rogue', 'lock', 'druid', 'priest'], specs: ['arms', 'sub', 'affli', 'resto', 'disc'], healers: 2, tier: 'S',
        why: 'More kill pressure than Eurocomp via Rogue burst; CC chains from Rogue+Lock+Druid lock down the enemy healers.' },
      { name: '2346 (Warr/Ele/Lock)', classes: ['warr', 'sham', 'lock', 'priest', 'pala'], specs: ['arms', 'ele', 'affli', 'disc', 'holy'], healers: 2, tier: 'A',
        why: 'MS + Ele burst with Curse of Tongues as the long-game plan; the solo Warrior is the primary target.' },
      { name: '2347 (Hunter/Ele/Lock)', classes: ['hunter', 'sham', 'lock', 'priest', 'pala'], specs: ['mm', 'ele', 'destro', 'disc', 'holy'], healers: 2, tier: 'A',
        why: 'Aimed Shot + Ele/Destro burst, all ranged, lots of dispels; cast-reliant and curse-vulnerable.' },
      { name: '2345 (Warr/Ele/Mage)', classes: ['warr', 'sham', 'mage', 'priest', 'pala'], specs: ['arms', 'ele', 'frost', 'disc', 'holy'], healers: 2, tier: 'A',
        why: 'Lock-free burst variant, but cooldown- and mana-dependent.' },
      { name: 'Caster Cleave (Mage/Lock)', classes: ['mage', 'lock', 'priest', 'druid', 'sham'], specs: ['frost', 'affli', 'disc', 'resto', 'resto'], healers: 3, tier: 'A',
        why: 'CC depth (Poly/Fear/Cyclone) and Blizzard AoE with a BL window; loses to gap-closers.' },
      { name: 'TriHealer Drain', classes: ['hunter', 'lock', 'priest', 'sham', 'pala'], specs: ['mm', 'affli', 'disc', 'resto', 'holy'], healers: 3, tier: 'A',
        why: 'Viper Sting + Drain Mana + Mana Burn wins without dps; melee cleave is a hard counter.' },
      { name: 'Shadowplay Plus', classes: ['sham', 'mage', 'lock', 'priest', 'pala'], specs: ['ele', 'frost', 'destro', 'shadow', 'holy'], healers: 1, tier: 'A',
        why: 'Lots of non-DR CC and high damage, but no MS and low healing — the exception that proves the 2–3-healer norm.' },
      { name: 'Windfury Cleave', classes: ['warr', 'pala', 'sham', 'priest', 'pala'], specs: ['arms', 'ret', 'enh', 'disc', 'holy'], healers: 2, tier: 'B',
        why: 'WF burst + MS, documented double-paladin (Ret + Holy).' },
      { name: '3 DPS / 2 Healer Balanced', classes: ['warr', 'lock', 'mage', 'druid', 'pala'], specs: ['arms', 'affli', 'frost', 'resto', 'holy'], healers: 2, tier: 'B',
        why: 'Balanced pressure and okay durability, but neither triple-healer solidity nor caster CC.' },
      { name: '4 DPS Zerg', classes: ['warr', 'rogue', 'mage', 'lock', 'priest'], specs: ['arms', 'sub', 'frost', 'affli', 'disc'], healers: 1, tier: 'B',
        why: 'All-in: kill in 30 seconds or lose. Realistically C-tier — not competitive at a high level.' },
      { name: 'Euro Variant w/ Ele', classes: ['warr', 'sham', 'priest', 'pala', 'druid'], specs: ['arms', 'ele', 'disc', 'holy', 'resto'], healers: 3, tier: 'A',
        why: 'The closest S-tier approach without Lock: MS, Ele burst, double purge, BL, and full dispel coverage.' },
      { name: 'Hunter Cleave', classes: ['warr', 'hunter', 'sham', 'pala', 'druid'], specs: ['arms', 'mm', 'ele', 'holy', 'resto'], healers: 2, tier: 'B',
        why: 'Fully in-house for the crew: double MS source (MS + Aimed), Viper Sting, purge, and BL.' },
      { name: 'RMP + Double Support', classes: ['rogue', 'mage', 'priest', 'pala', 'druid'], specs: ['sub', 'frost', 'disc', 'holy', 'resto'], healers: 3, tier: 'B',
        why: 'In-house 3-healer with lots of CC, but no Shaman (missing BL/Purge) and MS only via Wound Poison. CC is devalued in 5v5.' },
      { name: 'Turbo Melee', classes: ['warr', 'rogue', 'sham', 'pala', 'druid'], specs: ['arms', 'sub', 'ele', 'holy', 'resto'], healers: 2, tier: 'B',
        why: 'In-house pressure comp with MS+Wound and BL; vulnerable to kiting and AoE CC.' },
    ],
    3: [
      { name: 'RMP', classes: ['rogue', 'mage', 'priest'], specs: ['sub', 'frost', 'disc'], healers: 1, tier: 'S',
        why: 'Best burst and CC toolkit, unpredictable swaps; mana-weak and the most coordination-demanding.' },
      { name: 'WLD', classes: ['warr', 'lock', 'druid'], specs: ['arms', 'affli', 'resto'], healers: 1, tier: 'S',
        why: 'Very robust drain war with fast swaps; defines the meta alongside RMP.' },
      { name: 'RLP', classes: ['rogue', 'lock', 'priest'], specs: ['sub', 'affli', 'disc'], healers: 1, tier: 'A',
        why: 'Versatile damage and interrupts; the RLD variant trades dispel (Priest) for extra CC (Druid).' },
      { name: 'Shadowplay', classes: ['lock', 'priest', 'sham'], specs: ['affli', 'shadow', 'resto'], healers: 1, tier: 'A',
        why: 'Best spread damage plus Bloodlust and lots of dispels; low mobility and burst.' },
      { name: '2-Healer Warrior', classes: ['warr', 'sham', 'pala'], specs: ['arms', 'resto', 'holy'], healers: 2, tier: 'A',
        why: 'MS + totems + purge + huge healing; all the damage rides on the Warrior, curse-vulnerable.' },
      { name: '2-Healer Hunter (Drain)', classes: ['hunter', 'priest', 'druid'], specs: ['mm', 'disc', 'resto'], healers: 2, tier: 'A',
        why: 'Mana Burn + Viper Sting wins without dps.' },
      { name: 'Ret Cleave', classes: ['warr', 'pala', 'sham'], specs: ['arms', 'ret', 'resto'], healers: 1, tier: 'A',
        why: 'Massive Windfury burst with both dispel directions covered; RNG-dependent and easy to kite.' },
      { name: 'Warrior Turbo', classes: ['warr', 'sham', 'druid'], specs: ['arms', 'enh', 'resto'], healers: 1, tier: 'B',
        why: 'High burst with BL and totems; gear-dependent and root-vulnerable.' },
    ],
    2: [
      { name: 'Rogue + Disc Priest', classes: ['rogue', 'priest'], specs: ['sub', 'disc'], healers: 1, tier: 'S',
        why: 'Priest removes CC/debuffs so the Rogue can restealth repeatedly; the Priest is itself the train target.' },
      { name: 'Mage + Rogue', classes: ['mage', 'rogue'], specs: ['frost', 'sub'], healers: 0, tier: 'S',
        why: 'Best opener and burst in the bracket; zero healing, so everything is decided in the setups.' },
      { name: 'SL-Lock + Resto Druid', classes: ['lock', 'druid'], specs: ['affli', 'resto'], healers: 1, tier: 'S',
        why: 'The infamous drain king; nearly unkillable, strongest in S3–S4 with resilience.' },
      { name: 'SL-Lock + Rogue', classes: ['lock', 'rogue'], specs: ['affli', 'sub'], healers: 0, tier: 'A',
        why: 'Strong all-round damage with lots of interrupts; only the felhunter for dispel.' },
      { name: 'Warr + Resto Druid', classes: ['warr', 'druid'], specs: ['arms', 'resto'], healers: 1, tier: 'A',
        why: 'Very durable, the druid can drink easily; low overall damage.' },
      { name: 'Rogue + Resto Druid', classes: ['rogue', 'druid'], specs: ['sub', 'resto'], healers: 1, tier: 'A',
        why: 'Double stealth and CC outside shared DR (Kidney/Cyclone/Blind); completely lacks dispels.' },
      { name: 'Affli Lock + Shadow Priest', classes: ['lock', 'priest'], specs: ['affli', 'shadow'], healers: 0, tier: 'A',
        why: 'Best spread damage, silences and fears; low mobility and burst.' },
      { name: 'Warr + Resto Shaman', classes: ['warr', 'sham'], specs: ['arms', 'resto'], healers: 1, tier: 'B',
        why: 'High offensive potential with totems; root- and curse-vulnerable.' },
    ],
  },
  rules: [
    { rule: 'A 5v5 team should have 2 or 3 healers.', type: 'hard', scope: '5v5', hint: 'healerFilter',
      why: '9 of 11 canonical top comps have 2–3 healers; 1-healer variants are all-in/niche.' },
    { rule: 'Only pick 3 healers in 5v5 when the team has sustained pressure (Warr/Lock/Ele) and plans a mana war.', type: 'soft', scope: '5v5', hint: 'healerFilter',
      why: 'Triple healer without attrition damage lacks a win condition.' },
    { rule: 'A 3v3 team should have 1 or 2 healers.', type: 'hard', scope: '3v3', hint: 'healerFilter',
      why: 'Both 1-healer (RMP/WLD) and 2-healer (Warr/Hunter variants) are top-tier in TBC.' },
    { rule: 'A 2v2 team should have 0 or 1 healer, never 2.', type: 'hard', scope: '2v2', hint: 'healerFilter',
      why: 'Double-DPS (Mage/Rogue) is S-tier; double healer lacks a win condition.' },
    { rule: 'At least 1 defensive magic dispeller (Paladin or Priest) in 5v5.', type: 'hard', scope: '5v5', hint: 'needDispel',
      why: 'Every canonical top 5s comp has Pala and/or Priest; Poly/Fear/DoTs need to be removable.' },
    { rule: 'At least 1 offensive purger (Priest, Shaman, or Warlock felhunter) in 5v5.', type: 'hard', scope: '5v5', hint: 'needDispel',
      why: 'Top 5s comps typically run 2–3 purgers; buffs/HoTs/Earth Shield need to be strippable.' },
    { rule: 'Without a poison remover (Paladin, Druid, or Shaman): warn.', type: 'soft', scope: 'all', hint: 'needDispel',
      why: 'Otherwise Wound/Crippling Poison sticks against rogues.' },
    { rule: 'Without a curse remover (Mage or Druid): warn about Curse of Tongues vulnerability.', type: 'soft', scope: 'all', hint: 'needDispel',
      why: 'The curse gap is the most frequently cited weakness in top comps with casters/healers.' },
    { rule: 'Without an MS effect (Arms Warrior, MM Hunter, or Rogue w/ Wound Poison): warn.', type: 'soft', scope: 'all', hint: 'new-concept',
      why: '50% healing reduction is present in most top comps; the exception is pure drain teams.' },
    { rule: 'A 5v5 team should have at least 1 Shaman (Bloodlust, Purge, totems).', type: 'soft', scope: '5v5', hint: 'mustHave',
      why: 'Shaman appears in 8 of 11 canonical 5s comps; a strong norm but not absolute.' },
    { rule: 'Max 1 of each class by default.', type: 'hard', scope: 'all', hint: 'caps',
      why: 'No top comp duplicates classes outside of documented exceptions.' },
    { rule: 'Exception: allow 2 paladins (Holy + Ret) in 5v5.', type: 'soft', scope: '5v5', hint: 'caps',
      why: 'Windfury Cleave with Ret+Holy is documented (Icy Veins).' },
    { rule: '2 shamans or 2 priests in 5v5: allow with a warning (uncertain evidence).', type: 'soft', scope: '5v5', hint: 'caps',
      why: 'Anecdotal from original TBC (Ele+Resto with double-BL in 2.4.3; Disc+Shadow); not in the main sources.' },
    { rule: '2 rogues: only acceptable in 3v3, otherwise warn.', type: 'soft', scope: 'all', hint: 'caps',
      why: 'Double-rogue is a known 3v3 cheese, not well-documented at a high level in other brackets.' },
    { rule: 'Require a stated win condition per team: cleave, caster, drain, or turtle.', type: 'soft', scope: 'all', hint: 'new-concept',
      why: 'Every top comp belongs to a clear archetype; mixed teams without a plan are the B-tier pattern.' },
  ],
  dispel: {
    defensive: {
      pala: ['magic', 'poison', 'disease'],
      priest: ['magic', 'disease'],
      sham: ['poison', 'disease'],
      druid: ['poison', 'curse'],
      mage: ['curse'],
      lock: ['magic'],
    },
    offensive: ['priest', 'sham', 'lock', 'mage'],
    note: 'Cleanse removes 1 poison + 1 disease + 1 magic per cast. Dispel Magic r2 and Purge r2 remove 2 effects per cast. Abolish Poison/Disease are tick variants. Priest Mass Dispel (new in TBC) also removes immunities (Divine Shield/Ice Block). Lock = felhunter Devour Magic, works both defensively and offensively (1 effect). Mage offensive = Spellsteal (steals the buff). Niche: Warrior Shield Slam dispels 1 magic effect (requires a shield); Hunter Tranq Shot only removes frenzy/enrage in TBC. Warr/Rogue/Hunter have no defensive dispel. Sham can NOT dispel magic in TBC.',
  },
  ms: {
    classes: ['warr', 'hunter', 'rogue'],
    note: 'Arms Warrior Mortal Strike: 50% for 10 sec. MM Hunter Aimed Shot (talent): 50% for 10 sec. Rogue Wound Poison: 10% per stack, max 5 = 50% (any spec, but dispellable poison). As of patch 2.1 the three do NOT stack with each other.',
  },
  sources: [
    { title: 'Icy Veins – TBC 5v5 Arena Composition Tier List', url: 'https://www.icy-veins.com/tbc-classic/5v5-arena-composition-rankings' },
    { title: 'Icy Veins – TBC 3v3 Arena Composition Tier List', url: 'https://www.icy-veins.com/tbc-classic/3v3-arena-composition-rankings' },
    { title: 'Icy Veins – TBC 2v2 Arena Composition Tier List', url: 'https://www.icy-veins.com/tbc-classic/2v2-arena-composition-rankings' },
    { title: 'AzerothGlad – TBC 5v5 Arena Tier List', url: 'https://www.azerothglad.com/tier-lists/5v5' },
    { title: 'Warcraft Tavern – Arena Class Tier List', url: 'https://www.warcrafttavern.com/tbc/guides/arena-class-tier-list/' },
    { title: 'Skill Capped – TBC Classic PvP Tier Lists', url: 'https://www.skill-capped.com/wowarticles/tbc/tier-lists/' },
    { title: 'Wowhead TBC – Mortal Strike', url: 'https://www.wowhead.com/tbc/spell=12294/mortal-strike' },
    { title: 'Wowhead TBC – Aimed Shot', url: 'https://www.wowhead.com/tbc/spell=27065/aimed-shot' },
    { title: 'Wowhead TBC – Cleanse', url: 'https://www.wowhead.com/tbc/spell=4987/cleanse' },
    { title: 'Wowhead TBC – Dispel Magic', url: 'https://www.wowhead.com/tbc/spell=527/dispel-magic' },
    { title: 'Wowpedia – Wound Poison (patch history)', url: 'https://wowpedia.fandom.com/wiki/Wound_Poison' },
    { title: 'Wowpedia – Dispel', url: 'https://wowpedia.fandom.com/wiki/Dispel' },
    { title: 'MMO-Champion – Dispeling abilities of each class (2007)', url: 'https://www.mmo-champion.com/threads/603872-Dispeling-abilities-of-each-class' },
    { title: 'Warcraft Tavern – Heroism/Bloodlust change in Anniversary', url: 'https://www.warcrafttavern.com/tbc/news/heroism-bloodlust-will-reset-for-bosses-in-tbc-classic-anniversary-edition/' },
    { title: 'MMO-Champion – Bloodlust in original TBC (no Sated)', url: 'https://www.mmo-champion.com/threads/2586733-Should-they-change-bloodlust-heroism-in-BC/page4' },
  ],
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

// Registered role for a character: hybrids (heal-capable classes) default to 'both', others are always 'dps'
function regOf(p, cls) {
  if (!CLASSES[cls].healer) return 'dps';
  return (p.roles && p.roles[cls]) || 'both';
}

// Which of the person's selected classes (sel[]) the board's role choice allows:
// "Healer" excludes pure ⚔ registrations, "DPS" excludes pure ✚ registrations.
function selOptions(p) {
  let opts = p.sel || [];
  if (p.healerRole === true) opts = opts.filter(c => regOf(p, c) !== 'dps');
  if (p.healerRole === false) opts = opts.filter(c => regOf(p, c) !== 'healer');
  return opts;
}

/*
 * findComps(people, opts) → { results, capped }
 *
 * people: [{ name, classes[], benched, sel[], healerRole(true|false|null), not70[], roles{} }]
 * opts:   { teamSize, mustHave(Set), healerWanted(null|int), only70(bool),
 *           caps({cls: max} — a class with no entry = unlimited), needDispel(bool) }
 *
 * Rules: a cap per class, an optional dispeller requirement (at least 1 pala/priest), and
 * an optional exact healer count. roleMode (healer filter active):
 * 'healer' characters always count as healer, 'dps' characters never do, '✚⚔'
 * characters branch into both roles — unless the role is chosen on the board (healerRole).
 * Without the filter, each class combination is generated once; the heal flag is then set
 * only for those registered as 'healer' (for display). Selected people (sel[] not empty)
 * are hard constraints: they are always included, on one of the selected classes —
 * the role choice can narrow down which ones (selOptions). If the role choice
 * excludes all selected classes, no valid teams exist.
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
    if (p.sel && p.sel.length) {
      // selected person: always included, on one of the selected classes — no "sit out" branch
      if (team.length >= teamSize) return;
      for (const c of selOptions(p)) {
        if ((counts[c] || 0) >= capOf(c)) continue;
        if (only70 && !is70(p, c)) continue;
        for (const heal of roleOptions(p, c, true)) {
          team.push({ name: p.name, cls: c, heal });
          counts[c] = (counts[c] || 0) + 1;
          rec(i + 1, team, healCount + (heal ? 1 : 0));
          team.pop();
          counts[c]--;
        }
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
      rec(i + 1, team, healCount); // the person sits out
    }
  }

  rec(0, [], 0);
  return { results, capped };
}

// Node export for the tests; ignored in the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CLASSES, CLASS_KEYS, MAX_RESULTS, DISPEL, SPECS, META, DEFAULT_ROSTER, is70, regOf, selOptions, findComps };
}
