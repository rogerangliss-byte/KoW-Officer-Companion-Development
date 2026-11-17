import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFilterHandler() {
  const start = source.indexOf('function handleOfficerFilterChange(){');
  assert.notEqual(start, -1, 'filter-change handler must exist');
  const end = source.indexOf('\n}', start);
  assert.notEqual(end, -1, 'filter-change handler must have a closing brace');
  return source.slice(start, end + 2);
}

function runFilterChange(nextSelection) {
  const calls = [];
  let loadedIndex = 0;
  const select = { value: '0' };
  const officers = [
    { season: 'S7', name: 'Liora' },
    { season: 'S8', name: 'Infantry Officer' }
  ];
  const context = {
    get loadedOfficerProfileIndex() { return loadedIndex; },
    set loadedOfficerProfileIndex(value) { loadedIndex = value; },
    officers,
    $(id) { return id === 'officerSelect' ? select : null; },
    officerProfileKey(index) { return officers[Number(index)].season + '|' + officers[Number(index)].name; },
    saveOfficerProfile(silent, index) {
      calls.push('save:' + index);
      loadedIndex = Number(index);
    },
    saveOfficerFilterState() { calls.push('save-filters'); },
    renderOfficerOptions() { calls.push('render-options'); select.value = nextSelection; },
    updateOfficerExperience() { calls.push('update-experience'); },
    loadOfficerProfile(index) { calls.push('load:' + index); loadedIndex = Number(index); },
    updateSkillRarityNotice() { calls.push('update-skill-rarity'); },
    updateSkillCostSummaries() { calls.push('update-skill-costs'); },
    currentOfficer() { return select.value === '' ? null : officers[Number(select.value)]; },
    updateProfileStatus(value) { calls.push(value === null ? 'clear-profile-status' : 'profile-status'); },
    saveSelectedOfficerState() { calls.push('save-selected-officer'); },
    calculate() { calls.push('calculate'); },
    populateCompareOfficers() { calls.push('populate-compare'); },
    buildUpgradeSummary() { calls.push('upgrade-summary'); }
  };
  vm.runInNewContext(extractFilterHandler() + '\nhandleOfficerFilterChange();', context);
  return { calls, loadedIndex: context.loadedOfficerProfileIndex, selectedValue: select.value };
}

test('filter selecting a different Officer saves the old profile before loading the new one', () => {
  const result = runFilterChange('1');
  assert.ok(result.calls.indexOf('save:0') < result.calls.indexOf('load:1'));
  assert.equal(result.loadedIndex, 1);
  assert.equal(result.selectedValue, '1');
  assert.ok(result.calls.includes('update-skill-rarity'));
  assert.ok(result.calls.includes('upgrade-summary'));
});

test('filter retaining the same Officer does not reload or replace its profile', () => {
  const result = runFilterChange('0');
  assert.ok(result.calls.includes('save:0'));
  assert.equal(result.calls.some(call => call.startsWith('load:')), false);
  assert.equal(result.loadedIndex, 0);
});

test('filter with no matches clears the active profile without selecting Officer zero', () => {
  const result = runFilterChange('');
  assert.equal(result.loadedIndex, null);
  assert.equal(result.selectedValue, '');
  assert.ok(result.calls.includes('clear-profile-status'));
  assert.equal(result.calls.some(call => call.startsWith('load:')), false);
});

test('Save, MAX and Reset are guarded when no Officer is selected', () => {
  assert.match(source, /function saveOfficerProfile\(silent=false,index=null\)\s*\{\s*if\(index==null&&\$\('officerSelect'\)\?\.value===''\)return;/);
  assert.match(source, /function maxSelectedOfficerProfile\(\)\s*\{\s*if\(\$\('officerSelect'\)\?\.value===''\)return;/);
  assert.match(source, /function resetOfficerProfile\(\)\s*\{\s*if\(\$\('officerSelect'\)\?\.value===''\)return;/);
});
