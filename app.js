'use strict';
/*
 * app.js — UI-tilstand, rendering og hendelser. Domenelogikken bor i engine.js.
 *
 * To faner: «Lagbygging» (tavla, tilgjengelig-oversikt, gyldige lag, lagrede
 * lag) og «Roster» (redigering + lagrede lag). Alt re-rendres per interaksjon
 * (bevisst enkelt); tekstfelt-verdier bevares over re-render i render().
 *
 * Random-plasser: state.randomCount ukjente spillere teller mot lagstørrelsen.
 * Generatoren jobber da med teamSize − randomCount kjente plasser; filtre og
 * regler gjelder de kjente. Lagres/eksporteres som { random: true }-oppføringer.
 *
 * Lagring (PLAN punkt 4): hele state persisteres til localStorage i render()
 * (persist), og gjenopprettes ved oppstart (loadStored) med validering og
 * versjonsfelt. Feiler lagringen (privat modus, sandbox uten localStorage)
 * kjører alt videre i minnet — derfor svelges feilene med vilje.
 */

let state = {
  tab: 'build',       // 'build' | 'pug' | 'roster'
  teamSize: 5,
  sortBy: 'std',      // sortering av gyldige lag: 'std' | 'comp' | 'heal' | 'disp'
  collapsed: {},      // seksjons-id → true når lukket
  mustHave: new Set(),
  healerFilter: null, // null = alle, ellers eksakt antall faktiske healers
  only70: true,
  caps: { rogue: 1, sham: 1 },
  needDispel: true,
  people: freshRoster(),
  saved: [],          // [{name, size, team: [{name, cls, heal} | {random:true}]}]
  randomCount: 0,     // antall random-plasser på tavla
  shown: 25,          // paginering av forslagslista
  metaOnlyOss: false, // Comps-fanen: vis kun comps gutta kan bemanne
  showIO: false,
  toast: null,
};
state.collapsed.kilder = true; // kilde-lista i Comps-fanen starter lukket
const PAGE = 25;

function freshRoster() {
  return DEFAULT_ROSTER.map(p => ({
    name: p.name,
    classes: [...p.classes],
    benched: false,
    sel: [],           // valgte classes på tavla — 1+ betyr «alltid med, på en av disse»
    healerRole: null,  // rollevalg på tavla for ✚⚔: true=healer, false=dps, null=åpen
    not70: [],
    roles: {},         // per-char registrering for hybrid-classes: 'healer' | 'dps' | 'both'
  }));
}

/* ---------- lagring ---------- */

const STORAGE_KEY = 'tbc-arena-planner';
const STORAGE_VERSION = 1;

// Rens en liste lagrede lag (fra import ELLER localStorage) til gyldig form.
// Godtar gammelt format uten random-oppføringer. null = ikke en liste.
function reviveSaved(data) {
  if (!Array.isArray(data)) return null;
  const clean = [];
  for (const s of data) {
    if (!s || !Array.isArray(s.team)) continue;
    const team = s.team
      .filter(x => x && (x.random === true || (typeof x.name === 'string' && CLASSES[x.cls])))
      .map(x => x.random === true
        ? { random: true }
        : { name: x.name, cls: x.cls, heal: x.heal === true ? true : x.heal === false ? false : null });
    if (!team.length) continue;
    clean.push({
      name: typeof s.name === 'string' && s.name.trim() ? s.name.trim() : 'Importert lag',
      size: [2, 3, 5].includes(s.size) ? s.size : ([2, 3, 5].includes(team.length) ? team.length : 5),
      team,
    });
  }
  return clean;
}

function revivePeople(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  const seen = new Set();
  for (const p of list) {
    if (!p || typeof p.name !== 'string' || !p.name.trim()) continue;
    if (seen.has(p.name.toLowerCase())) continue;
    seen.add(p.name.toLowerCase());
    const classes = (Array.isArray(p.classes) ? p.classes : []).filter(c => CLASSES[c]);
    const roles = {};
    if (p.roles && typeof p.roles === 'object') {
      for (const k of Object.keys(p.roles)) {
        if (CLASSES[k] && ['healer', 'dps', 'both'].includes(p.roles[k])) roles[k] = p.roles[k];
      }
    }
    out.push({
      name: p.name,
      classes,
      benched: p.benched === true,
      sel: (Array.isArray(p.sel) ? p.sel : []).filter(c => classes.includes(c)),
      healerRole: p.healerRole === true ? true : p.healerRole === false ? false : null,
      not70: (Array.isArray(p.not70) ? p.not70 : []).filter(c => CLASSES[c]),
      roles,
    });
  }
  return out.length ? out : null;
}

function loadStored() {
  let d;
  try {
    d = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    return;
  }
  if (!d || d.v !== STORAGE_VERSION) return; // ukjent format → start ferskt (migrering hektes på her)
  if ([2, 3, 5].includes(d.teamSize)) state.teamSize = d.teamSize;
  if (['build', 'pug', 'meta', 'roster'].includes(d.tab)) state.tab = d.tab;
  if (['std', 'comp', 'heal', 'disp'].includes(d.sortBy)) state.sortBy = d.sortBy;
  if (typeof d.metaOnlyOss === 'boolean') state.metaOnlyOss = d.metaOnlyOss;
  if (d.collapsed && typeof d.collapsed === 'object') state.collapsed = { ...d.collapsed };
  if (Array.isArray(d.mustHave)) state.mustHave = new Set(d.mustHave.filter(c => CLASSES[c]));
  if ([1, 2, 3].includes(d.healerFilter) || d.healerFilter === null) state.healerFilter = d.healerFilter;
  if (typeof d.only70 === 'boolean') state.only70 = d.only70;
  if (typeof d.needDispel === 'boolean') state.needDispel = d.needDispel;
  if (d.caps && typeof d.caps === 'object') {
    const caps = {};
    for (const k of Object.keys(d.caps)) {
      if (CLASSES[k] && Number.isInteger(d.caps[k]) && d.caps[k] >= 0) caps[k] = d.caps[k];
    }
    state.caps = caps;
  }
  const ppl = revivePeople(d.people);
  if (ppl) state.people = ppl;
  const saved = reviveSaved(d.saved);
  if (saved) state.saved = saved;
  if (Number.isInteger(d.randomCount)) state.randomCount = Math.max(0, Math.min(d.randomCount, state.teamSize));
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      v: STORAGE_VERSION,
      teamSize: state.teamSize,
      sortBy: state.sortBy,
      tab: state.tab,
      collapsed: state.collapsed,
      mustHave: [...state.mustHave],
      healerFilter: state.healerFilter,
      only70: state.only70,
      caps: state.caps,
      needDispel: state.needDispel,
      people: state.people,
      saved: state.saved,
      randomCount: state.randomCount,
      metaOnlyOss: state.metaOnlyOss,
    }));
  } catch (e) { /* privat modus / sandbox uten localStorage: fortsett uten lagring */ }
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function personByName(name) {
  return state.people.find(p => p.name === name) || null;
}
function knownSlots() {
  return state.teamSize - state.randomCount;
}

/* ---------- tavle-status ---------- */

