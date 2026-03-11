# Beta-to-Mainnet Criteria

Objective criteria for deciding when WillChain is ready for mainnet deployment.
No "on gut feeling" — every item must be green.

## Hard Requirements (all must pass)

### Security
- [ ] External professional audit completed (Trail of Bits / Cyfrin / Code4rena)
- [ ] All critical and high findings resolved
- [ ] Medium findings resolved or documented with accepted rationale
- [ ] Bug bounty program announced (Immunefi)
- [ ] SECURITY.md with safe harbor published

### Stability
- [ ] 4+ weeks of continuous testnet beta with zero protocol incidents
- [ ] Bot uptime > 99% over the beta period (measured by UptimeRobot)
- [ ] API uptime > 99% over the beta period
- [ ] Zero unresolved `filter not found` or RPC disconnection patterns
- [ ] Event processing lag consistently < 5 minutes

### Correctness
- [ ] Full lifecycle completed by real users: register → designate → grace → claim → transfer
- [ ] Full lifecycle completed: register → abandon → recycle (commit-reveal)
- [ ] Dividend distribution verified with real multi-user scenario
- [ ] Bot alerts match actual on-chain state (no false positives/negatives over 2+ weeks)
- [ ] All 299+ Hardhat tests passing
- [ ] All Foundry fuzz tests passing (10 x 1,000 runs minimum)
- [ ] CI green on all 9 jobs

### Governance
- [ ] Treasury ownership transferred to Gnosis Safe multisig (2-of-3 minimum)
- [ ] Treasury timelock tested (propose → wait 2 days → execute)
- [ ] Deployer wallet is fresh (no prior history)
- [ ] Private key stored in hardware wallet

### Operations
- [ ] Production monitoring live (uptime, block lag, error rate, cert expiry)
- [ ] Incident runbook tested with at least 3 scenarios
- [ ] On-call rotation defined (even if 1 person)
- [ ] Alert channels configured (Telegram / email)
- [ ] Backup RPC provider configured

### User Experience
- [ ] 5+ real beta testers completed full onboarding without assistance
- [ ] FAQ covers top 10 user questions
- [ ] Support response time < 24 hours during beta
- [ ] No unresolved UX blockers from beta feedback

## Soft Goals (nice to have before mainnet)

- [ ] Formal verification (Certora/Halmos) on core invariants
- [ ] Property-based simulation (100+ step scenarios)
- [ ] Analytics dashboard for onboarding funnel
- [ ] Multi-language support verified by native speakers
- [ ] Gas optimization review (batch operations, storage packing)

## Decision Process

1. Fill in this checklist based on evidence (links to PRs, logs, metrics)
2. All hard requirements must be checked
3. Review with at least one external party (advisor, auditor, or technical peer)
4. Final go/no-go decision documented with date and rationale
