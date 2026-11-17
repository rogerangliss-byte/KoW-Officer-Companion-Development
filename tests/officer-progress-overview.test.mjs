import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name + ' must exist');
  const end = source.indexOf(String.fromCharCode(10) + '}', start);
  assert.notEqual(end, -1, name + ' must have a closing brace');
  return source.slice(start, end + 2);
}

function sortRows(rows, mode) {
  const sandbox = { input: rows, result: null };
  const call = 'result=sortSavedOfficerProgressRows(input, ' + JSON.stringify(mode) + ');';
  vm.runInNewContext(extractFunction('sortSavedOfficerProgressRows') + String.fromCharCode(10) + call, sandbox);
  return JSON.parse(JSON.stringify(sandbox.result));
}

const rows = [
  { name: 'Original Elite', season: 'Original', rarity: 'Elite', overall: 20, maxed: false, notStarted: false },
  { name: 'S7 Legendary', season: 'S7', rarity: 'Legendary', overall: 75, maxed: false, notStarted: false },
  { name: 'S8 Epic', season: 'S8', rarity: 'Epic', overall: 10, maxed: false, notStarted: false },
  { name: 'S6 MAXED', season: 'S6', rarity: 'Legendary', overall: 100, maxed: true, notStarted: false },
  { name: 'S5 Not Started', season: 'S5', rarity: 'Legendary', overall: 0, maxed: false, notStarted: true }
];

test('season sorting places newest seasonal Officers first and Originals last', () => {
  assert.deepEqual(sortRows(rows, 'season').map(r => r.name), ['S8 Epic', 'S7 Legendary', 'S6 MAXED', 'S5 Not Started', 'Original Elite']);
});

test('newest-first sorting follows Officer Database release order within a season', () => {
  const sameSeason = [
    { name: 'Later release', season: 'S8', rarity: 'Epic', releaseOrder: 0, overall: 0, maxed: false, notStarted: true },
    { name: 'Earlier release', season: 'S8', rarity: 'Legendary', releaseOrder: 1, overall: 0, maxed: false, notStarted: true }
  ];
  assert.deepEqual(sortRows(sameSeason, 'season').map(r => r.name), ['Later release', 'Earlier release']);
});

test('rarity sorting uses Legendary, Epic, Elite order', () => {
  assert.deepEqual(sortRows(rows, 'rarity').map(r => r.rarity), ['Legendary', 'Legendary', 'Legendary', 'Epic', 'Elite']);
});

test('progress sorting places highest overall progress first', () => {
  assert.deepEqual(sortRows(rows, 'progress').map(r => r.overall), [100, 75, 20, 10, 0]);
});

test('upgrade priority sorting places unfinished low-progress Officers first and MAXED last', () => {
  assert.deepEqual(sortRows(rows, 'priority').map(r => r.name), ['S5 Not Started', 'S8 Epic', 'Original Elite', 'S7 Legendary', 'S6 MAXED']);
});

test('recommended sorting preserves MAXED, in-progress, not-started status grouping', () => {
  const result = sortRows(rows, 'recommended');
  assert.equal(result[0].name, 'S6 MAXED');
  assert.equal(result.at(-1).name, 'S5 Not Started');
});

test('all other sort modes use Officer release order when their primary sort values tie', () => {
  const ordered = [
    { name: 'Latest release', season: 'S8', rarity: 'Legendary', releaseOrder: 0, overall: 50, maxed: false, notStarted: false },
    { name: 'Earlier release', season: 'S7', rarity: 'Legendary', releaseOrder: 1, overall: 50, maxed: false, notStarted: false }
  ];
  for (const mode of ['rarity', 'progress', 'priority', 'recommended']) {
    assert.deepEqual(sortRows(ordered, mode).map(r => r.name), ['Latest release', 'Earlier release'], mode);
  }
});

test('sorting does not mutate the source progress data', () => {
  const before = JSON.stringify(rows);
  sortRows(rows, 'progress');
  assert.equal(JSON.stringify(rows), before);
});

test('overview includes Officer portrait, season, rarity, role and sort control', () => {
  assert.ok(source.includes('id="progressSortOrder"'));
  assert.ok(source.includes('<th>Season</th><th>Rarity</th><th>Role</th>'));
  assert.ok(source.includes('data-progress-portrait='));
  assert.ok(source.includes('rarity:officerRarity(o),role:officerRole(o)'));
  assert.ok(source.includes('setPortraitWithFallback(img,null,officerPortraitCandidates'));
});



