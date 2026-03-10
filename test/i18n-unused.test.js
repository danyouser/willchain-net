/**
 * i18n unused keys test
 * Checks that every key in lang/uk.json is actually used somewhere in the React frontend.
 * Source of truth: lang/uk.json (root)
 * Frontend: frontend-react/src/ (TSX/TS/CSS)
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const LANG_DIR = path.join(__dirname, '..', 'lang');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend-react', 'src');

// Recursively collect all TS/TSX/CSS source files
function collectSourceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(full);
    if (/\.(tsx?|css)$/.test(entry.name)) return [fs.readFileSync(full, 'utf8')];
    return [];
  });
}

const sourceFiles = collectSourceFiles(FRONTEND_DIR);

const allSource = sourceFiles.join('\n');

function flattenKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && v !== null ? flattenKeys(v, key) : [key];
  });
}

const ukJson = JSON.parse(fs.readFileSync(path.join(LANG_DIR, 'uk.json'), 'utf8'));
const allKeys = flattenKeys(ukJson);

// Keys used dynamically (built from variable parts) or via special patterns in React
const DYNAMIC_OR_INDIRECT_KEYS = new Set([
  // Language names — LANG_NAMES hardcoded in Header.tsx (not via t())
  'languages.en', 'languages.es', 'languages.pt', 'languages.ru', 'languages.de',
  'languages.fr', 'languages.tr', 'languages.uk', 'languages.pl', 'languages.it', 'languages.nl',
  // FAQ — used as t(`faq.q${n}`) / t(`faq.a${n}`) loop in FAQSection.tsx
  'faq.q1', 'faq.q2', 'faq.q3', 'faq.q4', 'faq.q5', 'faq.q6', 'faq.q7', 'faq.q8',
  'faq.a1', 'faq.a2', 'faq.a3', 'faq.a4', 'faq.a5', 'faq.a6', 'faq.a7', 'faq.a8',
  // HowItWorks — used as t(`how_it_works.step${n}_title`) loop
  'how_it_works.step1_title', 'how_it_works.step1_desc',
  'how_it_works.step2_title', 'how_it_works.step2_desc',
  'how_it_works.step3_title', 'how_it_works.step3_desc',
  'how_it_works.step4_title', 'how_it_works.step4_desc',
  // VaultStatus badges — used via status map/object lookup
  'status.unregistered', 'status.active', 'status.grace', 'status.claimable', 'status.abandoned',
  // meta — used in index.html or SSR (not in TSX source)
  'meta.title', 'meta.description', 'meta.og_title', 'meta.og_description',
  // problem card icons
  'problem.card1_icon', 'problem.card2_icon', 'problem.card3_icon',
]);

// Keys that exist in uk.json but are NOT used in the React frontend.
// Either legacy vanilla-only keys or genuinely orphaned.
const KNOWN_ORPHANED_KEYS = new Set([]);

describe('i18n — all uk.json keys are used in frontend', () => {
  const unusedKeys = allKeys.filter(key => {
    if (DYNAMIC_OR_INDIRECT_KEYS.has(key)) return false;
    if (KNOWN_ORPHANED_KEYS.has(key)) return false;
    return !allSource.includes(`'${key}'`) &&
           !allSource.includes(`"${key}"`);
  });

  test('no unexpected unused keys in uk.json', () => {
    assert.deepEqual(
      unusedKeys,
      [],
      `Unexpected unused i18n keys:\n${unusedKeys.map(k => `  - ${k}`).join('\n')}`
    );
  });

  test('known orphaned keys list is accurate (none secretly used)', () => {
    const secretlyUsed = [...KNOWN_ORPHANED_KEYS].filter(key =>
      allSource.includes(`'${key}'`) || allSource.includes(`"${key}"`)
    );
    assert.deepEqual(
      secretlyUsed,
      [],
      `These "orphaned" keys are actually still used:\n${secretlyUsed.map(k => `  - ${k}`).join('\n')}`
    );
  });

  test('known orphaned keys — reminder to clean up uk.json', () => {
    // This test always passes but prints the list so it's visible in output
    if (KNOWN_ORPHANED_KEYS.size > 0) {
      console.log(`      ℹ️  ${KNOWN_ORPHANED_KEYS.size} orphaned keys in uk.json (safe to delete):`);
      for (const k of KNOWN_ORPHANED_KEYS) console.log(`         - ${k}`);
    }
    assert.ok(true);
  });
});
