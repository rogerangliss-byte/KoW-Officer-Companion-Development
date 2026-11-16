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

  // Full single-Officer calculator audit. Preserve and restore the pre-test profile/resource snapshots.
  const singleOfficerAuditState = await page.evaluate(() => ({
    profiles: localStorage.getItem('kow_officer_profiles_v435'),
    resources: localStorage.getItem('kow_global_resources_v435')
  }));
  await page.locator('[data-view="officer"]').click();
  await page.locator('#officerSelect').selectOption({ label: 'S8 Po' });
  await page.locator('[data-view="stars"]').click();
  await page.locator('#currentStar').selectOption('5');
  await page.locator('#targetStar').selectOption('5');
  await page.locator('[data-view="development"]').click();
  await page.locator('#unlocked').check();
  await page.waitForTimeout(100);
  for (let strand = 0; strand < 4; strand++) {
    await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').nth(strand).locator('button.skill-lvl').first().click();
  }
  await page.locator('#badgeHeld').fill('0');
  await page.waitForTimeout(100);
  check('Single-Officer unlock adds exactly 10 badges to the requirement', await page.locator('#badgesUsed').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 10));
  check('Single-Officer training is locked until all four primary skills are complete', await page.locator('#trainingExact').isDisabled());

  // Skill costs are consumed incrementally across the whole tree, not restarted per strand.
  await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').nth(0).locator('button.skill-lvl').nth(1).click();
  await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').nth(1).locator('button.skill-lvl').nth(1).click();
  await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').nth(0).locator('button.skill-lvl').nth(2).click();
  await page.waitForTimeout(100);
  check('Single-Officer skill badge spend follows the global incremental sequence across strands',
    await page.locator('#badgesUsed').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 14),
    'expected 14 badges used including unlock; got ' + await page.locator('#badgesUsed').innerText());
  check('Single-Officer next skill cost advances globally after cross-strand upgrades',
    /Next cost: 2 Officer Badges/.test(await page.locator('#nextSkillCostSummary').innerText()),
    await page.locator('#nextSkillCostSummary').innerText());

  // Completing all four strands must unlock training and total exactly 690 Legendary skill badges.
  for (let strand = 0; strand < 4; strand++) {
    await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').nth(strand).locator('button.skill-lvl').nth(9).click();
  }
  await page.waitForFunction(() => !document.querySelector('#trainingExact')?.disabled);
  check('Single-Officer training unlocks only after all four skills reach level 10',
    await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status) button.skill-lvl.reached').count() === 40 &&
    /Fifth Skill: UNLOCKED/.test(await page.locator('#skillGrid .fifth-skill-status').innerText()));
  check('Single-Officer Legendary primary skill cost totals exactly 690',
    await page.locator('#badgesUsed').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 700),
    'expected 690 skill badges plus 10 unlock badges; got ' + await page.locator('#badgesUsed').innerText());
  await page.locator('#trainingExact').fill('1');
  check('Single-Officer first Legendary training level costs 5 badges',
    await page.locator('#badgesUsed').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 705));
  await page.locator('#trainingExact').fill('180');
  await page.waitForTimeout(100);
  check('Single-Officer MAX training reaches the exact 1,600 badge total',
    await page.locator('#badgesUsed').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 1600) &&
    await page.locator('#badgesRequired').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 0),
    'used=' + await page.locator('#badgesUsed').innerText() + ', required=' + await page.locator('#badgesRequired').innerText());

  // Verify whole-badge ORV handling, individual and universal badges, and mutually exclusive chest use.
  // Keep the Officer MAXED here: resource availability is calculated independently of remaining need.
  await page.locator('#badgeHeld').fill('1');
  await page.locator('#universalBadgeHeld').fill('1');
  await page.locator('#legendaryBadgeChestHeld').fill('1');
  await page.locator('#legendaryBadgeChestMode').selectOption('orv');
  await page.locator('#legendarySelectionChestHeld').fill('1');
  await page.locator('#orvHeld').fill('719');
  await page.waitForTimeout(100);
  check('Single-Officer chest converts at the current 720 ORV rate',
    await page.locator('#selectionChestOrvGenerated').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 720));
  check('Single-Officer ORV counts only whole badges and preserves the 719 remainder',
    await page.locator('#badgesFromOrv').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 1) &&
    await page.locator('#orvRemainder').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 719));
  check('Single-Officer excludes the Original-only Selection Chest from ineligible S8 Po',
    await page.locator('#universalBadgesAvailable').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 1));
  await page.locator('#legendaryBadgeChestMode').selectOption('badge');
  await page.waitForTimeout(100);
  check('Single-Officer badge chest is counted once and not also converted to ORV',
    await page.locator('#selectionChestOrvGenerated').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 0) &&
    await page.locator('#universalBadgesAvailable').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 2));
  await page.locator('[data-view="officer"]').click();
  await page.locator('#officerSelect').selectOption({ label: 'Katherine' });
  await page.locator('[data-view="development"]').click();
  await page.waitForTimeout(100);
  check('Single-Officer applies the Selection Chest to a specifically eligible Original Officer',
    await page.locator('#universalBadgesAvailable').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 3));

  // Legendary SRV converts only in whole 360-SRV Exclusive Star units.
  await page.locator('[data-view="officer"]').click();
  await page.locator('#officerSelect').selectOption({ label: 'S8 Po' });
  await page.locator('[data-view="stars"]').click();
  await page.locator('#currentStar').selectOption('0');
  await page.locator('#targetStar').selectOption('5');
  await page.locator('#ls1').fill('1');
  await page.locator('#ls2').fill('1');
  await page.locator('#ls3').fill('1');
  await page.locator('#srvHeld').fill('360');
  await page.waitForTimeout(100);
  check('Single-Officer SRV converts one complete 360-SRV Exclusive Star into 110 Officer Stars',
    await page.locator('#exclusiveFromSrv').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 1) &&
    await page.locator('#officerStarsFromSrv').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 110) &&
    await page.locator('#srvRemainder').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 0));
  check('Single-Officer Star calculator combines Star Books and SRV before calculating the remaining target',
    await page.locator('#starsHeld').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 1600) &&
    await page.locator('#starsRequired').innerText().then(v => Number(v.replace(/[^0-9]/g,'')) === 96400));

  // XP books, shortfall and level-70 cap.
  await page.locator('[data-view="xp"]').click();
  await page.locator('#currentLevel').fill('1');
  await page.locator('#targetLevel').fill('2');
  await page.locator('#xp1000').fill('1');
  await page.waitForTimeout(100);
  const xpNeed = Number((await page.locator('#xpRequired').innerText()).replace(/[^0-9]/g,''));
  const xpGap = Number((await page.locator('#xpShortfall').innerText()).replace(/[^0-9]/g,''));
  check('Single-Officer XP Books are included in held XP and reduce the exact shortfall',
    Number((await page.locator('#xpHeld').innerText()).replace(/[^0-9]/g,'')) === 1000 &&
    xpNeed > 1000 && xpGap === xpNeed - 1000,
    'required=' + xpNeed + ', shortfall=' + xpGap);
  await page.locator('#currentLevel').fill('70');
  await page.locator('#targetLevel').fill('70');
  await page.waitForTimeout(100);
  check('Single-Officer level 70 has no further XP requirement',
    Number((await page.locator('#xpRequired').innerText()).replace(/[^0-9]/g,'')) === 0 &&
    Number((await page.locator('#xpShortfall').innerText()).replace(/[^0-9]/g,'')) === 0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#officerSelect option').length === 68);
  await page.waitForTimeout(350);
  await page.evaluate(state => {
    if (state.profiles === null) localStorage.removeItem('kow_officer_profiles_v435');
    else localStorage.setItem('kow_officer_profiles_v435', state.profiles);
    if (state.resources === null) localStorage.removeItem('kow_global_resources_v435');
    else localStorage.setItem('kow_global_resources_v435', state.resources);
  }, singleOfficerAuditState);
  check('Single-Officer audit restores the original saved profile and resource fixtures',
    await page.evaluate(state => localStorage.getItem('kow_officer_profiles_v435') === state.profiles &&
      localStorage.getItem('kow_global_resources_v435') === state.resources, singleOfficerAuditState));

  // Planner calculation and scenario save.
  await page.locator('[data-view="planner"]').click();
  await page.locator('#scenarioName').fill('Automated regression scenario');
  await page.locator('#calculateScenario').click();
  await page.waitForTimeout(300);
  check('Future target calculation returns content', (await page.locator('#scenarioResult').innerText()).trim().length > 20);
  await page.locator('#saveScenario').click();
  check('Planning scenario can be saved', /Automated regression scenario/.test(await page.locator('#savedScenarioList').innerText()));

  // Saved scenario / readiness dashboard snapshot isolation and lifecycle audit.
  const scenarioFixture = await page.evaluate(() => ({
    scenarios: localStorage.getItem('kow_v4359_planning_scenarios'),
    inventory: localStorage.getItem('kow_central_inventory_v1')
  }));
  const scenarioInventory = {
    invOrv: 1728, invSrv: 432, invUniversalLegendary: 2,
    invLegendaryBadgeChests: 1, invLegendarySelectionChests: 3,
    invLegStar1: 10, invLegStar2: 2, invLegStar3: 1,
    invXp100: 0, invXp500: 0, invXp1000: 0, invXp5000: 0,
    invXp10000: 0, invXp20000: 0, invXp50000: 0,
    savedAt: '2026-11-16T12:00:00.000Z'
  };
  await page.evaluate(inventory => {
    localStorage.setItem('kow_v4359_planning_scenarios', '[]');
    localStorage.setItem('kow_central_inventory_v1', JSON.stringify(inventory));
  }, scenarioInventory);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-view="planner"]').click();
  await page.locator('#scenarioSession').selectOption('next');
  await page.locator('#scenarioOfficerCount').selectOption('1');
  await page.locator('#scenarioName').fill('Snapshot Alpha');
  await page.locator('#scenarioYear').fill('2027');
  await page.locator('#calculateScenario').click();
  await page.locator('#saveScenario').click();
  await page.waitForFunction(() => document.querySelector('#v440PlanningReadiness')?.innerText.includes('Snapshot Alpha'));
  let savedScenarios = await page.evaluate(() => JSON.parse(localStorage.getItem('kow_v4359_planning_scenarios') || '[]'));
  check('Saved scenario records the inventory snapshot used at calculation time',
    savedScenarios.length === 1 && savedScenarios[0].held.orv === 1728 &&
    savedScenarios[0].held.badges === 5 && savedScenarios[0].held.selectionChests === 3,
    JSON.stringify(savedScenarios[0]?.held));
  check('Scenario snapshot excludes Officer-specific Selection Chests from shared badge readiness',
    savedScenarios.length === 1 && savedScenarios[0].held.badges === 5 &&
    savedScenarios[0].held.badgeParts.selectionChests === 3,
    JSON.stringify(savedScenarios[0]?.held));
  check('Readiness dashboard renders the saved scenario',
    /Snapshot Alpha/.test(await page.locator('#v440PlanningReadiness').innerText()),
    (await page.locator('#v440PlanningReadiness').innerText()).slice(0, 300));
  await page.evaluate(() => {
    const inventory = {
      invOrv: 0, invSrv: 0, invUniversalLegendary: 0,
      invLegendaryBadgeChests: 0, invLegendarySelectionChests: 0,
      invLegStar1: 0, invLegStar2: 0, invLegStar3: 0,
      invXp100: 0, invXp500: 0, invXp1000: 0, invXp5000: 0,
      invXp10000: 0, invXp20000: 0, invXp50000: 0,
      savedAt: '2026-11-16T13:00:00.000Z'
    };
    localStorage.setItem('kow_central_inventory_v1', JSON.stringify(inventory));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-view="planner"]').click();
  const alphaAfterInventoryChange = await page.locator('#savedScenarioList').innerText();
  check('Changing current Inventory does not overwrite the saved scenario snapshot',
    /ORV badge equivalents: 2/.test(alphaAfterInventoryChange) &&
    /Shared Officer Badges held: 5/.test(alphaAfterInventoryChange),
    alphaAfterInventoryChange.slice(0, 500));
  check('Readiness dashboard continues to use the saved snapshot after Inventory changes',
    /Snapshot Alpha/.test(await page.locator('#v440PlanningReadiness').innerText()) &&
    /0%/.test(await page.locator('#v440PlanningReadiness').innerText()),
    (await page.locator('#v440PlanningReadiness').innerText()).slice(0, 350));
  await page.locator('[data-load-scenario="0"]').click();
  check('Loading a saved scenario restores its session, year and name without mutating the saved record',
    await page.locator('#scenarioSession').inputValue() === 'next' &&
    await page.locator('#scenarioYear').inputValue() === '2027' &&
    await page.locator('#scenarioName').inputValue() === 'Snapshot Alpha' &&
    (await page.evaluate(() => JSON.parse(localStorage.getItem('kow_v4359_planning_scenarios') || '[]'))).length === 1);
  await page.locator('#scenarioName').fill('Snapshot Beta');
  await page.locator('#calculateScenario').click();
  await page.locator('#saveScenario').click();
  await page.waitForFunction(() => {
    const text = document.querySelector('#v440PlanningReadiness')?.innerText || '';
    return text.includes('Snapshot Alpha') && text.includes('Snapshot Beta');
  });
  savedScenarios = await page.evaluate(() => JSON.parse(localStorage.getItem('kow_v4359_planning_scenarios') || '[]'));
  check('Saving a recalculated scenario creates a separate saved record, preserving the original',
    savedScenarios.length === 2 && savedScenarios[0].name === 'Snapshot Beta' &&
    savedScenarios[1].name === 'Snapshot Alpha' && savedScenarios[1].held.badges === 5,
    JSON.stringify(savedScenarios.map(s => ({name:s.name,badges:s.held.badges}))));
  check('Readiness dashboard includes both saved scenarios independently',
    /Snapshot Alpha/.test(await page.locator('#v440PlanningReadiness').innerText()) &&
    /Snapshot Beta/.test(await page.locator('#v440PlanningReadiness').innerText()) &&
    /Saved targets/.test(await page.locator('#v440PlanningReadiness').innerText()),
    (await page.locator('#v440PlanningReadiness').innerText()).slice(0, 450));
  await page.locator('[data-delete-scenario="0"]').click();
  await page.waitForFunction(() => {
    const text = document.querySelector('#v440PlanningReadiness')?.innerText || '';
    return text.includes('Snapshot Alpha') && !text.includes('Snapshot Beta');
  });
  const afterScenarioDelete = await page.evaluate(() => JSON.parse(localStorage.getItem('kow_v4359_planning_scenarios') || '[]'));
  check('Deleting one scenario preserves the other scenario and its original snapshot',
    afterScenarioDelete.length === 1 && afterScenarioDelete[0].name === 'Snapshot Alpha' &&
    afterScenarioDelete[0].held.badges === 5 && afterScenarioDelete[0].held.orv === 1728,
    JSON.stringify(afterScenarioDelete.map(s => ({name:s.name,badges:s.held.badges,orv:s.held.orv}))));
  check('Readiness dashboard removes only the deleted scenario',
    /Snapshot Alpha/.test(await page.locator('#v440PlanningReadiness').innerText()) &&
    !/Snapshot Beta/.test(await page.locator('#v440PlanningReadiness').innerText()),
    (await page.locator('#v440PlanningReadiness').innerText()).slice(0, 350));
  await page.evaluate(({ scenarios, inventory }) => {
    const restore = (key, value) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
    restore('kow_v4359_planning_scenarios', scenarios);
    restore('kow_central_inventory_v1', inventory);
  }, scenarioFixture);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-view="planner"]').click();
  check('Scenario and Inventory test fixtures are restored after the audit',
    await page.evaluate(previous => localStorage.getItem('kow_v4359_planning_scenarios') === previous.scenarios &&
      localStorage.getItem('kow_central_inventory_v1') === previous.inventory, scenarioFixture));

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

  // Multi-plan persistence and recovery: two distinct plans must remain isolated across reload.
  const createAndSaveMultiPlan = async ({name, officer, needed, orv, universal, chests, selection, mode}) => {
    while (await page.locator('#multiPlannerRows tr').count()) {
      await page.locator('#multiPlannerRows tr').first().locator('[data-remove]').click();
    }
    await page.locator('#multiAddOfficer').click();
    const row = page.locator('#multiPlannerRows tr').first();
    await row.locator('[data-multi-officer]').selectOption({ label: officer });
    await row.locator('[data-multi-needed]').fill(String(needed));
    await page.locator('#multiOrv').fill(String(orv));
    await page.locator('#multiUniversal').fill(String(universal));
    await page.locator('#multiChests').fill(String(chests));
    await page.locator('#multiSelectionChests').fill(String(selection));
    await page.locator('#multiChestMode').selectOption(mode);
    await page.locator('#multiPlanName').fill(name);
    await page.locator('#multiSavePlan').click();
  };
  await createAndSaveMultiPlan({
    name: 'QA Persistence Alpha', officer: 'S8 Po', needed: 2,
    orv: 1439, universal: 0, chests: 0, selection: 0, mode: 'orv'
  });
  check('Persistence Alpha saves a partially funded plan with an ORV remainder',
    !!(await page.evaluate(() => JSON.parse(localStorage.getItem('kow_multi_plans_v430') || '{}')['QA Persistence Alpha'])));
  await createAndSaveMultiPlan({
    name: 'QA Persistence Beta', officer: 'S7 Code', needed: 2,
    orv: 346, universal: 1, chests: 1, selection: 0, mode: 'badge'
  });
  check('Persistence Beta is saved independently alongside Alpha',
    await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem('kow_multi_plans_v430') || '{}');
      return !!p['QA Persistence Alpha'] && !!p['QA Persistence Beta'] &&
        p['QA Persistence Alpha'].orv === 1439 && p['QA Persistence Beta'].orv === 346;
    }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#officerSelect option').length >= 60);
  await page.waitForTimeout(500);
  await page.locator('[data-view="planner"]').click();
  await page.locator('#multiSavedPlans').waitFor({ state: 'visible' });
  check('Both saved Multi-Officer plans survive a full application reload',
    await page.locator('#multiSavedPlans option').allTextContents().then(a =>
      a.some(x => x.trim() === 'QA Persistence Alpha') && a.some(x => x.trim() === 'QA Persistence Beta')));
  await page.locator('#multiSavedPlans').selectOption({ label: 'QA Persistence Alpha' });
  let restoredRows = page.locator('#multiPlannerRows tr');
  check('Reload restores Alpha resource balances, officer and badge requirement',
    await page.locator('#multiOrv').inputValue() === '1439' &&
    await page.locator('#multiUniversal').inputValue() === '0' &&
    await restoredRows.count() === 1 &&
    await restoredRows.first().locator('[data-multi-officer] option:checked').innerText() === 'S8 Po' &&
    await restoredRows.first().locator('[data-multi-needed]').inputValue() === '2');
  check('Reload recalculates Alpha partial funding without rounding its 719 ORV remainder',
    await restoredRows.first().locator('[data-multi-allocated]').innerText() === '1 / 2' &&
    await restoredRows.first().locator('[data-multi-status]').innerText() === 'Partially Funded' &&
    /719 ORV/.test(await page.locator('#multiPlannerSummary').innerText()),
    await page.locator('#multiPlannerSummary').innerText());
  await page.locator('#multiSavedPlans').selectOption({ label: 'QA Persistence Beta' });
  restoredRows = page.locator('#multiPlannerRows tr');
  check('Switching to Beta restores its distinct resources and Officer row',
    await page.locator('#multiOrv').inputValue() === '346' &&
    await page.locator('#multiUniversal').inputValue() === '1' &&
    await page.locator('#multiChests').inputValue() === '1' &&
    await page.locator('#multiChestMode').inputValue() === 'badge' &&
    await restoredRows.count() === 1 &&
    await restoredRows.first().locator('[data-multi-officer] option:checked').innerText() === 'S7 Code');
  await page.locator('#multiSavedPlans').selectOption({ label: 'QA Persistence Alpha' });
  check('Switching back to Alpha does not inherit Beta resources or settings',
    await page.locator('#multiOrv').inputValue() === '1439' &&
    await page.locator('#multiUniversal').inputValue() === '0' &&
    await page.locator('#multiChests').inputValue() === '0' &&
    await page.locator('#multiChestMode').inputValue() === 'orv' &&
    await page.locator('#multiPlannerRows tr').first().locator('[data-multi-officer] option:checked').innerText() === 'S8 Po');
  await page.locator('#multiSavedPlans').selectOption({ label: 'QA Persistence Beta' });
  await page.locator('#multiDeletePlan').click();
  check('Deleting Beta leaves Alpha saved and selectable',
    await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem('kow_multi_plans_v430') || '{}');
      return !!p['QA Persistence Alpha'] && !p['QA Persistence Beta'];
    }) &&
    await page.locator('#multiSavedPlans option').allTextContents().then(a => a.some(x => x.trim() === 'QA Persistence Alpha') && !a.some(x => x.trim() === 'QA Persistence Beta')));
  await page.locator('#multiSavedPlans').selectOption({ label: 'QA Persistence Alpha' });
  check('Remaining Alpha plan still restores its original partial allocation after Beta deletion',
    await page.locator('#multiOrv').inputValue() === '1439' &&
    await page.locator('#multiPlannerRows tr').first().locator('[data-multi-allocated]').innerText() === '1 / 2' &&
    /719 ORV/.test(await page.locator('#multiPlannerSummary').innerText()));

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
  // Advanced Planner persistence and recovery: saved Officer profiles and shared
  // resource snapshots must survive a full reload and remain isolated from session changes.
  const plannerInventoryFixture = await page.evaluate(() => ({
    central: localStorage.getItem('kow_central_inventory_v1'),
    global: localStorage.getItem('kow_global_resources_v435')
  }));
  await page.evaluate(() => {
    const central = {
      invOrv: 720, invSrv: 360, invUniversalLegendary: 0,
      invLegendaryBadgeChests: 0, invLegendarySelectionChests: 0,
      invLegStar1: 0, invLegStar2: 0, invLegStar3: 0,
      savedAt: '2026-11-16T00:00:00.000Z'
    };
    const global = {
      orvHeld: '720', srvHeld: '360', universalBadgeHeld: '0',
      legendaryBadgeChestHeld: '0', legendarySelectionChestHeld: '0',
      legendaryBadgeChestMode: 'badge', xp: {},
      savedAt: '2026-11-16T00:00:00.000Z'
    };
    localStorage.setItem('kow_central_inventory_v1', JSON.stringify(central));
    localStorage.setItem('kow_global_resources_v435', JSON.stringify(global));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#officerSelect option').length === 68);
  await page.locator('[data-view="planner"]').click();
  await page.locator('#kowPlannerSession').selectOption('saved');
  await page.locator('#kowPlannerSeasonFilter').selectOption('S8');
  await page.locator('#kowFutureOfficerType').selectOption('auto');
  await page.locator('#kowPlannerIncludeNotStarted').uncheck();
  await page.locator('#kowPlannerIncludeOriginals').uncheck();
  await page.locator('#advancedMultiOfficerPlanning button[onclick="kowRunAdvancedPlanner()"]').click();
  await page.waitForTimeout(150);
  plannerRows = page.locator('#kowAdvancedPlannerResults tbody tr');
  plannerCells = await plannerRows.evaluateAll(rows => rows.map(row =>
    Array.from(row.querySelectorAll('td')).map(cell => cell.innerText.trim())));
  check('Advanced Planner restores both saved S8 Officer profiles after reload',
    plannerCells.length === 2 && plannerCells[0]?.[1] === 'S8 Po' && plannerCells[1]?.[1] === 'S8 Sara',
    JSON.stringify(plannerCells));
  check('Advanced Planner restores the saved 720 ORV inventory snapshot after reload',
    /Inventory detected: ORV 720/.test(await page.locator('#kowAdvancedPlannerResults').innerText()),
    (await page.locator('#kowAdvancedPlannerResults').innerText()).slice(-220));
  check('Advanced Planner recalculates the ORV recommendation from restored inventory',
    plannerCells.length === 2 && plannerCells.every(row => row[4].includes('then ORV where eligible')),
    JSON.stringify(plannerCells.map(row => row[4])));
  await page.locator('#kowPlannerSession').selectOption('january');
  await page.locator('#advancedMultiOfficerPlanning button[onclick="kowRunAdvancedPlanner()"]').click();
  check('Changing to a future session does not erase saved Officer progress',
    JSON.parse(await page.evaluate(() => localStorage.getItem('kow_officer_profiles_v435') || '{}'))['S8|S8 Po']?.skills?.filter(Boolean).length === 20);
  await page.locator('#kowPlannerSession').selectOption('saved');
  await page.locator('#advancedMultiOfficerPlanning button[onclick="kowRunAdvancedPlanner()"]').click();
  check('Returning to Saved Officers restores the same recommendation order',
    (await page.locator('#kowAdvancedPlannerResults tbody tr td:nth-child(2)').allInnerTexts()).join('|') === 'S8 Po|S8 Sara');
  await page.evaluate(() => {
    const key = 'kow_officer_profiles_v435';
    const profiles = JSON.parse(localStorage.getItem(key) || '{}');
    profiles['S8|S8 Sara'] = {
      unlocked: true, skills: Array(36).fill(true), training: 180,
      currentStar: 5, currentLevel: 70, badgeHeld: 0, savedAt: '2026-11-16T00:01:00.000Z'
    };
    localStorage.setItem(key, JSON.stringify(profiles));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#officerSelect option').length === 68);
  await page.locator('[data-view="planner"]').click();
  await page.locator('#kowPlannerSession').selectOption('saved');
  await page.locator('#kowPlannerSeasonFilter').selectOption('S8');
  await page.locator('#kowPlannerIncludeNotStarted').uncheck();
  await page.locator('#kowPlannerIncludeOriginals').uncheck();
  await page.locator('#advancedMultiOfficerPlanning button[onclick="kowRunAdvancedPlanner()"]').click();
  const afterProfileChange = await page.locator('#kowAdvancedPlannerResults tbody tr td:nth-child(2)').allInnerTexts();
  check('Advanced Planner excludes an Officer newly saved as MAXED after reload',
    afterProfileChange.length === 1 && afterProfileChange[0] === 'S8 Po',
    JSON.stringify(afterProfileChange));
  await page.evaluate(({ profiles, inventory }) => {
    const profileKey = 'kow_officer_profiles_v435';
    if (profiles === null) localStorage.removeItem(profileKey);
    else localStorage.setItem(profileKey, profiles);
    const restore = (key, value) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
    restore('kow_central_inventory_v1', inventory.central);
    restore('kow_global_resources_v435', inventory.global);
  }, { profiles: plannerFixture, inventory: plannerInventoryFixture });
  await page.locator('#kowPlannerSession').selectOption('saved');
  await page.locator('#advancedMultiOfficerPlanning button[onclick="kowRunAdvancedPlanner()"]').click();
  await page.waitForTimeout(100);
  check('Advanced Planner test fixtures are restored after the persistence audit',
    await page.evaluate(previous => localStorage.getItem('kow_officer_profiles_v435') === previous, plannerFixture));

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

  // Cross-calculator consistency audit: the same saved S8 Po progress and the
  // same 719 ORV + 1 Universal Badge inventory must reconcile in all three planners.
  const crossCalculatorFixture = await page.evaluate(() => ({
    profiles: localStorage.getItem('kow_officer_profiles_v435'),
    central: localStorage.getItem('kow_central_inventory_v1'),
    global: localStorage.getItem('kow_global_resources_v435')
  }));
  await page.evaluate(() => {
    const skills = Array.from({ length: 36 }, (_, i) => i < 20);
    localStorage.setItem('kow_officer_profiles_v435', JSON.stringify({
      'S8|S8 Po': {
        unlocked: true, skills, training: 0, currentStar: 2,
        currentLevel: 30, targetLevel: 70, badgeHeld: 0, savedAt: '2026-11-16T00:00:00.000Z'
      }
    }));
    localStorage.removeItem('kow_central_inventory_v1');
    localStorage.setItem('kow_global_resources_v435', JSON.stringify({
      orvHeld: '719', universalBadgeHeld: '1', universalEpicBadgeHeld: '0',
      universalEliteBadgeHeld: '0', legendaryBadgeChestHeld: '0',
      legendarySelectionChestHeld: '0', legendaryBadgeChestMode: 'badge',
      srvHeld: '0', xp: {}, savedAt: '2026-11-16T00:00:00.000Z'
    }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#officerSelect option').length === 68);
  await page.locator('[data-view="officer"]').click();
  await page.locator('#officerSelect').selectOption({ label: 'S8 Po' });
  await page.locator('[data-view="development"]').click();
  await page.waitForTimeout(150);
  await page.locator('#orvHeld').fill('719');
  await page.locator('#universalBadgeHeld').fill('1');
  await page.locator('#legendaryBadgeChestHeld').fill('0');
  await page.locator('#legendarySelectionChestHeld').fill('0');
  await page.waitForTimeout(150);
  const singleRequired = Number((await page.locator('#badgesRequired').innerText()).replace(/[^0-9.-]/g, '')) || 0;
  const singleOrvRequired = Number((await page.locator('#orvRequired').innerText()).replace(/[^0-9.-]/g, '')) || 0;
  check('Single-Officer calculator recognises one Universal Badge and sub-threshold ORV',
    (await page.locator('#universalBadgesAvailable').innerText()).trim() === '1' &&
    (await page.locator('#badgesFromOrv').innerText()).trim() === '0' &&
    (await page.locator('#orvRemainder').innerText()).trim() === '719');
  check('Single-Officer remaining badge and ORV requirements reconcile at the 720 threshold',
    singleRequired > 0 && singleOrvRequired === singleRequired * 720,
    'badges required=' + singleRequired + '; ORV required=' + singleOrvRequired);

  await page.locator('[data-view="planner"]').click();
  while (await page.locator('#multiPlannerRows tr').count()) {
    await page.locator('#multiPlannerRows tr').first().locator('[data-remove]').click();
  }
  await page.locator('#multiAddOfficer').click();
  const crossRow = page.locator('#multiPlannerRows tr').first();
  await crossRow.locator('[data-multi-officer]').selectOption({ label: 'S8 Po' });
  await crossRow.locator('[data-multi-needed]').fill('1600');
  await page.locator('#multiOrv').fill('719');
  await page.locator('#multiUniversal').fill('1');
  await page.locator('#multiChests').fill('0');
  await page.locator('#multiSelectionChests').fill('0');
  await page.locator('#multiChestMode').selectOption('badge');
  await page.waitForTimeout(150);
  const multiSummary = await page.locator('#multiPlannerSummary').innerText();
  const multiTotals = multiSummary.match(/(\\d+) of (\\d+) required badge equivalents covered/);
  const multiNeed = multiTotals ? Number(multiTotals[2]) : -1;
  check('Multi-Officer Planner uses the same saved Officer badge shortfall as Single-Officer',
    multiNeed > 0 && singleRequired === multiNeed - 1,
    'single required=' + singleRequired + '; multi summary=' + multiSummary);
  check('Multi-Officer Planner preserves 719 ORV and allocates exactly one Universal Badge',
    await crossRow.locator('[data-multi-allocated]').innerText() === '1 / ' + multiNeed &&
    /0 of \\d+ required badge equivalents covered/.test(multiSummary) === false &&
    /719 ORV · 0 Universal Badges · 0 Selection Chests/.test(multiSummary),
    'row=' + await crossRow.locator('[data-multi-allocated]').innerText() + '; summary=' + multiSummary);

  await page.locator('#kowPlannerSession').selectOption('saved');
  await page.locator('#kowPlannerSeasonFilter').selectOption('S8');
  await page.locator('#kowPlannerIncludeNotStarted').uncheck();
  await page.locator('#kowPlannerIncludeOriginals').uncheck();
  await page.locator('#advancedMultiOfficerPlanning button[onclick="kowRunAdvancedPlanner()"]').click();
  await page.waitForTimeout(150);
  const advancedCrossText = await page.locator('#kowAdvancedPlannerResults').innerText();
  check('Advanced Planner selects the same saved S8 Po profile used by both badge calculators',
    await page.locator('#kowAdvancedPlannerResults tbody tr').count() === 1 &&
    /S8 Po/.test(advancedCrossText),
    advancedCrossText.slice(0, 300));
  check('Advanced Planner reads the identical 719 ORV and 1 Universal Badge inventory snapshot',
    /Inventory detected: ORV 719, Universal Badges 1/.test(advancedCrossText),
    advancedCrossText.slice(-250));
  check('Advanced Planner does not recommend ORV funding below the one-badge threshold',
    /Use Officer-specific badges first\\. Use flexible Universal\\/Selection resources only where required\\./.test(advancedCrossText),
    advancedCrossText.slice(0, 300));

  await page.evaluate(state => {
    const restore = (key, value) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
    restore('kow_officer_profiles_v435', state.profiles);
    restore('kow_central_inventory_v1', state.central);
    restore('kow_global_resources_v435', state.global);
  }, crossCalculatorFixture);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#officerSelect option').length === 68);
  check('Cross-calculator audit restores the original profile and inventory fixtures',
    await page.evaluate(state =>
      localStorage.getItem('kow_officer_profiles_v435') === state.profiles &&
      localStorage.getItem('kow_central_inventory_v1') === state.central &&
      localStorage.getItem('kow_global_resources_v435') === state.global, crossCalculatorFixture));

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
  // Return to the Planner view before interacting with its controls; the preceding
  // settings checks intentionally leave Settings active, where planner rows are hidden.
  await page.locator('[data-view="planner"]').click();
  await page.locator('#multiPlannerCard').waitFor({ state: 'visible' });

  // Partial-funding audit: retain unusable ORV remainders and report partial coverage accurately.
  edgeRow = await resetMultiCase('S8 Po', 2, { orv: 1439, mode: 'orv' });
  check('Partial funding allocates only whole badges and retains 719 ORV',
    await edgeRow.locator('[data-multi-allocated]').innerText() === '1 / 2' &&
    await edgeRow.locator('[data-multi-status]').innerText() === 'Partially Funded' &&
    /1 partially funded/.test(await page.locator('#multiPlannerSummary').innerText()) &&
    /719 ORV/.test(await page.locator('#multiPlannerSummary').innerText()),
    await page.locator('#multiPlannerSummary').innerText());

  edgeRow = await resetMultiCase('S8 Po', 2, { orv: 719, universal: 1, mode: 'badge' });
  check('Universal Badge covers one badge while sub-threshold ORV remains untouched',
    await edgeRow.locator('[data-multi-allocated]').innerText() === '1 / 2' &&
    await edgeRow.locator('[data-multi-status]').innerText() === 'Partially Funded' &&
    /719 ORV · 0 Universal Badges/.test(await page.locator('#multiPlannerSummary').innerText()),
    await page.locator('#multiPlannerSummary').innerText());

  await clearMixedPlannerRows();
  const mixedRateCode = await addMixedPlannerRow('S7 Code', 2);
  const mixedRatePo = await addMixedPlannerRow('S8 Po', 1);
  await page.locator('#multiOrv').fill('719');
  await page.locator('#multiUniversal').fill('0');
  await page.locator('#multiChests').fill('0');
  await page.locator('#multiSelectionChests').fill('0');
  await page.locator('#multiChestMode').selectOption('orv');
  await page.waitForTimeout(100);
  check('Lower-cost Officer consumes only whole affordable badges and preserves ORV remainder for next priority',
    await mixedRateCode.locator('[data-multi-allocated]').innerText() === '2 / 2' &&
    await mixedRateCode.locator('[data-multi-status]').innerText() === 'Fully Funded' &&
    await mixedRatePo.locator('[data-multi-allocated]').innerText() === '0 / 1' &&
    await mixedRatePo.locator('[data-multi-status]').innerText() === 'Shortfall' &&
    /27 ORV/.test(await page.locator('#multiPlannerSummary').innerText()),
    await page.locator('#multiPlannerSummary').innerText());
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
