'use strict';
/*
 * app.js — UI state, rendering and events. Domain logic lives in engine.js.
 *
 * Four tabs: «Team building» (the board, filters/rules, valid teams with
 * sorting), «Pugging» (brainstorm: comp strip, checklist, availability
 * overview, random slots), «Comps» (the META reference: tier lists per
 * bracket, guidelines, dispel/MS, «Try with the crew» which staffs a comp
 * from the roster via the engine — gaps/Lock become random slots) and
 * «Roster» — all sharing the same state. Everything re-renders per
 * interaction (deliberately simple); text field values are preserved across
 * re-render in render().
 *
 * Random slots: state.randomCount unknown players count against the team
 * size. The generator then works with teamSize − randomCount known slots;
 * filters and rules apply to the known ones. Saved/exported as
 * { random: true } entries.
 *
 * Storage (PLAN item 4): the whole state is persisted to localStorage in
 * render() (persist), and restored on startup (loadStored) with validation
 * and a version field. If storage fails (private mode, sandbox without
 * localStorage) everything keeps running in memory — hence the errors are
 * deliberately swallowed.
 */

let state = {
  tab: 'build',       // 'build' | 'pug' | 'meta' | 'roster'
  teamSize: 5,
  sortBy: 'std',      // sorting of valid teams: 'std' | 'comp' | 'heal' | 'disp'
  collapsed: {},      // section id → true when collapsed
  mustHave: new Set(),
  healerFilter: null, // null = all, otherwise the exact number of actual healers
  only70: true,
  caps: { rogue: 1, sham: 1 },
  needDispel: true,
  people: freshRoster(),
  saved: [],          // [{name, size, team: [{name, cls, heal} | {random:true}]}]
  randomCount: 0,     // number of random slots on the board
  shown: 25,          // pagination of the suggestions list
  metaOnlyOss: false, // Comps tab: show only comps the crew can staff
  showIO: false,
  toast: null,
};
state.collapsed.kilder = true; // the source list in the Comps tab starts collapsed
const PAGE = 25;

function freshRoster() {
  return DEFAULT_ROSTER.map(p => ({
    name: p.name,
    classes: [...p.classes],
    benched: false,
    sel: [],           // selected classes on the board — 1+ means "always included, on one of these"
    healerRole: null,  // role choice on the board for ✚⚔: true=healer, false=dps, null=open
    not70: [],
    roles: {},         // per-character registration for hybrid classes: 'healer' | 'dps' | 'both'
  }));
}

/* ---------- storage ---------- */

const STORAGE_KEY = 'tbc-arena-planner';
const STORAGE_VERSION = 1;

// Clean up a list of saved teams (from import OR localStorage) into valid form.
// Accepts the old format without random entries. null = not a list.
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
      name: typeof s.name === 'string' && s.name.trim() ? s.name.trim() : 'Imported team',
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
  if (!d || d.v !== STORAGE_VERSION) return; // unknown format → start fresh (hook migrations in here)
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
  } catch (e) { /* private mode / sandbox without localStorage: continue without saving */ }
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

/* ---------- board status ---------- */

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

// Is one of the classes in clsArr guaranteed included ("yes"), possible ("maybe"), or not included ("no")?
function containsStatus(clsArr) {
  const set = new Set(clsArr);
  let possible = false;
  for (const p of state.people) {
    if (p.benched || !p.sel.length) continue;
    const opts = selOptions(p);
    if (!opts.length) continue;
    if (opts.every(c => set.has(c))) return 'yes';
    if (opts.some(c => set.has(c))) possible = true;
  }
  return possible ? 'maybe' : 'no';
}

