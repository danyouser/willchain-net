/**
 * WillChain Bot — Blockchain Event Listener & Catch-up
 * Handles historical event replay on startup and real-time event subscriptions.
 */

const db = require('./database');
const { log } = require('./utils');
const notifications = require('./notifications');
const { reportEventBlock } = require('./api');

const MAX_CATCHUP_BLOCKS = 500_000; // ~69 days on Base (2s block time)
const BATCH_SIZE = 2000;
const POLL_INTERVAL_MS = 5000; // 5s ≈ 2-3 blocks on Base

let contract;
let provider;
let CONFIG;
let pollTimer = null;

function init(contractInstance, providerInstance, config) {
  contract = contractInstance;
  provider = providerInstance;
  CONFIG = config;
}

async function catchUpMissedEvents() {
  if (!contract || !provider) {
    log('WARN', 'Contract not configured, skipping event catch-up');
    return;
  }

  const lastProcessedBlock = db.getLastProcessedBlock();
  const currentBlock = await provider.getBlockNumber();

  let fromBlock;
  if (lastProcessedBlock) {
    fromBlock = lastProcessedBlock + 1;
    log('INFO', `Catching up events from block ${fromBlock} to ${currentBlock}`);
  } else if (CONFIG.deploymentBlock > 0) {
    fromBlock = CONFIG.deploymentBlock;
    log('INFO', `First run: scanning from deployment block ${fromBlock} to ${currentBlock}`);
  } else {
    fromBlock = Math.max(0, currentBlock - CONFIG.eventCatchupBlocks);
    log('INFO', `First run: scanning last ${CONFIG.eventCatchupBlocks} blocks (${fromBlock} to ${currentBlock})`);
  }

  const blocksToScan = currentBlock - fromBlock;
  if (blocksToScan > MAX_CATCHUP_BLOCKS) {
    const skippedFrom = fromBlock;
    const skippedTo = currentBlock - MAX_CATCHUP_BLOCKS;
    fromBlock = skippedTo;
    log('ERROR', `CRITICAL: Skipping blocks ${skippedFrom}–${skippedTo} (${blocksToScan - MAX_CATCHUP_BLOCKS} blocks missed). ` +
      `Events in this range are PERMANENTLY LOST. Set DEPLOYMENT_BLOCK=${skippedFrom} and restart to recover.`);
  }

  if (fromBlock > currentBlock) {
    log('INFO', 'No new blocks to process');
    db.setLastProcessedBlock(currentBlock);
    return;
  }

  try {
    let processedCount = 0;

    for (let start = fromBlock; start <= currentBlock; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE - 1, currentBlock);

      const [claimEvents, activityEvents, transferEvents, successorEvents, registeredEvents] = await Promise.all([
        contract.queryFilter('SuccessorClaimInitiated', start, end),
        contract.queryFilter('UserActivityConfirmed', start, end),
        contract.queryFilter('VaultAccessTransferred', start, end),
        contract.queryFilter('SuccessorDesignated', start, end),
        contract.queryFilter('NodeRegistered', start, end),
      ]);

      for (const event of claimEvents) {
        await notifications.notifySuccessorClaimInitiated(
          event.args[0], event.args[1], event.args[2],
          event.transactionHash, event.index
        );
        processedCount++;
      }

      for (const event of activityEvents) {
        await notifications.notifyActivityConfirmed(
          event.args[0], event.args[1],
          event.transactionHash, event.index
        );
        processedCount++;
      }

      for (const event of transferEvents) {
        await notifications.notifyVaultAccessTransferred(
          event.args[0], event.args[1], event.args[2],
          event.transactionHash, event.index
        );
        processedCount++;
      }

      for (const event of successorEvents) {
        await notifications.notifySuccessorDesignated(
          event.args[0], event.args[1],
          event.transactionHash, event.index
        );
        processedCount++;
      }

      for (const event of registeredEvents) {
        await notifications.notifyNodeRegistered(
          event.args[0], event.args[1],
          event.transactionHash, event.index
        );
        processedCount++;
      }

      db.setLastProcessedBlock(end);
    }

    log('SUCCESS', `Event catch-up complete. Processed ${processedCount} events.`);

  } catch (error) {
    log('ERROR', 'Event catch-up failed', error.message);
  }
}

function startEventPolling() {
  if (!contract || !provider) {
    log('WARN', 'Contract not configured, skipping event polling');
    return;
  }

  log('INFO', `Starting event polling (every ${POLL_INTERVAL_MS / 1000}s)...`);
  let polling = false;

  pollTimer = setInterval(async () => {
    if (polling) return; // skip if previous tick still running
    polling = true;
    try {
      const currentBlock = await provider.getBlockNumber();
      const lastProcessed = db.getLastProcessedBlock();

      if (!lastProcessed || currentBlock <= lastProcessed) {
        reportEventBlock(currentBlock);
        return;
      }

      const fromBlock = lastProcessed + 1;

      const [claimEvents, activityEvents, transferEvents, successorEvents, registeredEvents, recycledEvents] = await Promise.all([
        contract.queryFilter('SuccessorClaimInitiated', fromBlock, currentBlock),
        contract.queryFilter('UserActivityConfirmed', fromBlock, currentBlock),
        contract.queryFilter('VaultAccessTransferred', fromBlock, currentBlock),
        contract.queryFilter('SuccessorDesignated', fromBlock, currentBlock),
        contract.queryFilter('NodeRegistered', fromBlock, currentBlock),
        contract.queryFilter('InactiveNodeRecycled', fromBlock, currentBlock),
      ]);

      for (const event of claimEvents) {
        await notifications.notifySuccessorClaimInitiated(
          event.args[0], event.args[1], event.args[2],
          event.transactionHash, event.index
        );
      }

      for (const event of activityEvents) {
        await notifications.notifyActivityConfirmed(
          event.args[0], event.args[1],
          event.transactionHash, event.index
        );
      }

      for (const event of transferEvents) {
        await notifications.notifyVaultAccessTransferred(
          event.args[0], event.args[1], event.args[2],
          event.transactionHash, event.index
        );
      }

      for (const event of successorEvents) {
        await notifications.notifySuccessorDesignated(
          event.args[0], event.args[1],
          event.transactionHash, event.index
        );
      }

      for (const event of registeredEvents) {
        await notifications.notifyNodeRegistered(
          event.args[0], event.args[1],
          event.transactionHash, event.index
        );
      }

      for (const event of recycledEvents) {
        const { ethers } = require('ethers');
        log('EVENT', `InactiveNodeRecycled: ${event.args[0]}, burned: ${ethers.formatEther(event.args[1])}, recycled: ${ethers.formatEther(event.args[2])}`);
      }

      db.setLastProcessedBlock(currentBlock);
      reportEventBlock(currentBlock);
    } catch (err) {
      log('ERROR', 'Event poll failed', err.message);
    } finally {
      polling = false;
    }
  }, POLL_INTERVAL_MS);

  log('SUCCESS', 'Event polling active');
}

function stopEventPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    log('INFO', 'Event polling stopped');
  }
}

module.exports = { init, catchUpMissedEvents, startEventPolling, stopEventPolling };