function capViolations() {
  const count = {};
  for (const p of state.people) {
    if (!p.benched && p.sel.length === 1) count[p.sel[0]] = (count[p.sel[0]] || 0) + 1;
  }
  const out = [];
  for (const cls of Object.keys(count)) {
    const cap = state.caps[cls] === undefined ? Infinity : state.caps[cls];
    if (count[cls] > cap) out.push({ cls, count: count[cls], cap });
  }
  return out;
}

// Er en av classene i clsArr garantert med («ja»), mulig («mulig») eller ikke med («nei»)?
function containsStatus(clsArr) {
  const set = new Set(clsArr);
  let possible = false;
  for (const p of state.people) {
    if (p.benched || !p.sel.length) continue;
    const opts = selOptions(p);
    if (!opts.length) continue;
    if (opts.every(c => set.has(c))) return 'ja';
    if (opts.some(c => set.has(c))) possible = true;
  }
  return possible ? 'mulig' : 'nei';
}

function boardInfo() {
  const active = state.people.filter(p => !p.benched);
  const chosen = active.filter(p => p.sel.length > 0);
  const multi = chosen.filter(p => p.sel.length > 1);
  const viol = capViolations();
  const slots = knownSlots();
  const info = { chosen, multi, viol, slots, warns: [], complete: false, healTxt: '' };

  if (viol.length) info.warns.push('Regelbrudd: ' + viol.map(v => v.count + '× ' + CLASSES[v.cls].label + ' (maks ' + v.cap + ')').join(', '));
  if (chosen.length > slots) info.warns.push('For mange valgt – ' + slots + ' plass' + (slots === 1 ? '' : 'er') + ' igjen etter random');
  if (active.length < slots) info.warns.push('Bare ' + active.length + ' aktive spillere');
  if (state.only70) {
    const low = chosen.filter(p => p.sel.length === 1 && !is70(p, p.sel[0]));
    if (low.length) info.warns.push('Ikke 70: ' + low.map(p => esc(p.name)).join(', '));
  }
  if (!multi.length && !info.warns.length && chosen.length === slots && chosen.length + state.randomCount === state.teamSize) {
    const dispelOk = !state.needDispel || chosen.some(p => DISPEL.includes(p.sel[0]));
    if (!dispelOk) {
      info.warns.push('Mangler dispeller (Pala/Priest)');
    } else {
      let heal = 0, open = 0;
      for (const p of chosen) {
        const reg = regOf(p, p.sel[0]);
        if (reg === 'healer' || (reg === 'both' && p.healerRole === true)) heal++;
        else if (reg === 'both' && p.healerRole === null) open++;
      }
      info.complete = true;
      info.healTxt = heal + ' healer' + (heal === 1 ? '' : 's') +
        (open ? ', ' + open + ' uavklart ✚⚔' : '') +
        (state.randomCount ? ', ' + state.randomCount + ' random' : '');
    }
  }
  return info;
}

/* ---------- komponenter ---------- */

function section(id, title, badge, headExtra, bodyHtml) {
  const open = !state.collapsed[id];
  return '<section class="sec" id="sec-' + id + '"><div class="sechead" data-act="collapse" data-id="' + id +
    '" role="button" tabindex="0" aria-expanded="' + open + '">' +
    '<span class="chev' + (open ? ' open' : '') + '">▸</span><h2>' + title + '</h2>' +
    (badge || '') + '<span class="hspace"></span>' + (headExtra || '') + '</div>' +
    (open ? '<div class="secbody">' + bodyHtml + '</div>' : '') +
    '</section>';
}

function chipHtml(p, pi, cls, selected, conflict) {
  const c = CLASSES[cls];
  const reg = regOf(p, cls);
  const n70 = !is70(p, cls);
  let mark = '';
  if (reg === 'healer') mark = ' <span class="mark">✚</span>';
  else if (reg === 'both') mark = ' <span class="mark">✚⚔</span>';
  else if (c.healer) mark = ' <span class="mark">⚔</span>';
  let style = selected
    ? 'background:' + c.color + ';border-color:' + c.color + ';color:var(--ink)'
    : 'border-color:' + c.color + ';color:' + c.color;
  if (n70 && !selected && state.only70) style += ';opacity:0.5';
  return '<button class="chip' + (conflict ? ' conflict' : '') + '" style="' + style +
    '" data-act="selchip" data-pi="' + pi + '" data-cls="' + cls + '" aria-pressed="' + selected + '"' +
    (n70 ? ' title="Ikke level 70"' : '') + '>' + c.label + mark +
    (n70 ? '<span class="lvl">&lt;70</span>' : '') + '</button>';
}

function pairsHtml(team) {
  return team.map(t => {
    if (t.random) return '<span class="pair rnd">Random</span>';
    const c = CLASSES[t.cls];
    const p = personByName(t.name);
    const reg = p ? regOf(p, t.cls) : 'dps';
    const mark = reg === 'healer' ? ' <span class="mark">✚</span>' : reg === 'both' ? ' <span class="mark">✚⚔</span>' : '';
    const style = t.heal === true
      ? 'background:' + c.color + ';border-color:' + c.color + ';color:var(--ink)'
      : 'border-color:' + c.color + ';color:' + c.color;
    return '<span class="pair" style="' + style + '">' + esc(t.name) +
      ' <span style="opacity:0.8">' + c.label + '</span>' + mark + '</span>';
  }).join('');
}

/* ---------- fane: lagbygging ---------- */

function checklistHtml(info) {
  if (!info.chosen.length && !state.randomCount) return '';
  const pill = (kind, txt, extra) => '<span class="ckpill ' + kind + '"' + (extra || '') + '>' + txt + '</span>';
  const items = [];

  const sham = containsStatus(['sham']);
  items.push(sham === 'ja' ? pill('ok', 'Sham ✓') : sham === 'mulig' ? pill('maybe', 'Sham ?') : pill('', 'Sham –'));

  const disp = containsStatus(DISPEL);
  items.push(disp === 'ja' ? pill('ok', 'Dispeller ✓')
    : disp === 'mulig' ? pill('maybe', 'Dispeller ?')
    : pill(state.needDispel ? 'bad' : '', 'Dispeller –'));

  if (info.viol.length) {
    items.push(pill('bad', info.viol.map(v => v.count + '× ' + CLASSES[v.cls].label + ' (maks ' + v.cap + ')').join(' · ')));
  } else if (Object.keys(state.caps).length) {
    items.push(pill('ok', 'Maks-regler ✓'));
  }

  let heal = 0, open = 0;
  for (const p of info.chosen) {
    const opts = selOptions(p);
    if (!opts.length) continue;
    const mustHeal = p.healerRole === true || opts.every(c => regOf(p, c) === 'healer');
    const canHeal = opts.some(c => regOf(p, c) !== 'dps');
    if (mustHeal) heal++;
    else if (canHeal && p.healerRole === null) open++;
  }
  items.push(pill(heal ? 'ok' : '', '✚ ' + heal + (open ? ' (+' + open + '?)' : '')));

  if (state.randomCount) {
    items.push('<button class="ckpill rnd" data-act="rmrandom" title="Ukjent spiller – klikk for å fjerne en plass">Random ×' +
      state.randomCount + ' ✕</button>');
  }
  return '<div class="flabel" style="margin:12px 0 6px">Compen på tavla</div><div class="checklist" id="checklist">' + items.join('') + '</div>';
}

