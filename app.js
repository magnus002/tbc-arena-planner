'use strict';
/* app.js — UI-tilstand, rendering og hendelser. Domenelogikken bor i engine.js. */

let state = {
  teamSize: 5,
  editMode: false,
  mustHave: new Set(),
  healerFilter: null, // null = alle, ellers eksakt antall faktiske healers i laget
  only70: true,       // filtrer bort chars som ikke er 70
  caps: { rogue: 1, sham: 1 }, // maks per class; class uten oppføring = ubegrenset
  needDispel: true,   // minst 1 dispeller (pala/priest) per lag
  people: freshRoster(),
  saved: [],          // [{name, size, team: [{name, cls, heal(true|false|null)}]}]
  showIO: false,
};

function freshRoster() {
  return DEFAULT_ROSTER.map(p => ({
    name: p.name,
    classes: [...p.classes],
    benched: false,
    assigned: null,
    healerRole: null,  // rolle-valg på tavla for ✚⚔-chars: true=healer, false=dps, null=åpen
    not70: [],         // class-nøkler der personens char IKKE er 70
    roles: {},         // per-char registrering for hybrid-classes: 'healer' | 'dps' | 'both' (default both)
  }));
}

function charLabel(p, cls) {
  const c = CLASSES[cls];
  const reg = regOf(p, cls);
  let mark = '';
  if (reg === 'healer') mark = ' ✚';
  else if (reg === 'both') mark = ' ✚⚔';
  else if (reg === 'dps' && c.healer) mark = ' ⚔'; // hybrid registrert som ren dps
  return c.label + (mark ? '<span class="mark">' + mark + '</span>' : '');
}

/* ---------- hjelpere ---------- */

function capViolations() {
  const count = {};
  for (const p of state.people) {
    if (!p.benched && p.assigned) count[p.assigned] = (count[p.assigned] || 0) + 1;
  }
  const out = [];
  for (const cls of Object.keys(count)) {
    const cap = state.caps[cls] === undefined ? Infinity : state.caps[cls];
    if (count[cls] > cap) out.push({ cls, count: count[cls], cap });
  }
  return out;
}

function boardDispelOk() {
  if (!state.needDispel) return true;
  return state.people.some(p => !p.benched && p.assigned && DISPEL.includes(p.assigned));
}

