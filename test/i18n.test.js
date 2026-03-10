/**
 * i18n completeness test
 * Ensures all keys from uk.json (source of truth) exist in every other language file.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const LANG_DIR = path.join(__dirname, '..', 'lang');
const SOURCE_LANG = 'uk';

function flattenKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && v !== null ? flattenKeys(v, key) : [key];
  });
}

const sourceFile = path.join(LANG_DIR, `${SOURCE_LANG}.json`);
const sourceJson = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
const sourceKeys = flattenKeys(sourceJson);

const langFiles = fs.readdirSync(LANG_DIR)
  .filter(f => f.endsWith('.json') && f !== `${SOURCE_LANG}.json`);

describe('i18n — all languages have all keys from uk.json', () => {
  for (const file of langFiles) {
    const lang = file.replace('.json', '');
    test(`${lang}.json has no missing keys`, () => {
      const json = JSON.parse(fs.readFileSync(path.join(LANG_DIR, file), 'utf8'));
      const keys = flattenKeys(json);
      const missing = sourceKeys.filter(k => !keys.includes(k));
      assert.deepEqual(missing, [], `Missing keys in ${lang}: ${missing.join(', ')}`);
    });
  }

  for (const file of langFiles) {
    const lang = file.replace('.json', '');
    test(`${lang}.json has no extra keys not in uk.json`, () => {
      const json = JSON.parse(fs.readFileSync(path.join(LANG_DIR, file), 'utf8'));
      const keys = flattenKeys(json);
      const extra = keys.filter(k => !sourceKeys.includes(k));
      assert.deepEqual(extra, [], `Extra keys in ${lang}: ${extra.join(', ')}`);
    });
  }
});
