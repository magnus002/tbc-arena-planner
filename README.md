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

## Publisere (GitHub + Pages)

```bash
gh repo create tbc-lagplanlegger --private --source . --push
```

Deretter i repo-innstillingene på GitHub: Settings → Pages → Deploy from
branch → `main` / root. Siden blir liggende på
`https://<brukernavn>.github.io/tbc-lagplanlegger/` — og på egen hosting kan
verktøyet ta i bruk localStorage for ekte lagring (se PLAN.md punkt 4).

## Struktur

```
index.html    markup
style.css     tema (mørkt, WoW-classfarger)
engine.js     domenemotor — delt av app og tester (aldri dupliser!)
app.js        UI-tilstand, rendering, hendelser
tests/        verify.js (oracle) + smoke.js (playwright)
```