test('Compare Officer sorting supports Role, Season, Progress and Upgrade priority without rarity sort modes', () => {
  const compareRows = [
    { name: 'Tank Elite', season: 'S7', rarity: 'Elite', role: 'Tank', releaseOrder: 2, overall: 20, maxed: false, notStarted: false },
    { name: 'Rally Epic', season: 'S8', rarity: 'Epic', role: 'Rally', releaseOrder: 1, overall: 40, maxed: false, notStarted: false },
    { name: 'Garrison Legendary', season: 'S8', rarity: 'Legendary', role: 'Garrison', releaseOrder: 0, overall: 60, maxed: false, notStarted: false }
  ];
  assert.deepEqual(sortRows(compareRows, 'role').map(r => r.role), ['Garrison', 'Rally', 'Tank']);
  assert.deepEqual(sortRows(compareRows, 'season').map(r => r.name), ['Garrison Legendary', 'Rally Epic', 'Tank Elite']);
  assert.deepEqual(sortRows(compareRows, 'progress').map(r => r.name), ['Garrison Legendary', 'Rally Epic', 'Tank Elite']);
  assert.ok(source.includes('value="priority"'));
  assert.ok(!source.includes('value="rarity-legendary"'));
  assert.ok(!source.includes('value="rarity-epic"'));
  assert.ok(!source.includes('value="rarity-elite"'));
});

test('Compare Officer has independent status and rarity tick-box filters plus its own sort control', () => {
  assert.ok(source.includes('id="compareProgressSortOrder"'));
  for (const rarity of ['Legendary', 'Epic', 'Elite']) {
    assert.ok(source.includes('class="compareRarityFilter" value="'+rarity+'" checked'));
  }
  for (const status of ['maxed', 'progress', 'notStarted']) {
    assert.ok(source.includes('class="compareStatusFilter" value="'+status+'" checked'));
  }
  assert.ok(source.includes("mode==='role'"));
  assert.ok(source.includes("runProgressComparison();"));
  assert.ok(source.includes('restoreComparePickState()'));
  assert.ok(source.includes("apply('.compareRarityFilter',st.compareRarityFilters)"));
  assert.ok(source.includes("'.compareStatusFilter,.compareRarityFilter'"));
  const filterBarStart = source.indexOf('id="compareStatusFilters"');
  const sortControl = source.indexOf('id="compareProgressSortOrder"');
  const selectionControls = source.indexOf('id="compareProgressSelectAll"');
  assert.ok(filterBarStart < sortControl && sortControl < selectionControls, 'Sort control must sit inside the Compare filter bar');
  assert.ok(source.includes('grid-template-columns:repeat(3,minmax(0,1fr))'), 'Each filter row must use three columns');
  assert.ok(source.includes('grid-template-columns:minmax(0,1fr) minmax(190px,260px)'), 'Sort control must sit alongside the two filter rows');
  assert.ok(source.includes('data-compare-portrait='));
  assert.ok(source.includes('officerPortraitCandidates(img.dataset.comparePortrait)'));
  assert.ok(source.includes('setPortraitWithFallback(img,null,officerPortraitCandidates(img.dataset.comparePortrait))'));
  assert.ok(source.includes('data-compare-result-portrait='));
  assert.ok(source.includes('officerPortraitCandidates(img.dataset.compareResultPortrait)'));
  assert.ok(source.includes('setPortraitWithFallback(img,null,officerPortraitCandidates(img.dataset.compareResultPortrait))'));
});

function allowsCompareFilters(row, statuses, rarities) {
  const statusBoxes = ['maxed', 'progress', 'notStarted'].map(value => ({ value, checked: statuses.includes(value) }));
  const rarityBoxes = ['Legendary', 'Epic', 'Elite'].map(value => ({ value, checked: rarities.includes(value) }));
  const sandbox = {
    document: { querySelectorAll: selector => selector === '.compareStatusFilter' ? statusBoxes : selector === '.compareRarityFilter' ? rarityBoxes : [] },
    result: null
  };
  vm.runInNewContext(
    extractFunction('compareStatusAllowed') + String.fromCharCode(10) + 'result=compareStatusAllowed(' + JSON.stringify(row) + ');',
    sandbox
  );
  return sandbox.result;
}

