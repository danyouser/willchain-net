/**
 * WillChain Bot — Auto-Recycle Module
 *
 * Automatically recycles ABANDONED nodes to earn the 1% maintainer reward.
 * Supports commit-reveal for fresh ABANDONED nodes (< 24h) and direct
 * recycle for stale ones.
 *
 * Requires PRIVATE_KEY in .env to sign transactions.
 * Enable with RECYCLE_ENABLED=true in .env.
 */

const { ethers } = require('ethers');
const db = require('./database');
const { log } = require('./utils');

const COMMIT_REVEAL_WINDOW = 86400; // 1 day in seconds
const COMMIT_MIN_DELAY_BLOCKS = 2;
const COMMIT_MAX_DELAY_BLOCKS = 256;

let contract;
let wallet;
let provider;
let CONFIG;

function init(contractInstance, providerInstance, config) {
  contract = contractInstance;
  provider = providerInstance;
  CONFIG = config;

  if (!config.privateKey) {
    log('INFO', '[Recycle] PRIVATE_KEY not set — auto-recycle disabled');
    return;
  }

  wallet = new ethers.Wallet(config.privateKey, provider);
  contract = contract.connect(wallet);
  log('INFO', `[Recycle] Auto-recycle enabled, signer: ${wallet.address}`);
}

/**
 * Check if a node is ABANDONED and has balance > 0.
 * Returns { isAbandoned, isFresh, abandonedAt, balance } or null.
 */
async function checkNode(nodeAddress) {
  try {
    const [state, status, balance] = await Promise.all([
      contract.getNodeState(nodeAddress),
      contract.getVaultStatus(nodeAddress),
      contract.balanceOf(nodeAddress),
    ]);

    // VaultStatus 4 = ABANDONED
    const isAbandoned = Number(status) === 4;
    if (!isAbandoned || balance === 0n) return null;

    // Compute abandonedAt — two paths mirror contract _isFreshAbandoned()
    const lastActivity = Number(state.lastActivityTimestamp);
    const inactivityPeriod = Number(state.inactivityPeriod);
    const gracePeriod = 30 * 86400;
    const claimPeriod = 30 * 86400;

    let abandonedAt;
    if (state.successorClaimInitiated && Number(state.claimInitiationTimestamp) > 0) {
      // Path 1: Claim was initiated then expired
      abandonedAt = Number(state.claimInitiationTimestamp) + gracePeriod + claimPeriod;
    } else {
      // Path 2: Natural inactivity timeline
      abandonedAt = lastActivity + inactivityPeriod + gracePeriod + claimPeriod;
    }

    const now = Math.floor(Date.now() / 1000);
    const isFresh = now <= abandonedAt + COMMIT_REVEAL_WINDOW;

    return { isAbandoned: true, isFresh, abandonedAt, balance };
  } catch (error) {
    log('ERROR', `[Recycle] Failed to check node ${nodeAddress}`, error.message);
    return null;
  }
}

/**
 * Generate a random 32-byte salt.
 */
function generateSalt() {
  return ethers.hexlify(ethers.randomBytes(32));
}

/**
 * Compute commit hash: keccak256(abi.encodePacked(abandonedNode, salt, msg.sender))
 */
function computeCommitHash(abandonedNode, salt, committer) {
  return ethers.solidityPackedKeccak256(
    ['address', 'bytes32', 'address'],
    [abandonedNode, salt, committer]
  );
}

/**
 * Phase 1: Send commitRecycle transaction and save salt.
 */
async function commitRecycle(abandonedNode) {
  if (!wallet) return false;

  const salt = generateSalt();
  const commitHash = computeCommitHash(abandonedNode, salt, wallet.address);

  try {
    const tx = await contract.commitRecycle(commitHash);
    const receipt = await tx.wait();
    const commitBlock = receipt.blockNumber;

    db.saveRecycleCommit(abandonedNode, salt, commitBlock);
    log('SUCCESS', `[Recycle] Committed recycle for ${abandonedNode} at block ${commitBlock}`);
    return true;
  } catch (error) {
    log('ERROR', `[Recycle] commitRecycle failed for ${abandonedNode}`, error.message);
    return false;
  }
}

/**
 * Phase 2: Execute recycle after commit delay.
 */
async function executeRecycle(abandonedNode) {
  if (!wallet) return false;

  const commit = db.getRecycleCommit(abandonedNode);
  if (!commit) {
    log('WARN', `[Recycle] No commit found for ${abandonedNode}`);
    return false;
  }

  try {
    const currentBlock = await provider.getBlockNumber();
    const blocksPassed = currentBlock - commit.commit_block;

    if (blocksPassed < COMMIT_MIN_DELAY_BLOCKS) {
      log('INFO', `[Recycle] Too early for ${abandonedNode} (${blocksPassed}/${COMMIT_MIN_DELAY_BLOCKS} blocks)`);
      return false;
    }

    if (blocksPassed > COMMIT_MAX_DELAY_BLOCKS) {
      log('WARN', `[Recycle] Commit expired for ${abandonedNode} (${blocksPassed} blocks > ${COMMIT_MAX_DELAY_BLOCKS})`);
      db.deleteRecycleCommit(abandonedNode);
      return false;
    }

    const tx = await contract.executeRecycle(abandonedNode, commit.salt);
    await tx.wait();

    db.deleteRecycleCommit(abandonedNode);
    log('SUCCESS', `[Recycle] Executed recycle for ${abandonedNode}, reward earned!`);
    return true;
  } catch (error) {
    log('ERROR', `[Recycle] executeRecycle failed for ${abandonedNode}`, error.message);
    // If node was resurrected or already recycled, clean up
    if (error.message.includes('not abandoned') || error.message.includes('Invalid commit')) {
      db.deleteRecycleCommit(abandonedNode);
    }
    return false;
  }
}

/**
 * Direct recycle for stale ABANDONED nodes (> 24h).
 */
async function directRecycle(abandonedNode) {
  if (!wallet) return false;

  try {
    const tx = await contract.recycleInactiveNode(abandonedNode);
    await tx.wait();
    log('SUCCESS', `[Recycle] Direct recycle for ${abandonedNode}, reward earned!`);
    return true;
  } catch (error) {
    log('ERROR', `[Recycle] directRecycle failed for ${abandonedNode}`, error.message);
    return false;
  }
}

/**
 * Process a single ABANDONED node: commit-reveal if fresh, direct if stale.
 */
async function processNode(nodeAddress) {
  const info = await checkNode(nodeAddress);
  if (!info) return;

  if (info.isFresh) {
    // Check if we already have a pending commit
    const existing = db.getRecycleCommit(nodeAddress);
    if (existing) {
      await executeRecycle(nodeAddress);
    } else {
      await commitRecycle(nodeAddress);
    }
  } else {
    await directRecycle(nodeAddress);
  }
}

/**
 * Process all pending commits (phase 2 execution).
 * Called periodically to finalize commits that have matured.
 */
async function processPendingCommits() {
  const commits = db.getAllRecycleCommits();
  if (commits.length === 0) return;

  log('INFO', `[Recycle] Processing ${commits.length} pending commit(s)...`);

  for (const commit of commits) {
    await executeRecycle(commit.abandoned_node);
    // Small delay between txs
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

module.exports = {
  init,
  checkNode,
  processNode,
  commitRecycle,
  executeRecycle,
  directRecycle,
  processPendingCommits,
  // Exported for testing
  generateSalt,
  computeCommitHash,
};