function boardInfo() {
  const active = state.people.filter(p => !p.benched);
  const chosen = active.filter(p => p.sel.length > 0);
  const multi = chosen.filter(p => p.sel.length > 1);
  const viol = capViolations();
  const slots = knownSlots();
  const info = { chosen, multi, viol, slots, warns: [], complete: false, healTxt: '' };

  if (viol.length) info.warns.push('Rule violation: ' + viol.map(v => v.count + '× ' + CLASSES[v.cls].label + ' (max ' + v.cap + ')').join(', '));
  if (chosen.length > slots) info.warns.push('Too many selected – ' + slots + ' slot' + (slots === 1 ? '' : 's') + ' left after random');
  if (active.length < slots) info.warns.push('Only ' + active.length + ' active players');
  if (state.only70) {
    const low = chosen.filter(p => p.sel.length === 1 && !is70(p, p.sel[0]));
    if (low.length) info.warns.push('Not 70: ' + low.map(p => esc(p.name)).join(', '));
  }
  if (!multi.length && !info.warns.length && chosen.length === slots && chosen.length + state.randomCount === state.teamSize) {
    const dispelOk = !state.needDispel || chosen.some(p => DISPEL.includes(p.sel[0]));
    if (!dispelOk) {
      info.warns.push('Missing dispeller (Pala/Priest)');
    } else {
      let heal = 0, open = 0;
      for (const p of chosen) {
        const reg = regOf(p, p.sel[0]);
        if (reg === 'healer' || (reg === 'both' && p.healerRole === true)) heal++;
        else if (reg === 'both' && p.healerRole === null) open++;
      }
      info.complete = true;
      info.healTxt = heal + ' healer' + (heal === 1 ? '' : 's') +
        (open ? ', ' + open + ' undecided ✚⚔' : '') +
        (state.randomCount ? ', ' + state.randomCount + ' random' : '');
    }
  }
  return info;
}

/* ---------- components ---------- */

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
    (n70 ? ' title="Not level 70"' : '') + '>' + c.label + mark +
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

/* ---------- tab: team building ---------- */

function checklistHtml(info) {
  if (!info.chosen.length && !state.randomCount) return '';
  const pill = (kind, txt, extra) => '<span class="ckpill ' + kind + '"' + (extra || '') + '>' + txt + '</span>';
  const items = [];

  const sham = containsStatus(['sham']);
  items.push(sham === 'yes' ? pill('ok', 'Sham ✓') : sham === 'maybe' ? pill('maybe', 'Sham ?') : pill('', 'Sham –'));

  const disp = containsStatus(DISPEL);
  items.push(disp === 'yes' ? pill('ok', 'Dispeller ✓')
    : disp === 'maybe' ? pill('maybe', 'Dispeller ?')
    : pill(state.needDispel ? 'bad' : '', 'Dispeller –'));

  if (info.viol.length) {
    items.push(pill('bad', info.viol.map(v => v.count + '× ' + CLASSES[v.cls].label + ' (max ' + v.cap + ')').join(' · ')));
  } else if (Object.keys(state.caps).length) {
    items.push(pill('ok', 'Cap rules ✓'));
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
    items.push('<button class="ckpill rnd" data-act="rmrandom" title="Unknown player – click to remove a slot">Random ×' +
      state.randomCount + ' ✕</button>');
  }
  return '<div class="flabel" style="margin:12px 0 6px">The comp on the board</div><div class="checklist" id="checklist">' + items.join('') + '</div>';
}

function boardSection() {
  const info = boardInfo();
  const conflicts = new Set(info.viol.map(v => v.cls));
  const cards = state.people.map((p, pi) => {
    let chips;
    if (!p.classes.length) {
      chips = '<span class="noclasses">No classes – add some under «Roster»</span>';
    } else {
      chips = p.classes.map(cls =>
        chipHtml(p, pi, cls, p.sel.includes(cls), p.sel.length === 1 && p.sel[0] === cls && conflicts.has(cls))
      ).join('');
    }
    let roleline = '';
    if (!p.benched && p.sel.some(cls => regOf(p, cls) === 'both')) {
      roleline = '<div class="roleline"><span>Role:</span><span class="mini">' +
        '<button class="' + (p.healerRole === true ? 'on' : '') + '" data-act="pickrole" data-pi="' + pi + '" data-val="heal">✚ Healer</button>' +
        '<button class="' + (p.healerRole === null ? 'on' : '') + '" data-act="pickrole" data-pi="' + pi + '" data-val="open">Open</button>' +
        '<button class="' + (p.healerRole === false ? 'on' : '') + '" data-act="pickrole" data-pi="' + pi + '" data-val="dps">⚔ DPS</button>' +
        '</span></div>';
    }
    const multihint = (!p.benched && p.sel.length > 1)
      ? '<div class="multihint">' + p.sel.length + ' classes selected – suggestions try them all</div>' : '';
    return '<div class="card' + (p.benched ? ' benched' : '') + '">' +
      '<div class="cardhead"><span class="pname">' + esc(p.name) + '</span>' +
      '<button class="pill' + (p.benched ? ' on' : '') + '" data-act="bench" data-pi="' + pi + '" aria-pressed="' + p.benched + '">Bench</button></div>' +
      '<div class="chips">' + chips + '</div>' + roleline + multihint + '</div>';
  }).join('');

  const filled = info.chosen.length + state.randomCount;
  const badge = '<span class="count' + (info.complete ? ' ok' : info.warns.length ? ' warn' : '') + '">' +
    filled + '/' + state.teamSize + '</span>';
  const clearBtn = (info.chosen.length || state.randomCount)
    ? '<button class="btn small ghost" data-act="clear">Clear selection</button>' : '';
  const help = '<div class="legend">Click a class to set who plays what – feel free to pick several per person, the suggestions will try them all. ✚ healer · ⚔ dps · ✚⚔ can do both.</div>';
  return section('board', 'Board', badge, clearBtn, '<div class="cards">' + cards + '</div>' + checklistHtml(info) + help);
}