function boardSection() {
  const info = boardInfo();
  const conflicts = new Set(info.viol.map(v => v.cls));
  const cards = state.people.map((p, pi) => {
    let chips;
    if (!p.classes.length) {
      chips = '<span class="noclasses">Ingen classes – legg til under «Roster»</span>';
    } else {
      chips = p.classes.map(cls =>
        chipHtml(p, pi, cls, p.sel.includes(cls), p.sel.length === 1 && p.sel[0] === cls && conflicts.has(cls))
      ).join('');
    }
    let roleline = '';
    if (!p.benched && p.sel.some(cls => regOf(p, cls) === 'both')) {
      roleline = '<div class="roleline"><span>Rolle:</span><span class="mini">' +
        '<button class="' + (p.healerRole === true ? 'on' : '') + '" data-act="pickrole" data-pi="' + pi + '" data-val="heal">✚ Healer</button>' +
        '<button class="' + (p.healerRole === null ? 'on' : '') + '" data-act="pickrole" data-pi="' + pi + '" data-val="open">Åpen</button>' +
        '<button class="' + (p.healerRole === false ? 'on' : '') + '" data-act="pickrole" data-pi="' + pi + '" data-val="dps">⚔ DPS</button>' +
        '</span></div>';
    }
    const multihint = (!p.benched && p.sel.length > 1)
      ? '<div class="multihint">' + p.sel.length + ' classes valgt – forslagene prøver alle</div>' : '';
    return '<div class="card' + (p.benched ? ' benched' : '') + '">' +
      '<div class="cardhead"><span class="pname">' + esc(p.name) + '</span>' +
      '<button class="pill' + (p.benched ? ' on' : '') + '" data-act="bench" data-pi="' + pi + '" aria-pressed="' + p.benched + '">Benk</button></div>' +
      '<div class="chips">' + chips + '</div>' + roleline + multihint + '</div>';
  }).join('');

  const filled = info.chosen.length + state.randomCount;
  const badge = '<span class="count' + (info.complete ? ' ok' : info.warns.length ? ' warn' : '') + '">' +
    filled + '/' + state.teamSize + '</span>';
  const clearBtn = (info.chosen.length || state.randomCount)
    ? '<button class="btn small ghost" data-act="clear">Nullstill valg</button>' : '';
  const help = '<div class="legend">Klikk en class for å sette hvem som spiller hva – velg gjerne flere per person, så prøver forslagene alle. ✚ healer · ⚔ dps · ✚⚔ kan begge.</div>';
  return section('board', 'Tavla', badge, clearBtn, '<div class="cards">' + cards + '</div>' + checklistHtml(info) + help);
}

function availSection() {
  const rows = CLASS_KEYS.map(cls => {
    const c = CLASSES[cls];
    const plays = state.people.map((p, pi) => ({ p, pi })).filter(x => x.p.classes.includes(cls));
    let entries;
    if (!plays.length) {
      entries = '<span class="dim" style="font-style:italic;font-size:12px">ingen</span>';
    } else {
      entries = plays.map(({ p, pi }) => {
        const reg = regOf(p, cls);
        const mark = reg === 'healer' ? ' ✚' : reg === 'both' ? ' ✚⚔' : c.healer ? ' ⚔' : '';
        const n70 = !is70(p, cls);
        if (p.benched) {
          return '<span class="avbtn benched" title="Benket – aktiver under Benk-knappen på kortet">' + esc(p.name) + mark + '</span>';
        }
        const on = p.sel.includes(cls);
        const style = on
          ? 'background:' + c.color + ';border-color:' + c.color + ';color:var(--ink)'
          : 'border-color:' + c.color + ';color:' + c.color + (n70 && state.only70 ? ';opacity:0.5' : '');
        return '<button class="avbtn" style="' + style + '" data-act="selchip" data-pi="' + pi + '" data-cls="' + cls +
          '" aria-pressed="' + on + '"' + (n70 ? ' title="Ikke level 70"' : '') + '>' + esc(p.name) + mark +
          (n70 ? '<span class="lvl">&lt;70</span>' : '') + '</button>';
      }).join('');
    }
    return '<div class="avrow"><span class="avcls" style="color:' + c.color + '">' + c.label + '</span>' +
      '<span class="aventries">' + entries + '</span></div>';
  }).join('');

  const randomRow = '<div class="avrow"><span class="avcls dim">Random</span><span class="aventries">' +
    '<button class="avbtn rnd" data-act="addrandom"' + (state.randomCount >= state.teamSize ? ' disabled' : '') + '>+ Legg til plass</button>' +
    (state.randomCount ? '<button class="avbtn rnd" data-act="rmrandom">Random ×' + state.randomCount + ' ✕</button>' : '') +
    '<span class="dim" style="font-size:11.5px">i tilfelle dere ikke er nok folk – teller som ukjent spiller</span>' +
    '</span></div>';

  const help = '<div class="legend">Klikk et navn for å sette personen på tavla med den classen – samme som å klikke chipen på kortet.</div>';
  return section('avail', 'Tilgjengelig per class', '', '', rows + randomRow + help);
}

let listCache = [];

/*
 * Felles port for forslagsberegningen: enten { results, capped } eller
 * { msg, warn?, zero? } når tavla/oppsettet gjør lista meningsløs.
 * Brukes av både «Gyldige lag» (Lagbygging) og telleren i Pugging-fanen.
 */
function computeComps() {
  const active = state.people.filter(p => !p.benched);
  const slots = knownSlots();
  const locked = active.filter(p => p.sel.length);
  const deadLock = active.find(p => p.sel.length && selOptions(p).length === 0);
  if (slots <= 0) {
    return { msg: state.randomCount >= state.teamSize
      ? 'Alle plassene er random – fjern en plass for å få forslag med gutta.'
      : 'Ingen plasser igjen.' };
  }
  if (capViolations().length) return { msg: 'Tavla bryter en maks-regel – fjern et valg eller hev taket under «Filtre og regler».', warn: true };
  if (deadLock) return { msg: esc(deadLock.name) + ' sitt rollevalg utelukker alle valgte classes – endre rolle eller class-valg.', warn: true, zero: true };
  if (locked.length > slots) return { msg: 'Flere valgt (' + locked.length + ') enn plasser (' + slots + ') – fjern et valg eller en random-plass.', warn: true };
  if (state.only70 && active.some(p => p.sel.length === 1 && !is70(p, p.sel[0]))) {
    return { msg: 'Noen på tavla spiller en char som ikke er 70 – fjern valget eller skru av «Kun 70».', warn: true };
  }
  if (active.length < slots) {
    return { msg: 'For få aktive spillere for ' + state.teamSize + 'v' + state.teamSize +
      (state.randomCount ? '' : ' – eller legg til random-plasser under «Pugging»') + '.', warn: true };
  }
  const { results, capped } = findComps(state.people, {
    teamSize: slots,
    mustHave: state.mustHave,
    healerWanted: state.healerFilter,
    only70: state.only70,
    caps: state.caps,
    needDispel: state.needDispel,
  });
  return { results, capped };
}