test('Compare results use the complete Officer Progress overview column set and metadata fields', () => {
  const expectedHeaders = '<th>Officer</th><th>Season</th><th>Rarity</th><th>Role</th><th>Overall progress</th><th>Development</th><th>Stars</th><th>XP</th><th>Officer Badge shortfall</th><th>Skill Badge shortfall</th><th>Star shortfall</th><th>XP shortfall</th><th>Status</th>';
  assert.ok(source.includes('<table id="compareProgressResultsTable">'));
  assert.ok(source.includes('<thead><tr>' + expectedHeaders + '</tr></thead>'));
  assert.ok(source.includes("esc(r.season||'Original')+'</td><td>'+esc(r.rarity)+'</td><td>'+esc(r.role)"));
  assert.ok(source.includes("fmt(r.officerBadgeShort)+'</td><td>'+fmt(r.skillBadgeShort)+'</td><td>'+fmt(r.starShort)+'</td><td>'+fmt(r.xpShort)"));
  assert.ok(source.includes('#savedOfficerProgressTable,#compareProgressResultsTable{min-width:1250px}'));
});

test('Compare Officer rarity filters include only checked rarities', () => {
  assert.equal(allowsCompareFilters({ maxed: false, notStarted: false, rarity: 'Legendary' }, ['maxed', 'progress', 'notStarted'], ['Legendary']), true);
  assert.equal(allowsCompareFilters({ maxed: false, notStarted: false, rarity: 'Epic' }, ['maxed', 'progress', 'notStarted'], ['Legendary']), false);
  assert.equal(allowsCompareFilters({ maxed: false, notStarted: false, rarity: 'Elite' }, ['maxed', 'progress', 'notStarted'], ['Elite']), true);
});

test('Compare Officer combines status and rarity filters', () => {
  assert.equal(allowsCompareFilters({ maxed: true, notStarted: false, rarity: 'Legendary' }, ['maxed'], ['Legendary']), true);
  assert.equal(allowsCompareFilters({ maxed: true, notStarted: false, rarity: 'Epic' }, ['maxed'], ['Legendary']), false);
  assert.equal(allowsCompareFilters({ maxed: false, notStarted: false, rarity: 'Legendary' }, ['maxed'], ['Legendary']), false);
});

function allowsProgressStatus(row, checkedValues) {
  const boxes = ['maxed', 'progress', 'notStarted'].map(value => ({
    value,
    checked: checkedValues.includes(value)
  }));
  const sandbox = {
    document: { querySelectorAll: selector => selector === '.progressStatusFilter' ? boxes : [] },
    row,
    result: null
  };
  vm.runInNewContext(
    extractFunction('progressStatusAllowed') + String.fromCharCode(10) + 'result=progressStatusAllowed(row);',
    sandbox
  );
  return sandbox.result;
}

test('Officer Progress status filter includes MAXED only when selected', () => {
  assert.equal(allowsProgressStatus({ maxed: true, notStarted: false }, ['maxed']), true);
  assert.equal(allowsProgressStatus({ maxed: true, notStarted: false }, ['progress', 'notStarted']), false);
});

test('Officer Progress status filter includes IN PROGRESS only when selected', () => {
  assert.equal(allowsProgressStatus({ maxed: false, notStarted: false }, ['progress']), true);
  assert.equal(allowsProgressStatus({ maxed: false, notStarted: false }, ['maxed', 'notStarted']), false);
});

test('Officer Progress status filter includes NOT STARTED only when selected', () => {
  assert.equal(allowsProgressStatus({ maxed: false, notStarted: true }, ['notStarted']), true);
  assert.equal(allowsProgressStatus({ maxed: false, notStarted: true }, ['maxed', 'progress']), false);
});

test('Officer Progress status filter defaults to showing rows if filter controls are absent', () => {
  const sandbox = {
    document: { querySelectorAll: () => [] },
    row: { maxed: false, notStarted: true },
    result: null
  };
  vm.runInNewContext(
    extractFunction('progressStatusAllowed') + String.fromCharCode(10) + 'result=progressStatusAllowed(row);',
    sandbox
  );
  assert.equal(sandbox.result, true);
});

test('overview rendering calls a defined status filter helper', () => {
  assert.ok(source.includes('function progressStatusAllowed(r)'));
  assert.ok(source.includes('allRows.filter(progressStatusAllowed)'));
});

test('Officer Progress summary has four live status cards and an accessible update region', () => {
  for (const id of ['progressSummaryTotal', 'progressSummaryMaxed', 'progressSummaryInProgress', 'progressSummaryNotStarted']) {
    assert.ok(source.includes('id="'+id+'"'), id + ' summary counter must exist');
  }
  assert.ok(source.includes('class="progress-summary-grid"'));
  assert.ok(source.includes('aria-live="polite"'));
});