function availSection() {
  const rows = CLASS_KEYS.map(cls => {
    const c = CLASSES[cls];
    const plays = state.people.map((p, pi) => ({ p, pi })).filter(x => x.p.classes.includes(cls));
    let entries;
    if (!plays.length) {
      entries = '<span class="dim" style="font-style:italic;font-size:12px">none</span>';
    } else {
      entries = plays.map(({ p, pi }) => {
        const reg = regOf(p, cls);
        const mark = reg === 'healer' ? ' ✚' : reg === 'both' ? ' ✚⚔' : c.healer ? ' ⚔' : '';
        const n70 = !is70(p, cls);
        if (p.benched) {
          return '<span class="avbtn benched" title="Benched – enable via the Bench button on the card">' + esc(p.name) + mark + '</span>';
        }
        const on = p.sel.includes(cls);
        const style = on
          ? 'background:' + c.color + ';border-color:' + c.color + ';color:var(--ink)'
          : 'border-color:' + c.color + ';color:' + c.color + (n70 && state.only70 ? ';opacity:0.5' : '');
        return '<button class="avbtn" style="' + style + '" data-act="selchip" data-pi="' + pi + '" data-cls="' + cls +
          '" aria-pressed="' + on + '"' + (n70 ? ' title="Not level 70"' : '') + '>' + esc(p.name) + mark +
          (n70 ? '<span class="lvl">&lt;70</span>' : '') + '</button>';
      }).join('');
    }
    return '<div class="avrow"><span class="avcls" style="color:' + c.color + '">' + c.label + '</span>' +
      '<span class="aventries">' + entries + '</span></div>';
  }).join('');

  const randomRow = '<div class="avrow"><span class="avcls dim">Random</span><span class="aventries">' +
    '<button class="avbtn rnd" data-act="addrandom"' + (state.randomCount >= state.teamSize ? ' disabled' : '') + '>+ Add slot</button>' +
    (state.randomCount ? '<button class="avbtn rnd" data-act="rmrandom">Random ×' + state.randomCount + ' ✕</button>' : '') +
    '<span class="dim" style="font-size:11.5px">in case you do not have enough people – counts as an unknown player</span>' +
    '</span></div>';

  const help = '<div class="legend">Click a name to put that person on the board with that class – same as clicking the chip on the card.</div>';
  return section('avail', 'Available per class', '', '', rows + randomRow + help);
}

let listCache = [];

/*
 * Shared entry point for computing suggestions: either { results, capped } or
 * { msg, warn?, zero? } when the board/setup makes the list meaningless.
 * Used by both «Valid teams» (Team building) and the counter in the Pugging tab.
 */
