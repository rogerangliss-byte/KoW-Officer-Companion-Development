import { chromium } from 'playwright';

const base = 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [];
const passes = [];
const check = (name, condition, detail = '') => {
  if (condition) passes.push(name);
  else failures.push(name + (detail ? ': ' + detail : ''));
};
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.stack || error.message));

try {
  const response = await page.goto(base, { waitUntil: 'domcontentloaded' });
  check('Application page responds successfully', response?.ok());
  await page.waitForFunction(() => document.querySelectorAll('#officerSelect option').length >= 60, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  check('Officer database loads', await page.locator('#officerSelect option').count() === 68,
    'expected 68 officers, got ' + await page.locator('#officerSelect option').count());

  const views = ['dashboard','progress','officer','inventory','stars','development','xp','planner','database','releases','settings','help'];
  for (const view of views) {
    await page.locator('[data-view="' + view + '"]').first().click();
    const active = await page.locator('.view.active').getAttribute('id');
    check('Navigation opens ' + view, active === view, 'active view is ' + active);
  }

  // Saved progress status filters must render without undefined callbacks.
  await page.locator('[data-view="progress"]').click();
  await page.locator('.progressStatusFilter[value="progress"]').uncheck();
  await page.waitForTimeout(100);
  await page.locator('.progressStatusFilter[value="progress"]').check();
  check('Saved progress status filters are interactive', await page.locator('#savedOfficerProgressSummary').count() === 1);

  // Officer selection and published S8 readiness rates.
  await page.locator('[data-view="officer"]').click();
  await page.locator('#officerSelect').selectOption({ label: 'S8 Po' });
  check('S8 Po is selected', await page.locator('#dashOfficer').textContent().then(v => v.trim()) === 'S8 Po');
  check('S8 Po ORV rate is 720', await page.locator('#orvCost').inputValue() === '720');
  check('S8 Po SRV rate is 360', await page.locator('#srvCost').inputValue() === '360');

  // Officer selection and skill controls live on separate views. Always select on Officer, then inspect Development.
  const selectOfficerForSkills = async (name, expectedRarity) => {
    await page.locator('[data-view="officer"]').click();
    const officerSelect = page.locator('#officerSelect');
    const selectionResult = await officerSelect.selectOption({ label: name });
    const selectedValue = await officerSelect.inputValue();
    const selectedText = await officerSelect.locator('option:checked').textContent();
    if (!selectedText || selectedText.trim() !== name) {
      throw new Error('Officer selection mismatch for ' + name +
        '; selected value ' + selectedValue + ', selected text ' + (selectedText || '<none>'));
    }
    await page.evaluate(() => {
      const select = document.querySelector('#officerSelect');
      window.__officerSelectionTrace = [];
      if (select) select.addEventListener('change', () => {
        window.__officerSelectionTrace.push({
          value: select.value,
          optionText: select.options[select.selectedIndex]?.textContent?.trim() ?? null,
          rarity: document.querySelector('#officerRarityValue')?.textContent?.trim() ?? null,
          timestamp: performance.now()
        });
      });
    });
    console.log('Officer selection confirmed:', JSON.stringify({
      officer: name, selectedValue, selectedText: selectedText.trim(), selectionResult
    }));
    await page.waitForFunction(expected => {
      const selected = document.querySelector('#officerSelect option:checked')?.textContent?.trim();
      return selected === expected;
    }, name);
    await page.waitForFunction(expected => {
      const selected = document.querySelector('#officerSelect option:checked')?.textContent?.trim();
      const rarity = document.querySelector('#officerRarityValue')?.textContent?.trim();
      // The select uses the season-qualified display name; the dashboard uses the raw officer name.
      // Do not compare those two different presentation formats.
      return !!selected && rarity === expected;
    }, expectedRarity, { timeout: 10000 });
    await page.locator('[data-view="development"]').click();
    await page.waitForFunction(expected => {
      const grid = document.querySelector('#skillGrid');
      const status = grid?.querySelector('.fifth-skill-status')?.textContent || '';
      return !!grid && grid.querySelectorAll('.skill-strand-row:not(.fifth-skill-status)').length === 4 &&
        (expected === 'Elite' ? /Not available for Elite Officers/.test(status) : /Fifth Skill:/.test(status));
    }, expectedRarity);
    return selectedValue;
  };

  // Confirm Elite does not expose a fifth skill.
  const marjorie = await selectOfficerForSkills('Marjorie', 'Elite');
  if (marjorie !== undefined) {
    const skillRows = await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').count();
    const fifthStatus = await page.locator('#skillGrid .fifth-skill-status').textContent();
    const fifthButtons = await page.locator('#skillGrid .fifth-skill-status button').count();
    check('Elite Marjorie has four primary strands and no fifth skill controls', skillRows === 4 && fifthButtons === 0 && /Fifth Skill: Not available for Elite Officers/i.test(fifthStatus),
      `found ${skillRows} primary rows; fifth status: ${fifthStatus}`);
  } else check('Elite Marjorie is present', false);

  // Verify rarity-specific skill totals, star gates, and fifth-skill unlock behaviour.
  const epic = await selectOfficerForSkills('Evelyn', 'Epic');
  if (epic !== undefined) {
    await page.locator('#skillSequenceNotice').waitFor({ state: 'visible' });
    await page.waitForFunction(() => /Epic Skill Badge progression:\s*440 Officer Badges total/i.test(document.querySelector('#skillSequenceNotice')?.textContent || ''));
    const epicNotice = await page.locator('#skillSequenceNotice').textContent();
    check('Epic skill badge total is 440', /Epic Skill Badge progression:\s*440 Officer Badges total/i.test(epicNotice), epicNotice);
    await page.locator('label.check').filter({ hasText: 'Officer unlocked (10 badges)' }).click();
    const setEpicStars = async value => {
      // Star progress is edited through the Officer Progress modal. #currentStar
      // belongs to the separate Star Planner view and is not visible on Officer.
      await page.locator('[data-view="officer"]').click();
      await page.locator('#quickProgressBtn').click();
      await page.locator('#quickStarLevel').selectOption(String(value));
      await page.locator('#quickProgressSave').click();
      await page.waitForFunction(expected => Number(document.querySelector('#currentStar')?.value) === expected, value);
      await page.locator('[data-view="development"]').click();
    };
    await setEpicStars(0);
    check('Epic skill strand star gates begin at 0 stars', await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').nth(0).locator('button.skill-lvl').first().isEnabled() &&
      !(await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').nth(1).locator('button.skill-lvl').first().isEnabled()));
    await setEpicStars(1);
    check('Epic third skill remains gated below 2 stars', !(await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').nth(2).locator('button.skill-lvl').first().isEnabled()));
    await setEpicStars(2);
    check('Epic fourth skill remains gated below 3 stars', !(await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').nth(3).locator('button.skill-lvl').first().isEnabled()));
    await setEpicStars(3);
    check('Epic fourth skill unlocks at 3 stars', await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').nth(3).locator('button.skill-lvl').first().isEnabled());
    check('Epic fifth skill stays locked before all four skills are complete', /Fifth Skill: LOCKED/.test(await page.locator('#skillGrid .fifth-skill-status').innerText()));
    for (let strand = 0; strand < 4; strand++) {
      await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').nth(strand).locator('button.skill-lvl').nth(9).click();
    }
    check('Epic fifth skill unlocks after all four primary skills reach level 10', /Fifth Skill: UNLOCKED/.test(await page.locator('#skillGrid .fifth-skill-status').innerText()));
  } else check('Epic Evelyn is present', false);

  const legendary = await selectOfficerForSkills('S8 Po', 'Legendary');
  if (legendary !== undefined) {
    check('Legendary skill badge total is 690', /690 Officer Badges total/.test(await page.locator('#skillSequenceNotice').innerText()));
  } else check('Legendary S8 Po is present', false);
  await selectOfficerForSkills('Marjorie', 'Elite');
  check('Elite skill badge total is 340', /340 Officer Badges total/.test(await page.locator('#skillSequenceNotice').innerText()));

  // Independent Officer profiles and shared-resource persistence.
  page.on('dialog', dialog => dialog.accept());
  await page.locator('[data-view="officer"]').click();
  await page.locator('#officerSelect').selectOption({ label: 'S8 Po' });
  await page.locator('[data-view="development"]').click();
  await page.locator('#orvHeld').fill('4321');
  await page.locator('[data-view="officer"]').click();
  await page.locator('#quickProgressBtn').click();
  await page.locator('#quickOfficerLevel').fill('2');
  await page.locator('#quickStarLevel').selectOption('1');
  await page.locator('#quickProgressSave').click();
  await page.waitForTimeout(200);
  check('First Officer profile saves', /Saved/.test(await page.locator('#profileSavedStatus').innerText()));
  await page.locator('#officerSelect').selectOption({ label: 'S8 Sara' });
  check('Shared ORV inventory survives Officer switch', await page.locator('#orvHeld').inputValue() === '4321',
    'expected 4321 ORV after switching, got ' + await page.locator('#orvHeld').inputValue());
  await page.locator('#quickProgressBtn').click();
  await page.locator('#quickOfficerLevel').fill('3');
  await page.locator('#quickStarLevel').selectOption('2');
  await page.locator('#quickProgressSave').click();
  await page.waitForTimeout(200);
  await page.locator('#officerSelect').selectOption({ label: 'S8 Po' });
  check('First Officer profile restores independently', await page.locator('#currentLevel').inputValue() === '2' && await page.locator('#currentStar').inputValue() === '1');
  await page.locator('#officerSelect').selectOption({ label: 'S8 Sara' });
  check('Second Officer profile restores independently', await page.locator('#currentLevel').inputValue() === '3' && await page.locator('#currentStar').inputValue() === '2');

  // Reload must retain both profiles and shared inventory.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#officerSelect option').length === 68);
  await page.waitForTimeout(300);
  check('Selected Officer is restored after page reload', await page.locator('#officerSelect').locator('option:checked').textContent().then(v => v.trim()) === 'S8 Sara');
  check('Second Officer progress survives page reload', await page.locator('#currentLevel').inputValue() === '3' && await page.locator('#currentStar').inputValue() === '2');
  check('Shared ORV inventory survives page reload', await page.locator('#orvHeld').inputValue() === '4321');

  // MAX and Reset must affect only the selected Officer profile, never shared inventory.
  await page.locator('[data-view="officer"]').click();
  await page.locator('#maxOfficerProfile').click();
  await page.waitForTimeout(150);
  check('MAX sets level 70 and five stars', await page.locator('#currentLevel').inputValue() === '70' && await page.locator('#currentStar').inputValue() === '5');
  await page.locator('[data-view="development"]').click();
  check('MAX unlocks Officer and completes four primary skills',
    await page.locator('#unlocked').isChecked() &&
    await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').count() === 4 &&
    await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status) button.skill-lvl.reached').count() === 40);
  check('MAX sets training to 180', await page.locator('#trainingExact').inputValue() === '180');
  check('MAX leaves shared ORV inventory untouched', await page.locator('#orvHeld').inputValue() === '4321');
  await page.locator('[data-view="officer"]').click();
  await page.locator('#resetOfficerProfile').click();
  await page.waitForTimeout(150);
  check('Reset clears only the selected Officer progress', await page.locator('#currentLevel').inputValue() === '1' && await page.locator('#currentStar').inputValue() === '0' && /Not saved yet/i.test(await page.locator('#profileSavedStatus').innerText()));
  check('Reset preserves shared ORV inventory', await page.locator('#orvHeld').inputValue() === '4321');
  await page.locator('#officerSelect').selectOption({ label: 'S8 Po' });
  check('Reset does not damage another Officer profile', await page.locator('#currentLevel').inputValue() === '2' && await page.locator('#currentStar').inputValue() === '1');

  await page.locator('[data-view="progress"]').click();
  await page.waitForTimeout(150);
  check('Saved Officer progress overview lists both profiles',
    await page.locator('#savedOfficerProgressRows tr').count() >= 2,
    'rows=' + await page.locator('#savedOfficerProgressRows tr').count());
  const compareNames = await page.locator('#compareProgressChoices .progressComparePick').count();
  check('Progress comparison offers saved Officers', compareNames >= 2, 'choices=' + compareNames);
  await page.locator('#compareProgressClear').click();
  await page.locator('#compareProgressChoices .progressComparePick').nth(0).check();
  await page.locator('#compareProgressChoices .progressComparePick').nth(1).check();
  await page.locator('#compareProgressRun').click();
  check('Progress comparison renders two selected Officers',
    await page.locator('#compareProgressResults tr').count() === 2,
    'rows=' + await page.locator('#compareProgressResults tr').count());
  check('Progress comparison produces a recommendation',
    (await page.locator('#compareProgressRecommendation').innerText()).trim().length > 0);

  // Inventory save / restore in this isolated browser profile only.
  await page.locator('[data-view="inventory"]').click();
  await page.locator('#invOrv').fill('1234');
  await page.locator('#saveInventory').click();
  await page.waitForTimeout(250);
  check('Inventory save reports success', !/not yet saved/i.test(await page.locator('#inventorySavedStatus').innerText()));
  check('Inventory is persisted locally', await page.evaluate(() => {
    return Object.keys(localStorage).some(k => /inventory/i.test(k));
  }));

  // Star calculator accepts level changes and emits a numeric result.
  await page.locator('[data-view="officer"]').click();
  await page.locator('#officerSelect').selectOption({ label: 'S8 Po' });
  await page.locator('[data-view="stars"]').click();
  await page.locator('#legendaryStarInventory').waitFor({ state: 'visible' });
  await page.locator('#currentStar').selectOption('0');
  await page.locator('#targetStar').selectOption('5');
  await page.locator('#ls1').fill('1');
  await page.locator('#ls2').fill('1');
  await page.locator('#ls3').fill('1');
  await page.waitForTimeout(300);
  const starOutput = await page.locator('#starsRequired').innerText();
  check('Star calculator renders a numeric requirement', /[0-9]/.test(starOutput), starOutput.slice(0, 120));

  // Development skills and training controls.
  await page.locator('[data-view="development"]').click();
  check('Skill strands render', await page.locator('#skillGrid').innerText().then(t => t.trim().length > 0));
  check('Training remains locked until all four primary skills are complete', await page.locator('#trainingExact').isDisabled());

  // XP calculation.
  await page.locator('[data-view="xp"]').click();
  await page.locator('#currentLevel').fill('1');
  await page.locator('#targetLevel').fill('2');
  await page.waitForTimeout(250);
  check('XP requirement is calculated', Number((await page.locator('#xpRequired').innerText()).replace(/[^0-9]/g,'')) > 0,
    'level 1 to 2 should require positive XP; got ' + await page.locator('#xpRequired').innerText());

  // Planner calculation and scenario save.
  await page.locator('[data-view="planner"]').click();
  await page.locator('#scenarioName').fill('Automated regression scenario');
  await page.locator('#calculateScenario').click();
  await page.waitForTimeout(300);
  check('Future target calculation returns content', (await page.locator('#scenarioResult').innerText()).trim().length > 20);
  await page.locator('#saveScenario').click();
  check('Planning scenario can be saved', /Automated regression scenario/.test(await page.locator('#savedScenarioList').innerText()));

  // Multi-Officer Planner: priority allocation, saved-plan round trip and deletion.
  await page.locator('[data-view="planner"]').click();
  // Clear any restored working rows so this test starts from a deterministic state.
  const existingMultiRows = page.locator('#multiPlannerRows tr');
  while (await existingMultiRows.count()) {
    await existingMultiRows.first().locator('[data-remove]').click();
  }
  await page.locator('#multiAddOfficer').click();
  await page.locator('#multiAddOfficer').click();
  const multiRows = page.locator('#multiPlannerRows tr');
  check('Multi-Officer Planner adds two priority rows', await multiRows.count() === 2);
  await multiRows.nth(0).locator('[data-multi-officer]').selectOption({ label: 'S8 Po' });
  await multiRows.nth(0).locator('[data-multi-needed]').fill('1');
  await multiRows.nth(1).locator('[data-multi-officer]').selectOption({ label: 'S8 Sara' });
  await multiRows.nth(1).locator('[data-multi-needed]').fill('1');
  await page.locator('#multiOrv').fill('720');
  await page.locator('#multiUniversal').fill('0');
  await page.locator('#multiChests').fill('0');
  await page.locator('#multiSelectionChests').fill('0');
  await page.locator('#multiChestMode').selectOption('orv');
  await page.waitForTimeout(150);
  check('Multi-Officer Planner allocates shared ORV to first priority only',
    await multiRows.nth(0).locator('[data-multi-status]').innerText() === 'Fully Funded' &&
    await multiRows.nth(1).locator('[data-multi-status]').innerText() === 'Shortfall',
    'statuses=' + JSON.stringify(await multiRows.locator('[data-multi-status]').allInnerTexts()));
  check('Multi-Officer Planner shows one badge allocated to priority one',
    /1 \/ 1/.test(await multiRows.nth(0).locator('[data-multi-allocated]').innerText()),
    await multiRows.nth(0).locator('[data-multi-allocated]').innerText());

  // Priority controls must change allocation order, not just row numbering.
  await multiRows.nth(0).locator('[data-down]').click();
  check('Multi-Officer Planner moves the selected Officer down one priority', 
    await multiRows.nth(0).locator('[data-multi-officer] option:checked').innerText() === 'S8 Sara' &&
    await multiRows.nth(0).locator('[data-multi-status]').innerText() === 'Fully Funded' &&
    await multiRows.nth(1).locator('[data-multi-status]').innerText() === 'Shortfall');
  await multiRows.nth(1).locator('[data-up]').click();
  check('Multi-Officer Planner restores the original priority order',
    await multiRows.nth(0).locator('[data-multi-officer] option:checked').innerText() === 'S8 Po' &&
    await multiRows.nth(0).locator('[data-multi-status]').innerText() === 'Fully Funded');

  await page.locator('#multiPlanName').fill('QA Multi Officer Plan');
  await page.locator('#multiSavePlan').click();
  check('Multi-Officer Planner saves named plan',
    /QA Multi Officer Plan/.test(await page.locator('#multiSavedPlans').innerText()) &&
    await page.evaluate(() => !!JSON.parse(localStorage.getItem('kow_multi_plans_v430') || '{}')['QA Multi Officer Plan']));
  await page.locator('#multiOrv').fill('0');
  await page.locator('#multiSavedPlans').selectOption({ label: 'QA Multi Officer Plan' });
  check('Multi-Officer Planner restores saved resources and officer rows',
    await page.locator('#multiOrv').inputValue() === '720' && await page.locator('#multiPlannerRows tr').count() === 2);
  await page.locator('#multiDeletePlan').click();
  check('Multi-Officer Planner deletes saved plan',
    !/QA Multi Officer Plan/.test(await page.locator('#multiSavedPlans').innerText()) &&
    !(await page.evaluate(() => !!JSON.parse(localStorage.getItem('kow_multi_plans_v430') || '{}')['QA Multi Officer Plan'])));

  // Multi-Officer Planner edge cases: exact thresholds, held badges and chest strategies.
  const resetMultiCase = async (officerName, needed, resources = {}) => {
    while (await page.locator('#multiPlannerRows tr').count()) {
      await page.locator('#multiPlannerRows tr').first().locator('[data-remove]').click();
    }
    await page.locator('#multiAddOfficer').click();
    const row = page.locator('#multiPlannerRows tr').first();
    await row.locator('[data-multi-officer]').selectOption({ label: officerName });
    await row.locator('[data-multi-needed]').fill(String(needed));
    await page.locator('#multiOrv').fill(String(resources.orv ?? 0));
    await page.locator('#multiUniversal').fill(String(resources.universal ?? 0));
    await page.locator('#multiChests').fill(String(resources.chests ?? 0));
    await page.locator('#multiSelectionChests').fill(String(resources.selection ?? 0));
    await page.locator('#multiChestMode').selectOption(resources.mode ?? 'optimise');
    await page.waitForTimeout(100);
    return row;
  };
  await page.evaluate(() => localStorage.removeItem('kow_central_inventory_v1'));
  let edgeRow = await resetMultiCase('S8 Po', 1, { orv: 720, mode: 'orv' });
  check('Multi-Officer Planner funds exactly one badge at the 720 ORV threshold',
    await edgeRow.locator('[data-multi-status]').innerText() === 'Fully Funded' &&
    await edgeRow.locator('[data-multi-allocated]').innerText() === '1 / 1');
  edgeRow = await resetMultiCase('S8 Po', 1, { orv: 719, mode: 'orv' });
  check('Multi-Officer Planner does not round 719 ORV up to a badge',
    await edgeRow.locator('[data-multi-status]').innerText() === 'Shortfall' &&
    await edgeRow.locator('[data-multi-allocated]').innerText() === '0 / 1');
  await page.evaluate(() => localStorage.setItem('kow_central_inventory_v1',
    JSON.stringify({ officerBadges: { 'S8 Po': 1 } })));
  edgeRow = await resetMultiCase('S8 Po', 2, { orv: 720, mode: 'orv' });
  check('Multi-Officer Planner applies individual held badges before shared ORV',
    await edgeRow.locator('[data-multi-held]').innerText() === '1' &&
    await edgeRow.locator('[data-multi-allocated]').innerText() === '1 / 1' &&
    await edgeRow.locator('[data-multi-status]').innerText() === 'Fully Funded');
  await page.evaluate(() => localStorage.removeItem('kow_central_inventory_v1'));
  edgeRow = await resetMultiCase('S8 Po', 1, { universal: 1, mode: 'badge' });
  check('Multi-Officer Planner uses a Universal Badge when no ORV is available',
    await edgeRow.locator('[data-multi-allocated]').innerText() === '1 / 1' &&
    await edgeRow.locator('[data-multi-status]').innerText() === 'Fully Funded');
  edgeRow = await resetMultiCase('S8 Po', 1, { chests: 1, mode: 'orv' });
  check('Multi-Officer Planner converts one Legendary Badge Chest at the current ORV rate',
    await edgeRow.locator('[data-multi-allocated]').innerText() === '1 / 1' &&
    await edgeRow.locator('[data-multi-status]').innerText() === 'Fully Funded');
  edgeRow = await resetMultiCase('S8 Po', 1, { chests: 1, mode: 'optimise' });
  check('Multi-Officer Planner keeps Badge Chests as Universal Badges when coverage ties',
    /Optimised: use Badge Chests as Universal Badges/.test(await page.locator('#multiPlannerSummary').innerText()) &&
    await edgeRow.locator('[data-multi-status]').innerText() === 'Fully Funded');
  edgeRow = await resetMultiCase('Katherine', 1, { selection: 1, mode: 'badge' });
  check('Multi-Officer Planner applies an eligible Officer Selection Chest to its Officer',
    await edgeRow.locator('[data-multi-allocated]').innerText() === '1 / 1' &&
    await edgeRow.locator('[data-multi-status]').innerText() === 'Fully Funded');
  await page.evaluate(() => localStorage.removeItem('kow_central_inventory_v1'));
  // Mixed-resource allocation audit: individual badges, Officer-specific Selection
  // Chests, ORV and Universal Badges must each be consumed once and in the right order.
  const clearMixedPlannerRows = async () => {
    while (await page.locator('#multiPlannerRows tr').count()) {
      await page.locator('#multiPlannerRows tr').first().locator('[data-remove]').click();
    }
  };
  const addMixedPlannerRow = async (name, needed) => {
    const rowIndex = await page.locator('#multiPlannerRows tr').count();
    await page.locator('#multiAddOfficer').click();
    const row = page.locator('#multiPlannerRows tr').nth(rowIndex);
    await row.locator('[data-multi-officer]').selectOption({ label: name });
    await row.locator('[data-multi-needed]').fill(String(needed));
    return row;
  };
  await page.evaluate(() => localStorage.setItem('kow_central_inventory_v1',
    JSON.stringify({ officerBadges: { 'S8 Po': 1 } })));
  await clearMixedPlannerRows();
  const mixedPo = await addMixedPlannerRow('S8 Po', 2);
  const mixedKatherine = await addMixedPlannerRow('Katherine', 2);
  const mixedSara = await addMixedPlannerRow('S8 Sara', 1);
  await page.locator('#multiOrv').fill('720');
  await page.locator('#multiUniversal').fill('2');
  await page.locator('#multiChests').fill('0');
  await page.locator('#multiSelectionChests').fill('1');
  await page.locator('#multiChestMode').selectOption('badge');
  await page.waitForTimeout(120);
  check('Mixed allocation applies the individual Officer Badge before shared resources',
    await mixedPo.locator('[data-multi-held]').innerText() === '1' &&
    await mixedPo.locator('[data-multi-allocated]').innerText() === '1 / 1' &&
    await mixedPo.locator('[data-multi-status]').innerText() === 'Fully Funded',
    'held=' + await mixedPo.locator('[data-multi-held]').innerText() +
    '; allocated=' + await mixedPo.locator('[data-multi-allocated]').innerText() +
    '; status=' + await mixedPo.locator('[data-multi-status]').innerText());
  check('Mixed allocation reserves the Selection Chest for its named eligible Officer',
    await mixedKatherine.locator('[data-multi-allocated]').innerText() === '2 / 2' &&
    await mixedKatherine.locator('[data-multi-status]').innerText() === 'Fully Funded',
    'allocated=' + await mixedKatherine.locator('[data-multi-allocated]').innerText() +
    '; status=' + await mixedKatherine.locator('[data-multi-status]').innerText());
  check('Mixed allocation consumes each shared resource once across all priority rows',
    await mixedSara.locator('[data-multi-allocated]').innerText() === '1 / 1' &&
    await mixedSara.locator('[data-multi-status]').innerText() === 'Fully Funded' &&
    /5 of 5 required badge equivalents covered: 1 Individual Officer Badges held \+ 4 shared badges allocated/.test(await page.locator('#multiPlannerSummary').innerText()) &&
    /0 ORV · 0 Universal Badges · 0 Selection Chests/.test(await page.locator('#multiPlannerSummary').innerText()),
    await page.locator('#multiPlannerSummary').innerText());

  // Universal Badges must cover an eligible Officer's residual need after ORV.
  await clearMixedPlannerRows();
  const mixedTopUp = await addMixedPlannerRow('S8 Sara', 2);
  await page.locator('#multiOrv').fill('720');
  await page.locator('#multiUniversal').fill('1');
  await page.locator('#multiChests').fill('0');
  await page.locator('#multiSelectionChests').fill('0');
  await page.locator('#multiChestMode').selectOption('badge');
  await page.waitForTimeout(100);
  check('Universal Badge tops up the remaining eligible-Officer shortfall after ORV',
    await mixedTopUp.locator('[data-multi-allocated]').innerText() === '2 / 2' &&
    await mixedTopUp.locator('[data-multi-status]').innerText() === 'Fully Funded');

  // The automatic chest strategy must compare whole-badge coverage, not just
  // the nominal ORV value: 720 ORV funds two S7 Code badges at 346 each.
  await clearMixedPlannerRows();
  const chestOptimise = await addMixedPlannerRow('S7 Code', 2);
  await page.locator('#multiOrv').fill('0');
  await page.locator('#multiUniversal').fill('0');
  await page.locator('#multiChests').fill('1');
  await page.locator('#multiSelectionChests').fill('0');
  await page.locator('#multiChestMode').selectOption('optimise');
  await page.waitForTimeout(100);
  check('Automatic chest strategy converts to ORV when it funds more whole badges',
    await chestOptimise.locator('[data-multi-allocated]').innerText() === '2 / 2' &&
    /Optimised: convert Badge Chests to ORV/.test(await page.locator('#multiPlannerSummary').innerText()),
    await page.locator('#multiPlannerSummary').innerText());
  await page.evaluate(() => localStorage.removeItem('kow_central_inventory_v1'));


  // Advanced Multi-Officer Planning: saved progress and future release placeholders.
  // The season selector must follow the actual officer dataset, including newly added seasons.
  const seasonOptions = await page.locator('#kowPlannerSeasonFilter option').allTextContents();
  check('Advanced Planner season filter includes current S8 data',
    seasonOptions.some(v => v.trim() === 'S8'),
    'options=' + seasonOptions.join(', '));
  check('Advanced Planner season filter retains Original as a separate category',
    seasonOptions.some(v => v.trim() === 'Original'),
    'options=' + seasonOptions.join(', '));
  await page.locator('#kowPlannerSession').selectOption('saved');
  await page.locator('#kowPlannerSeasonFilter').selectOption('all');
  await page.locator('#kowFutureOfficerType').selectOption('auto');
  await page.locator('#advancedMultiOfficerPlanning button[onclick="kowRunAdvancedPlanner()"]').click();
  await page.waitForTimeout(150);
  check('Advanced Planner analyses saved Officer progress',
    (await page.locator('#kowAdvancedPlannerResults tbody tr').count()) >= 1,
    (await page.locator('#kowAdvancedPlannerSummary').innerText()).slice(0, 220));

  // Advanced Planner mixed-progress audit. Use isolated saved profiles so the
  // result is deterministic and exercises partially completed skill strands.
  const plannerFixture = await page.evaluate(() => {
    const key = 'kow_officer_profiles_v435';
    const previous = localStorage.getItem(key);
    const skills = count => Array.from({ length: 36 }, (_, i) => i < count);
    const profiles = {
      'S8|S8 Po': {
        unlocked: true, skills: skills(20), training: 0,
        currentStar: 2, currentLevel: 30, badgeHeld: 0, savedAt: '2026-11-16T00:00:00.000Z'
      },
      'S8|S8 Sara': {
        unlocked: true, skills: skills(8), training: 0,
        currentStar: 1, currentLevel: 15, badgeHeld: 0, savedAt: '2026-11-16T00:00:00.000Z'
      }
    };
    localStorage.setItem(key, JSON.stringify(profiles));
    return previous;
  });
  await page.locator('#kowPlannerSeasonFilter').selectOption('S8');
  await page.locator('#kowPlannerSession').selectOption('saved');
  await page.locator('#kowFutureOfficerType').selectOption('auto');
  await page.locator('#kowPlannerIncludeNotStarted').uncheck();
  await page.locator('#kowPlannerIncludeOriginals').uncheck();
  const setAdvancedPlannerInventory = async ({ orv = 0, universal = 0, badgeChests = 0, selection = 0 }) => {
    await page.evaluate(values => {
      const fields = {
        orvHeld: values.orv,
        universalBadgeHeld: values.universal,
        legendaryBadgeChestHeld: values.badgeChests,
        legendarySelectionChestHeld: values.selection
      };
      Object.entries(fields).forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (!input) throw new Error('Missing inventory input: ' + id);
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }, { orv, universal, badgeChests, selection });
  };
  await setAdvancedPlannerInventory({ orv: 719 });
  await page.locator('#advancedMultiOfficerPlanning button[onclick="kowRunAdvancedPlanner()"]').click();
  await page.waitForTimeout(100);
  let plannerRows = page.locator('#kowAdvancedPlannerResults tbody tr');
  let plannerCells = await plannerRows.evaluateAll(rows => rows.map(row =>
    Array.from(row.querySelectorAll('td')).map(cell => cell.innerText.trim())));
  check('Advanced Planner isolates saved S8 Officers for mixed-progress analysis',
    plannerCells.length === 2 && plannerCells.every(row => /S8 Po|S8 Sara/.test(row[1])),
    JSON.stringify(plannerCells));
  check('Advanced Planner ranks the more-developed partially skilled Officer first',
    plannerCells[0]?.[1] === 'S8 Po' && plannerCells[0]?.[3].includes('IN PROGRESS'),
    JSON.stringify(plannerCells.slice(0, 2)));
  check('Advanced Planner recognises partial skill development without marking either Officer MAXED',
    plannerCells.length === 2 && plannerCells.every(row => row[3].includes('IN PROGRESS')),
    JSON.stringify(plannerCells.map(row => row[3])));
  check('Advanced Planner identifies the sub-threshold ORV shortage in its inventory snapshot',
    /ORV 719/.test(await page.locator('#kowAdvancedPlannerResults').innerText()));
  check('Advanced Planner gives the no-funded-ORV recommendation below the 720 threshold',
    plannerCells.every(row => row[4].includes('Use Officer-specific badges first.')),
    JSON.stringify(plannerCells.map(row => row[4])));
  await setAdvancedPlannerInventory({ orv: 720 });
  await page.locator('#advancedMultiOfficerPlanning button[onclick="kowRunAdvancedPlanner()"]').click();
  plannerRows = page.locator('#kowAdvancedPlannerResults tbody tr');
  plannerCells = await plannerRows.evaluateAll(rows => rows.map(row =>
    Array.from(row.querySelectorAll('td')).map(cell => cell.innerText.trim())));
  check('Advanced Planner changes its recommendation when ORV reaches exactly one badge',
    plannerCells.every(row => row[4].includes('then ORV where eligible')),
    JSON.stringify(plannerCells.map(row => row[4])));
  await setAdvancedPlannerInventory({ universal: 1 });
  await page.locator('#advancedMultiOfficerPlanning button[onclick="kowRunAdvancedPlanner()"]').click();
  check('Advanced Planner reports shared Universal Badge inventory separately from ORV',
    /ORV 0/.test(await page.locator('#kowAdvancedPlannerResults').innerText()) &&
    /Universal Badges 1/.test(await page.locator('#kowAdvancedPlannerResults').innerText()));
  await page.evaluate(previous => {
    const key = 'kow_officer_profiles_v435';
    if (previous === null) localStorage.removeItem(key);
    else localStorage.setItem(key, previous);
  }, plannerFixture);
  await page.locator('#kowPlannerSession').selectOption('january');
  await page.locator('#advancedMultiOfficerPlanning button[onclick="kowRunAdvancedPlanner()"]').click();
  check('Advanced Planner projects January as S8 Infantry',
    /S8 Infantry/.test(await page.locator('#kowAdvancedPlannerSummary').innerText()) &&
    /S8 Infantry/.test(await page.locator('#kowAdvancedPlannerResults').innerText()));
  await page.locator('#kowPlannerSession').selectOption('october');
  await page.locator('#advancedMultiOfficerPlanning button[onclick="kowRunAdvancedPlanner()"]').click();
  check('Advanced Planner projects October as S9 Rally and Garrison',
    /S9 Rally/.test(await page.locator('#kowAdvancedPlannerResults').innerText()) &&
    /S9 Garrison/.test(await page.locator('#kowAdvancedPlannerResults').innerText()));

  // Future release forecast: verify the published S8 baseline and one-release growth.
  await page.locator('[data-view="releases"]').click();
  await page.locator('#forecastRelease').selectOption('1');
  await page.locator('#forecastGrowth').fill('20');
  await page.waitForTimeout(250);
  check('January forecast compounds 20% from 720 ORV / 360 SRV baseline',
    await page.locator('#forecastOrvPerBadge').innerText() === '864' &&
    await page.locator('#forecastSrvPerStar').innerText() === '432',
    'forecast=' + await page.locator('#forecastOrvPerBadge').innerText() + ' ORV / ' + await page.locator('#forecastSrvPerStar').innerText() + ' SRV');
  await page.locator('#forecastGrowth').fill('0');
  await page.waitForTimeout(200);
  check('Zero-growth forecast retains confirmed 720 ORV / 360 SRV baseline',
    await page.locator('#forecastOrvPerBadge').innerText() === '720' &&
    await page.locator('#forecastSrvPerStar').innerText() === '360');

  // Database and release forecast.
  await page.locator('[data-view="database"]').click();
  check('Officer database table renders all records', await page.locator('#dbRows tr').count() === 68);
  check('Officer database validation reports clean data', !/error|invalid|duplicate/i.test(await page.locator('#dbValidation').innerText()));
  await page.locator('[data-view="releases"]').click();
  await page.waitForTimeout(300);
  check('Release forecast renders ORV and SRV values',
    (await page.locator('#forecastOrvPerBadge').innerText()).trim().length > 0 &&
    (await page.locator('#forecastSrvPerStar').innerText()).trim().length > 0);

  // Local UI preferences.
  await page.locator('[data-view="settings"]').click();
  await page.locator('#appName').fill('REGRESSION TEST');
  await page.locator('#appName').dispatchEvent('change');
  check('Settings app-name control is interactive', await page.locator('#appName').inputValue() === 'REGRESSION TEST');

  check('No uncaught browser JavaScript exceptions', pageErrors.length === 0, pageErrors.join(' | '));
} catch (error) {
  let diagnostic = {};
  try {
    diagnostic = await page.evaluate(() => {
      const select = document.querySelector('#officerSelect');
      const option = select?.options?.[select.selectedIndex];
      const index = Number(select?.value);
      const published = window.KOW_PUBLISHED_OFFICERS || [];
      return {
        selectedValue: select?.value ?? null,
        selectedOptionText: option?.textContent?.trim() ?? null,
        optionsContainingMarjorie: [...(select?.options || [])].filter(o => /marjorie/i.test(o.textContent)).map(o => ({value:o.value,text:o.textContent.trim()})),
        optionCount: select?.options?.length ?? null,
        selectionChangeTrace: window.__officerSelectionTrace || [],
        selectedOptionHtml: option?.outerHTML ?? null,
        publishedOfficerAtIndex: Number.isInteger(index) ? published[index] ?? null : null,
        displayedRarity: document.querySelector('#officerRarityValue')?.textContent?.trim() ?? null,
        displayedSeason: document.querySelector('#officerSeasonValue')?.textContent?.trim() ?? null,
        dashboardOfficer: document.querySelector('#dashOfficer')?.textContent?.trim() ?? null,
        activeView: document.querySelector('.view.active')?.id ?? null,
        filterValues: {
          search: document.querySelector('#officerSearch')?.value ?? null,
          season: document.querySelector('#officerSeasonFilter')?.value ?? null,
          rarity: document.querySelector('#officerRarityFilter')?.value ?? null,
          role: document.querySelector('#officerRoleFilter')?.value ?? null
        }
      };
    });
  } catch (diagnosticError) {
    diagnostic = { diagnosticReadError: diagnosticError.message };
  }
  failures.push('Test execution stopped: ' + error.message +
    ' | selection diagnostic: ' + JSON.stringify(diagnostic) +
    ' | browser errors: ' + pageErrors.join(' || '));
} finally {
  console.log('Application regression smoke test');
  console.log('=================================');
  for (const name of passes) console.log('PASS  ' + name);
  for (const name of failures) console.log('FAIL  ' + name);
  console.log('\nResult: ' + passes.length + ' passed; ' + failures.length + ' failed.');
  await browser.close();
}
if (failures.length) process.exit(1);
