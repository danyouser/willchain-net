#!/usr/bin/env node

/**
 * WillChain Release Gate
 *
 * Single script that runs every quality check before a release.
 * Exit code 0 = safe to ship. Non-zero = fix issues first.
 *
 * Usage:
 *   node scripts/qa.mjs          # full gate
 *   node scripts/qa.mjs --quick  # skip shared tests (for iteration)
 *
 * What it checks:
 *   1. Contract compile (hardhat)
 *   2. Contract tests (hardhat)
 *   3. Shared / utility tests (node:test)
 *   4. Frontend lint (eslint)
 *   5. Frontend tests (vitest)
 *   6. Frontend build (vite)
 *   7. Bundle size budget (700kB/chunk)
 *   8. Bot tests (node:test)
 *   9. Docs generation sync (GENERATED-REFERENCE.md)
 *  10. Critical file existence
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const quick = process.argv.includes('--quick')

const results = []
let failed = 0

function run(label, cmd, opts = {}) {
  const cwd = opts.cwd || ROOT
  process.stdout.write(`\n── ${label} `)
  const start = Date.now()
  try {
    execSync(cmd, { cwd, stdio: 'pipe', timeout: 300_000 })
    const ms = Date.now() - start
    process.stdout.write(`✅ (${(ms / 1000).toFixed(1)}s)\n`)
    results.push({ label, status: '✅', ms })
  } catch (err) {
    const ms = Date.now() - start
    process.stdout.write(`❌ (${(ms / 1000).toFixed(1)}s)\n`)
    const output = (err.stdout?.toString() || '') + (err.stderr?.toString() || '')
    const tail = output.split('\n').slice(-20).join('\n')
    if (tail.trim()) console.error(tail)
    results.push({ label, status: '❌', ms })
    failed++
  }
}

function check(label, fn) {
  process.stdout.write(`\n── ${label} `)
  try {
    fn()
    process.stdout.write('✅\n')
    results.push({ label, status: '✅', ms: 0 })
  } catch (err) {
    process.stdout.write('❌\n')
    console.error(`   ${err.message}`)
    results.push({ label, status: '❌', ms: 0 })
    failed++
  }
}

// ── Header ──────────────────────────────────────────────────────

console.log('╔══════════════════════════════════════════╗')
console.log('║     WillChain Release Gate               ║')
console.log(`║     Mode: ${quick ? 'QUICK' : 'FULL '}                        ║`)
console.log('╚══════════════════════════════════════════╝')

const totalStart = Date.now()

// ── 1. Contract ─────────────────────────────────────────────────

run('Contract compile', 'npx hardhat compile')
run('Contract tests', 'npx hardhat test')

// ── 2. Shared tests ─────────────────────────────────────────────

if (!quick) {
  run('Shared & utility tests',
    'node --test test/vault-status.test.js test/timer-logic.test.js test/i18n.test.js test/i18n-unused.test.js test/translate-utils.test.js test/canonical-fixtures.test.js test/ci-assertions.test.js'
  )
}

// ── 3. Frontend ─────────────────────────────────────────────────

const FE = resolve(ROOT, 'frontend-react')

run('Frontend lint', 'npx eslint src/', { cwd: FE })
run('Frontend tests', 'npx vitest run src/test/', { cwd: FE })
run('Frontend build', 'npx vite build', { cwd: FE })

// ── 4. Bundle size budget ───────────────────────────────────────

check('Bundle size budget (700kB/chunk)', () => {
  const distDir = resolve(FE, 'dist', 'assets')
  if (!existsSync(distDir)) throw new Error('dist/assets not found — build failed?')

  const jsFiles = readdirSync(distDir).filter(f => f.endsWith('.js'))
  for (const name of jsFiles) {
    const sizeKB = Math.round(statSync(resolve(distDir, name)).size / 1024)
    if (sizeKB > 700) {
      throw new Error(`${name}: ${sizeKB}kB exceeds 700kB budget`)
    }
  }
})

// ── 5. Bot ──────────────────────────────────────────────────────

run('Bot tests', 'npm test', { cwd: resolve(ROOT, 'bot') })

// ── 6. Docs sync ────────────────────────────────────────────────

check('Docs generation sync', () => {
  const refPath = resolve(ROOT, 'docs', 'GENERATED-REFERENCE.md')
  if (!existsSync(refPath)) throw new Error('GENERATED-REFERENCE.md missing')

  const before = readFileSync(refPath, 'utf8')
  execSync('node scripts/generate-docs.js', { cwd: ROOT, stdio: 'pipe' })
  const after = readFileSync(refPath, 'utf8')

  // Compare ignoring the date line (changes daily)
  const strip = s => s.replace(/^Generated: .+$/m, '')
  if (strip(before) !== strip(after)) {
    writeFileSync(refPath, before)
    throw new Error('GENERATED-REFERENCE.md is out of sync — run: node scripts/generate-docs.js')
  }
  // Restore original (preserves committed date)
  writeFileSync(refPath, before)
})

// ── 7. Critical file checks ────────────────────────────────────

check('Critical files exist', () => {
  const required = [
    'docs/PROTOCOL-TRUTH.md',
    'docs/PROTOCOL-SPEC.md',
    'docs/INVARIANTS.md',
    'SECURITY.md',
    'README.md',
    '.env.example',
    'bot/.env.example',
  ]
  for (const f of required) {
    if (!existsSync(resolve(ROOT, f))) {
      throw new Error(`Missing: ${f}`)
    }
  }
})

// ── Summary ─────────────────────────────────────────────────────

const totalMs = Date.now() - totalStart
console.log('\n╔══════════════════════════════════════════╗')
console.log('║     Results                              ║')
console.log('╠══════════════════════════════════════════╣')

for (const r of results) {
  const pad = r.label.padEnd(36)
  console.log(`║  ${r.status} ${pad} ║`)
}

console.log('╠══════════════════════════════════════════╣')
const timeStr = (totalMs / 1000).toFixed(1) + 's'
console.log(`║  Total: ${timeStr}${' '.repeat(31 - timeStr.length)}║`)

if (failed > 0) {
  console.log(`║  ❌ ${failed} check(s) FAILED${' '.repeat(20 - String(failed).length)}║`)
  console.log('╚══════════════════════════════════════════╝')
  process.exit(1)
} else {
  console.log('║  ✅ All checks passed — safe to ship     ║')
  console.log('╚══════════════════════════════════════════╝')
}
