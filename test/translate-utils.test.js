/**
 * Tests for pure utility functions in scripts/translate-langs.mjs
 * (flattenObj and setNestedKey)
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Inline the pure functions under test (mirrors scripts/translate-langs.mjs) ──

function flattenObj(obj, prefix = '') {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null) {
      Object.assign(result, flattenObj(v, fullKey));
    } else {
      result[fullKey] = v;
    }
  }
  return result;
}

function setNestedKey(obj, flatKey, value) {
  const parts = flatKey.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === undefined) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

// ── flattenObj ──
describe('flattenObj', () => {
  test('flattens a simple flat object unchanged', () => {
    const obj = { a: '1', b: '2' };
    assert.deepEqual(flattenObj(obj), { a: '1', b: '2' });
  });

  test('flattens one level of nesting', () => {
    const obj = { section: { key1: 'val1', key2: 'val2' } };
    assert.deepEqual(flattenObj(obj), {
      'section.key1': 'val1',
      'section.key2': 'val2',
    });
  });

  test('flattens two levels of nesting', () => {
    const obj = { a: { b: { c: 'deep' } } };
    assert.deepEqual(flattenObj(obj), { 'a.b.c': 'deep' });
  });

  test('handles mixed flat and nested keys', () => {
    const obj = { top: 'value', nested: { child: 'childVal' } };
    assert.deepEqual(flattenObj(obj), {
      top: 'value',
      'nested.child': 'childVal',
    });
  });

  test('empty object returns empty object', () => {
    assert.deepEqual(flattenObj({}), {});
  });

  test('handles numeric-like string values', () => {
    const obj = { count: '42' };
    assert.deepEqual(flattenObj(obj), { count: '42' });
  });

  test('preserves prefix when provided', () => {
    const obj = { key: 'val' };
    assert.deepEqual(flattenObj(obj, 'ns'), { 'ns.key': 'val' });
  });

  test('real-world i18n structure', () => {
    const obj = {
      dashboard: { title: 'Dashboard', subtitle: 'Overview' },
      nav: { home: 'Home' },
    };
    assert.deepEqual(flattenObj(obj), {
      'dashboard.title': 'Dashboard',
      'dashboard.subtitle': 'Overview',
      'nav.home': 'Home',
    });
  });
});

// ── setNestedKey ──
describe('setNestedKey', () => {
  test('sets a top-level key', () => {
    const obj = {};
    setNestedKey(obj, 'key', 'value');
    assert.deepEqual(obj, { key: 'value' });
  });

  test('sets a nested key (one level deep)', () => {
    const obj = {};
    setNestedKey(obj, 'section.key', 'value');
    assert.deepEqual(obj, { section: { key: 'value' } });
  });

  test('sets a deeply nested key (two levels)', () => {
    const obj = {};
    setNestedKey(obj, 'a.b.c', 'deep');
    assert.deepEqual(obj, { a: { b: { c: 'deep' } } });
  });

  test('creates intermediate objects as needed', () => {
    const obj = {};
    setNestedKey(obj, 'x.y.z', 'val');
    assert.ok(typeof obj.x === 'object');
    assert.ok(typeof obj.x.y === 'object');
    assert.equal(obj.x.y.z, 'val');
  });

  test('does not overwrite existing sibling keys', () => {
    const obj = { section: { existing: 'keep' } };
    setNestedKey(obj, 'section.new', 'added');
    assert.equal(obj.section.existing, 'keep');
    assert.equal(obj.section.new, 'added');
  });

  test('overwrites an existing value at the target key', () => {
    const obj = { section: { key: 'old' } };
    setNestedKey(obj, 'section.key', 'new');
    assert.equal(obj.section.key, 'new');
  });

  test('roundtrip: flattenObj then setNestedKey reconstructs original', () => {
    const original = {
      dashboard: { title: 'Test', count: '5' },
      nav: { home: 'Home', about: 'About' },
    };
    const flat = flattenObj(original);
    const reconstructed = {};
    for (const [key, value] of Object.entries(flat)) {
      setNestedKey(reconstructed, key, value);
    }
    assert.deepEqual(reconstructed, original);
  });
});