function rowHeal(team) {
  return state.healerFilter !== null
    ? team.filter(t => t.heal).length
    : team.filter(t => regOf(personByName(t.name) || {}, t.cls) !== 'dps').length;
}

function sortedResults(results) {
  if (state.sortBy === 'std') return results;
  const r = results.slice(); // Array.sort er stabil — lik nøkkel beholder generert rekkefølge
  if (state.sortBy === 'comp') {
    const sig = t => t.map(x => CLASSES[x.cls].label).sort().join(' · ');
    r.sort((a, b) => sig(a) < sig(b) ? -1 : sig(a) > sig(b) ? 1 : 0);
  } else if (state.sortBy === 'heal') {
    r.sort((a, b) => rowHeal(b) - rowHeal(a));
  } else if (state.sortBy === 'disp') {
    const d = t => t.filter(x => DISPEL.includes(x.cls)).length;
    r.sort((a, b) => d(b) - d(a));
  }
  return r;
}

function filtersSection() {
  // kort oppsummering av aktive innsnevringer, synlig også når seksjonen er lukket
  const sum = [];
  if (state.mustHave.size) sum.push('må ha: ' + [...state.mustHave].map(c => CLASSES[c].label).join(', '));
  if (state.healerFilter !== null) sum.push(state.healerFilter + ' ✚');
  for (const cls of CLASS_KEYS) if (state.caps[cls] !== undefined) sum.push(CLASSES[cls].label + ' ×' + state.caps[cls]);
  if (state.needDispel) sum.push('dispel-krav');
  if (state.only70) sum.push('kun 70');
  const headsum = sum.length ? '<span class="headsum">' + sum.join(' · ') + '</span>' : '';

  const body =
    '<div class="fgrid"><div class="fbox"><div class="flabel">Filtre</div>' +
    '<div class="frow"><span class="lbl">Må inneholde:</span>' + CLASS_KEYS.map(cls => {
      const on = state.mustHave.has(cls);
      const c = CLASSES[cls];
      const style = on
        ? 'background:' + c.color + ';border-color:' + c.color + ';color:var(--ink)'
        : 'border-color:' + c.color + ';color:' + c.color + ';opacity:0.55';
      return '<button class="chip" style="' + style + '" data-act="must" data-cls="' + cls + '" aria-pressed="' + on + '">' + c.label + '</button>';
    }).join('') + '</div>' +
    '<div class="frow"><span class="lbl">Healers:</span><span class="seg">' +
    [[null, 'Alle'], [1, '1 ✚'], [2, '2 ✚'], [3, '3 ✚']].map(([v, lbl]) =>
      '<button class="' + (state.healerFilter === v ? 'on' : '') + '" data-act="healfilter" data-val="' + (v === null ? 'all' : v) + '">' + lbl + '</button>'
    ).join('') + '</span>' +
    '<label class="check"><input type="checkbox" data-act="only70"' + (state.only70 ? ' checked' : '') + '> Kun 70</label></div>' +
    '</div><div class="fbox"><div class="flabel">Regler</div>' +
    '<div class="frow"><span class="lbl">Maks per class:</span>' + CLASS_KEYS.map(cls => {
      const c = CLASSES[cls];
      const cap = state.caps[cls] === undefined ? Infinity : state.caps[cls];
      const capped = cap !== Infinity;
      const style = 'border-color:' + c.color + ';color:' + c.color + (capped ? '' : ';opacity:0.4');
      return '<button class="chip" style="' + style + '" data-act="cap" data-cls="' + cls +
        '" title="Klikk for å endre: ∞ → 1 → 2 → 3 → ∞">' + c.label + ' <span class="mark">' + (capped ? '×' + cap : '∞') + '</span></button>';
    }).join('') + '</div>' +
    '<div class="frow"><label class="check"><input type="checkbox" data-act="dispel"' + (state.needDispel ? ' checked' : '') + '> Minst 1 dispeller (Pala/Priest)</label></div>' +
    '</div></div>';
  return section('filters', 'Filtre og regler', '', headsum, body);
}

function compsSection() {
  const active = state.people.filter(p => !p.benched);

  // gull-linja: alt som snevrer inn forslagene
  const segs = [];
  const locked = active.filter(p => p.sel.length);
  if (locked.length) segs.push('På tavla: ' + locked.map(p => {
    const opts = selOptions(p);
    return esc(p.name) + ' (' + (opts.length ? opts.map(c => CLASSES[c].label).join(' / ') : '–') + ')';
  }).join(', '));
  if (state.randomCount) segs.push('Random-plasser: ' + state.randomCount);
  const benched = state.people.filter(p => p.benched);
  if (benched.length) segs.push('Benket: ' + benched.map(p => esc(p.name)).join(', '));
  if (state.only70) {
    const no70 = active.filter(p => !p.sel.length && p.classes.length && p.classes.every(cls => !is70(p, cls)));
    if (no70.length) segs.push('Ingen 70-char: ' + no70.map(p => esc(p.name)).join(', '));
  }
  const lockline = segs.length ? '<p class="lockline">' + segs.join(' &nbsp;·&nbsp; ') + '</p>' : '';

  const cc = computeComps();
  let list = '';
  let badge;
  if (cc.msg) {
    badge = '<span class="count' + (cc.warn ? ' warn' : '') + '">' + (cc.zero ? '0' : '–') + '</span>';
    list = '<div class="empty">' + cc.msg + '</div>';
  } else if (!cc.results.length) {
    badge = '<span class="count warn">0</span>';
    list = '<div class="empty">Ingen gyldige lag med disse begrensningene – løsne et filter eller en regel under «Filtre og regler».</div>';
  } else {
    badge = '<span class="count">' + cc.results.length + (cc.capped ? '+' : '') + '</span>';
    const sortRow = '<div class="frow" style="margin-bottom:10px"><span class="lbl">Sorter:</span><span class="seg">' +
      [['std', 'Som generert'], ['comp', 'Like comps samlet'], ['heal', 'Flest healers'], ['disp', 'Flest dispellere']].map(([v, lbl]) =>
        '<button class="' + (state.sortBy === v ? 'on' : '') + '" data-act="sortby" data-val="' + v + '">' + lbl + '</button>'
      ).join('') + '</span></div>';
    const sorted = sortedResults(cc.results);
    const randomPairs = state.randomCount ? '<span class="pair rnd">Random</span>'.repeat(state.randomCount) : '';
    list = sortRow + sorted.slice(0, state.shown).map((team, ti) => {
      const inTeam = new Set(team.map(t => t.name));
      const outside = active.filter(p => !inTeam.has(p.name)).map(p => p.name);
      return '<div class="comp"><span class="pairs">' + pairsHtml(team) + randomPairs +
        '<span class="healbadge" title="' + (state.healerFilter !== null ? 'Antall som spiller healer' : 'Antall som kan heale') + '">✚' + rowHeal(team) + '</span>' +
        (outside.length ? '<span class="meta">står over: ' + outside.map(esc).join(', ') + '</span>' : '') +
        '</span><span class="rowbtns"><button class="btn small ghost" data-act="savecomp" data-ti="' + ti + '">Lagre</button>' +
        '<button class="btn small" data-act="use" data-ti="' + ti + '">Bruk på tavla</button></span></div>';
    }).join('');
    if (sorted.length > state.shown) {
      list += '<div class="morewrap"><button class="btn ghost" data-act="more">Vis ' +
        Math.min(PAGE, sorted.length - state.shown) + ' til <span class="dim">(' +
        (sorted.length - state.shown) + ' igjen)</span></button></div>';
    }
    list += '<div class="legend">Fylt chip = spiller healer i det laget · «står over» = ikke med i akkurat dette laget.</div>';
    listCache = sorted;
  }
  return section('comps', 'Gyldige lag', badge, '', lockline + list);
}

