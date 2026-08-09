'use strict';
/*
 * Browser smoke test: loads the page and clicks through the main flows
 * (tabs, collapsible sections, multi-select, availability panel, checklist,
 * random slots). Run: npm run smoke  (requires playwright + chromium).
 * Set CHROMIUM_PATH to use a pre-installed chromium.
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

  // Baseline: default rules give 180 teams (locked answer in tests/verify.js); no savebar yet
  t.startCountOk = (await compCount()) === '180';
  t.noSavebar = (await page.locator('#savebar').count()) === 0;

  // Rules: pala cap ×1 → 65; back to ∞ → 180
  await click('[data-act="cap"][data-cls="pala"]');
  t.palaCapOk = (await compCount()) === '65';
  for (let i = 0; i < 3; i++) await click('[data-act="cap"][data-cls="pala"]');
  t.backToStart = (await compCount()) === '180';

  // Dispel requirement off → 185
  await page.locator('[data-act="dispel"]').uncheck();
  t.noDispelOk = (await compCount()) === '185';
  await page.locator('[data-act="dispel"]').check();

  // «Filters and rules» is its own section; the list can be sorted
  t.filtersSeparate = (await page.locator('#sec-filters [data-act="cap"]').count()) === 8;
  await click('[data-act="sortby"][data-val="heal"]');
  const heals = await page.locator('#sec-comps .healbadge').allTextContents();
  t.sortHealDesc = heals.length > 1 && parseInt(heals[0].slice(1)) >= parseInt(heals[heals.length - 1].slice(1));
  await click('[data-act="sortby"][data-val="std"]');

  // Save directly from a suggestion row → toast + counter in «Saved teams»
  await click('[data-act="savecomp"]');
  t.saveToast = (await text('.toast')).includes('Saved as');
  t.savedFromRow = (await text('#sec-saved .sechead .count')) === '1';

  // Building blocks in the Pugging tab: pick Magnus-sham from «Available per class»
  await click('[data-act="tab"][data-val="pug"]');
  await click('#sec-avail [data-act="selchip"][data-pi="0"][data-cls="sham"]');
  t.pugStrip = (await text('#sec-pug .pairs')).includes('Magnus');
  t.pugSlots = (await text('#sec-pug .pairs')).includes('open');
  t.checkShamYes = (await text('#checklist')).includes('Sham ✓');
  await click('[data-act="tab"][data-val="build"]');
  t.availSelects = (await page.locator('#sec-board [data-act="selchip"][data-pi="0"][data-cls="sham"]').getAttribute('aria-pressed')) === 'true';
  t.lockline = (await text('#sec-comps .lockline')).includes('Magnus');

  // Role healer + exact 2 healers → 64 (answer in verify.js)
  await click('[data-act="pickrole"][data-val="heal"]');
  await click('[data-act="healfilter"][data-val="2"]');
  t.singleLockOk = (await compCount()) === '64';

  // Multi-select: + priest → 179 (answer in verify.js); sham no longer guaranteed
  await click('#sec-board [data-act="selchip"][data-pi="0"][data-cls="priest"]');
  t.multiOk = (await compCount()) === '179';
  t.checkShamMaybe = (await text('#checklist')).includes('Sham ?');
  t.multihint = (await text('#sec-board')).includes('2 classes selected');
  await click('#sec-board [data-act="selchip"][data-pi="0"][data-cls="priest"]');

  // Use a suggestion → full team; save from the sticky bar
  await click('[data-act="use"]');
  t.statusAfterUse = (await text('#savebar .stat')).includes('valid team');
  await page.fill('#saveName', 'Testteam');
  await click('[data-act="saveboard"]');
  t.savedFromBoard = (await text('#sec-saved')).includes('Testteam');

  // The export panel contains the team
  await click('[data-act="toggleio"]');
  t.exportHasTeam = (await page.inputValue('#ioText')).includes('Testteam');
  await click('[data-act="toggleio"]');

  // Storage (PLAN 4): the board and saved teams survive a reload via localStorage
  await page.reload();
  t.persistedSaved = (await text('#sec-saved')).includes('Testteam');
  t.persistedBoard = (await text('#sec-board .sechead .count')) === '5/5';

  // A random slot added in Pugging counts against the team size
  // (4 known slots → 242, answer from the engine)
  await click('[data-act="clear"]');
  await click('[data-act="healfilter"][data-val="all"]');
  await click('[data-act="tab"][data-val="pug"]');
  await click('[data-act="addrandom"]');
  t.pugRandomStrip = (await text('#sec-pug .pairs')).includes('Random');
  t.pugValidline = (await text('#sec-pug')).includes('242 valid teams');
  await click('[data-act="tab"][data-val="build"]');
  t.randomBoardBadge = (await text('#sec-board .sechead .count')) === '1/5';
  t.randomCountOk = (await compCount()) === '242';
  t.randomInRow = (await text('#sec-comps .comp')).includes('Random');
  t.randomInChecklist = (await text('#checklist')).includes('Random ×1');
  await click('[data-act="rmrandom"]');
  t.randomRemoved = (await compCount()) === '180';

  // Rule violation warning: two palas with pala cap ×1
  await click('[data-act="cap"][data-cls="pala"]');
  await click('#sec-board [data-act="selchip"][data-pi="1"][data-cls="pala"]');
  await click('#sec-board [data-act="selchip"][data-pi="5"][data-cls="pala"]');
  t.violationShown = (await text('#savebar .stat')).includes('Rule violation');
  t.violationInComps = (await text('#sec-comps')).includes('cap rule');

  // Roster tab: reset, role registration and 70 status
  await click('[data-act="tab"][data-val="roster"]');
  await click('[data-act="resetroster"]');
  await click('[data-act="setreg"][data-pi="3"][data-cls="druid"][data-val="healer"]');
  await click('[data-act="lvl"][data-pi="2"][data-cls="hunter"]');
  await click('[data-act="tab"][data-val="build"]');
  const druidChip = await text('#sec-board [data-act="selchip"][data-pi="3"][data-cls="druid"]');
  t.druidMark = druidChip.includes('✚') && !druidChip.includes('⚔');
  t.hunterN70 = (await text('#sec-board [data-act="selchip"][data-pi="2"][data-cls="hunter"]')).includes('70');

  // Comps tab: tier list for 5v5, «Try with the crew» sets the comp on the board.
  // (Runar-hunter is <70 from the previous step → the hunter slot in Hunter Cleave
  // gets covered automatically as random.)
  await click('[data-act="tab"][data-val="meta"]');
  t.metaCount = (await text('#sec-meta .sechead .count')) === '15';
  t.metaTierFirst = (await text('#sec-meta .comp .tier')) === 'S';
  t.metaRules = (await text('#sec-metarules .sechead .count')) === '15';
  t.metaDispel = (await text('#sec-metaeff')).includes('purge');
  await click('[data-act="trycomp"][data-mi="12"]'); // Hunter Cleave
  t.tryCompBoard = (await text('#sec-board .sechead .count')) === '5/5';
  t.tryCompValid = (await text('#savebar .stat')).includes('valid team');
  await click('[data-act="clear"]');

  // Collapse: the board closes and reopens
  await click('#sec-board .sechead');
  t.collapsed = (await page.locator('#sec-board .secbody').count()) === 0;
  await click('#sec-board .sechead');
  t.reopened = (await page.locator('#sec-board .secbody').count()) === 1;

  const failed = Object.entries(t).filter(([, v]) => v !== true).map(([k]) => k);
  console.log(JSON.stringify({ ...t, errors }, null, 2));
  if (failed.length || errors.length) {
    console.error('SMOKE FAIL: ' + failed.join(', '));
    process.exit(1);
  }
  console.log('SMOKE OK');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('SMOKE FAIL: ' + e.message); process.exit(1); });