function boardComplete() {
  const active = state.people.filter(p => !p.benched);
  const assigned = active.filter(p => p.assigned);
  return assigned.length === state.teamSize && capViolations().length === 0 && boardDispelOk();
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function personByName(name) {
  return state.people.find(p => p.name === name) || null;
}

/* ---------- rendering ---------- */

function render() {
  renderCards();
  renderStatus();
  renderFilters();
  renderComps();
  renderSaved();
  document.getElementById('editBtn').classList.toggle('active', state.editMode);
  document.getElementById('addrow').style.display = state.editMode ? 'flex' : 'none';
  document.getElementById('sizeSel').value = String(state.teamSize);
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = !boardComplete();
  saveBtn.title = saveBtn.disabled ? 'Sett opp et fullt lag uten regelbrudd først' : 'Lagrer laget slik det står på tavla';
  document.getElementById('savehint').style.display = saveBtn.disabled ? 'inline' : 'none';
  document.getElementById('iobox').style.display = state.showIO ? 'block' : 'none';
}

function chipOffHtml(cls, dataAttrs) {
  const c = CLASSES[cls];
  return '<span class="chip off" style="border-color:' + c.color + ';color:' + c.color + '" ' + dataAttrs + '>' + c.label + '</span>';
}

function renderCards() {
  const conflicts = new Set(capViolations().map(v => v.cls));
  const el = document.getElementById('cards');
  el.innerHTML = state.people.map((p, pi) => {
    let chips;
    if (state.editMode) {
      chips = CLASS_KEYS.map(cls => {
        const has = p.classes.includes(cls);
        if (!has) return chipOffHtml(cls, 'data-pi="' + pi + '" data-cls="' + cls + '" data-act="toggle"');
        const n70 = !is70(p, cls);
        const c = CLASSES[cls];
        const reg = regOf(p, cls);
        const roletag = c.healer
          ? '<span class="roletag" data-pi="' + pi + '" data-cls="' + cls + '" data-act="roletag"' +
            ' title="Rolle: ' + (reg === 'both' ? 'begge' : reg) + ' – klikk for å bytte">' +
            (reg === 'healer' ? '✚' : reg === 'dps' ? '⚔' : '✚⚔') + '</span>'
          : '';
        return '<span class="chip" style="border-color:' + c.color + ';color:' + c.color +
          '" data-pi="' + pi + '" data-cls="' + cls + '" data-act="toggle">' + c.label + roletag +
          '<span class="lvltag' + (n70 ? ' n70' : '') + '" data-pi="' + pi + '" data-cls="' + cls +
          '" data-act="lvl" title="Klikk for å bytte 70-status">' + (n70 ? '&lt;70' : '70') + '</span></span>';
      }).join('');
    } else if (p.classes.length === 0) {
      chips = '<span class="noclasses">Ingen classes – bruk «Rediger roster»</span>';
    } else {
      chips = p.classes.map(cls => {
        const sel = p.assigned === cls;
        const conf = sel && conflicts.has(cls);
        const n70 = !is70(p, cls);
        const c = CLASSES[cls];
        let style = sel
          ? 'background:' + c.color + ';border-color:' + c.color + ';color:#181510'
          : 'border-color:' + c.color + ';color:' + c.color;
        if (n70 && !sel) style += ';opacity:0.5';
        return '<span class="chip' + (conf ? ' conflict' : '') + '" style="' + style +
          '" data-pi="' + pi + '" data-cls="' + cls + '" data-act="assign"' +
          (n70 ? ' title="Ikke level 70"' : '') + '>' + charLabel(p, cls) +
          (n70 ? ' <span style="font-size:10.5px;opacity:0.8">&lt;70</span>' : '') + '</span>';
      }).join('');
    }

    // Rollelinje: kun for ✚⚔-chars som er valgt på tavla
    let roleline = '';
    if (!state.editMode && !p.benched && p.assigned) {
      const reg = regOf(p, p.assigned);
      if (reg === 'both') {
        roleline = '<div class="roleline"><span>Rolle:</span>' +
          '<button class="rolebtn' + (p.healerRole === true ? ' active' : '') + '" data-pi="' + pi + '" data-act="pickrole" data-val="heal">✚ Healer</button>' +
          '<button class="rolebtn' + (p.healerRole === false ? ' active' : '') + '" data-pi="' + pi + '" data-act="pickrole" data-val="dps">⚔ DPS</button>' +
          (p.healerRole === null ? '<span style="opacity:0.8">(åpen – forslagene prøver begge)</span>' : '') +
          '</div>';
      } else if (reg === 'healer') {
        roleline = '<div class="roleline">Spiller healer ✚</div>';
      }
    }

    const rm = state.editMode
      ? '<button class="rmbtn" data-pi="' + pi + '" data-act="remove" title="Fjern person">✕</button>' : '';
    return '<div class="card' + (p.benched ? ' benched' : '') + '">' +
      '<div class="cardhead"><span class="pname">' + esc(p.name) + '</span>' + rm +
      '<label class="benchlbl"><input type="checkbox" data-pi="' + pi + '" data-act="bench"' +
      (p.benched ? ' checked' : '') + '> Benk</label></div>' +
      '<div class="chips">' + chips + '</div>' + roleline + '</div>';
  }).join('');
}

function renderStatus() {
  const el = document.getElementById('status');
  const active = state.people.filter(p => !p.benched);
  const assigned = active.filter(p => p.assigned);
  const viol = capViolations();
  const parts = [];

  parts.push('Valgt: <b>' + assigned.length + '/' + state.teamSize + '</b>');

  if (viol.length) {
    parts.push('<span class="warn">Regelbrudd: ' + viol.map(v => v.count + '× ' + CLASSES[v.cls].label + ' (maks ' + v.cap + ')').join(', ') + '</span>');
  }
  if (assigned.length > state.teamSize) {
    parts.push('<span class="warn">For mange valgt for ' + state.teamSize + 'v' + state.teamSize + '</span>');
  }
  if (active.length < state.teamSize) {
    parts.push('<span class="warn">Bare ' + active.length + ' aktive – for få for ' + state.teamSize + 'v' + state.teamSize + '</span>');
  }
  const lowAssigned = state.only70 ? assigned.filter(p => !is70(p, p.assigned)) : [];
  if (lowAssigned.length) {
    parts.push('<span class="warn">Ikke 70: ' + lowAssigned.map(p => esc(p.name) + ' (' + CLASSES[p.assigned].label + ')').join(', ') + '</span>');
  }
  const dispelMissing = assigned.length === state.teamSize && !boardDispelOk();
  if (dispelMissing) {
    parts.push('<span class="warn">Mangler dispeller (Pala/Priest)</span>');
  }
  if (!viol.length && !lowAssigned.length && !dispelMissing && assigned.length === state.teamSize) {
    let heal = 0, open = 0;
    for (const p of assigned) {
      const reg = regOf(p, p.assigned);
      if (reg === 'healer' || (reg === 'both' && p.healerRole === true)) heal++;
      else if (reg === 'both' && p.healerRole === null) open++;
    }
    parts.push('<span class="ok">Gyldig lag ✓</span> <span style="color:var(--dim)">(' +
      heal + ' healer' + (heal === 1 ? '' : 's') + (open ? ', ' + open + ' uavklart ✚⚔' : '') + ')</span>');
  }
  el.innerHTML = parts.join(' &nbsp;·&nbsp; ');
}

function renderFilters() {
  const el = document.getElementById('filterrow');
  el.innerHTML = '<span class="lbl">Må inneholde:</span>' + CLASS_KEYS.map(cls => {
    const on = state.mustHave.has(cls);
    const c = CLASSES[cls];
    const style = on
      ? 'background:' + c.color + ';border-color:' + c.color + ';color:#181510'
      : 'border-color:' + c.color + ';color:' + c.color + ';opacity:0.55';
    return '<span class="chip" style="' + style + '" data-cls="' + cls + '" data-act="must">' + c.label + '</span>';
  }).join('');

  const hr = document.getElementById('healerrow');
  const opts = [[null, 'Alle'], [1, '1 ✚'], [2, '2 ✚'], [3, '3 ✚']];
  hr.innerHTML = '<span class="lbl">Antall healers:</span>' + opts.map(([v, lbl]) =>
    '<button class="hfbtn' + (state.healerFilter === v ? ' active' : '') +
    '" data-act="healfilter" data-val="' + (v === null ? 'all' : v) + '">' + lbl + '</button>'
  ).join('') +
  '<label class="benchlbl" style="margin-left:14px"><input type="checkbox" data-act="only70"' +
  (state.only70 ? ' checked' : '') + '> Kun 70-chars</label>';

  const rr = document.getElementById('rulesrow');
  rr.innerHTML = '<span class="lbl">Regler – maks per class:</span>' + CLASS_KEYS.map(cls => {
    const c = CLASSES[cls];
    const cap = state.caps[cls] === undefined ? Infinity : state.caps[cls];
    const capped = cap !== Infinity;
    const style = 'border-color:' + c.color + ';color:' + c.color + (capped ? '' : ';opacity:0.45');
    return '<span class="chip" style="' + style + '" data-cls="' + cls + '" data-act="cap"' +
      ' title="Maks antall ' + c.label + ' per lag – klikk for å endre">' +
      c.label + ' <span class="mark">' + (capped ? '×' + cap : '∞') + '</span></span>';
  }).join('') +
  '<label class="benchlbl" style="margin-left:14px"><input type="checkbox" data-act="dispel"' +
  (state.needDispel ? ' checked' : '') + '> Minst 1 dispeller (Pala/Priest)</label>';
}

function pairsHtml(team) {
  return team.map(t => {
    const c = CLASSES[t.cls];
    const p = personByName(t.name);
    const style = t.heal === true
      ? 'background:' + c.color + ';border-color:' + c.color + ';color:#181510'
      : 'border-color:' + c.color + ';color:' + c.color;
    const label = p ? charLabel(p, t.cls) : c.label;
    return '<span class="pair" style="' + style + '">' +
      esc(t.name) + ' <span style="opacity:0.8">' + label + '</span></span>';
  }).join('');
}

function renderComps() {
  const countEl = document.getElementById('compcount');
  const listEl = document.getElementById('complist');
  const active = state.people.filter(p => !p.benched);

  // Synliggjør alt som snevrer inn forslagene, så låste valg ikke glemmes
  const segs = [];
  const locked = active.filter(p => p.assigned);
  if (locked.length) segs.push('Låst på tavla: ' + locked.map(p => esc(p.name) + ' (' + CLASSES[p.assigned].label + ')').join(', '));
  const benched = state.people.filter(p => p.benched);
  if (benched.length) segs.push('Benket: ' + benched.map(p => esc(p.name)).join(', '));
  if (state.only70) {
    const no70 = active.filter(p => !p.assigned && p.classes.length && p.classes.every(cls => !is70(p, cls)));
    if (no70.length) segs.push('Ingen 70-char: ' + no70.map(p => esc(p.name)).join(', '));
  }
  document.getElementById('lockline').innerHTML = segs.join(' &nbsp;·&nbsp; ');

  if (capViolations().length) {
    countEl.textContent = '';
    listEl.innerHTML = '<div class="empty">Tavla bryter en maks-regel – fjern et valg eller hev taket under «Regler».</div>';
    return;
  }
  if (state.only70 && active.some(p => p.assigned && !is70(p, p.assigned))) {
    countEl.textContent = '';
    listEl.innerHTML = '<div class="empty">Noen på tavla spiller en char som ikke er 70 – fjern valget eller skru av «Kun 70-chars».</div>';
    return;
  }
  if (active.length < state.teamSize) {
    countEl.textContent = '';
    listEl.innerHTML = '<div class="empty">For få aktive spillere for ' + state.teamSize + 'v' + state.teamSize + '.</div>';
    return;
  }

  const roleMode = state.healerFilter !== null;
  const { results, capped } = findComps(state.people, {
    teamSize: state.teamSize,
    mustHave: state.mustHave,
    healerWanted: state.healerFilter,
    only70: state.only70,
    caps: state.caps,
    needDispel: state.needDispel,
  });
  countEl.textContent = results.length + ' gyldige lag' +
    (capped ? ' (viser de første ' + MAX_RESULTS + ')' : '') +
    ' – gitt låste valg, benk og filter. Fylt chip = spiller healer.';

  if (!results.length) {
    listEl.innerHTML = '<div class="empty">Ingen gyldige lag med disse begrensningene.</div>';
    return;
  }

  listEl.innerHTML = results.map((team, ti) => {
    const inTeam = new Set(team.map(t => t.name));
    const outside = active.filter(p => !inTeam.has(p.name)).map(p => p.name);
    const heal = roleMode
      ? team.filter(t => t.heal).length
      : team.filter(t => regOf(personByName(t.name) || {}, t.cls) !== 'dps').length;
    return '<div class="comp">' + pairsHtml(team) +
      '<span class="healbadge" title="' + (roleMode ? 'Antall som spiller healer' : 'Antall som kan heale (✚ og ✚⚔)') + '">✚' + heal + '</span>' +
      (outside.length ? '<span class="meta">benk: ' + outside.map(esc).join(', ') + '</span>' : '') +
      '<span class="rowbtns"><button data-ti="' + ti + '" data-act="savecomp" title="Legg til i lagrede lag">Lagre</button>' +
      '<button data-ti="' + ti + '" data-act="use">Bruk</button></span></div>';
  }).join('');

  listEl._results = results;
}

function renderSaved() {
  const el = document.getElementById('savedlist');
  if (!state.saved.length) {
    el.innerHTML = '<div class="empty">Ingen lagrede lag ennå – sett opp et fullt lag på tavla og trykk «Lagre laget på tavla».</div>';
  } else {
    el.innerHTML = state.saved.map((s, si) =>
      '<div class="comp"><span class="savedname">' + esc(s.name) + '</span>' +
      '<span class="sizebadge">' + s.size + 'v' + s.size + '</span>' +
      pairsHtml(s.team) +
      '<span class="rowbtns">' +
      '<button data-si="' + si + '" data-act="usesaved">Bruk</button>' +
      '<button data-si="' + si + '" data-act="delsaved">Slett</button>' +
      '</span></div>'
    ).join('');
  }
  if (state.showIO) {
    const ta = document.getElementById('ioText');
    // ikke overskriv mens brukeren limer inn/redigerer i feltet
    if (document.activeElement !== ta) ta.value = JSON.stringify(state.saved, null, 1);
  }
}

/* ---------- handlinger ---------- */

function applyTeam(team, size) {
  if (size) state.teamSize = size;
  const roleMode = state.healerFilter !== null;
  const byName = new Map(team.map(x => [x.name, x]));
  const misses = [];
  for (const person of state.people) {
    const hit = byName.get(person.name);
    if (hit && person.classes.includes(hit.cls)) {
      person.assigned = hit.cls;
      if (hit.fromSaved) {
        // lagrede lag har rollen lagret direkte (true/false/null=åpen)
        person.healerRole = hit.heal === true ? true : hit.heal === false ? false : null;
      } else {
        // fra forslag: med healer-filter aktivt er rollen bestemt i raden; ellers åpen
        person.healerRole = roleMode ? hit.heal === true : null;
      }
    } else {
      person.assigned = null;
      person.healerRole = null;
      if (hit) misses.push(hit.name);
    }
  }
  for (const t of team) {
    if (!personByName(t.name)) misses.push(t.name);
  }
  return misses;
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  const pi = t.dataset.pi !== undefined ? Number(t.dataset.pi) : null;
  const p = pi !== null ? state.people[pi] : null;

  if (act === 'assign') {
    p.assigned = p.assigned === t.dataset.cls ? null : t.dataset.cls;
    p.healerRole = null;
  } else if (act === 'toggle') {
    const cls = t.dataset.cls;
    const idx = p.classes.indexOf(cls);
    if (idx >= 0) {
      p.classes.splice(idx, 1);
      if (p.assigned === cls) { p.assigned = null; p.healerRole = null; }
    } else {
      p.classes.push(cls);
      p.classes.sort((a, b) => CLASS_KEYS.indexOf(a) - CLASS_KEYS.indexOf(b));
    }
  } else if (act === 'roletag') {
    const cls = t.dataset.cls;
    const cur = regOf(p, cls);
    const next = cur === 'both' ? 'healer' : cur === 'healer' ? 'dps' : 'both';
    p.roles = p.roles || {};
    p.roles[cls] = next;
    if (p.assigned === cls) p.healerRole = null;
  } else if (act === 'lvl') {
    const cls = t.dataset.cls;
    p.not70 = p.not70 || [];
    const ix = p.not70.indexOf(cls);
    if (ix >= 0) p.not70.splice(ix, 1); else p.not70.push(cls);
  } else if (act === 'pickrole') {
    const want = t.dataset.val === 'heal';
    p.healerRole = (p.healerRole === want) ? null : want;
  } else if (act === 'remove') {
    state.people.splice(pi, 1);
  } else if (act === 'must') {
    const cls = t.dataset.cls;
    state.mustHave.has(cls) ? state.mustHave.delete(cls) : state.mustHave.add(cls);
  } else if (act === 'healfilter') {
    const v = t.dataset.val;
    state.healerFilter = v === 'all' ? null : Number(v);
  } else if (act === 'cap') {
    const cls = t.dataset.cls;
    const cur = state.caps[cls] === undefined ? Infinity : state.caps[cls];
    const next = cur === Infinity ? 1 : cur === 1 ? 2 : cur === 2 ? 3 : Infinity;
    if (next === Infinity) delete state.caps[cls]; else state.caps[cls] = next;
  } else if (act === 'savecomp') {
    const results = document.getElementById('complist')._results;
    const team = results[Number(t.dataset.ti)];
    const roleMode = state.healerFilter !== null;
    const stored = team.map(x => {
      const p2 = personByName(x.name);
      const reg = p2 ? regOf(p2, x.cls) : 'dps';
      const heal = reg === 'healer' ? true
                 : reg === 'dps' ? false
                 : x.heal === true ? true
                 : roleMode ? false : null;
      return { name: x.name, cls: x.cls, heal };
    });
    state.saved.push({ name: 'Lag ' + (state.saved.length + 1), size: state.teamSize, team: stored });
  } else if (act === 'use') {
    const results = document.getElementById('complist')._results;
    applyTeam(results[Number(t.dataset.ti)]);
  } else if (act === 'usesaved') {
    const s = state.saved[Number(t.dataset.si)];
    applyTeam(s.team.map(x => ({ ...x, fromSaved: true })), s.size);
  } else if (act === 'delsaved') {
    state.saved.splice(Number(t.dataset.si), 1);
  } else {
    return;
  }
  render();
});

