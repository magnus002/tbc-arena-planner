# Plan – prioritert av Magnus (juli 2026)

## 1. Oversikt over tilgjengelige classes og specs (viktigst)

> **Status juli 2026:** levert som «Tilgjengelig per class»-panelet i
> Pugging-fanen (klikk på navn = valg på tavla, samme state, benk/70
> vises), pluss comp-sjekkliste (sham/dispeller/maks-brudd/healers) og
> random-plasser for når gutta ikke er nok folk. Spec-visning per char
> (`Enh ⚔` osv.) venter på punkt 2.

Et eget panel («Tilgjengelig» e.l.) som viser poolen så man kan bygge lag selv:
per class en rad med hvem som kan spille den, med 70-status og rolle/spec —
f.eks. `Sham: Magnus (Enh ⚔, 70) · Andre (Resto ✚, 70)`. Krav:

- Grupper per class (alle 8), tydelig hvem som mangler/ikke er 70.
- Skal fungere som «byggeklosser»: klikk på en char i oversikten → lås
  personen på den classen på tavla (samme effekt som å klikke chipen på kortet).
- Oppdateres av samme state som resten (benk, 70, spec-registrering).

## 2. Ekte TBC-specs per char (vedtatt datamodell-endring)

Erstatt `roles{cls: healer|dps|both}` med spec-registrering per char:

- Katalogen ligger i `engine.js` (`SPECS`): f.eks. sham → Ele/Enh/Resto,
  priest → Disc/Holy/Shadow. `role` per spec er allerede definert der.
- Per char registrerer man hvilke specs som er aktuelle (1+; f.eks. Andre-sham
  = [Resto] eller [Enh, Resto]). ✚/⚔/✚⚔-merkene UTLEDES av spec-settet.
- På tavla velges spec (ikke bare healer/dps) når en låst char har flere
  aktuelle specs; generatoren grener over aktuelle specs som før over roller.
- Forslags-rader og lagrede lag viser spec (f.eks. «Andre Sham (Resto)»).
- Lagrede lag/eksport: nytt felt `spec`; behold bakoverkompatibel import av
  gammelt format (`heal` → gjett spec via rolle) eller avvis pent med melding.
- Oracle-testen i `tests/verify.js` må utvides tilsvarende (spec-grening).

## 3. UI/UX-remake (jobbes iterativt med Magnus)

> **Status juli 2026:** iterasjon 1 landet — faner (Lagbygging/Roster),
> kollapsbare seksjoner med tellere, flervalg på tavla (`sel[]`, personen
> alltid med på en av de valgte), FILTRE/REGLER-skille, paginert
> forslagsliste (25 om gangen), sticky lagre-bar med toasts, roster-fane
> med store klikkmål. «Hvorfor så få»-forklaringen (kulepunkt 1 under) er
> nedprioritert av Magnus inntil videre.
>
> **Iterasjon 2 (juli 2026):** «Filtre og regler» skilt ut som egen seksjon
> med aktiv-oppsummering i headeren; gyldige lag kan sorteres (som generert /
> like comps samlet / flest healers / flest dispellere); ny «Pugging»-fane
> spesialisert for comp-brainstorm (comp-stripe med ledige plasser,
> sjekkliste, tilgjengelig-oversikt, random) — Lagbygging-fanen er roligere.

Kjente problemer å løse:

- **«Hvorfor så få lag?»**: innsnevringer er usynlige. Utvid gull-linja til en
  forklaring: vis gjerne per aktiv begrensning hvor mange lag den koster
  (motoren er billig — kjør findComps på nytt med én begrensning sluppet:
  «uten 'må ha sham': 10 · med healers=Alle: 15»).
- Tavla er tett: mange chips per kort (class + rolle-tag + 70-tag). Vurder
  klarere skille mellom «rediger roster»-modus og «bygg lag»-modus.
- Seksjonsrekkefølge og hierarki: Tavla → regler/filtre → forslag → lagrede
  lag fungerer, men trenger tydeligere gruppering (regler vs. filtre er i dag
  blandet: «må inneholde» og «antall healers» er filtre, tak/dispel er regler).
- Mobil/smal sidepanel-bredde: chips wrapper stygt; test ~400px bredde.
- Behold WoW-classfargene og mørkt tema.

## 4. Ekte lagring (localStorage) — mulig først ved egen hosting

> **Status juli 2026:** levert — hele `state` (roster, regler, tavla,
> lagrede lag, random-plasser) persisteres automatisk, versjonert
> (`{v: 1, ...}`) med validering og migreringskrok i `loadStored()`.
> Eksport/import beholdt som deling.

Artifact-versjonen kunne ikke bruke localStorage; det kan repo-versjonen:

- Persistér hele `state` (roster-endringer, regler, lagrede lag) automatisk.
- Behold eksport/import som deling gutta imellom («lim inn dette laget»).
- Versjonér lagringsformatet (`{v: 2, ...}`) med migrering.

## 5. Hosting og deling

> **Status juli 2026:** Magnus har aktivert Pages — live på
> https://magnus002.github.io/tbc-arena-planner/ (deploy fra `main`;
> merge dit er live etter ~ett minutt). Kombinert med punkt 4 husker
> siden alt lokalt per person.

- GitHub Pages fra main-branch (statisk side — funker som den er).
- Da får gutta én URL; kombinert med punkt 4 husker den alt lokalt per person.

## Ikke-mål (foreløpig)

- Ingen backend/database, ingen innlogging, ingen rammeverk/build-steg.
- Ingen rating/meta-vurdering av comps (verktøyet er nøytral brainstorming).
