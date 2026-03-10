/**
 * CI-level semantic assertions for cross-layer consistency.
 *
 * These tests catch drift between contract, frontend, bot, and docs
 * that cannot be detected by simple grep-based CI checks.
 *
 * Run: node --test test/ci-assertions.test.js
 * CI:  runs as part of the shared-tests job
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ── ABI Drift ──────────────────────────────────────────────────────────

describe('ABI drift — frontend contract.ts includes required functions', () => {
  const contractTs = readFile('frontend-react/src/config/contract.ts');

  const requiredFunctions = [
    'confirmActivity',
    'designateSuccessor',
    'setInactivityPeriod',
    'updateVaultData',
    'initiateSuccessorClaim',
    'completeVaultTransfer',
    'cancelSuccessorClaim',
    'recycleInactiveNode',
    'commitRecycle',
    'executeRecycle',
    'claimDividends',
    'getNodeState',
    'getVaultStatus',
    'getNetworkStatistics',
    'pendingDividends',
    'balanceOf',
    'transfer',
  ];

  for (const fn of requiredFunctions) {
    test(`ABI includes "${fn}"`, () => {
      assert.ok(
        contractTs.includes(`'${fn}'`) || contractTs.includes(`"${fn}"`),
        `Function "${fn}" not found in contract.ts ABI`,
      );
    });
  }
});

describe('ABI drift — frontend contract.ts includes required constants', () => {
  const contractTs = readFile('frontend-react/src/config/contract.ts');

  test('GRACE_PERIOD_SECONDS defined', () => {
    assert.match(contractTs, /GRACE_PERIOD_SECONDS/);
  });

  test('CLAIM_PERIOD_SECONDS defined', () => {
    assert.match(contractTs, /CLAIM_PERIOD_SECONDS/);
  });

  test('COMMIT_REVEAL_WINDOW defined', () => {
    assert.match(contractTs, /COMMIT_REVEAL_WINDOW/);
  });

  test('INACTIVITY_PERIODS defined', () => {
    assert.match(contractTs, /INACTIVITY_PERIODS/);
  });

  test('SERVICE_TIERS defined', () => {
    assert.match(contractTs, /SERVICE_TIERS/);
  });
});

// ── Docs drift — required sections in key docs ────────────────────────

describe('Docs drift — PROTOCOL-SPEC.md covers all vault statuses', () => {
  const spec = readFile('docs/PROTOCOL-SPEC.md');

  for (const status of ['UNREGISTERED', 'ACTIVE', 'GRACE', 'CLAIMABLE', 'ABANDONED']) {
    test(`mentions ${status}`, () => {
      assert.ok(spec.includes(status), `PROTOCOL-SPEC.md missing status: ${status}`);
    });
  }

  test('mentions commit-reveal', () => {
    assert.ok(
      spec.toLowerCase().includes('commit-reveal') || spec.toLowerCase().includes('commit reveal'),
      'PROTOCOL-SPEC.md missing commit-reveal documentation',
    );
  });
});

describe('Docs drift — SECURITY-MODEL.md covers key topics', () => {
  const doc = readFile('docs/SECURITY-MODEL.md');

  const requiredTopics = [
    'transferFrom',
    'Smart Wallet',
    'Successor claiming',
    'Dividend',
    'UNREGISTERED',
    'Ownable2Step',
  ];

  for (const topic of requiredTopics) {
    test(`mentions "${topic}"`, () => {
      assert.ok(doc.includes(topic), `SECURITY-MODEL.md missing topic: ${topic}`);
    });
  }
});

describe('Docs drift — INVARIANTS.md covers all invariant categories', () => {
  const doc = readFile('docs/INVARIANTS.md');

  const categories = [
    'Economic Invariants',
    'Registration Invariants',
    'Timer Invariants',
    'Successor Invariants',
    'MEV Protection Invariants',
    'Admin Invariants',
  ];

  for (const cat of categories) {
    test(`includes "${cat}" section`, () => {
      assert.ok(doc.includes(cat), `INVARIANTS.md missing section: ${cat}`);
    });
  }
});

// ── Forbidden phrases in production code ──────────────────────────────

describe('Forbidden phrases — no debug artifacts in production', () => {
  const prodFiles = [
    'contracts/WillChain.sol',
    'frontend-react/src/config/contract.ts',
    'frontend-react/src/config/wagmi.ts',
    'shared/vault-status.js',
    'shared/contract-config.js',
  ];

  const forbidden = [
    { pattern: /console\.log\(/, name: 'console.log' },
    { pattern: /FIXME|HACK|XXX/i, name: 'FIXME/HACK/XXX' },
  ];

  for (const file of prodFiles) {
    if (!fileExists(file)) continue;
    const content = readFile(file);
    for (const { pattern, name } of forbidden) {
      test(`${file}: no ${name}`, () => {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          // Skip comments containing these in Solidity (NatSpec, etc.)
          const line = lines[i];
          if (file.endsWith('.sol') && (line.trim().startsWith('//') || line.trim().startsWith('*'))) continue;
          assert.ok(!pattern.test(line), `${file}:${i + 1} contains forbidden "${name}": ${line.trim()}`);
        }
      });
    }
  }
});

// ── Shared module consistency ─────────────────────────────────────────

describe('Shared modules — vault-status.js exports', () => {
  const vs = require('../shared/vault-status.js');

  test('exports VAULT_STATUS with 5 values', () => {
    assert.equal(Object.keys(vs.VAULT_STATUS).length, 5);
    assert.equal(vs.VAULT_STATUS.UNREGISTERED, 0);
    assert.equal(vs.VAULT_STATUS.ABANDONED, 4);
  });

  test('exports deriveVaultStatus function', () => {
    assert.equal(typeof vs.deriveVaultStatus, 'function');
  });

  test('exports helper functions', () => {
    assert.equal(typeof vs.needsCriticalAlert, 'function');
    assert.equal(typeof vs.approachingInactivity, 'function');
    assert.equal(typeof vs.statusName, 'function');
  });
});

describe('Shared modules — contract-config.js exports', () => {
  const cc = require('../shared/contract-config.js');

  test('exports ACTIVE_NETWORK with contractAddress', () => {
    assert.ok(cc.ACTIVE_NETWORK, 'ACTIVE_NETWORK not exported');
    assert.ok(cc.ACTIVE_NETWORK.contractAddress, 'contractAddress missing');
    assert.match(cc.ACTIVE_NETWORK.contractAddress, /^0x[0-9a-fA-F]{40}$/);
  });

  test('exports ACTIVE_NETWORK with chainId', () => {
    assert.ok(cc.ACTIVE_NETWORK.chainId, 'chainId missing');
  });
});

// ── Canonical fixtures present ────────────────────────────────────────

describe('Canonical fixtures — file structure', () => {
  test('shared/fixtures/canonical-states.json exists', () => {
    assert.ok(fileExists('shared/fixtures/canonical-states.json'));
  });

  test('has _meta, states, transitions, invariants', () => {
    const data = JSON.parse(readFile('shared/fixtures/canonical-states.json'));
    assert.ok(data._meta, 'Missing _meta');
    assert.ok(Array.isArray(data.states), 'Missing states array');
    assert.ok(Array.isArray(data.transitions), 'Missing transitions array');
    assert.ok(Array.isArray(data.invariants), 'Missing invariants array');
  });

  test('has at least 10 states', () => {
    const data = JSON.parse(readFile('shared/fixtures/canonical-states.json'));
    assert.ok(data.states.length >= 10, `Expected >= 10 states, got ${data.states.length}`);
  });

  test('has at least 10 transitions', () => {
    const data = JSON.parse(readFile('shared/fixtures/canonical-states.json'));
    assert.ok(data.transitions.length >= 10, `Expected >= 10 transitions, got ${data.transitions.length}`);
  });
});

// ── Key docs exist ────────────────────────────────────────────────────

describe('Required documentation exists', () => {
  const requiredDocs = [
    'docs/PROTOCOL-SPEC.md',
    'docs/PROTOCOL-TRUTH.md',
    'docs/SECURITY-MODEL.md',
    'docs/INVARIANTS.md',
    'docs/AUDIT-GUIDE.md',
    'docs/WHITEPAPER.md',
    'SECURITY.md',
    'README.md',
  ];

  for (const doc of requiredDocs) {
    test(`${doc} exists`, () => {
      assert.ok(fileExists(doc), `Missing required doc: ${doc}`);
    });
  }
});