test('Officer Progress summary counts only rows allowed by the active status filters', () => {
  const start = source.indexOf('function renderSavedOfficerProgress(){');
  const end = source.indexOf(String.fromCharCode(10) + '}', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const renderer = source.slice(start, end + 2);
  assert.ok(renderer.includes('allRows.filter(progressStatusAllowed)'));
  assert.ok(renderer.includes('total:rows.length'));
  assert.ok(renderer.includes("maxed:rows.filter(x=>x.maxed).length"));
  assert.ok(renderer.includes("inProgress:rows.filter(x=>!x.maxed&&!x.notStarted).length"));
  assert.ok(renderer.includes("notStarted:rows.filter(x=>x.notStarted).length"));
  for (const id of ['Total', 'Maxed', 'InProgress', 'NotStarted']) {
    assert.ok(renderer.includes("setCount('progressSummary"+id+"'"));
  }
});

function headerSortRows(input, key, direction) {
  const sandbox = { input, result: null };
  const call = 'result=sortProgressRowsByHeader(input,' + JSON.stringify(key) + ',' + JSON.stringify(direction) + ');';
  vm.runInNewContext(extractFunction('sortProgressRowsByHeader') + String.fromCharCode(10) + call, sandbox);
  return JSON.parse(JSON.stringify(sandbox.result));
}

test('Officer Progress sortable headings cover Season, Rarity, Role, Overall Progress and Status', () => {
  for (const key of ['season', 'rarity', 'role', 'progress', 'status']) {
    assert.ok(source.includes('class="progress-header-sort" data-progress-sort="'+key+'"'), key + ' heading must be sortable');
  }
  assert.ok(source.includes('aria-sort="none"'));
  assert.ok(source.includes('aria-pressed'));
  assert.ok(source.includes("icon.textContent=active?(state.direction==='asc'?'↑':'↓'):'↕'"));
});

test('click sorting orders Season, Rarity, Role, Progress and Status in both directions', () => {
  const sample = [
    { name: 'Original Elite', season: 'Original', rarity: 'Elite', role: 'Tank', overall: 20, maxed: false, notStarted: false, releaseOrder: 4 },
    { name: 'S8 Epic', season: 'S8', rarity: 'Epic', role: 'Rally', overall: 10, maxed: false, notStarted: true, releaseOrder: 0 },
    { name: 'S7 Legendary', season: 'S7', rarity: 'Legendary', role: 'Garrison', overall: 75, maxed: true, notStarted: false, releaseOrder: 1 },
    { name: 'S6 Epic', season: 'S6', rarity: 'Epic', role: 'Infantry', overall: 50, maxed: false, notStarted: false, releaseOrder: 2 }
  ];
  assert.deepEqual(headerSortRows(sample, 'season', 'desc').map(r => r.name), ['S8 Epic', 'S7 Legendary', 'S6 Epic', 'Original Elite']);
  assert.deepEqual(headerSortRows(sample, 'season', 'asc').map(r => r.name), ['Original Elite', 'S6 Epic', 'S7 Legendary', 'S8 Epic']);
  assert.deepEqual(headerSortRows(sample, 'rarity', 'asc').map(r => r.rarity), ['Legendary', 'Epic', 'Epic', 'Elite']);
  assert.deepEqual(headerSortRows(sample, 'rarity', 'desc').map(r => r.rarity), ['Elite', 'Epic', 'Epic', 'Legendary']);
  assert.deepEqual(headerSortRows(sample, 'role', 'asc').map(r => r.role), ['Garrison', 'Infantry', 'Rally', 'Tank']);
  assert.deepEqual(headerSortRows(sample, 'role', 'desc').map(r => r.role), ['Tank', 'Rally', 'Infantry', 'Garrison']);
  assert.deepEqual(headerSortRows(sample, 'progress', 'asc').map(r => r.overall), [10, 20, 50, 75]);
  assert.deepEqual(headerSortRows(sample, 'progress', 'desc').map(r => r.overall), [75, 50, 20, 10]);
  assert.deepEqual(headerSortRows(sample, 'status', 'asc').map(r => r.name), ['S7 Legendary', 'S6 Epic', 'S8 Epic', 'Original Elite']);
  assert.deepEqual(headerSortRows(sample, 'status', 'desc').map(r => r.name), ['Original Elite', 'S8 Epic', 'S6 Epic', 'S7 Legendary']);
});

test('Officer Progress dropdown remains available and clears active heading sort when changed', () => {
  assert.ok(source.includes('id="progressSortOrder"'));
  assert.ok(source.includes('window.progressHeaderSortState=null;renderSavedOfficerProgress();updateProgressHeaderSortIndicators();'));
  assert.ok(source.includes('setupProgressHeaderSorting();'));
});
