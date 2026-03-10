# Slither Accepted Findings

Slither static analysis runs in CI (`.github/workflows/ci.yml`, job `slither`).
The CI gate **fails only on High severity** findings.

This document catalogs accepted Medium/Low/Informational findings with rationale.

---

## CI Configuration

```yaml
slither contracts/WillChain.sol \
  --solc-remaps "@openzeppelin/=$(pwd)/node_modules/@openzeppelin/" \
  --exclude-dependencies \
  --exclude-informational \
  --exclude-low
```

- Dependencies (OpenZeppelin) excluded from analysis
- Only Medium and High severity reported
- High severity = CI failure
- Medium severity = documented here, accepted with rationale

---

## Accepted Findings

### M-01: Reentrancy in `_recycleInactiveNode` (False Positive)

**Detector:** `reentrancy-no-eth`

**Description:** Slither flags the `_recycleInactiveNode` function for reentrancy because
it performs external calls (token transfers) before modifying state.

**Why accepted:**
- Function is protected by `nonReentrant` modifier (OpenZeppelin ReentrancyGuard)
- All recipients are EOAs or the WillChain contract itself (no arbitrary callback)
- State modifications follow CEI pattern within the nonReentrant scope
- The `_burn()` call is internal and does not trigger external callbacks

### M-02: Block timestamp dependence

**Detector:** `timestamp`

**Description:** Slither flags `block.timestamp` usage in timer comparisons.

**Why accepted:**
- WillChain uses day-scale time periods (30–365 days)
- Block timestamp manipulation is limited to ~15 seconds
- 15-second precision is irrelevant for 30-day windows
- Base L2 has a single sequencer — timestamp manipulation is even less viable

### M-03: Missing zero-address check on `_successor` parameter

**Detector:** `missing-zero-check`

**Description:** Some internal functions don't explicitly check for zero address.

**Why accepted:**
- Public entry points (`designateSuccessor`) have explicit zero-address checks
- Internal functions are only called from guarded public functions
- Adding redundant checks would increase gas without security benefit

---

## How to Update This Document

When Slither reports new findings:

1. Run locally: `slither contracts/WillChain.sol --solc-remaps "@openzeppelin/=$(pwd)/node_modules/@openzeppelin/" --exclude-dependencies --json slither-report.json`
2. Review each finding against the contract logic
3. If accepted: add entry here with detector name, description, and rationale
4. If real issue: fix in contract, add test, update invariants

---

## Local Slither Note

As of 2026-03-10, Slither may not run locally due to `solc-select` path permissions
(`/Library/Developer/...`). It works correctly in CI (Ubuntu runner with Python 3.11).
Use CI results as the canonical Slither analysis.
