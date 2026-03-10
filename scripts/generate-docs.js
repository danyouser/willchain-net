#!/usr/bin/env node

/**
 * Docs-from-Code: auto-generate protocol reference tables.
 *
 * Reads WillChain.sol and extracts:
 * - Constants (public constant)
 * - Enum values
 * - Events
 * - Public/external function signatures
 *
 * Outputs: docs/GENERATED-REFERENCE.md
 *
 * Run: node scripts/generate-docs.js
 * CI: verify output hasn't drifted from committed version
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CONTRACT_PATH = path.resolve(__dirname, '..', 'contracts', 'WillChain.sol');
const OUTPUT_PATH = path.resolve(__dirname, '..', 'docs', 'GENERATED-REFERENCE.md');

const sol = fs.readFileSync(CONTRACT_PATH, 'utf8');
const lines = sol.split('\n');

// ── Extractors ──────────────────────────────────────────────────

function extractConstants() {
  const constants = [];
  for (const line of lines) {
    const m = line.match(/^\s*(uint256|uint64|uint8)\s+public\s+constant\s+(\w+)\s*=\s*(.+?)\s*;/);
    if (m) {
      constants.push({ type: m[1], name: m[2], value: m[3].trim() });
    }
  }
  return constants;
}

function extractEnums() {
  const enums = [];
  const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/g;
  let match;
  while ((match = enumRegex.exec(sol)) !== null) {
    const name = match[1];
    const values = match[2].split(',').map((v, i) => ({
      name: v.trim(),
      index: i,
    }));
    enums.push({ name, values });
  }
  return enums;
}

function extractEvents() {
  const events = [];
  for (const line of lines) {
    const m = line.match(/^\s*event\s+(\w+)\s*\(([^)]*)\)\s*;/);
    if (m) {
      events.push({ name: m[1], params: m[2].trim() });
    }
  }
  return events;
}

function extractFunctions() {
  const functions = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s*function\s+(\w+)\s*\(([^)]*)\)\s*(.*)/);
    if (!m) continue;
    const name = m[1];
    const params = m[2].trim();
    const rest = m[3];

    // Determine visibility
    let visibility = 'internal';
    if (rest.includes('external')) visibility = 'external';
    else if (rest.includes('public')) visibility = 'public';
    else if (rest.includes('private')) visibility = 'private';

    // Skip internal/private
    if (visibility === 'internal' || visibility === 'private') continue;

    // Determine mutability
    let mutability = 'nonpayable';
    if (rest.includes('pure')) mutability = 'pure';
    else if (rest.includes('view')) mutability = 'view';
    else if (rest.includes('payable') && !rest.includes('nonpayable')) mutability = 'payable';

    // Extract return type (simplified)
    const retMatch = rest.match(/returns\s*\(([^)]+)\)/);
    const returns = retMatch ? retMatch[1].trim() : '';

    functions.push({ name, params, visibility, mutability, returns });
  }
  return functions;
}

// ── Generate Markdown ───────────────────────────────────────────

function generate() {
  const constants = extractConstants();
  const enums = extractEnums();
  const events = extractEvents();
  const functions = extractFunctions();

  const lines = [
    '# WillChain Contract Reference',
    '',
    '> **Auto-generated** by `scripts/generate-docs.js` from `contracts/WillChain.sol`.',
    '> Do not edit manually — run `node scripts/generate-docs.js` to regenerate.',
    '',
    `Generated: ${new Date().toISOString().split('T')[0]}`,
    '',
    '---',
    '',
    '## Constants',
    '',
    '| Name | Type | Value |',
    '|------|------|-------|',
  ];

  for (const c of constants) {
    lines.push(`| \`${c.name}\` | ${c.type} | \`${c.value}\` |`);
  }

  lines.push('', '---', '', '## Enums', '');

  for (const e of enums) {
    lines.push(`### ${e.name}`, '', '| Index | Name |', '|-------|------|');
    for (const v of e.values) {
      lines.push(`| ${v.index} | ${v.name} |`);
    }
    lines.push('');
  }

  lines.push('---', '', '## Events', '', '| Event | Parameters |', '|-------|-----------|');

  for (const e of events) {
    lines.push(`| \`${e.name}\` | \`${e.params || '—'}\` |`);
  }

  lines.push('', '---', '', '## Public & External Functions', '');
  lines.push('| Function | Visibility | Mutability | Returns |', '|----------|-----------|------------|---------|');

  for (const f of functions) {
    const sig = `${f.name}(${f.params})`;
    lines.push(`| \`${sig}\` | ${f.visibility} | ${f.mutability} | \`${f.returns || '—'}\` |`);
  }

  lines.push('', '---', '', `Total: ${constants.length} constants, ${enums.length} enums, ${events.length} events, ${functions.length} public/external functions.`, '');

  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────

const output = generate();
fs.writeFileSync(OUTPUT_PATH, output);
console.log(`✅ Generated ${OUTPUT_PATH}`);
console.log(`   Constants: ${extractConstants().length}`);
console.log(`   Enums: ${extractEnums().length}`);
console.log(`   Events: ${extractEvents().length}`);
console.log(`   Functions: ${extractFunctions().length}`);