function computeComps() {
  const active = state.people.filter(p => !p.benched);
  const slots = knownSlots();
  const locked = active.filter(p => p.sel.length);
  const deadLock = active.find(p => p.sel.length && selOptions(p).length === 0);
  if (slots <= 0) {
    return { msg: state.randomCount >= state.teamSize
      ? 'All the slots are random – remove a slot to get suggestions with the crew.'
      : 'No slots left.' };
  }
  if (capViolations().length) return { msg: 'The board breaks a cap rule – remove a selection or raise the cap under «Filters and rules».', warn: true };
  if (deadLock) return { msg: 'The role choice for ' + esc(deadLock.name) + ' excludes all selected classes – change the role or class selection.', warn: true, zero: true };
  if (locked.length > slots) return { msg: 'More selected (' + locked.length + ') than slots (' + slots + ') – remove a selection or a random slot.', warn: true };
  if (state.only70 && active.some(p => p.sel.length === 1 && !is70(p, p.sel[0]))) {
    return { msg: 'Someone on the board is playing a character that is not level 70 – remove the selection or turn off «Level 70 only».', warn: true };
  }
  if (active.length < slots) {
    return { msg: 'Not enough active players for ' + state.teamSize + 'v' + state.teamSize +
      (state.randomCount ? '' : ' – or add random slots under «Pugging»') + '.', warn: true };
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
  const r = results.slice(); // Array.sort is stable — equal keys keep the generated order
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
  // short summary of active constraints, visible even when the section is collapsed
  const sum = [];
  if (state.mustHave.size) sum.push('must have: ' + [...state.mustHave].map(c => CLASSES[c].label).join(', '));
  if (state.healerFilter !== null) sum.push(state.healerFilter + ' ✚');
  for (const cls of CLASS_KEYS) if (state.caps[cls] !== undefined) sum.push(CLASSES[cls].label + ' ×' + state.caps[cls]);
  if (state.needDispel) sum.push('dispel required');
  if (state.only70) sum.push('level 70 only');
  const headsum = sum.length ? '<span class="headsum">' + sum.join(' · ') + '</span>' : '';

  const body =
    '<div class="fgrid"><div class="fbox"><div class="flabel">Filters</div>' +
    '<div class="frow"><span class="lbl">Must include:</span>' + CLASS_KEYS.map(cls => {
      const on = state.mustHave.has(cls);
      const c = CLASSES[cls];
      const style = on
        ? 'background:' + c.color + ';border-color:' + c.color + ';color:var(--ink)'
        : 'border-color:' + c.color + ';color:' + c.color + ';opacity:0.55';
      return '<button class="chip" style="' + style + '" data-act="must" data-cls="' + cls + '" aria-pressed="' + on + '">' + c.label + '</button>';
    }).join('') + '</div>' +
    '<div class="frow"><span class="lbl">Healers:</span><span class="seg">' +
    [[null, 'All'], [1, '1 ✚'], [2, '2 ✚'], [3, '3 ✚']].map(([v, lbl]) =>
      '<button class="' + (state.healerFilter === v ? 'on' : '') + '" data-act="healfilter" data-val="' + (v === null ? 'all' : v) + '">' + lbl + '</button>'
    ).join('') + '</span>' +
    '<label class="check"><input type="checkbox" data-act="only70"' + (state.only70 ? ' checked' : '') + '> Level 70 only</label></div>' +
    '</div><div class="fbox"><div class="flabel">Rules</div>' +
    '<div class="frow"><span class="lbl">Max per class:</span>' + CLASS_KEYS.map(cls => {
      const c = CLASSES[cls];
      const cap = state.caps[cls] === undefined ? Infinity : state.caps[cls];
      const capped = cap !== Infinity;
      const style = 'border-color:' + c.color + ';color:' + c.color + (capped ? '' : ';opacity:0.4');
      return '<button class="chip" style="' + style + '" data-act="cap" data-cls="' + cls +
        '" title="Click to change: ∞ → 1 → 2 → 3 → ∞">' + c.label + ' <span class="mark">' + (capped ? '×' + cap : '∞') + '</span></button>';
    }).join('') + '</div>' +
    '<div class="frow"><label class="check"><input type="checkbox" data-act="dispel"' + (state.needDispel ? ' checked' : '') + '> At least 1 dispeller (Pala/Priest)</label></div>' +
    '</div></div>';
  return section('filters', 'Filters and rules', '', headsum, body);
}

function compsSection() {
  const active = state.people.filter(p => !p.benched);

  // gold line: everything that narrows down the suggestions
  const segs = [];
  const locked = active.filter(p => p.sel.length);
  if (locked.length) segs.push('On the board: ' + locked.map(p => {
    const opts = selOptions(p);
    return esc(p.name) + ' (' + (opts.length ? opts.map(c => CLASSES[c].label).join(' / ') : '–') + ')';
  }).join(', '));
  if (state.randomCount) segs.push('Random slots: ' + state.randomCount);
  const benched = state.people.filter(p => p.benched);
  if (benched.length) segs.push('Benched: ' + benched.map(p => esc(p.name)).join(', '));
  if (state.only70) {
    const no70 = active.filter(p => !p.sel.length && p.classes.length && p.classes.every(cls => !is70(p, cls)));
    if (no70.length) segs.push('No level-70 character: ' + no70.map(p => esc(p.name)).join(', '));
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
    list = '<div class="empty">No valid teams with these constraints – loosen a filter or a rule under «Filters and rules».</div>';
  } else {
    badge = '<span class="count">' + cc.results.length + (cc.capped ? '+' : '') + '</span>';
    const sortRow = '<div class="frow" style="margin-bottom:10px"><span class="lbl">Sort:</span><span class="seg">' +
      [['std', 'As generated'], ['comp', 'Identical comps grouped'], ['heal', 'Most healers'], ['disp', 'Most dispellers']].map(([v, lbl]) =>
        '<button class="' + (state.sortBy === v ? 'on' : '') + '" data-act="sortby" data-val="' + v + '">' + lbl + '</button>'
      ).join('') + '</span></div>';
    const sorted = sortedResults(cc.results);
    const randomPairs = state.randomCount ? '<span class="pair rnd">Random</span>'.repeat(state.randomCount) : '';
    list = sortRow + sorted.slice(0, state.shown).map((team, ti) => {
      const inTeam = new Set(team.map(t => t.name));
      const outside = active.filter(p => !inTeam.has(p.name)).map(p => p.name);
      return '<div class="comp"><span class="pairs">' + pairsHtml(team) + randomPairs +
        '<span class="healbadge" title="' + (state.healerFilter !== null ? 'Number playing healer' : 'Number who can heal') + '">✚' + rowHeal(team) + '</span>' +
        (outside.length ? '<span class="meta">sitting out: ' + outside.map(esc).join(', ') + '</span>' : '') +
        '</span><span class="rowbtns"><button class="btn small ghost" data-act="savecomp" data-ti="' + ti + '">Save</button>' +
        '<button class="btn small" data-act="use" data-ti="' + ti + '">Use on board</button></span></div>';
    }).join('');
    if (sorted.length > state.shown) {
      list += '<div class="morewrap"><button class="btn ghost" data-act="more">Show ' +
        Math.min(PAGE, sorted.length - state.shown) + ' more <span class="dim">(' +
        (sorted.length - state.shown) + ' left)</span></button></div>';
    }
    list += '<div class="legend">Filled chip = plays healer in that team · «sitting out» = not included in this particular team.</div>';
    listCache = sorted;
  }
  return section('comps', 'Valid teams', badge, '', lockline + list);
}

/* ---------- tab: pugging (brainstorm comps with the roster + randoms) ---------- */

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
  for (let i = chips.length; i < state.teamSize; i++) chips.push('<span class="pair slot">open</span>');
  const strip = '<div class="pairs">' + chips.join('') + '</div>';

  const cc = computeComps();
  const validline = '<div class="legend">' + (cc.msg
    ? cc.msg
    : cc.results.length + (cc.capped ? '+' : '') + ' valid teams with this starting point – the list is under «Team building».') + '</div>';

  const filled = info.chosen.length + state.randomCount;
  const badge = '<span class="count' + (info.complete ? ' ok' : info.warns.length ? ' warn' : '') + '">' +
    filled + '/' + state.teamSize + '</span>';
  const clearBtn = (info.chosen.length || state.randomCount)
    ? '<button class="btn small ghost" data-act="clear">Clear selection</button>' : '';
  return section('pug', 'The comp', badge, clearBtn, strip + checklistHtml(info) + validline);
}

