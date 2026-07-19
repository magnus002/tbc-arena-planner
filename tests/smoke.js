'use strict';
/*
 * Browser-røyktest: laster siden og klikker gjennom hovedflytene.
 * Kjør: npm run smoke   (krever playwright + chromium, se README)
 */
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  const t = {};

  // Standardregler gir 180 lag (låst fasit i tests/verify.js)
  t.startCountOk = (await page.textContent('#compcount')).startsWith('180 gyldige lag');
  t.savehintVisible = await page.isVisible('#savehint');

  // Regler: pala-tak ×1 → 65; tilbake til ∞ → 180 igjen
  await page.click('[data-act="cap"][data-cls="pala"]');
  t.palaCapOk = (await page.textContent('#compcount')).startsWith('65 ');
  for (let i = 0; i < 3; i++) await page.click('[data-act="cap"][data-cls="pala"]');
  t.backToStart = (await page.textContent('#compcount')).startsWith('180 ');

  // Dispel-krav av → 185
  await page.uncheck('[data-act="dispel"]');
  t.noDispelOk = (await page.textContent('#compcount')).startsWith('185 ');
  await page.check('[data-act="dispel"]');

  // Lagre direkte fra forslag
  await page.click('[data-act="savecomp"]');
  t.savedFromRow = (await page.textContent('#savedlist')).includes('Lag 1');

  // Tavla: lås Magnus på sham som healer, filter 2 ✚, bruk forslag, lagre
  await page.click('[data-act="assign"][data-cls="sham"][data-pi="0"]');
  t.lockline = (await page.textContent('#lockline')).includes('Magnus');
  await page.click('[data-act="pickrole"][data-val="heal"]');
  await page.click('[data-act="healfilter"][data-val="2"]');
  await page.click('[data-act="use"]');
  t.statusAfterUse = (await page.textContent('#status')).includes('Gyldig lag');
  await page.fill('#saveName', 'Testlag');
  await page.click('#saveBtn');
  t.savedFromBoard = (await page.textContent('#savedlist')).includes('Testlag');

  // Eksport-panelet inneholder laget
  await page.click('#ioBtn');
  t.exportHasTeam = (await page.inputValue('#ioText')).includes('Testlag');

  // Regelbrudd-varsel: to palas med pala-tak ×1
  await page.click('#clearBtn');
  await page.click('[data-act="healfilter"][data-val="all"]');
  await page.click('[data-act="cap"][data-cls="pala"]');
  await page.click('[data-act="assign"][data-cls="pala"][data-pi="1"]');
  await page.click('[data-act="assign"][data-cls="pala"][data-pi="5"]');
  t.violationShown = (await page.textContent('#status')).includes('Regelbrudd');

  // Rediger roster: rolle-registrering og 70-tag
  await page.click('#resetBtn');
  await page.click('#editBtn');
  await page.click('[data-act="roletag"][data-cls="druid"][data-pi="3"]'); // both → healer
  await page.click('[data-act="lvl"][data-cls="hunter"][data-pi="2"]');    // Runar-hunter → ikke 70
  await page.click('#editBtn');
  t.druidMark = (await page.textContent('[data-act="assign"][data-cls="druid"][data-pi="3"]')).includes('✚');
  t.hunterN70 = (await page.textContent('[data-act="assign"][data-cls="hunter"][data-pi="2"]')).includes('70');

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
