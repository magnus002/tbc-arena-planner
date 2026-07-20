# TBC Arena – Lagplanlegger

Brainstorm-verktøy for arena-lag i WoW TBC: hvem spiller hvilken class og
rolle, med regler (tak per class, dispeller-krav), healer-filter, 70-status
og lagrede teams. Norsk UI, ingen build-steg — ren statisk side.

## Kjøre lokalt

Åpne `index.html` rett i nettleseren, eller:

```bash
npm run serve   # statisk server på localhost
```

## Tester

```bash
npm test        # oracle-test av motoren (tests/verify.js) — trenger bare node
npm install     # én gang, for playwright
npx playwright install chromium   # én gang, for browser-testen
npm run smoke   # klikktest i browser (tests/smoke.js)
```

`npm test` skal alltid være grønn før commit. Se `CLAUDE.md` for arbeidsform
og arkitektur, `PLAN.md` for prioritert roadmap. `CHROMIUM_PATH` kan settes
for å kjøre smoke-testen mot en ferdiginstallert chromium i stedet for
playwright sin egen nedlasting.

## Live-versjon

Verktøyet er live på **https://magnus002.github.io/tbc-arena-planner/**
(GitHub Pages, deploy fra `main` / root). Merge/push til `main` er live
etter ~ett minutt — hard refresh (Ctrl+F5) om du ser en gammel versjon.

Siden bruker localStorage: roster, regler, tavla og lagrede lag huskes
per nettleser. «Eksporter / importer» brukes for å dele lag gutta imellom.

## Struktur

```
index.html    markup
style.css     tema (mørkt, WoW-classfarger)
engine.js     domenemotor — delt av app og tester (aldri dupliser!)
app.js        UI-tilstand, rendering, hendelser
tests/        verify.js (oracle) + smoke.js (playwright)
```