/* ---------- tab: comps (research reference from META in engine.js) ---------- */

function clsInfo(c) {
  return CLASSES[c] || META.extraClasses[c] || { label: c, color: 'var(--dim)', healer: false };
}

function metaSpecRole(cls, key) {
  const s = (SPECS[cls] || []).find(x => x.key === key);
  return s ? s.role : 'dps';
}

/*
 * Can the crew staff the comp? Classes outside CLASSES (lock) are resolved as
 * random slots, and up to 2 slots total may go uncovered (PUG).
 * Returns { team, randoms } or null. Uses the engine with exact class
 * caps and filters by signature — respects bench and «Level 70 only».
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
    if (lockN + drop >= comp.classes.length) break; // at least one of the crew must be included
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
          ? '<span class="ckpill maybe">✓ w/ ' + st.randoms + ' random</span>'
          : '<span class="ckpill ok">✓ crew can</span>')
        : '<span class="ckpill">missing people</span>';
      rows.push('<div class="comp"><span class="pairs">' +
        '<span class="tier ' + comp.tier + '">' + comp.tier + '</span>' +
        '<span class="metaname">' + esc(comp.name) + '</span>' + chips +
        '<span class="healbadge" title="Number of healer specs">✚' + comp.healers + '</span>' + feas +
        '</span><span class="rowbtns"><button class="btn small" data-act="trycomp" data-mi="' + mi + '"' +
        (st ? '' : ' disabled title="None of the crew can staff this right now (bench/70 taken into account)"') +
        '>Try with the crew</button></span>' +
        '<div class="metasub">' + comp.specs.join(' · ') + ' — ' + esc(comp.why) + '</div></div>');
    });
  const ossBtn = '<button class="pill' + (state.metaOnlyOss ? ' on' : '') + '" data-act="metaoss" aria-pressed="' + state.metaOnlyOss + '">Crew only</button>';
  const listBody = rows.join('') ||
    '<div class="empty">No comps to show' + (state.metaOnlyOss ? ' – turn off the «Crew only» filter' : '') + '.</div>';
  const legend = '<div class="legend">Research from July 2026, TBC 2.4.3 / TBC Classic. Filled chip = healer spec. «Try with the crew» sets the comp on the board — Lock slots and uncovered slots become random slots.</div>';
  const compsSec = section('meta', 'Recommended comps · ' + state.teamSize + 'v' + state.teamSize,
    '<span class="count">' + shown + '</span>', ossBtn, listBody + legend);

  const ruleRows = META.rules.map(r =>
    '<div class="comp"><span class="pairs">' +
    '<span class="ckpill ' + (r.type === 'hard' ? 'hard' : '') + '">' + r.type + '</span>' +
    '<span class="sizebadge">' + r.scope + '</span>' +
    '<span style="font-weight:600">' + esc(r.rule) + '</span>' +
    '</span><div class="metasub">' + esc(r.why) + '</div></div>'
  ).join('');
  const ruleLegend = '<div class="legend">Reference — the guidelines are not wired into the rules/checklist yet. Let us know which ones should be enforced, and they will get coded in.</div>';
  const rulesSec = section('metarules', 'Guidelines from the research',
    '<span class="count">' + META.rules.length + '</span>', '', ruleRows + ruleLegend);

  const effRows = CLASS_KEYS.concat(['lock']).map(c => {
    const def = META.dispel.defensive[c] || [];
    const off = META.dispel.offensive.includes(c);
    if (!def.length && !off) return '';
    const info = clsInfo(c);
    return '<div class="avrow"><span class="avcls" style="color:' + info.color + '">' + info.label + '</span>' +
      '<span class="aventries">' +
      (def.length ? def.map(t => '<span class="ckpill">' + t + '</span>').join('') : '<span class="dim" style="font-size:12px">no defensive</span>') +
      (off ? '<span class="ckpill ok">purge ✓</span>' : '') +
      '</span></div>';
  }).join('');
  const msRow = '<div class="avrow"><span class="avcls" style="color:var(--gold)">MS effect</span><span class="aventries">' +
    META.ms.classes.map(c => '<span class="ckpill">' + clsInfo(c).label + '</span>').join('') + '</span></div>';
  const effSec = section('metaeff', 'Dispel & MS', '', '',
    effRows + msRow +
    '<div class="legend">' + esc(META.dispel.note) + '</div>' +
    '<div class="legend">' + esc(META.ms.note) + '</div>');

  const srcSec = section('kilder', 'Sources', '<span class="count">' + META.sources.length + '</span>', '',
    '<div class="srclist">' + META.sources.map(s =>
      '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title) + '</a>').join('') + '</div>');

  return compsSec + rulesSec + effSec + srcSec;
}

function savedSection() {
  let body;
  if (!state.saved.length) {
    body = '<div class="empty">No saved teams yet – set up a full team on the board, or click «Save» on a suggestion.</div>';
  } else {
    body = state.saved.map((s, si) =>
      '<div class="comp"><span class="pairs"><span class="savedname">' + esc(s.name) + '</span>' +
      '<span class="sizebadge">' + s.size + 'v' + s.size + '</span>' + pairsHtml(s.team) +
      '</span><span class="rowbtns"><button class="btn small" data-act="usesaved" data-si="' + si + '">Use on board</button>' +
      '<button class="btn small ghost danger" data-act="delsaved" data-si="' + si + '">Delete</button></span></div>'
    ).join('');
  }
  let io = '';
  if (state.showIO) {
    io = '<div class="iopanel"><textarea id="ioText" spellcheck="false"></textarea>' +
      '<div style="margin-top:8px;display:flex;gap:8px;align-items:center">' +
      '<button class="btn small" data-act="import">Import from the text</button>' +
      '<span class="iomsg" id="iomsg"></span></div></div>';
  }
  const badge = '<span class="count">' + state.saved.length + '</span>';
  const ioBtn = '<button class="btn small ghost" data-act="toggleio">Export / import</button>';
  return section('saved', 'Saved teams', badge, ioBtn, body + io);
}

function savebarHtml() {
  const info = boardInfo();
  if (state.tab === 'roster' || (!info.chosen.length && !state.randomCount)) return '';
  const filled = info.chosen.length + state.randomCount;
  let stat = '<span class="' + (info.complete ? 'ok' : '') + '">' + filled + '/' + state.teamSize + ' selected</span>';
  if (info.multi.length) {
    stat += ' <span class="dim">· ' + info.multi.map(p => esc(p.name)).join(' and ') + ' have multiple classes selected</span>';
  }
  if (info.warns.length) stat += ' <span class="warn">· ' + info.warns[0] + '</span>';
  else if (info.complete) stat += ' <span class="dim">· valid team (' + info.healTxt + ') ✓</span>';
  const canSave = info.complete;
  const saveTitle = canSave ? 'Saves the team as it stands on the board'
    : info.multi.length ? 'Pick one class per person to save' : 'Requires a full team with no rule violations';
  return '<div class="savebar" id="savebar"><div class="savebar-inner">' +
    '<span class="stat">' + stat + '</span><span class="grow"></span>' +
    '<input type="text" id="saveName" placeholder="Team name …">' +
    '<button class="btn primary" data-act="saveboard"' + (canSave ? '' : ' disabled') + ' title="' + saveTitle + '">Save team</button>' +
    '</div></div>';
}

/* ---------- tab: roster ---------- */

