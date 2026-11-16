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

  // Confirm Elite does not expose a fifth skill.
  const marjorie = await page.locator('#officerSelect option').evaluateAll(opts => opts.find(o => /Marjorie/i.test(o.textContent))?.value);
  if (marjorie !== undefined) {
    await page.locator('#officerSelect').selectOption(marjorie);
    const skillText = await page.locator('#skillGrid').innerText();
    const skillRows = await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').count();
    const fifthStatus = await page.locator('#skillGrid .fifth-skill-status').innerText();
    const fifthButtons = await page.locator('#skillGrid .fifth-skill-status button').count();
    check('Elite Marjorie has four primary strands and no fifth skill controls', skillRows === 4 && fifthButtons === 0 && /Not available for Elite Officers/i.test(fifthStatus),
      `found ${skillRows} primary rows; fifth status: ${fifthStatus}`);
  } else check('Elite Marjorie is present', false);

  // Verify rarity-specific skill totals, star gates, and fifth-skill unlock behaviour.
  const epic = await page.locator('#officerSelect option').evaluateAll(opts => opts.find(o => /Evelyn/i.test(o.textContent))?.value);
  if (epic !== undefined) {
    await page.locator('#officerSelect').selectOption(epic);
    check('Epic skill badge total is 440', /440 Officer Badges total/.test(await page.locator('#skillSequenceNotice').innerText()));
    await page.locator('label.check').filter({ hasText: 'Officer unlocked (10 badges)' }).click();
    await page.locator('#currentStar').selectOption('0');
    await page.waitForTimeout(100);
    check('Epic skill strand star gates begin at 0 stars', await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').nth(0).locator('button.skill-lvl').first().isEnabled() &&
      !(await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').nth(1).locator('button.skill-lvl').first().isEnabled()));
    await page.locator('#currentStar').selectOption('1');
    await page.waitForTimeout(100);
    check('Epic third skill remains gated below 2 stars', !(await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').nth(2).locator('button.skill-lvl').first().isEnabled()));
    await page.locator('#currentStar').selectOption('2');
    await page.waitForTimeout(100);
    check('Epic fourth skill remains gated below 3 stars', !(await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').nth(3).locator('button.skill-lvl').first().isEnabled()));
    await page.locator('#currentStar').selectOption('3');
    await page.waitForTimeout(100);
    check('Epic fourth skill unlocks at 3 stars', await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').nth(3).locator('button.skill-lvl').first().isEnabled());
    check('Epic fifth skill stays locked before all four skills are complete', /Fifth Skill: LOCKED/.test(await page.locator('#skillGrid .fifth-skill-status').innerText()));
    for (let strand = 0; strand < 4; strand++) {
      await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').nth(strand).locator('button.skill-lvl').nth(9).click();
    }
    check('Epic fifth skill unlocks after all four primary skills reach level 10', /Fifth Skill: UNLOCKED/.test(await page.locator('#skillGrid .fifth-skill-status').innerText()));
  } else check('Epic Evelyn is present', false);

  const legendary = await page.locator('#officerSelect option').evaluateAll(opts => opts.find(o => /S8 Po/i.test(o.textContent))?.value);
  if (legendary !== undefined) {
    await page.locator('#officerSelect').selectOption(legendary);
    check('Legendary skill badge total is 690', /690 Officer Badges total/.test(await page.locator('#skillSequenceNotice').innerText()));
  } else check('Legendary S8 Po is present', false);
  await page.locator('#officerSelect').selectOption(marjorie);
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
  check('MAX unlocks Officer and completes four primary skills',
    await page.locator('#unlocked').isChecked() &&
    await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status)').count() === 4 &&
    await page.locator('#skillGrid .skill-strand-row:not(.fifth-skill-status) button.skill-lvl.reached').count() === 40);
  check('MAX sets training to 180', await page.locator('#trainingExact').inputValue() === '180');
  check('MAX leaves shared ORV inventory untouched', await page.locator('#orvHeld').inputValue() === '4321');
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
  failures.push('Test execution stopped: ' + error.message);
} finally {
  console.log('Application regression smoke test');
  console.log('=================================');
  for (const name of passes) console.log('PASS  ' + name);
  for (const name of failures) console.log('FAIL  ' + name);
  console.log('\nResult: ' + passes.length + ' passed; ' + failures.length + ' failed.');
  await browser.close();
}
if (failures.length) process.exit(1);
