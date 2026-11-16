#!/usr/bin/env node
// Validates the Officer Command Centre's published and bundled officer datasets.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const checks = [];
const readJson = (file) => {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { errors.push(`${file}: invalid or unreadable JSON (${error.message})`); return null; }
};
const check = (label, condition, detail = '') => {
  checks.push({ label, passed: Boolean(condition), detail });
  if (!condition) errors.push(`${label}${detail ? ': ' + detail : ''}`);
};
const key = (value) => String(value ?? '').trim().toLocaleLowerCase('en-GB');
const parseCsv = (input) => {
  const text = input.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field.length === 0) quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); if (row.some(v => v !== '')) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (quoted) throw new Error('unterminated quoted CSV field');
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); if (row.some(v => v !== '')) rows.push(row); }
  const headers = (rows.shift() || []).map(v => v.trim());
  return rows.map((values, index) => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ''])));
};
const readCsv = (file) => {
  try { return parseCsv(fs.readFileSync(path.join(root, file), 'utf8')); }
  catch (error) { errors.push(`${file}: CSV could not be parsed (${error.message})`); return []; }
};
const validateRows = (label, rows) => {
  check(label + ' is a non-empty array', Array.isArray(rows) && rows.length > 0);
  if (!Array.isArray(rows)) return;
  const seen = new Set();
  for (const [i, officer] of rows.entries()) {
    const name = key(officer?.name);
    check(`${label} row ${i + 1} has a name`, Boolean(name));
    if (name) {
      check(`${label} has no duplicate name: ${officer.name}`, !seen.has(name));
      seen.add(name);
    }
    check(`${label} row ${i + 1} has a season`, Boolean(String(officer?.season ?? '').trim()));
    for (const field of ['orv', 'srv']) {
      check(`${label} ${officer?.name || 'row ' + (i + 1)} has valid ${field}`,
        Number.isInteger(Number(officer?.[field])) && Number(officer[field]) >= 0);
    }
    if (officer?.rarity !== undefined) check(`${label} ${officer.name} has valid rarity`,
      ['Legendary', 'Epic', 'Elite'].includes(officer.rarity));
  }
  return seen;
};
const main = readJson('officers.json');
const defaults = readJson('officers-default.json');
const metadata = readJson('officer-data-version.json');
const mainCsv = readCsv('officers.csv');
const defaultCsv = readCsv('officers-default.csv');
const mainNames = validateRows('officers.json', main || []);
const defaultNames = validateRows('officers-default.json', defaults || []);

const compareCsv = (label, jsonRows, csvRows, fields) => {
  check(label + ' JSON/CSV row counts match', jsonRows.length === csvRows.length,
    `JSON ${jsonRows.length}, CSV ${csvRows.length}`);
  const csvByName = new Map(csvRows.map(row => [key(row.name ?? row['Officer Name']), row]));
  for (const officer of jsonRows) {
    const csv = csvByName.get(key(officer.name));
    check(label + ' CSV contains ' + officer.name, Boolean(csv));
    if (!csv) continue;
    for (const [jsonField, csvField] of fields) {
      const a = String(officer[jsonField] ?? '').trim();
      const b = String(csv[csvField] ?? '').trim();
      check(label + ' ' + officer.name + ' ' + jsonField + ' matches CSV', a === b,
        `JSON="${a}" CSV="${b}"`);
    }
  }
};
compareCsv('Published officers', main || [], mainCsv,
  [['name','name'],['season','season'],['orv','orv'],['srv','srv'],['role','role'],['notes','notes'],['rarity','rarity']]);
compareCsv('Default officers', defaults || [], defaultCsv,
  [['name','Officer Name'],['season','Season'],['orv','ORV per Badge'],['srv','SRV per Exclusive Star'],['notes','Notes']]);

if (Array.isArray(defaults) && Array.isArray(main)) {
  const published = new Map(main.map(o => [key(o.name), o]));
  for (const officer of defaults) {
    const source = published.get(key(officer.name));
    check('Default officer exists in published dataset: ' + officer.name, Boolean(source));
    if (source) {
      check('Default costs match published data: ' + officer.name,
        Number(source.orv) === Number(officer.orv) && Number(source.srv) === Number(officer.srv));
    }
  }
}
if (metadata && Array.isArray(main)) {
  check('Data version officerCount matches officers.json',
    Number(metadata.officerCount) === main.length,
    `metadata ${metadata.officerCount}, actual ${main.length}`);
  check('Data version identifies Enhancement Development',
    metadata.environment === 'Enhancement Development', String(metadata.environment));
}

// The inline array is the app's offline/bundled fallback. Keep it aligned with the
// canonical published JSON, without confusing it with the intentionally smaller defaults.
try {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const match = html.match(/const DEFAULT_OFFICERS=(\[[\s\S]*?\]);\s*\n/);
  check('index.html contains bundled DEFAULT_OFFICERS array', Boolean(match));
  if (match && Array.isArray(main)) {
    const bundled = JSON.parse(match[1]);
    check('Bundled and published officer counts match', bundled.length === main.length,
      `bundled ${bundled.length}, published ${main.length}`);
    const byName = new Map(main.map(o => [key(o.name), o]));
    for (const officer of bundled) {
      const source = byName.get(key(officer.name));
      check('Bundled officer exists in officers.json: ' + officer.name, Boolean(source));
      if (source) for (const field of ['season','orv','srv','role','rarity']) {
        check('Bundled ' + officer.name + ' ' + field + ' matches published data',
          String(officer[field] ?? '') === String(source[field] ?? ''));
      }
    }
  }
} catch (error) { errors.push('index.html: could not validate bundled officer data (' + error.message + ')'); }

// Portrait filenames are derived from the officer's season and display name.
if (Array.isArray(main)) {
  const portraitDir = path.join(root, 'officer-portraits');
  check('officer-portraits directory exists', fs.existsSync(portraitDir));
  if (fs.existsSync(portraitDir)) {
    const files = new Set(fs.readdirSync(portraitDir).filter(f => /\.jpe?g$/i.test(f)).map(f => f.toLowerCase()));
    const expected = new Set();
    for (const officer of main) {
      const season = String(officer.season || '').trim();
      let name = String(officer.name || '').trim();
      if (season && name.toLowerCase().startsWith((season + ' ').toLowerCase())) name = name.slice(season.length).trim();
      const slug = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const filename = (season.toLowerCase() === 'original' ? slug : season.toLowerCase() + '-' + slug) + '.jpg';
      expected.add(filename);
      check('Portrait exists for ' + officer.name, files.has(filename), filename);
    }
    check('No unexpected portrait files', [...files].every(f => expected.has(f)),
      [...files].filter(f => !expected.has(f)).join(', '));
  }
}

console.log('\nOfficer data validation');
console.log('========================');
for (const item of checks) console.log(`${item.passed ? 'PASS' : 'FAIL'}  ${item.label}${item.detail ? ' — ' + item.detail : ''}`);
console.log(`\nResult: ${checks.filter(x => x.passed).length}/${checks.length} checks passed; ${errors.length} error(s).`);
if (errors.length) process.exitCode = 1;