/* ---------- fane: pugging (brainstorm comps med roster + randoms) ---------- */

function pugSection() {
  const info = boardInfo();
  const chips = [];
  for (const p of state.people) {
    if (p.benched || !p.sel.length) continue;
    const opts = selOptions(p);
    if (p.sel.length === 1) {
      const c = CLASSES[p.sel[0]];
      chips.push('<span class="pair" style="border-color:' + c.color + ';color:' + c.color + '">' +
        esc(p.name) + ' <span style="opacity:0.8">' + c.label + '</span></span>');
    } else {
      chips.push('<span class="pair" style="border-color:var(--gold);color:var(--gold)">' + esc(p.name) +
        ' <span style="opacity:0.8">' + (opts.length ? opts.map(c => CLASSES[c].label).join('/') : '–') + '</span></span>');
    }
  }
  for (let i = 0; i < state.randomCount; i++) chips.push('<span class="pair rnd">Random</span>');
  for (let i = chips.length; i < state.teamSize; i++) chips.push('<span class="pair slot">ledig</span>');
  const strip = '<div class="pairs">' + chips.join('') + '</div>';

  const cc = computeComps();
  const validline = '<div class="legend">' + (cc.msg
    ? cc.msg
    : cc.results.length + (cc.capped ? '+' : '') + ' gyldige lag med dette utgangspunktet – lista ligger under «Lagbygging».') + '</div>';

  const filled = info.chosen.length + state.randomCount;
  const badge = '<span class="count' + (info.complete ? ' ok' : info.warns.length ? ' warn' : '') + '">' +
    filled + '/' + state.teamSize + '</span>';
  const clearBtn = (info.chosen.length || state.randomCount)
    ? '<button class="btn small ghost" data-act="clear">Nullstill valg</button>' : '';
  return section('pug', 'Compen', badge, clearBtn, strip + checklistHtml(info) + validline);
}

/* ---------- fane: comps (research-referanse fra META i engine.js) ---------- */

function clsInfo(c) {
  return CLASSES[c] || META.extraClasses[c] || { label: c, color: 'var(--dim)', healer: false };
}

function metaSpecRole(cls, key) {
  const s = (SPECS[cls] || []).find(x => x.key === key);
  return s ? s.role : 'dps';
}

/*
 * Kan gutta bemanne compen? Classes utenfor CLASSES (lock) løses som
 * random-plasser, og inntil 2 plasser totalt kan stå udekket (PUG).
 * Returnerer { team, randoms } eller null. Bruker motoren med eksakte
 * class-tak og filtrerer på signatur — respekterer benk og «Kun 70».
 */
function findStaffing(comp) {
  const known = comp.classes.filter(c => CLASSES[c]);
  const lockN = comp.classes.length - known.length;
  const tryExact = clsList => {
    const caps = {};
    CLASS_KEYS.forEach(c => { caps[c] = 0; });
    clsList.forEach(c => { caps[c]++; });
    const sig = clsList.slice().sort().join('|');
    const { results } = findComps(state.people.map(p => ({ ...p, sel: [] })), {
      teamSize: clsList.length, mustHave: new Set(), healerWanted: null,
      only70: state.only70, caps, needDispel: false,
    });
    return results.find(t => t.map(x => x.cls).sort().join('|') === sig) || null;
  };
  const maxDrop = Math.max(0, 2 - lockN);
  for (let drop = 0; drop <= maxDrop; drop++) {
    if (lockN + drop >= comp.classes.length) break; // minst én av gutta må være med
    if (drop === 0) {
      const team = tryExact(known);
      if (team) return { team, randoms: lockN };
    } else if (drop === 1) {
      for (let i = 0; i < known.length; i++) {
        const team = tryExact(known.filter((_, x) => x !== i));
        if (team) return { team, randoms: lockN + 1 };
      }
    } else {
      for (let i = 0; i < known.length; i++) {
        for (let j = i + 1; j < known.length; j++) {
          const team = tryExact(known.filter((_, x) => x !== i && x !== j));
          if (team) return { team, randoms: lockN + 2 };
        }
      }
    }
  }
  return null;
}

