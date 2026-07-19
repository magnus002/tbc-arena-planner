# Plan – prioritert av Magnus (juli 2026)

## 1. Oversikt over tilgjengelige classes og specs (viktigst)

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

Artifact-versjonen kunne ikke bruke localStorage; det kan repo-versjonen:

- Persistér hele `state` (roster-endringer, regler, lagrede lag) automatisk.
- Behold eksport/import som deling gutta imellom («lim inn dette laget»).
- Versjonér lagringsformatet (`{v: 2, ...}`) med migrering.

## 5. Hosting og deling

- GitHub Pages fra main-branch (statisk side — funker som den er).
- Da får gutta én URL; kombinert med punkt 4 husker den alt lokalt per person.

## Ikke-mål (foreløpig)

- Ingen backend/database, ingen innlogging, ingen rammeverk/build-steg.
- Ingen rating/meta-vurdering av comps (verktøyet er nøytral brainstorming).
