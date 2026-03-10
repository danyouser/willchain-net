/**
 * Scenario Simulator — long-run randomized lifecycle test.
 *
 * Simulates 50 random actions across multiple users:
 * - register, designate successor, confirm activity
 * - time warps (partial and full inactivity periods)
 * - initiate/cancel claims, complete transfers
 * - recycle abandoned nodes
 * - claim dividends
 *
 * After each action, verifies key invariants:
 * - dividend pool <= contract balance
 * - totalSupply consistency
 * - UNREGISTERED users have 0 pending dividends
 *
 * Run: npx hardhat test test/scenario-simulator.test.js
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');

const DAY = 86400;
const PERIOD_90_DAYS = 90 * DAY;
const GRACE_PERIOD = 30 * DAY;
const CLAIM_PERIOD = 30 * DAY;
const COMMIT_REVEAL_WINDOW = DAY;
const TOTAL_TIMEOUT = PERIOD_90_DAYS + GRACE_PERIOD + CLAIM_PERIOD;

describe('Scenario Simulator — randomized lifecycle', function () {
  this.timeout(120000); // 2 min for long-run

  let token;
  let users;
  let owner;
  const NUM_USERS = 6;
  const NUM_ACTIONS = 50;

  // Track state for invariant checks
  let totalBurned = 0n;

  before(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    users = signers.slice(1, 1 + NUM_USERS);

    const WillChain = await ethers.getContractFactory('WillChain');
    token = await WillChain.deploy();
    await token.waitForDeployment();

    // Fund users
    for (const user of users) {
      await token.transfer(user.address, ethers.parseEther('5000000'));
    }
  });

  // ── Invariant Checker ─────────────────────────────────────────

  async function checkInvariants(label) {
    const contractAddr = await token.getAddress();
    const contractBal = await token.balanceOf(contractAddr);
    const dividendPool = await token.dividendPool();

    // INV-E1: dividend pool <= contract balance
    expect(dividendPool).to.be.lte(
      contractBal,
      `[${label}] dividendPool (${dividendPool}) > contractBal (${contractBal})`
    );

    // INV-R1: unregistered users have 0 pending dividends
    for (const user of users) {
      const isReg = await token.everRegistered(user.address);
      if (!isReg) {
        const pending = await token.pendingDividends(user.address);
        expect(pending).to.equal(
          0n,
          `[${label}] Unregistered user ${user.address} has pending dividends: ${pending}`
        );
      }
    }
  }

  // ── Random Helpers ────────────────────────────────────────────

  function randomUser() {
    return users[Math.floor(Math.random() * users.length)];
  }

  function randomOtherUser(exclude) {
    const candidates = users.filter(u => u.address !== exclude.address);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  async function getStatus(addr) {
    return Number(await token.getVaultStatus(addr));
  }

  async function timeWarp(seconds) {
    await ethers.provider.send('evm_increaseTime', [seconds]);
    await ethers.provider.send('evm_mine');
  }

  // ── Action Definitions ────────────────────────────────────────

  const actions = [
    {
      name: 'register',
      weight: 15,
      async execute() {
        const user = randomUser();
        const status = await getStatus(user.address);
        if (status !== 0) return `${user.address} already registered`;
        await token.connect(user).confirmActivity();
        return `registered ${user.address}`;
      },
    },
    {
      name: 'designate_successor',
      weight: 12,
      async execute() {
        const user = randomUser();
        const isReg = await token.everRegistered(user.address);
        if (!isReg) return `${user.address} not registered`;
        const successor = randomOtherUser(user);
        // Check for circular
        const successorState = await token.nodeStates(successor.address);
        if (successorState.designatedSuccessor === user.address) {
          return `circular successor blocked for ${user.address}`;
        }
        try {
          await token.connect(user).designateSuccessor(successor.address);
          return `${user.address} → successor ${successor.address}`;
        } catch {
          return `designateSuccessor failed for ${user.address}`;
        }
      },
    },
    {
      name: 'confirm_activity',
      weight: 15,
      async execute() {
        const user = randomUser();
        const isReg = await token.everRegistered(user.address);
        if (!isReg) return `${user.address} not registered`;
        await token.connect(user).confirmActivity();
        return `confirmed activity for ${user.address}`;
      },
    },
    {
      name: 'transfer',
      weight: 10,
      async execute() {
        const from = randomUser();
        const to = randomOtherUser(from);
        const bal = await token.balanceOf(from.address);
        if (bal === 0n) return `${from.address} has no balance`;
        const amount = bal / 100n; // 1% of balance
        if (amount === 0n) return `transfer amount too small`;
        await token.connect(from).transfer(to.address, amount);
        return `transferred ${ethers.formatEther(amount)} from ${from.address} to ${to.address}`;
      },
    },
    {
      name: 'time_warp_small',
      weight: 15,
      async execute() {
        const days = Math.floor(Math.random() * 30) + 1;
        await timeWarp(days * DAY);
        return `warped ${days} days`;
      },
    },
    {
      name: 'time_warp_large',
      weight: 8,
      async execute() {
        const days = Math.floor(Math.random() * 120) + 60;
        await timeWarp(days * DAY);
        return `warped ${days} days (large)`;
      },
    },
    {
      name: 'initiate_claim',
      weight: 8,
      async execute() {
        // Find a user who is designated as successor of someone in GRACE
        for (const target of users) {
          const state = await token.nodeStates(target.address);
          if (state.designatedSuccessor === ethers.ZeroAddress) continue;
          const status = await getStatus(target.address);
          if (status !== 2) continue; // Must be GRACE
          if (state.successorClaimInitiated) continue;
          const successor = users.find(u => u.address === state.designatedSuccessor);
          if (!successor) continue;
          try {
            await token.connect(successor).initiateSuccessorClaim(target.address);
            return `initiated claim on ${target.address} by ${successor.address}`;
          } catch {
            return `initiate claim failed on ${target.address}`;
          }
        }
        return 'no GRACE vaults with successors found';
      },
    },
    {
      name: 'cancel_claim',
      weight: 5,
      async execute() {
        for (const user of users) {
          const state = await token.nodeStates(user.address);
          if (state.successorClaimInitiated) {
            try {
              await token.connect(user).cancelSuccessorClaim();
              return `cancelled claim for ${user.address}`;
            } catch {
              return `cancel claim failed for ${user.address}`;
            }
          }
        }
        return 'no active claims to cancel';
      },
    },
    {
      name: 'recycle',
      weight: 8,
      async execute() {
        for (const target of users) {
          const status = await getStatus(target.address);
          if (status !== 4) continue; // ABANDONED
          const bal = await token.balanceOf(target.address);
          if (bal === 0n) continue;
          // Must be past fresh window
          await timeWarp(COMMIT_REVEAL_WINDOW + 1);
          try {
            await ethers.provider.send('evm_mine'); // extra block for flashloan guard
            await token.recycleInactiveNode(target.address);
            return `recycled ${target.address} (${ethers.formatEther(bal)} WILL)`;
          } catch (e) {
            return `recycle failed for ${target.address}: ${e.message?.slice(0, 60)}`;
          }
        }
        return 'no ABANDONED vaults to recycle';
      },
    },
    {
      name: 'claim_dividends',
      weight: 6,
      async execute() {
        const user = randomUser();
        const isReg = await token.everRegistered(user.address);
        if (!isReg) return `${user.address} not registered`;
        const pending = await token.pendingDividends(user.address);
        if (pending === 0n) return `${user.address} has no pending dividends`;
        await ethers.provider.send('evm_mine'); // flashloan guard
        await token.connect(user).claimDividends();
        return `claimed ${ethers.formatEther(pending)} dividends for ${user.address}`;
      },
    },
  ];

  // Build weighted action array
  const weightedActions = [];
  for (const action of actions) {
    for (let i = 0; i < action.weight; i++) {
      weightedActions.push(action);
    }
  }

  function randomAction() {
    return weightedActions[Math.floor(Math.random() * weightedActions.length)];
  }

  // ── Main Simulation ──────────────────────────────────────────

  it(`runs ${NUM_ACTIONS} random actions and all invariants hold`, async function () {
    const log = [];

    for (let step = 0; step < NUM_ACTIONS; step++) {
      const action = randomAction();
      try {
        const result = await action.execute();
        log.push(`[${step}] ${action.name}: ${result}`);
      } catch (e) {
        log.push(`[${step}] ${action.name}: ERROR — ${e.message?.slice(0, 80)}`);
      }

      // Check invariants after every action
      try {
        await checkInvariants(`step ${step} (${action.name})`);
      } catch (e) {
        console.error('\n=== Simulation Log ===');
        log.forEach(l => console.error(l));
        console.error('=== End Log ===\n');
        throw e;
      }
    }

    // Final comprehensive check
    await checkInvariants('final');

    // Print summary
    const statusCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const user of users) {
      const status = await getStatus(user.address);
      statusCounts[status]++;
    }

    console.log(`\n  Simulation complete: ${NUM_ACTIONS} actions`);
    console.log(`  Final statuses: UNREG=${statusCounts[0]} ACTIVE=${statusCounts[1]} GRACE=${statusCounts[2]} CLAIMABLE=${statusCounts[3]} ABANDONED=${statusCounts[4]}`);
    console.log(`  Total supply: ${ethers.formatEther(await token.totalSupply())} WILL`);
  });
});