function rosterSection() {
  const cards = state.people.map((p, pi) => {
    const rows = p.classes.map(cls => {
      const c = CLASSES[cls];
      const reg = regOf(p, cls);
      const n70 = !is70(p, cls);
      const role = c.healer
        ? '<span class="mini">' +
          '<button class="' + (reg === 'healer' ? 'on' : '') + '" data-act="setreg" data-pi="' + pi + '" data-cls="' + cls + '" data-val="healer" title="Healer only">✚</button>' +
          '<button class="' + (reg === 'both' ? 'on' : '') + '" data-act="setreg" data-pi="' + pi + '" data-cls="' + cls + '" data-val="both" title="Can do both">✚⚔</button>' +
          '<button class="' + (reg === 'dps' ? 'on' : '') + '" data-act="setreg" data-pi="' + pi + '" data-cls="' + cls + '" data-val="dps" title="DPS only">⚔</button>' +
          '</span>'
        : '<span class="dim" style="font-size:11px">⚔ dps</span>';
      return '<div class="clsrow">' +
        '<span class="chip" style="border-color:' + c.color + ';color:' + c.color + '">' + c.label + '</span>' +
        role +
        '<button class="lvlpill' + (n70 ? ' n70' : '') + '" data-act="lvl" data-pi="' + pi + '" data-cls="' + cls + '" title="Click to toggle 70 status">' + (n70 ? '&lt;70' : '70') + '</button>' +
        '<button class="clsrm" data-act="rmcls" data-pi="' + pi + '" data-cls="' + cls + '" title="Remove ' + c.label + ' from ' + esc(p.name) + '">✕</button>' +
        '</div>';
    }).join('');
    const missing = CLASS_KEYS.filter(cls => !p.classes.includes(cls));
    const addRow = missing.length
      ? '<div class="addcls"><div class="flabel">Add class</div><div class="chips">' +
        missing.map(cls => {
          const c = CLASSES[cls];
          return '<button class="chip off" style="border-color:' + c.color + ';color:' + c.color +
            '" data-act="addcls" data-pi="' + pi + '" data-cls="' + cls + '">' + c.label + '</button>';
        }).join('') + '</div></div>'
      : '';
    return '<div class="card' + (p.benched ? ' benched' : '') + '">' +
      '<div class="cardhead"><span class="pname">' + esc(p.name) + '</span>' +
      '<button class="pill' + (p.benched ? ' on' : '') + '" data-act="bench" data-pi="' + pi + '" aria-pressed="' + p.benched + '">Bench</button>' +
      '<button class="clsrm" data-act="rmperson" data-pi="' + pi + '" title="Remove ' + esc(p.name) + ' from the roster">✕</button></div>' +
      (rows || '<div class="noclasses">No classes yet</div>') + addRow + '</div>';
  }).join('');

  const add = '<div class="addrow"><input type="text" id="newName" placeholder="New name …">' +
    '<button class="btn" data-act="addperson">Add person</button></div>';
  const danger = '<div class="dangerzone"><button class="btn ghost danger" data-act="resetroster">Reset roster</button>' +
    '<span class="hint">Resets all people, classes, roles, and 70 status back to default.</span></div>';
  const badge = '<span class="count">' + state.people.length + '</span>';
  return section('roster', 'Players', badge, '', '<div class="rcards">' + cards + '</div>' + add + danger);
}

