# TBC Arena – Lagplanlegger

Verktøy for Magnus og gjengen (WoW TBC): brainstorme arena-lag (2v2/3v3/5v5) —
hvem spiller hvilken class/rolle, med regler og lagrede teams. Norsk UI.

## Arbeidsform

- Foreslå → Magnus vedtar → utfør. Still spørsmål ved tvil i stedet for å anta.
- Kjør `npm test` (oracle) og `npm run smoke` (browser) FØR du sier deg ferdig.
  Begge skal være grønne. Nye motor-regler skal ha nytt oracle-scenario.

## Arkitektur (bevisst enkel)

- **Ingen build-steg, ingen rammeverk.** Statisk side: `index.html` + `style.css`
  + `engine.js` + `app.js`. Skal kunne hostes rett på GitHub Pages.
- **`engine.js` er delt sannhet**: domenedata (CLASSES, SPECS, DEFAULT_ROSTER)
  og generatoren `findComps`. Lastes av nettleseren OG require-es av testene.
  ALDRI kopier logikk fra engine inn i app eller tester.
- `app.js`: UI-tilstand (`state`), rendering (innerHTML-re-render av alt per
  interaksjon — bevisst enkelt; tekstfelt-verdier bevares i `render()`),
  hendelses-delegering via `data-act`. To faner: Lagbygging og Roster;
  seksjonene er kollapsbare og har id `#sec-<navn>`.
- `tests/verify.js`: uavhengig brute-force-oracle. Poenget er at oracle og
  motor er to separate implementasjoner — en ny regel legges til BEGGE steder.
- `tests/smoke.js`: playwright-klikktest av hovedflytene mot `file://`.

## Domenemodell (dagens)

- Person: `{ name, classes[], benched, sel[], healerRole, not70[], roles{} }`
- `roles[cls]`: `'healer' | 'dps' | 'both'` for hybrid-classes (pala/priest/
  sham/druid); andre er alltid dps. `'both'` er default. Visning: ✚ / ⚔ / ✚⚔.
- `sel[]`: valgte classes på tavla. 1+ valgt = HARD føring: personen er
  alltid med, på EN av de valgte (flervalg → generatoren prøver alle).
  `healerRole` (true/false/null=åpen) er rollevalget på tavla for ✚⚔-chars;
  det utelukker classes som ikke kan spille rollen (`selOptions` i engine —
  brukes også av UI-et, aldri reimplementer den i app).
- `not70[cls]`: chars som ikke er 70; filtreres bort når «Kun 70» er på.
- Regler: `caps` (maks per class, manglende nøkkel = ∞; standard rogue×1,
  sham×1), `needDispel` (minst 1 pala/priest), `mustHave`, `healerFilter`
  (eksakt antall faktiske healers).
- Random-plasser: `state.randomCount` ukjente spillere teller mot
  lagstørrelsen (UI-konsept, ikke motor): generatoren kalles med
  `teamSize − randomCount`; filtre/regler gjelder de kjente.
- Gull-linja (`.lockline`) viser alt som snevrer inn forslagene;
  comp-sjekklista (`#checklist`) viser sham/dispeller (ja/mulig/nei),
  maks-brudd og healer-antall for tavla.
- Lagrede lag: `{ name, size, team: [{name, cls, heal(true|false|null)}
  | {random: true}] }` — heal null = åpen rolle. Eksport/import = JSON i
  textarea; import godtar også gammelt format (uten random).

## Kjente fallgruver

- Artifact-versjonen (Claude/Cowork) forbyr localStorage — repo-versjonen på
  egen hosting kan og BØR bruke localStorage (se PLAN.md punkt 4). Ikke
  gjeninnfør denne begrensningen når siden hostes selv.
- Rene ✚-registreringer betyr «teller alltid som healer når han er med» —
  kombinert med eksakt-N-filteret blir resultatlista fort veldig smal. UX-en
  bør forklare slike innsnevringer (se PLAN.md punkt 3).
- `esc()` alle personnavn/lagnavn i innerHTML (XSS via import-JSON).
- Ingen `alert/confirm/prompt`.

## Domenefakta (TBC)

- Heal-capable classes: pala, priest, sham, druid. Dispellere: pala, priest.
- Spec-katalogen ligger klar i `engine.js` (`SPECS`, ennå ikke koblet på UI).
- WoW-classfarger ligger i `CLASSES` — behold dem i redesign; de bærer mye
  gjenkjennelse (sham-blå er justert lysere for mørk bakgrunn).

## Roadmap

Se PLAN.md — prioritert av Magnus. Punkt 1 (oversikt) og 3 (UI-remake) er de
uttalte hovedønskene; punkt 2 (spec-modell) er vedtatt retning for datamodellen.