function metaView() {
  const comps = META.comps[state.teamSize] || [];
  const tierRank = { S: 0, A: 1, B: 2 };
  const rows = [];
  let shown = 0;
  comps.map((comp, mi) => ({ comp, mi, st: findStaffing(comp) }))
    .sort((a, b) => tierRank[a.comp.tier] - tierRank[b.comp.tier])
    .forEach(({ comp, mi, st }) => {
      if (state.metaOnlyOss && !st) return;
      shown++;
      const chips = comp.classes.map((c, i) => {
        const info = clsInfo(c);
        const role = metaSpecRole(c, comp.specs[i]);
        const style = role === 'healer'
          ? 'background:' + info.color + ';border-color:' + info.color + ';color:var(--ink)'
          : 'border-color:' + info.color + ';color:' + info.color;
        return '<span class="pair" style="' + style + '">' + info.label + '</span>';
      }).join('');
      const feas = st
        ? (st.randoms
          ? '<span class="ckpill maybe">✓ m/ ' + st.randoms + ' random</span>'
          : '<span class="ckpill ok">✓ gutta kan</span>')
        : '<span class="ckpill">mangler folk</span>';
      rows.push('<div class="comp"><span class="pairs">' +
        '<span class="tier ' + comp.tier + '">' + comp.tier + '</span>' +
        '<span class="metaname">' + esc(comp.name) + '</span>' + chips +
        '<span class="healbadge" title="Antall healer-specs">✚' + comp.healers + '</span>' + feas +
        '</span><span class="rowbtns"><button class="btn small" data-act="trycomp" data-mi="' + mi + '"' +
        (st ? '' : ' disabled title="Ingen av gutta kan bemanne denne nå (benk/70 tatt i betraktning)"') +
        '>Prøv med gutta</button></span>' +
        '<div class="metasub">' + comp.specs.join(' · ') + ' — ' + esc(comp.why) + '</div></div>');
    });
  const ossBtn = '<button class="pill' + (state.metaOnlyOss ? ' on' : '') + '" data-act="metaoss" aria-pressed="' + state.metaOnlyOss + '">Kun gutta</button>';
  const listBody = rows.join('') ||
    '<div class="empty">Ingen comps å vise' + (state.metaOnlyOss ? ' – skru av «Kun gutta»-filteret' : '') + '.</div>';
  const legend = '<div class="legend">Research juli 2026, TBC 2.4.3 / TBC Classic. Fylt chip = healer-spec. «Prøv med gutta» setter compen på tavla — Lock-plasser og udekkede plasser blir random-plasser.</div>';
  const compsSec = section('meta', 'Anbefalte comps · ' + state.teamSize + 'v' + state.teamSize,
    '<span class="count">' + shown + '</span>', ossBtn, listBody + legend);

  const ruleRows = META.rules.map(r =>
    '<div class="comp"><span class="pairs">' +
    '<span class="ckpill ' + (r.type === 'hard' ? 'hard' : '') + '">' + r.type + '</span>' +
    '<span class="sizebadge">' + r.scope + '</span>' +
    '<span style="font-weight:600">' + esc(r.rule) + '</span>' +
    '</span><div class="metasub">' + esc(r.why) + '</div></div>'
  ).join('');
  const ruleLegend = '<div class="legend">Referanse — føringene er ikke koblet til reglene/sjekklista ennå. Si ifra hvilke som skal håndheves, så kodes de inn.</div>';
  const rulesSec = section('metarules', 'Føringer fra researchen',
    '<span class="count">' + META.rules.length + '</span>', '', ruleRows + ruleLegend);

  const effRows = CLASS_KEYS.concat(['lock']).map(c => {
    const def = META.dispel.defensive[c] || [];
    const off = META.dispel.offensive.includes(c);
    if (!def.length && !off) return '';
    const info = clsInfo(c);
    return '<div class="avrow"><span class="avcls" style="color:' + info.color + '">' + info.label + '</span>' +
      '<span class="aventries">' +
      (def.length ? def.map(t => '<span class="ckpill">' + t + '</span>').join('') : '<span class="dim" style="font-size:12px">ingen defensiv</span>') +
      (off ? '<span class="ckpill ok">purge ✓</span>' : '') +
      '</span></div>';
  }).join('');
  const msRow = '<div class="avrow"><span class="avcls" style="color:var(--gold)">MS-effekt</span><span class="aventries">' +
    META.ms.classes.map(c => '<span class="ckpill">' + clsInfo(c).label + '</span>').join('') + '</span></div>';
  const effSec = section('metaeff', 'Dispel & MS', '', '',
    effRows + msRow +
    '<div class="legend">' + esc(META.dispel.note) + '</div>' +
    '<div class="legend">' + esc(META.ms.note) + '</div>');

  const srcSec = section('kilder', 'Kilder', '<span class="count">' + META.sources.length + '</span>', '',
    '<div class="srclist">' + META.sources.map(s =>
      '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title) + '</a>').join('') + '</div>');

  return compsSec + rulesSec + effSec + srcSec;
}

function savedSection() {
  let body;
  if (!state.saved.length) {
    body = '<div class="empty">Ingen lagrede lag ennå – sett opp et fullt lag på tavla, eller trykk «Lagre» på et forslag.</div>';
  } else {
    body = state.saved.map((s, si) =>
      '<div class="comp"><span class="pairs"><span class="savedname">' + esc(s.name) + '</span>' +
      '<span class="sizebadge">' + s.size + 'v' + s.size + '</span>' + pairsHtml(s.team) +
      '</span><span class="rowbtns"><button class="btn small" data-act="usesaved" data-si="' + si + '">Bruk på tavla</button>' +
      '<button class="btn small ghost danger" data-act="delsaved" data-si="' + si + '">Slett</button></span></div>'
    ).join('');
  }
  let io = '';
  if (state.showIO) {
    io = '<div class="iopanel"><textarea id="ioText" spellcheck="false"></textarea>' +
      '<div style="margin-top:8px;display:flex;gap:8px;align-items:center">' +
      '<button class="btn small" data-act="import">Importer fra teksten</button>' +
      '<span class="iomsg" id="iomsg"></span></div></div>';
  }
  const badge = '<span class="count">' + state.saved.length + '</span>';
  const ioBtn = '<button class="btn small ghost" data-act="toggleio">Eksporter / importer</button>';
  return section('saved', 'Lagrede lag', badge, ioBtn, body + io);
}

function savebarHtml() {
  const info = boardInfo();
  if (state.tab === 'roster' || (!info.chosen.length && !state.randomCount)) return '';
  const filled = info.chosen.length + state.randomCount;
  let stat = '<span class="' + (info.complete ? 'ok' : '') + '">' + filled + '/' + state.teamSize + ' valgt</span>';
  if (info.multi.length) {
    stat += ' <span class="dim">· ' + info.multi.map(p => esc(p.name)).join(' og ') + ' har flere classes valgt</span>';
  }
  if (info.warns.length) stat += ' <span class="warn">· ' + info.warns[0] + '</span>';
  else if (info.complete) stat += ' <span class="dim">· gyldig lag (' + info.healTxt + ') ✓</span>';
  const canSave = info.complete;
  const saveTitle = canSave ? 'Lagrer laget slik det står på tavla'
    : info.multi.length ? 'Velg én class per person for å lagre' : 'Krever fullt lag uten regelbrudd';
  return '<div class="savebar" id="savebar"><div class="savebar-inner">' +
    '<span class="stat">' + stat + '</span><span class="grow"></span>' +
    '<input type="text" id="saveName" placeholder="Navn på laget …">' +
    '<button class="btn primary" data-act="saveboard"' + (canSave ? '' : ' disabled') + ' title="' + saveTitle + '">Lagre laget</button>' +
    '</div></div>';
}

/* ---------- fane: roster ---------- */

function rosterSection() {
  const cards = state.people.map((p, pi) => {
    const rows = p.classes.map(cls => {
      const c = CLASSES[cls];
      const reg = regOf(p, cls);
      const n70 = !is70(p, cls);
      const role = c.healer
        ? '<span class="mini">' +
          '<button class="' + (reg === 'healer' ? 'on' : '') + '" data-act="setreg" data-pi="' + pi + '" data-cls="' + cls + '" data-val="healer" title="Kun healer">✚</button>' +
          '<button class="' + (reg === 'both' ? 'on' : '') + '" data-act="setreg" data-pi="' + pi + '" data-cls="' + cls + '" data-val="both" title="Kan begge">✚⚔</button>' +
          '<button class="' + (reg === 'dps' ? 'on' : '') + '" data-act="setreg" data-pi="' + pi + '" data-cls="' + cls + '" data-val="dps" title="Kun dps">⚔</button>' +
          '</span>'
        : '<span class="dim" style="font-size:11px">⚔ dps</span>';
      return '<div class="clsrow">' +
        '<span class="chip" style="border-color:' + c.color + ';color:' + c.color + '">' + c.label + '</span>' +
        role +
        '<button class="lvlpill' + (n70 ? ' n70' : '') + '" data-act="lvl" data-pi="' + pi + '" data-cls="' + cls + '" title="Klikk for å bytte 70-status">' + (n70 ? '&lt;70' : '70') + '</button>' +
        '<button class="clsrm" data-act="rmcls" data-pi="' + pi + '" data-cls="' + cls + '" title="Fjern ' + c.label + ' fra ' + esc(p.name) + '">✕</button>' +
        '</div>';
    }).join('');
    const missing = CLASS_KEYS.filter(cls => !p.classes.includes(cls));
    const addRow = missing.length
      ? '<div class="addcls"><div class="flabel">Legg til class</div><div class="chips">' +
        missing.map(cls => {
          const c = CLASSES[cls];
          return '<button class="chip off" style="border-color:' + c.color + ';color:' + c.color +
            '" data-act="addcls" data-pi="' + pi + '" data-cls="' + cls + '">' + c.label + '</button>';
        }).join('') + '</div></div>'
      : '';
    return '<div class="card' + (p.benched ? ' benched' : '') + '">' +
      '<div class="cardhead"><span class="pname">' + esc(p.name) + '</span>' +
      '<button class="pill' + (p.benched ? ' on' : '') + '" data-act="bench" data-pi="' + pi + '" aria-pressed="' + p.benched + '">Benk</button>' +
      '<button class="clsrm" data-act="rmperson" data-pi="' + pi + '" title="Fjern ' + esc(p.name) + ' fra rosteren">✕</button></div>' +
      (rows || '<div class="noclasses">Ingen classes ennå</div>') + addRow + '</div>';
  }).join('');

  const add = '<div class="addrow"><input type="text" id="newName" placeholder="Nytt navn …">' +
    '<button class="btn" data-act="addperson">Legg til person</button></div>';
  const danger = '<div class="dangerzone"><button class="btn ghost danger" data-act="resetroster">Tilbakestill roster</button>' +
    '<span class="hint">Setter alle personer, classes, roller og 70-status tilbake til standard.</span></div>';
  const badge = '<span class="count">' + state.people.length + '</span>';
  return section('roster', 'Spillere', badge, '', '<div class="rcards">' + cards + '</div>' + add + danger);
}

/* ---------- render ---------- */

function render() {
  const keep = {};
  for (const id of ['saveName', 'newName', 'ioText']) {
    const el = document.getElementById(id);
    if (el) keep[id] = { v: el.value, focus: document.activeElement === el };
  }

  const tabs = '<nav class="tabs">' +
    '<button class="' + (state.tab === 'build' ? 'on' : '') + '" data-act="tab" data-val="build">Lagbygging</button>' +
    '<button class="' + (state.tab === 'pug' ? 'on' : '') + '" data-act="tab" data-val="pug">Pugging</button>' +
    '<button class="' + (state.tab === 'meta' ? 'on' : '') + '" data-act="tab" data-val="meta">Comps</button>' +
    '<button class="' + (state.tab === 'roster' ? 'on' : '') + '" data-act="tab" data-val="roster">Roster</button></nav>';
  const bracket = '<span class="seg">' + [2, 3, 5].map(n =>
    '<button class="' + (state.teamSize === n ? 'on' : '') + '" data-act="size" data-val="' + n + '">' + n + 'v' + n + '</button>'
  ).join('') + '</span>';
  const top = '<div class="topbar"><h1>TBC Arena</h1><span class="topspace"></span>' + tabs + bracket + '</div>';

  let view;
  if (state.tab === 'build') {
    view = boardSection() + filtersSection() + compsSection() + savedSection();
  } else if (state.tab === 'pug') {
    view = pugSection() + availSection() + savedSection();
  } else if (state.tab === 'meta') {
    view = metaView();
  } else {
    view = rosterSection() + savedSection();
  }

  const foot = '<footer>Alt lagres automatisk i denne nettleseren. Bruk «Eksporter / importer» under «Lagrede lag» for å dele lag med gutta eller flytte dem til en annen maskin.</footer>';
  const toast = state.toast ? '<div class="toast">' + state.toast + '</div>' : '';
  document.getElementById('app').innerHTML = top + view + foot + savebarHtml() + toast;

  for (const id in keep) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (id === 'ioText' && !keep[id].focus) continue; // vis fersk eksport når feltet ikke er i bruk
    el.value = keep[id].v;
    if (keep[id].focus) el.focus();
  }
  if (state.showIO) {
    const ta = document.getElementById('ioText');
    if (ta && document.activeElement !== ta) ta.value = JSON.stringify(state.saved, null, 1);
  }
  persist();
}

let toastTimer = null;
function showToast(msg) {
  state.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = null; render(); }, 2600);
}