/* ---------- render ---------- */

function render() {
  const keep = {};
  for (const id of ['saveName', 'newName', 'ioText']) {
    const el = document.getElementById(id);
    if (el) keep[id] = { v: el.value, focus: document.activeElement === el };
  }

  const tabs = '<nav class="tabs">' +
    '<button class="' + (state.tab === 'build' ? 'on' : '') + '" data-act="tab" data-val="build">Team building</button>' +
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

  const foot = '<footer>Everything is saved automatically in this browser. Use «Export / import» under «Saved teams» to share teams with the crew or move them to another machine.</footer>';
  const toast = state.toast ? '<div class="toast">' + state.toast + '</div>' : '';
  document.getElementById('app').innerHTML = top + view + foot + savebarHtml() + toast;

  for (const id in keep) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (id === 'ioText' && !keep[id].focus) continue; // show a fresh export when the field is not in use
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

/* ---------- actions ---------- */

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
      showToast('None of the crew can staff <b>' + esc(comp.name) + '</b> right now');
      render();
      return;
    }
    // the spec roles from the comp drive the healer/dps choice on the board
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
    showToast('<b>' + esc(comp.name) + '</b> set on the board' +
      (st.randoms ? ' – ' + st.randoms + ' slot' + (st.randoms > 1 ? 's' : '') + ' as Random' : ''));
    resetPage();
  } else if (act === 'savecomp') {
    const team = listCache[Number(t.dataset.ti)];
    if (!team) return;
    const name = 'Team ' + (state.saved.length + 1);
    state.saved.push({ name, size: state.teamSize, team: storedTeamFromRow(team) });
    showToast('Saved as <b>' + esc(name) + '</b> under «Saved teams»');
  } else if (act === 'use') {
    const team = listCache[Number(t.dataset.ti)];
    if (!team) return;
    applyTeam(team, null, false);
    showToast('The team is set on the board');
    resetPage();
  } else if (act === 'usesaved') {
    const s = state.saved[Number(t.dataset.si)];
    state.randomCount = Math.min(s.team.filter(x => x.random).length, s.size);
    const misses = applyTeam(s.team.filter(x => !x.random), s.size, true);
    state.tab = 'build';
    showToast(misses.length
      ? 'Set on the board – could not find: ' + esc(misses.join(', '))
      : '<b>' + esc(s.name) + '</b> is set on the board');
    resetPage();
  } else if (act === 'delsaved') {
    const s = state.saved.splice(Number(t.dataset.si), 1)[0];
    showToast('Deleted <b>' + esc(s.name) + '</b>');
  } else if (act === 'toggleio') {
    state.showIO = !state.showIO;
    state.collapsed.saved = false;
  } else if (act === 'import') {
    const msgEl = document.getElementById('iomsg');
    try {
      const clean = reviveSaved(JSON.parse(document.getElementById('ioText').value));
      if (!clean) throw new Error('Expected a list');
      state.saved = clean;
      showToast('Imported ' + clean.length + ' teams (replaced the list)');
    } catch (err) {
      if (msgEl) { msgEl.classList.add('err'); msgEl.textContent = 'Could not read the text as JSON: ' + err.message; }
      return; // do not re-render – keep the text in the field
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
    const name = (inp && inp.value.trim()) || 'Team ' + (state.saved.length + 1);
    state.saved.push({ name, size: state.teamSize, team });
    if (inp) inp.value = '';
    showToast('Saved as <b>' + esc(name) + '</b> under «Saved teams»');
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
    showToast('Removed <b>' + esc(removed.name) + '</b> from the roster');
    resetPage();
  } else if (act === 'addperson') {
    const inp = document.getElementById('newName');
    const name = inp ? inp.value.trim() : '';
    if (!name) return;
    if (state.people.some(x => x.name.toLowerCase() === name.toLowerCase())) {
      showToast('<b>' + esc(name) + '</b> already exists');
      render();
      return;
    }
    state.people.push({ name, classes: [], benched: false, sel: [], healerRole: null, not70: [], roles: {} });
    if (inp) inp.value = '';
    showToast('Added <b>' + esc(name) + '</b> – pick classes on the card');
  } else if (act === 'resetroster') {
    state.people = freshRoster();
    state.mustHave = new Set();
    state.healerFilter = null;
    state.only70 = true;
    state.caps = { rogue: 1, sham: 1 };
    state.needDispel = true;
    state.randomCount = 0;
    showToast('The roster has been reset');
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

// keyboard on section headers (role=button)
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-act="collapse"]')) {
    e.preventDefault();
    state.collapsed[e.target.dataset.id] = !state.collapsed[e.target.dataset.id];
    render();
  }
});

loadStored();
render();
