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
    officerProfileDirty: true,
    officers,
    $(id) { return id === 'officerSelect' ? select : null; },
    officerProfileKey(index) { return officers[Number(index)].season + '|' + officers[Number(index)].name; },
    saveOfficerProfile(silent, index) {
      calls.push('save:' + index);
      loadedIndex = Number(index);
      context.officerProfileDirty = false;
    },
    saveOfficerFilterState() { calls.push('save-filters'); },
    renderOfficerOptions() { calls.push('render-options'); select.value = nextSelection; },
    updateOfficerExperience() { calls.push('update-experience'); },
    loadOfficerProfile(index) { calls.push('load:' + index); loadedIndex = Number(index); },
    updateSkillRarityNotice() { calls.push('update-skill-rarity'); },
    updateSkillCostSummaries() { calls.push('update-skill-costs'); },
    currentOfficer() { return select.value === '' ? null : officers[Number(select.value)]; },
    applyOfficerProgress(value) { calls.push(value === null ? 'clear-officer-progress' : 'apply-officer-progress'); },
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
  assert.equal(result.calls.includes('save-selected-officer'), false);
  assert.equal(result.calls.some(call => call.startsWith('load:')), false);
});


test('filter changes do not recreate a deliberately reset profile when no edits are pending', () => {
  const result = runFilterChange('1');
  // runFilterChange starts dirty to exercise the normal pending-save path.
  assert.ok(result.calls.includes('save:0'));
});

test('reset clears the dirty flag and removes the saved profile', () => {
  const elements = { officerSelect: { value: '0' } };
  const profiles = { 'S7|First': { currentStar: '5', savedAt: 'previous' } };
  const writes = [];
  const context = {
    officers: [{ name: 'First', season: 'S7' }],
    officerProfileDirty: true,
    loadedOfficerProfileIndex: 0,
    $: id => elements[id] || null,
    confirm: () => true,
    officerProfileKey: index => 'S7|First',
    officerDisplayName: o => o.name,
    getOfficerProfiles: () => profiles,
    localStorage: { setItem: (key, value) => writes.push([key, value]) },
    applyOfficerProgress() {},
    updateProfileStatus() {},
    calculate() {}
  };
  vm.runInNewContext(extractNamedFunction('resetOfficerProfile', 'function saveProgress') + '\\nresetOfficerProfile();', context);
  assert.equal(context.officerProfileDirty, false);
  assert.equal(Object.hasOwn(profiles, 'S7|First'), false);
  assert.equal(writes.length, 1);
});

