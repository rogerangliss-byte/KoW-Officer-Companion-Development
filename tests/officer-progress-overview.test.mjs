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



test('Compare Officer sorting supports each rarity, Role and Season', () => {
  const compareRows = [
    { name: 'Tank Elite', season: 'S7', rarity: 'Elite', role: 'Tank', releaseOrder: 2, overall: 20, maxed: false, notStarted: false },
    { name: 'Rally Epic', season: 'S8', rarity: 'Epic', role: 'Rally', releaseOrder: 1, overall: 40, maxed: false, notStarted: false },
    { name: 'Garrison Legendary', season: 'S8', rarity: 'Legendary', role: 'Garrison', releaseOrder: 0, overall: 60, maxed: false, notStarted: false }
  ];
  assert.deepEqual(sortRows(compareRows, 'rarity-legendary').map(r => r.name), ['Garrison Legendary', 'Tank Elite', 'Rally Epic']);
  assert.deepEqual(sortRows(compareRows, 'rarity-epic').map(r => r.name), ['Rally Epic', 'Garrison Legendary', 'Tank Elite']);
  assert.deepEqual(sortRows(compareRows, 'rarity-elite').map(r => r.name), ['Tank Elite', 'Garrison Legendary', 'Rally Epic']);
  assert.deepEqual(sortRows(compareRows, 'role').map(r => r.role), ['Garrison', 'Rally', 'Tank']);
  assert.deepEqual(sortRows(compareRows, 'season').map(r => r.name), ['Garrison Legendary', 'Rally Epic', 'Tank Elite']);
});

test('Compare Officer has an independent sort control and reapplies it to the results', () => {
  assert.ok(source.includes('id="compareProgressSortOrder"'));
  assert.ok(source.includes('value="rarity-legendary"'));
  assert.ok(source.includes('value="rarity-epic"'));
  assert.ok(source.includes('value="rarity-elite"'));
  assert.ok(source.includes("mode==='role'"));
  assert.ok(source.includes("runProgressComparison();"));
  assert.ok(source.includes('restoreComparePickState()'));
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
