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
  interaksjon — bevisst enkelt), hendelses-delegering via `data-act`.
- `tests/verify.js`: uavhengig brute-force-oracle. Poenget er at oracle og
  motor er to separate implementasjoner — en ny regel legges til BEGGE steder.
- `tests/smoke.js`: playwright-klikktest av hovedflytene mot `file://`.

## Domenemodell (dagens)

- Person: `{ name, classes[], benched, assigned, healerRole, not70[], roles{} }`
- `roles[cls]`: `'healer' | 'dps' | 'both'` for hybrid-classes (pala/priest/
  sham/druid); andre er alltid dps. `'both'` er default. Visning: ✚ / ⚔ / ✚⚔.
- `healerRole` (true/false/null=åpen) er rollevalget PÅ TAVLA for en låst
  ✚⚔-char. null → generatoren prøver begge.
- `not70[cls]`: chars som ikke er 70; filtreres bort når «Kun 70» er på.
- Regler: `caps` (maks per class, manglende nøkkel = ∞; standard rogue×1,
  sham×1), `needDispel` (minst 1 pala/priest), `mustHave`, `healerFilter`
  (eksakt antall faktiske healers).
- Låst (assigned) person er en HARD føring: alltid med, på den classen.
  Gull-linja (`#lockline`) viser alt som snevrer inn forslagene.
- Lagrede lag: `{ name, size, team: [{name, cls, heal(true|false|null)}] }` —
  heal null = åpen rolle. Eksport/import = JSON i textarea.

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