/* ---------- handlinger ---------- */

function applyTeam(team, size, fromSaved) {
  if (size) state.teamSize = size;
  const roleMode = state.healerFilter !== null;
  const byName = new Map(team.map(x => [x.name, x]));
  const misses = [];
  for (const person of state.people) {
    const hit = byName.get(person.name);
    if (hit && person.classes.includes(hit.cls)) {
      person.sel = [hit.cls];
      person.healerRole = fromSaved
        ? (hit.heal === true ? true : hit.heal === false ? false : null)
        : (roleMode ? hit.heal === true : null);
    } else {
      person.sel = [];
      person.healerRole = null;
      if (hit) misses.push(hit.name);
    }
  }
  for (const t of team) if (!personByName(t.name)) misses.push(t.name);
  return misses;
}

function storedTeamFromRow(team) {
  const roleMode = state.healerFilter !== null;
  const stored = team.map(x => {
    const p = personByName(x.name);
    const reg = p ? regOf(p, x.cls) : 'dps';
    const heal = reg === 'healer' ? true
               : reg === 'dps' ? false
               : x.heal === true ? true
               : roleMode ? false : null;
    return { name: x.name, cls: x.cls, heal };
  });
  for (let i = 0; i < state.randomCount; i++) stored.push({ random: true });
  return stored;
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  const pi = t.dataset.pi !== undefined ? Number(t.dataset.pi) : null;
  const p = pi !== null ? state.people[pi] : null;
  const resetPage = () => { state.shown = PAGE; };

  if (act === 'collapse') {
    state.collapsed[t.dataset.id] = !state.collapsed[t.dataset.id];
  } else if (act === 'tab') {
    state.tab = t.dataset.val;
  } else if (act === 'size') {
    state.teamSize = Number(t.dataset.val);
    state.randomCount = Math.min(state.randomCount, state.teamSize);
    resetPage();
  } else if (act === 'selchip') {
    const cls = t.dataset.cls;
    const ix = p.sel.indexOf(cls);
    if (ix >= 0) p.sel.splice(ix, 1);
    else { p.sel.push(cls); p.sel.sort((a, b) => CLASS_KEYS.indexOf(a) - CLASS_KEYS.indexOf(b)); }
    if (!p.sel.some(c => regOf(p, c) === 'both')) p.healerRole = null;
    resetPage();
  } else if (act === 'bench') {
    p.benched = !p.benched;
    if (p.benched) { p.sel = []; p.healerRole = null; }
    resetPage();
  } else if (act === 'pickrole') {
    p.healerRole = t.dataset.val === 'heal' ? true : t.dataset.val === 'dps' ? false : null;
    resetPage();
  } else if (act === 'clear') {
    state.people.forEach(x => { x.sel = []; x.healerRole = null; });
    state.randomCount = 0;
    resetPage();
  } else if (act === 'addrandom') {
    if (state.randomCount < state.teamSize) state.randomCount++;
    resetPage();
  } else if (act === 'rmrandom') {
    if (state.randomCount > 0) state.randomCount--;
    resetPage();
  } else if (act === 'must') {
    const cls = t.dataset.cls;
    state.mustHave.has(cls) ? state.mustHave.delete(cls) : state.mustHave.add(cls);
    resetPage();
  } else if (act === 'healfilter') {
    const v = t.dataset.val;
    state.healerFilter = v === 'all' ? null : Number(v);
    resetPage();
  } else if (act === 'cap') {
    const cls = t.dataset.cls;
    const cur = state.caps[cls] === undefined ? Infinity : state.caps[cls];
    const next = cur === Infinity ? 1 : cur === 1 ? 2 : cur === 2 ? 3 : Infinity;
    if (next === Infinity) delete state.caps[cls]; else state.caps[cls] = next;
    resetPage();
  } else if (act === 'more') {
    state.shown += PAGE;
  } else if (act === 'sortby') {
    state.sortBy = t.dataset.val;
    resetPage();
  } else if (act === 'metaoss') {
    state.metaOnlyOss = !state.metaOnlyOss;
  } else if (act === 'trycomp') {
    const comp = (META.comps[state.teamSize] || [])[Number(t.dataset.mi)];
    if (!comp) return;
    const st = findStaffing(comp);
    if (!st) {
      showToast('Ingen av gutta kan bemanne <b>' + esc(comp.name) + '</b> akkurat nå');
      render();
      return;
    }
    // spec-rollene fra compen styrer healer/dps-valget på tavla
    const specQ = {};
    comp.classes.forEach((c, i) => { (specQ[c] = specQ[c] || []).push(comp.specs[i]); });
    for (const person of state.people) { person.sel = []; person.healerRole = null; }
    for (const m of st.team) {
      const person = personByName(m.name);
      if (!person) continue;
      const spec = (specQ[m.cls] || []).shift();
      person.sel = [m.cls];
      person.healerRole = regOf(person, m.cls) === 'both' && spec
        ? metaSpecRole(m.cls, spec) === 'healer'
        : null;
    }
    state.randomCount = Math.min(st.randoms, state.teamSize);
    state.tab = 'build';
    showToast('<b>' + esc(comp.name) + '</b> satt på tavla' +
      (st.randoms ? ' – ' + st.randoms + ' plass' + (st.randoms > 1 ? 'er' : '') + ' som Random' : ''));
    resetPage();
  } else if (act === 'savecomp') {
    const team = listCache[Number(t.dataset.ti)];
    if (!team) return;
    const name = 'Lag ' + (state.saved.length + 1);
    state.saved.push({ name, size: state.teamSize, team: storedTeamFromRow(team) });
    showToast('Lagret som <b>' + esc(name) + '</b> under «Lagrede lag»');
  } else if (act === 'use') {
    const team = listCache[Number(t.dataset.ti)];
    if (!team) return;
    applyTeam(team, null, false);
    showToast('Laget er satt på tavla');
    resetPage();
  } else if (act === 'usesaved') {
    const s = state.saved[Number(t.dataset.si)];
    state.randomCount = Math.min(s.team.filter(x => x.random).length, s.size);
    const misses = applyTeam(s.team.filter(x => !x.random), s.size, true);
    state.tab = 'build';
    showToast(misses.length
      ? 'Satt på tavla – fant ikke: ' + esc(misses.join(', '))
      : '<b>' + esc(s.name) + '</b> er satt på tavla');
    resetPage();
  } else if (act === 'delsaved') {
    const s = state.saved.splice(Number(t.dataset.si), 1)[0];
    showToast('Slettet <b>' + esc(s.name) + '</b>');
  } else if (act === 'toggleio') {
    state.showIO = !state.showIO;
    state.collapsed.saved = false;
  } else if (act === 'import') {
    const msgEl = document.getElementById('iomsg');
    try {
      const clean = reviveSaved(JSON.parse(document.getElementById('ioText').value));
      if (!clean) throw new Error('Forventet en liste');
      state.saved = clean;
      showToast('Importerte ' + clean.length + ' lag (erstattet lista)');
    } catch (err) {
      if (msgEl) { msgEl.classList.add('err'); msgEl.textContent = 'Kunne ikke lese teksten som JSON: ' + err.message; }
      return; // ikke re-render – behold teksten i feltet
    }
  } else if (act === 'saveboard') {
    const info = boardInfo();
    if (!info.complete) return;
    const team = info.chosen.map(x => {
      const reg = regOf(x, x.sel[0]);
      const heal = reg === 'healer' ? true : reg === 'dps' ? false : x.healerRole;
      return { name: x.name, cls: x.sel[0], heal };
    });
    for (let i = 0; i < state.randomCount; i++) team.push({ random: true });
    const inp = document.getElementById('saveName');
    const name = (inp && inp.value.trim()) || 'Lag ' + (state.saved.length + 1);
    state.saved.push({ name, size: state.teamSize, team });
    if (inp) inp.value = '';
    showToast('Lagret som <b>' + esc(name) + '</b> under «Lagrede lag»');
  } else if (act === 'setreg') {
    p.roles = p.roles || {};
    p.roles[t.dataset.cls] = t.dataset.val;
    if (p.sel.includes(t.dataset.cls)) p.healerRole = null;
    resetPage();
  } else if (act === 'lvl') {
    const cls = t.dataset.cls;
    p.not70 = p.not70 || [];
    const ix = p.not70.indexOf(cls);
    if (ix >= 0) p.not70.splice(ix, 1); else p.not70.push(cls);
    resetPage();
  } else if (act === 'rmcls') {
    const cls = t.dataset.cls;
    p.classes = p.classes.filter(c => c !== cls);
    p.sel = p.sel.filter(c => c !== cls);
    resetPage();
  } else if (act === 'addcls') {
    p.classes.push(t.dataset.cls);
    p.classes.sort((a, b) => CLASS_KEYS.indexOf(a) - CLASS_KEYS.indexOf(b));
    resetPage();
  } else if (act === 'rmperson') {
    const removed = state.people.splice(pi, 1)[0];
    showToast('Fjernet <b>' + esc(removed.name) + '</b> fra rosteren');
    resetPage();
  } else if (act === 'addperson') {
    const inp = document.getElementById('newName');
    const name = inp ? inp.value.trim() : '';
    if (!name) return;
    if (state.people.some(x => x.name.toLowerCase() === name.toLowerCase())) {
      showToast('<b>' + esc(name) + '</b> finnes allerede');
      render();
      return;
    }
    state.people.push({ name, classes: [], benched: false, sel: [], healerRole: null, not70: [], roles: {} });
    if (inp) inp.value = '';
    showToast('La til <b>' + esc(name) + '</b> – velg classes på kortet');
  } else if (act === 'resetroster') {
    state.people = freshRoster();
    state.mustHave = new Set();
    state.healerFilter = null;
    state.only70 = true;
    state.caps = { rogue: 1, sham: 1 };
    state.needDispel = true;
    state.randomCount = 0;
    showToast('Rosteren er tilbakestilt');
    resetPage();
  } else {
    return;
  }
  render();
});

document.addEventListener('change', e => {
  const t = e.target;
  if (!t.dataset || !t.dataset.act) return;
  if (t.dataset.act === 'only70') state.only70 = t.checked;
  else if (t.dataset.act === 'dispel') state.needDispel = t.checked;
  else return;
  state.shown = PAGE;
  render();
});

// tastatur på seksjons-headere (role=button)
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-act="collapse"]')) {
    e.preventDefault();
    state.collapsed[e.target.dataset.id] = !state.collapsed[e.target.dataset.id];
    render();
  }
});

loadStored();
render();
