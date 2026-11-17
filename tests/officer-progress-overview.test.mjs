import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = source.indexOf('\\n}', start);
  assert.notEqual(end, -1, `${name} must have a closing brace`);
  return source.slice(start, end + 2);
}

function sortRows(rows, mode) {
  const sandbox = { input: rows, result: null };
  vm.runInNewContext(extractFunction('sortSavedOfficerProgressRows') + `\\nresult=sortSavedOfficerProgressRows(input, ${JSON.stringify(mode)});`, sandbox);
  return sandbox.result;
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