document.addEventListener('change', e => {
  const t = e.target;
  if (!t.dataset || !t.dataset.act) return;
  if (t.dataset.act === 'bench') {
    const p = state.people[Number(t.dataset.pi)];
    p.benched = t.checked;
    if (p.benched) { p.assigned = null; p.healerRole = null; }
    render();
  } else if (t.dataset.act === 'only70') {
    state.only70 = t.checked;
    render();
  } else if (t.dataset.act === 'dispel') {
    state.needDispel = t.checked;
    render();
  }
});

document.getElementById('sizeSel').addEventListener('change', e => {
  state.teamSize = Number(e.target.value);
  render();
});
document.getElementById('clearBtn').addEventListener('click', () => {
  state.people.forEach(p => { p.assigned = null; p.healerRole = null; });
  render();
});
document.getElementById('editBtn').addEventListener('click', () => {
  state.editMode = !state.editMode;
  render();
});
document.getElementById('resetBtn').addEventListener('click', () => {
  state.people = freshRoster();
  state.mustHave = new Set();
  state.healerFilter = null;
  state.only70 = true;
  state.caps = { rogue: 1, sham: 1 };
  state.needDispel = true;
  state.editMode = false;
  render();
});
document.getElementById('addBtn').addEventListener('click', () => {
  const inp = document.getElementById('newName');
  const name = inp.value.trim();
  if (!name) return;
  if (state.people.some(p => p.name.toLowerCase() === name.toLowerCase())) return;
  state.people.push({ name, classes: [], benched: false, assigned: null, healerRole: null, not70: [], roles: {} });
  inp.value = '';
  render();
});
document.getElementById('saveBtn').addEventListener('click', () => {
  if (!boardComplete()) return;
  const active = state.people.filter(p => !p.benched && p.assigned);
  const team = active.map(p => {
    const reg = regOf(p, p.assigned);
    const heal = reg === 'healer' ? true : reg === 'dps' ? false : p.healerRole;
    return { name: p.name, cls: p.assigned, heal };
  });
  const inp = document.getElementById('saveName');
  const name = inp.value.trim() || 'Lag ' + (state.saved.length + 1);
  state.saved.push({ name, size: state.teamSize, team });
  inp.value = '';
  render();
});
document.getElementById('ioBtn').addEventListener('click', () => {
  state.showIO = !state.showIO;
  document.getElementById('iomsg').textContent = '';
  render();
});
document.getElementById('importBtn').addEventListener('click', () => {
  const msg = document.getElementById('iomsg');
  msg.classList.remove('err');
  try {
    const data = JSON.parse(document.getElementById('ioText').value);
    if (!Array.isArray(data)) throw new Error('Forventet en liste');
    const clean = [];
    for (const s of data) {
      if (!s || !Array.isArray(s.team)) continue;
      const team = s.team
        .filter(t => t && typeof t.name === 'string' && CLASSES[t.cls])
        .map(t => ({ name: t.name, cls: t.cls, heal: t.heal === true ? true : t.heal === false ? false : null }));
      if (!team.length) continue;
      clean.push({
        name: typeof s.name === 'string' && s.name.trim() ? s.name.trim() : 'Importert lag',
        size: [2, 3, 5].includes(s.size) ? s.size : ([2, 3, 5].includes(team.length) ? team.length : 5),
        team,
      });
    }
    state.saved = clean;
    msg.textContent = 'Importerte ' + clean.length + ' lag (erstattet lista).';
    render();
  } catch (err) {
    msg.classList.add('err');
    msg.textContent = 'Kunne ikke lese teksten som JSON: ' + err.message;
  }
});

render();
