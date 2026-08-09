# TBC Arena – Team Planner

Tool for Magnus and the crew (WoW TBC): brainstorm arena teams (2v2/3v3/5v5) —
who plays which class/role, with rules and saved teams. English UI.

## Workflow

- Propose → Magnus decides → execute. Ask when in doubt instead of assuming.
- Run `npm test` (oracle) and `npm run smoke` (browser) BEFORE declaring
  yourself done. Both must be green. New engine rules need a new oracle scenario.

## Architecture (deliberately simple)

- **No build step, no framework.** Static site: `index.html` + `style.css`
  + `engine.js` + `app.js`. Hosted on GitHub Pages from `main`:
  https://magnus002.github.io/tbc-arena-planner/ — merging to main = live.
- **`engine.js` is the shared source of truth**: domain data (CLASSES, SPECS,
  META, DEFAULT_ROSTER) and the `findComps` generator. Loaded by the browser
  AND required by the tests. NEVER copy logic from the engine into the app or tests.
- `app.js`: UI state (`state`), rendering (innerHTML re-render of everything
  per interaction — deliberately simple; text field values are preserved in
  `render()`), event delegation via `data-act`. Four tabs: Team building (the
  board, filters/rules, valid teams with sorting), Pugging (brainstorm: comp
  strip, checklist, availability overview, random slots), Comps (the META
  reference: tier lists per bracket, guidelines, dispel/MS, «Try with the
  crew» which staffs a comp from the roster via the engine — gaps/Lock become
  random slots) and Roster — all sharing the same state. Sections are
  collapsible, id `#sec-<name>`.
- `tests/verify.js`: an independent brute-force oracle. The point is that the
  oracle and the engine are two separate implementations — a new rule gets
  added to BOTH.
- `tests/smoke.js`: a playwright click-through test of the main flows against `file://`.

## Domain model (current)

- Person: `{ name, classes[], benched, sel[], healerRole, not70[], roles{} }`
- `roles[cls]`: `'healer' | 'dps' | 'both'` for hybrid classes (pala/priest/
  sham/druid); others are always dps. `'both'` is the default. Display: ✚ / ⚔ / ✚⚔.
- `sel[]`: selected classes on the board. 1+ selected = HARD constraint: the
  person is always included, on ONE of the selected ones (multi-select → the
  generator tries them all). `healerRole` (true/false/null=open) is the role
  choice on the board for ✚⚔ characters; it excludes classes that cannot
  play that role (`selOptions` in the engine — also used by the UI, never
  reimplement it in the app).
- `not70[cls]`: characters that are not 70; filtered out when «Level 70 only» is on.
- Rules: `caps` (max per class, a missing key = ∞; default rogue×1,
  sham×1), `needDispel` (at least 1 pala/priest), `mustHave`, `healerFilter`
  (exact number of actual healers).
- Random slots: `state.randomCount` unknown players count against the
  team size (a UI concept, not the engine's): the generator is called with
  `teamSize − randomCount`; filters/rules apply to the known ones.
- The gold line (`.lockline`) shows everything narrowing down the
  suggestions; the comp checklist (`#checklist`) shows sham/dispeller
  (yes/maybe/no), cap violations and the healer count for the board.
- Saved teams: `{ name, size, team: [{name, cls, heal(true|false|null)}
  | {random: true}] }` — heal null = open role. Export/import = JSON in a
  textarea; import also accepts the old format (without random).

## Known pitfalls

- Storage: the whole `state` is persisted to localStorage, versioned — on
  format changes, bump `STORAGE_VERSION` and add a migration in `loadStored()`.
  `persist()`/`loadStored()` deliberately swallow errors: artifact/sandbox
  copies without localStorage should keep running in memory. Do not remove the storage.
- Pure ✚ registrations mean «always counts as healer when included» —
  combined with the exact-N filter, the result list narrows fast. The UX
  should explain such narrowing (see PLAN.md item 3).
- `esc()` every person/team name in innerHTML (XSS via import JSON).
- No `alert/confirm/prompt`.

## Domain facts (TBC)

- Heal-capable classes: pala, priest, sham, druid. Dispellers: pala, priest.
- The spec catalog is ready in `engine.js` (`SPECS`, not yet wired into the UI).
- `META` in engine.js: a research-based reference (comps/tier per bracket,
  guidelines, dispel taxonomy, MS effect, sources) — shown in the Comps tab,
  but NOT wired into the rules/checklist yet; that needs a decision from
  Magnus. `tests/verify.js` has an integrity check of META against SPECS.
  Warlock (`lock`) only exists in META (`META.extraClasses`), not in CLASSES.
- WoW class colors live in `CLASSES` — keep them in any redesign; they carry
  a lot of recognition (sham blue is adjusted lighter for the dark background).

## Roadmap

See PLAN.md — prioritized by Magnus. Item 1 (overview) and 3 (UI remake) are
the stated main wishes; item 2 (spec model) is the agreed direction for the data model.
