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

/*
 * META — research-basert referansedata om TBC-arenacomps (kilde: dyp-research
 * juli 2026, se META.sources). Vises i «Comps»-fanen. IKKE koblet til
 * reglene/generatoren ennå — føringene er referanse til Magnus vedtar hvilke
 * som skal håndheves. 'lock' (Warlock) finnes ikke i CLASSES (ingen i gjengen
 * spiller det); comps med lock bemannes via random-plasser i UI-et.
 */
const META = {
  extraClasses: { lock: { label: 'Lock', color: '#9482C9', healer: false } },
  comps: {
    5: [
      { name: 'Eurocomp (Triple Healer)', classes: ['warr', 'lock', 'sham', 'pala', 'priest'], specs: ['arms', 'affli', 'resto', 'holy', 'disc'], healers: 3, tier: 'S',
        why: 'Standard-metaen: tre healers, Warr+Lock-attrition, Mana Burn og Bloodlust som drapsvinduer. Sterkest S3–S4.' },
      { name: 'Melee Cleave (Warr/Rogue/Lock)', classes: ['warr', 'rogue', 'lock', 'druid', 'priest'], specs: ['arms', 'sub', 'affli', 'resto', 'disc'], healers: 2, tier: 'S',
        why: 'Mer drapspress enn Eurocomp via Rogue-burst; CC-kjeder fra Rogue+Lock+Druid låser fiendens healere.' },
      { name: '2346 (Warr/Ele/Lock)', classes: ['warr', 'sham', 'lock', 'priest', 'pala'], specs: ['arms', 'ele', 'affli', 'disc', 'holy'], healers: 2, tier: 'A',
        why: 'MS + Ele-burst med Curse of Tongues som langspill-plan; solo-Warrioren er hovedmål.' },
      { name: '2347 (Hunter/Ele/Lock)', classes: ['hunter', 'sham', 'lock', 'priest', 'pala'], specs: ['mm', 'ele', 'destro', 'disc', 'holy'], healers: 2, tier: 'A',
        why: 'Aimed Shot + Ele/Destro-burst, alle ranged, mange dispels; kast-avhengig og curse-sårbar.' },
      { name: '2345 (Warr/Ele/Mage)', classes: ['warr', 'sham', 'mage', 'priest', 'pala'], specs: ['arms', 'ele', 'frost', 'disc', 'holy'], healers: 2, tier: 'A',
        why: 'Lock-fri burst-variant, men cooldown- og mana-avhengig.' },
      { name: 'Caster Cleave (Mage/Lock)', classes: ['mage', 'lock', 'priest', 'druid', 'sham'], specs: ['frost', 'affli', 'disc', 'resto', 'resto'], healers: 3, tier: 'A',
        why: 'CC-dybde (Poly/Fear/Cyclone) og Blizzard-AoE med BL-vindu; taper mot gap-closers.' },
      { name: 'TriHealer Drain', classes: ['hunter', 'lock', 'priest', 'sham', 'pala'], specs: ['mm', 'affli', 'disc', 'resto', 'holy'], healers: 3, tier: 'A',
        why: 'Viper Sting + Drain Mana + Mana Burn vinner uten dps; melee-cleave er hard counter.' },
      { name: 'Shadowplay Plus', classes: ['sham', 'mage', 'lock', 'priest', 'pala'], specs: ['ele', 'frost', 'destro', 'shadow', 'holy'], healers: 1, tier: 'A',
        why: 'Mye ikke-DR CC og høy skade, men ingen MS og lav healing — unntaket som bekrefter 2–3-healer-normen.' },
      { name: 'Windfury Cleave', classes: ['warr', 'pala', 'sham', 'priest', 'pala'], specs: ['arms', 'ret', 'enh', 'disc', 'holy'], healers: 2, tier: 'B',
        why: 'WF-burst + MS, dokumentert dobbel-paladin (Ret + Holy).' },
      { name: '3 DPS / 2 Healer Balanced', classes: ['warr', 'lock', 'mage', 'druid', 'pala'], specs: ['arms', 'affli', 'frost', 'resto', 'holy'], healers: 2, tier: 'B',
        why: 'Balansert press og ok robusthet, men verken triple-healer-soliditet eller caster-CC.' },
      { name: '4 DPS Zerg', classes: ['warr', 'rogue', 'mage', 'lock', 'priest'], specs: ['arms', 'sub', 'frost', 'affli', 'disc'], healers: 1, tier: 'B',
        why: 'All-in: drep på 30 sek eller tap. Reelt C-tier — ikke konkurransedyktig høyt.' },
      { name: 'Euro-variant m/ Ele', classes: ['warr', 'sham', 'priest', 'pala', 'druid'], specs: ['arms', 'ele', 'disc', 'holy', 'resto'], healers: 3, tier: 'A',
        why: 'Nærmeste S-tilnærming uten Lock: MS, Ele-burst, dobbel purge, BL og full dispel-dekning.' },
      { name: 'Hunter Cleave', classes: ['warr', 'hunter', 'sham', 'pala', 'druid'], specs: ['arms', 'mm', 'ele', 'holy', 'resto'], healers: 2, tier: 'B',
        why: 'Helt in-house for gjengen: dobbel MS-kilde (MS + Aimed), Viper Sting, purge og BL.' },
      { name: 'RMP + dobbel støtte', classes: ['rogue', 'mage', 'priest', 'pala', 'druid'], specs: ['sub', 'frost', 'disc', 'holy', 'resto'], healers: 3, tier: 'B',
        why: 'In-house 3-healer med mye CC, men ingen Shaman (mangler BL/Purge) og MS kun via Wound Poison. CC er devaluert i 5v5.' },
      { name: 'Turbo Melee', classes: ['warr', 'rogue', 'sham', 'pala', 'druid'], specs: ['arms', 'sub', 'ele', 'holy', 'resto'], healers: 2, tier: 'B',
        why: 'In-house press-comp med MS+Wound og BL; sårbar for kiting og AoE-CC.' },
    ],
    3: [
      { name: 'RMP', classes: ['rogue', 'mage', 'priest'], specs: ['sub', 'frost', 'disc'], healers: 1, tier: 'S',
        why: 'Best burst og CC-register, uforutsigbare swaps; mana-svak og mest koordinasjonskrevende.' },
      { name: 'WLD', classes: ['warr', 'lock', 'druid'], specs: ['arms', 'affli', 'resto'], healers: 1, tier: 'S',
        why: 'Svært robust drain-krig med raske swaps; definerer metaen sammen med RMP.' },
      { name: 'RLP', classes: ['rogue', 'lock', 'priest'], specs: ['sub', 'affli', 'disc'], healers: 1, tier: 'A',
        why: 'Allsidig skade og interrupts; RLD-varianten bytter dispel (Priest) mot ekstra CC (Druid).' },
      { name: 'Shadowplay', classes: ['lock', 'priest', 'sham'], specs: ['affli', 'shadow', 'resto'], healers: 1, tier: 'A',
        why: 'Best spread-skade pluss Bloodlust og mange dispels; lav mobilitet og burst.' },
      { name: '2-Healer Warrior', classes: ['warr', 'sham', 'pala'], specs: ['arms', 'resto', 'holy'], healers: 2, tier: 'A',
        why: 'MS + totems + purge + enorm healing; all skade på Warrioren, curse-sårbar.' },
      { name: '2-Healer Hunter (Drain)', classes: ['hunter', 'priest', 'druid'], specs: ['mm', 'disc', 'resto'], healers: 2, tier: 'A',
        why: 'Mana Burn + Viper Sting vinner uten dps.' },
      { name: 'Ret Cleave', classes: ['warr', 'pala', 'sham'], specs: ['arms', 'ret', 'resto'], healers: 1, tier: 'A',
        why: 'Massiv Windfury-burst med begge dispel-retninger; RNG-avhengig og lett å kite.' },
      { name: 'Warrior Turbo', classes: ['warr', 'sham', 'druid'], specs: ['arms', 'enh', 'resto'], healers: 1, tier: 'B',
        why: 'Høy burst med BL og totems; gear-avhengig og root-sårbar.' },
    ],
    2: [
      { name: 'Rogue + Disc Priest', classes: ['rogue', 'priest'], specs: ['sub', 'disc'], healers: 1, tier: 'S',
        why: 'Priest fjerner CC/debuffs så Roguen kan restealthe gjentatte ganger; Priesten er selv train-mål.' },
      { name: 'Mage + Rogue', classes: ['mage', 'rogue'], specs: ['frost', 'sub'], healers: 0, tier: 'S',
        why: 'Best opener og burst i bracketen; null healing, så alt avgjøres i setups.' },
      { name: 'SL-Lock + Resto Druid', classes: ['lock', 'druid'], specs: ['affli', 'resto'], healers: 1, tier: 'S',
        why: 'Den beryktede drain-kongen; nærmest udrepelig, sterkest S3–S4 med resilience.' },
      { name: 'SL-Lock + Rogue', classes: ['lock', 'rogue'], specs: ['affli', 'sub'], healers: 0, tier: 'A',
        why: 'Sterk allround-skade med mange interrupts; kun felhunter som dispel.' },
      { name: 'Warr + Resto Druid', classes: ['warr', 'druid'], specs: ['arms', 'resto'], healers: 1, tier: 'A',
        why: 'Svært slitesterk, druiden drikker lett; lav samlet skade.' },
      { name: 'Rogue + Resto Druid', classes: ['rogue', 'druid'], specs: ['sub', 'resto'], healers: 1, tier: 'A',
        why: 'Dobbel stealth og CC utenfor delt DR (Kidney/Cyclone/Blind); mangler dispels helt.' },
      { name: 'Affli Lock + Shadow Priest', classes: ['lock', 'priest'], specs: ['affli', 'shadow'], healers: 0, tier: 'A',
        why: 'Best spread-skade, silences og fears; lav mobilitet og burst.' },
      { name: 'Warr + Resto Shaman', classes: ['warr', 'sham'], specs: ['arms', 'resto'], healers: 1, tier: 'B',
        why: 'Høyt offensivt potensial med totems; root- og curse-sårbar.' },
    ],
  },
  rules: [
    { rule: '5v5-lag skal ha 2 eller 3 healers.', type: 'hard', scope: '5v5', hint: 'healerFilter',
      why: '9 av 11 kanoniske topp-comps har 2–3 healers; 1-healer-varianter er all-in/nisje.' },
    { rule: 'Velg 3 healers i 5v5 bare når laget har vedvarende press (Warr/Lock/Ele) og planlegger mana-krig.', type: 'myk', scope: '5v5', hint: 'healerFilter',
      why: 'Triple healer uten attrition-skade mangler vinnebetingelse.' },
    { rule: '3v3-lag skal ha 1 eller 2 healers.', type: 'hard', scope: '3v3', hint: 'healerFilter',
      why: 'Både 1-healer (RMP/WLD) og 2-healer (Warr/Hunter-varianter) er topp-tier i TBC.' },
    { rule: '2v2-lag skal ha 0 eller 1 healer, aldri 2.', type: 'hard', scope: '2v2', hint: 'healerFilter',
      why: 'Dobbel-DPS (Mage/Rogue) er S-tier; dobbel healer mangler vinnebetingelse.' },
    { rule: 'Minst 1 defensiv magic-dispeller (Paladin eller Priest) i 5v5.', type: 'hard', scope: '5v5', hint: 'needDispel',
      why: 'Samtlige kanoniske topp-5s har Pala og/eller Priest; Poly/Fear/DoTs må kunne fjernes.' },
    { rule: 'Minst 1 offensiv purger (Priest, Shaman eller Warlock-felhunter) i 5v5.', type: 'hard', scope: '5v5', hint: 'needDispel',
      why: 'Topp-5s har typisk 2–3 purgere; buffs/HoTs/Earth Shield må kunne rives.' },
    { rule: 'Uten poison-fjerner (Paladin, Druid eller Shaman): advar.', type: 'myk', scope: 'alle', hint: 'needDispel',
      why: 'Wound/Crippling Poison blir ellers stående mot rogues.' },
    { rule: 'Uten curse-fjerner (Mage eller Druid): advar om Curse of Tongues-sårbarhet.', type: 'myk', scope: 'alle', hint: 'needDispel',
      why: 'Curse-hullet er den oftest nevnte svakheten i topp-comps med casters/healere.' },
    { rule: 'Uten MS-effekt (Arms Warrior, MM Hunter eller Rogue m/ Wound Poison): advar.', type: 'myk', scope: 'alle', hint: 'nytt-konsept',
      why: '50 % healing-reduksjon står i de fleste topp-comps; unntak er rene drain-lag.' },
    { rule: '5v5-lag bør ha minst 1 Shaman (Bloodlust, Purge, totems).', type: 'myk', scope: '5v5', hint: 'mustHave',
      why: 'Shaman står i 8 av 11 kanoniske 5s-comps; sterk norm men ikke absolutt.' },
    { rule: 'Maks 1 av hver class som standard.', type: 'hard', scope: 'alle', hint: 'caps',
      why: 'Ingen topp-comp dublerer classes utenom dokumenterte unntak.' },
    { rule: 'Unntak: tillat 2 paladiner (Holy + Ret) i 5v5.', type: 'myk', scope: '5v5', hint: 'caps',
      why: 'Windfury Cleave med Ret+Holy er dokumentert (Icy Veins).' },
    { rule: '2 shamans eller 2 priests i 5v5: tillat med advarsel (usikkert belegg).', type: 'myk', scope: '5v5', hint: 'caps',
      why: 'Anekdotisk fra original-TBC (Ele+Resto med dobbel-BL i 2.4.3; Disc+Shadow); ikke i hovedkildene.' },
    { rule: '2 rogues: kun akseptabelt i 3v3, ellers advar.', type: 'myk', scope: 'alle', hint: 'caps',
      why: 'Dobbel-rogue er kjent 3v3-cheese, ikke belagt høyt i andre brackets.' },
    { rule: 'Krev en uttalt vinnebetingelse per lag: cleave, caster, drain eller turtle.', type: 'myk', scope: 'alle', hint: 'nytt-konsept',
      why: 'Alle topp-comps tilhører en tydelig arketype; blandingslag uten plan er B-tier-mønsteret.' },
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
    note: 'Cleanse fjerner 1 poison + 1 disease + 1 magic per kast. Dispel Magic r2 og Purge r2 fjerner 2 effekter per kast. Abolish Poison/Disease er tick-varianter. Priest Mass Dispel (ny i TBC) fjerner også immuniteter (Divine Shield/Ice Block). Lock = felhunter Devour Magic, virker både defensivt og offensivt (1 effekt). Mage-offensiv = Spellsteal (stjeler buffen). Nisje: Warrior Shield Slam dispeller 1 magic (krever skjold); Hunter Tranq Shot fjerner kun frenzy/enrage i TBC. Warr/Rogue/Hunter har ingen defensiv dispel. Sham kan IKKE dispelle magic i TBC.',
  },
  ms: {
    classes: ['warr', 'hunter', 'rogue'],
    note: 'Arms Warrior Mortal Strike: 50 % i 10 sek. MM Hunter Aimed Shot (talent): 50 % i 10 sek. Rogue Wound Poison: 10 % per stack, maks 5 = 50 % (alle specs, men dispellbar poison). Fra patch 2.1 stacker de tre IKKE med hverandre.',
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
    { title: 'Wowpedia – Wound Poison (patch-historikk)', url: 'https://wowpedia.fandom.com/wiki/Wound_Poison' },
    { title: 'Wowpedia – Dispel', url: 'https://wowpedia.fandom.com/wiki/Dispel' },
    { title: 'MMO-Champion – Dispeling abilities of each class (2007)', url: 'https://www.mmo-champion.com/threads/603872-Dispeling-abilities-of-each-class' },
    { title: 'Warcraft Tavern – Heroism/Bloodlust-endring i Anniversary', url: 'https://www.warcrafttavern.com/tbc/news/heroism-bloodlust-will-reset-for-bosses-in-tbc-classic-anniversary-edition/' },
    { title: 'MMO-Champion – Bloodlust i original-TBC (ingen Sated)', url: 'https://www.mmo-champion.com/threads/2586733-Should-they-change-bloodlust-heroism-in-BC/page4' },
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

// Registrert rolle for en char: hybrids (heal-capable classes) default 'both', andre alltid 'dps'
function regOf(p, cls) {
  if (!CLASSES[cls].healer) return 'dps';
  return (p.roles && p.roles[cls]) || 'both';
}

// Hvilke av personens valgte classes (sel[]) rollevalget på tavla tillater:
// «Healer» utelukker rene ⚔-registreringer, «DPS» utelukker rene ✚-registreringer.
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
 *           caps({cls: maks} — class uten oppføring = ubegrenset), needDispel(bool) }
 *
 * Regler: tak per class, valgfritt dispeller-krav (minst 1 pala/priest) og
 * valgfritt eksakt antall healers. roleMode (healer-filter aktivt):
 * 'healer'-chars teller alltid som healer, 'dps'-chars aldri, '✚⚔'-chars
 * grenes i begge roller — med mindre rollen er valgt på tavla (healerRole).
 * Uten filter genereres hvert class-oppsett én gang; heal-flagget settes da
 * kun for 'healer'-registrerte (visning). Valgte personer (sel[] ikke tom)
 * er harde føringer: de er alltid med, på en av de valgte classene —
 * rollevalget kan snevre inn hvilke (selOptions). Utelukker rollevalget
 * alle valgte classes, finnes ingen gyldige lag.
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
      // valgt person: alltid med, på en av de valgte classene — ingen «stå over»-gren
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
      rec(i + 1, team, healCount); // personen står over
    }
  }

  rec(0, [], 0);
  return { results, capped };
}

// Node-eksport for testene; ignoreres i nettleseren.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CLASSES, CLASS_KEYS, MAX_RESULTS, DISPEL, SPECS, META, DEFAULT_ROSTER, is70, regOf, selOptions, findComps };
}
