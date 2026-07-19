'use strict';
/*
 * Browser-røyktest: laster siden og klikker gjennom hovedflytene i ny UI
 * (faner, kollapsbare seksjoner, flervalg, tilgjengelig-panel, sjekkliste,
 * random-plasser). Kjør: npm run smoke  (krever playwright + chromium).
 * Sett CHROMIUM_PATH for å bruke en ferdiginstallert chromium.
 */
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  const t = {};
  const click = sel => page.locator(sel).first().click();
  const text = sel => page.locator(sel).first().textContent();
  const compCount = () => text('#sec-comps .sechead .count');

  // Baseline: standardregler gir 180 lag (låst fasit i tests/verify.js); ingen lagre-bar ennå
  t.startCountOk = (await compCount()) === '180';
  t.noSavebar = (await page.locator('#savebar').count()) === 0;

  // Regler: pala-tak ×1 → 65; tilbake til ∞ → 180
  await click('[data-act="cap"][data-cls="pala"]');
  t.palaCapOk = (await compCount()) === '65';
  for (let i = 0; i < 3; i++) await click('[data-act="cap"][data-cls="pala"]');
  t.backToStart = (await compCount()) === '180';

  // Dispel-krav av → 185
  await page.locator('[data-act="dispel"]').uncheck();
  t.noDispelOk = (await compCount()) === '185';
  await page.locator('[data-act="dispel"]').check();

  // Lagre direkte fra forslagsrad → toast + teller i «Lagrede lag»
  await click('[data-act="savecomp"]');
  t.saveToast = (await text('.toast')).includes('Lagret som');
  t.savedFromRow = (await text('#sec-saved .sechead .count')) === '1';

  // Byggeklosser: velg Magnus-sham fra «Tilgjengelig per class»-panelet
  await click('#sec-avail [data-act="selchip"][data-pi="0"][data-cls="sham"]');
  t.availSelects = (await page.locator('#sec-board [data-act="selchip"][data-pi="0"][data-cls="sham"]').getAttribute('aria-pressed')) === 'true';
  t.lockline = (await text('#sec-comps .lockline')).includes('Magnus');
  t.checkShamYes = (await text('#checklist')).includes('Sham ✓');

  // Rolle healer + eksakt 2 healers → 64 (fasit i verify.js)
  await click('[data-act="pickrole"][data-val="heal"]');
  await click('[data-act="healfilter"][data-val="2"]');
  t.singleLockOk = (await compCount()) === '64';

  // Flervalg: + priest → 179 (fasit i verify.js); sham ikke lenger garantert
  await click('#sec-board [data-act="selchip"][data-pi="0"][data-cls="priest"]');
  t.multiOk = (await compCount()) === '179';
  t.checkShamMaybe = (await text('#checklist')).includes('Sham ?');
  t.multihint = (await text('#sec-board')).includes('2 classes valgt');
  await click('#sec-board [data-act="selchip"][data-pi="0"][data-cls="priest"]');

  // Bruk forslag → fullt lag; lagre fra sticky-baren
  await click('[data-act="use"]');
  t.statusAfterUse = (await text('#savebar .stat')).includes('gyldig lag');
  await page.fill('#saveName', 'Testlag');
  await click('[data-act="saveboard"]');
  t.savedFromBoard = (await text('#sec-saved')).includes('Testlag');

  // Eksport-panelet inneholder laget
  await click('[data-act="toggleio"]');
  t.exportHasTeam = (await page.inputValue('#ioText')).includes('Testlag');
  await click('[data-act="toggleio"]');

  // Lagring (PLAN 4): tavla og lagrede lag overlever reload via localStorage
  await page.reload();
  t.persistedSaved = (await text('#sec-saved')).includes('Testlag');
  t.persistedBoard = (await text('#sec-board .sechead .count')) === '5/5';

  // Random-plass: teller mot lagstørrelsen (4 kjente plasser → 242, fasit fra motoren)
  await click('[data-act="clear"]');
  await click('[data-act="healfilter"][data-val="all"]');
  await click('[data-act="addrandom"]');
  t.randomBoardBadge = (await text('#sec-board .sechead .count')) === '1/5';
  t.randomCountOk = (await compCount()) === '242';
  t.randomInRow = (await text('#sec-comps .comp')).includes('Random');
  t.randomInChecklist = (await text('#checklist')).includes('Random ×1');
  await click('[data-act="rmrandom"]');
  t.randomRemoved = (await compCount()) === '180';

  // Regelbrudd-varsel: to palas med pala-tak ×1
  await click('[data-act="cap"][data-cls="pala"]');
  await click('#sec-board [data-act="selchip"][data-pi="1"][data-cls="pala"]');
  await click('#sec-board [data-act="selchip"][data-pi="5"][data-cls="pala"]');
  t.violationShown = (await text('#savebar .stat')).includes('Regelbrudd');
  t.violationInComps = (await text('#sec-comps')).includes('maks-regel');

  // Roster-fanen: tilbakestill, rolle-registrering og 70-status
  await click('[data-act="tab"][data-val="roster"]');
  await click('[data-act="resetroster"]');
  await click('[data-act="setreg"][data-pi="3"][data-cls="druid"][data-val="healer"]');
  await click('[data-act="lvl"][data-pi="2"][data-cls="hunter"]');
  await click('[data-act="tab"][data-val="build"]');
  const druidChip = await text('#sec-board [data-act="selchip"][data-pi="3"][data-cls="druid"]');
  t.druidMark = druidChip.includes('✚') && !druidChip.includes('⚔');
  t.hunterN70 = (await text('#sec-board [data-act="selchip"][data-pi="2"][data-cls="hunter"]')).includes('70');

  // Kollaps: tavla lukkes og åpnes
  await click('#sec-board .sechead');
  t.collapsed = (await page.locator('#sec-board .secbody').count()) === 0;
  await click('#sec-board .sechead');
  t.reopened = (await page.locator('#sec-board .secbody').count()) === 1;

  const failed = Object.entries(t).filter(([, v]) => v !== true).map(([k]) => k);
  console.log(JSON.stringify({ ...t, errors }, null, 2));
  if (failed.length || errors.length) {
    console.error('SMOKE FEIL: ' + failed.join(', '));
    process.exit(1);
  }
  console.log('SMOKE OK');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('SMOKE FAIL: ' + e.message); process.exit(1); });