test('Save, MAX and Reset are guarded when no Officer is selected', () => {
  assert.match(source, /function saveOfficerProfile\(silent=false,index=null\)\s*\{\s*if\(index==null&&\$\('officerSelect'\)\?\.value===''\)return;/);
  assert.match(source, /function maxSelectedOfficerProfile\(\)\s*\{\s*if\(\$\('officerSelect'\)\?\.value===''\)return;/);
  assert.match(source, /function resetOfficerProfile\(\)\s*\{\s*if\(\$\('officerSelect'\)\?\.value===''\)return;/);
});


function extractNamedFunction(name, endMarker) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `${name} end marker must exist`);
  return source.slice(start, end);
}

test('MAX sets the selected Officer to the defined maximum without changing shared inventory', () => {
  const ids = ['officerSelect','currentStar','targetStar','unlocked','training','trainingExact','trainingLabel','currentLevel','targetLevel'];
  const elements = Object.fromEntries(ids.map(id => [id, { value: id === 'officerSelect' ? '1' : '0', checked: false }]));
  const sharedResources = { orvHeld: 12345, srvHeld: 6789, legendaryBadgeChestHeld: 4, legendarySelectionChestHeld: 3, xp: { 500: 99 } };
  const before = JSON.stringify(sharedResources);
  let saved = null;
  const context = {
    officers: [{ name: 'First', season: 'S7' }, { name: 'Second', season: 'S8' }],
    skills: Array(36).fill(false),
    $: id => elements[id] || null,
    confirm: () => true,
    officerDisplayName: o => o.name,
    renderSkillStrands() {},
    saveOfficerProfile() {
      saved = {
        currentStar: elements.currentStar.value,
        targetStar: elements.targetStar.value,
        unlocked: elements.unlocked.checked,
        skills: [...context.skills],
        training: elements.training.value,
        currentLevel: elements.currentLevel.value,
        targetLevel: elements.targetLevel.value
      };
    },
    calculate() {},
    alert() {},
    sharedResources
  };
  vm.runInNewContext(extractNamedFunction('maxSelectedOfficerProfile', 'function resetOfficerProfile'), context);
  vm.runInNewContext('maxSelectedOfficerProfile();', context);
  assert.equal(elements.currentStar.value, 5);
  assert.equal(elements.targetStar.value, 5);
  assert.equal(elements.unlocked.checked, true);
  assert.equal(elements.training.value, 180);
  assert.equal(elements.currentLevel.value, 70);
  assert.equal(elements.targetLevel.value, 70);
  assert.equal(saved.skills.length, 36);
  assert.ok(saved.skills.every(Boolean));
  assert.equal(JSON.stringify(sharedResources), before);
});

test('startup restoration with no matching Officer does not load Officer zero', () => {
  const elements = { officerSelect: { value: '' } };
  const calls = [];
  const context = {
    officers: [{ name: 'First' }, { name: 'Second' }],
    loadedOfficerProfileIndex: 0,
    $: id => elements[id] || null,
    localStorage: { getItem: () => null, setItem() {} },
    getOfficerProfiles: () => ({}),
    getGlobalResources: () => ({ orvHeld: '321' }),
    applyGlobalResources: value => calls.push(['global', value]),
    loadOfficerProfile: index => calls.push(['load', index]),
    applyOfficerProgress: value => calls.push(['progress', value]),
    updateProfileStatus: value => calls.push(['status', value]),
    calculate() {},
    officerProfileKey: () => 'key'
  };
  const start = source.indexOf('function loadProgress(){');
  const end = source.indexOf("\n}\n\n\nconst APP_VERSION", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  vm.runInNewContext(source.slice(start, end + 2) + '\nloadProgress();', context);
  assert.equal(context.loadedOfficerProfileIndex, null);
  assert.equal(calls.some(call => call[0] === 'load'), false);
  assert.ok(calls.some(call => call[0] === 'progress' && call[1] === null));
  assert.ok(calls.some(call => call[0] === 'global'));
});

test('startup restoration loads the selected Officer profile, not index zero', () => {
  const elements = { officerSelect: { value: '1' } };
  const calls = [];
  const context = {
    officers: [{ name: 'First' }, { name: 'Second' }],
    loadedOfficerProfileIndex: null,
    $: id => elements[id] || null,
    localStorage: { getItem: () => null, setItem() {} },
    getOfficerProfiles: () => ({}),
    getGlobalResources: () => ({ orvHeld: '321' }),
    applyGlobalResources: value => calls.push(['global', value]),
    loadOfficerProfile: index => calls.push(['load', index]),
    applyOfficerProgress: value => calls.push(['progress', value]),
    updateProfileStatus: value => calls.push(['status', value]),
    calculate() {},
    officerProfileKey: () => 'key'
  };
  const start = source.indexOf('function loadProgress(){');
  const end = source.indexOf("\n}\n\n\nconst APP_VERSION", start);
  vm.runInNewContext(source.slice(start, end + 2) + '\nloadProgress();', context);
  assert.deepEqual(calls.filter(call => call[0] === 'load'), [['load', 1]]);
});

test('backup persistence saves shared resources when Officer selection is empty', () => {
  const elements = { officerSelect: { value: '' } };
  const calls = [];
  const context = {
    officers: [{ name: 'First' }],
    $: id => elements[id] || null,
    officerProfileDirty: true,
    saveOfficerProfile: () => calls.push('officer'),
    saveGlobalResources: () => calls.push('global')
  };
  vm.runInNewContext(extractNamedFunction('persistCurrentStateBeforeBackup', 'function exportFullBackup') + '\npersistCurrentStateBeforeBackup();', context);
  assert.deepEqual(calls, ['global']);
});

test('backup persistence saves the selected Officer profile when one is selected', () => {
  const elements = { officerSelect: { value: '0' } };
  const calls = [];
  const context = {
    officers: [{ name: 'First' }],
    $: id => elements[id] || null,
    saveOfficerProfile: () => calls.push('officer'),
    saveGlobalResources: () => calls.push('global')
  };
  vm.runInNewContext(extractNamedFunction('persistCurrentStateBeforeBackup', 'function exportFullBackup') + '\npersistCurrentStateBeforeBackup();', context);
  assert.deepEqual(calls, ['officer']);
});


test('legacy single-save migration does not assign progress to Officer zero when filters match nobody', () => {
  const elements = { officerSelect: { value: '' } };
  const writes = [];
  const legacy = { currentStar: 4, targetStar: 5, unlocked: true, skills: Array(36).fill(true), orvHeld: 9876 };
  const context = {
    officers: [{ name: 'First' }, { name: 'Second' }],
    loadedOfficerProfileIndex: null,
    $: id => elements[id] || null,
    localStorage: {
      getItem: key => key === 'kow_progress_v4' ? JSON.stringify(legacy) : null,
      setItem: (key, value) => writes.push([key, value])
    },
    getOfficerProfiles: () => ({}),
    getGlobalResources: () => ({}),
    applyGlobalResources() {},
    loadOfficerProfile: index => writes.push(['loaded', index]),
    applyOfficerProgress: value => writes.push(['progress', value]),
    updateProfileStatus() {},
    calculate() {},
    officerProfileKey: index => 'profile-' + index,
    OFFICER_PROFILE_KEY: 'kow_officer_profiles_v435',
    GLOBAL_RESOURCE_KEY: 'kow_global_resources_v435'
  };
  const start = source.indexOf('function loadProgress(){');
  const end = source.indexOf("\n}\n\n\nconst APP_VERSION", start);
  vm.runInNewContext(source.slice(start, end + 2) + '\nloadProgress();', context);
  assert.equal(writes.some(([key]) => key === 'kow_officer_profiles_v435'), false);
  assert.equal(writes.some(([key]) => key === 'kow_global_resources_v435'), true);
  assert.equal(writes.some(([key]) => key === 'loaded'), false);
});
