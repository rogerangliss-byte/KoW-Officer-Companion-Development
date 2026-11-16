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
page.on('pageerror', error => pageErrors.push(error.message));

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
    check('Elite Marjorie has four primary skill strands and no fifth', !/fifth skill/i.test(skillText) && (await page.locator('#skillGrid .skill-strand, #skillGrid .skill-card').count()) <= 4,
      skillText.slice(0, 180));
  } else check('Elite Marjorie is present', false);

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
  await page.locator('[data-view="stars"]').click();
  await page.locator('#currentStar').selectOption('0');
  await page.locator('#targetStar').selectOption('5');
  await page.locator('#ls1').fill('1');
  await page.locator('#ls2').fill('1');
  await page.locator('#ls3').fill('1');
  await page.waitForTimeout(300);
  const starOutput = await page.locator('#starRequired, #starsRequired, #starShortfall, #starResult').evaluateAll(es => es.map(e => e.textContent || e.value).join(' '));
  check('Star calculator renders a result', starOutput.trim().length > 0, starOutput.slice(0, 120));

  // Development skills and training controls.
  await page.locator('[data-view="development"]').click();
  check('Skill strands render', await page.locator('#skillGrid').innerText().then(t => t.trim().length > 0));
  await page.locator('#trainingExact').fill('0');
  check('Training controls accept input', await page.locator('#trainingExact').inputValue() === '0');

  // XP calculation.
  await page.locator('[data-view="xp"]').click();
  await page.locator('#currentLevel').fill('0');
  await page.locator('#targetLevel').fill('1');
  await page.waitForTimeout(250);
  check('XP requirement is calculated', Number((await page.locator('#xpRequired').innerText()).replace(/[^0-9]/g,'')) > 0);

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
