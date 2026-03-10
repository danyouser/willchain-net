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

let contract;
let provider;
let CONFIG;

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

function setupEventListeners() {
  if (!contract) {
    log('WARN', 'Contract not configured, skipping event listeners');
    return;
  }

  log('INFO', 'Setting up blockchain event listeners...');

  contract.on('SuccessorClaimInitiated', async (node, successor, timestamp, event) => {
    await notifications.notifySuccessorClaimInitiated(node, successor, timestamp, event.log.transactionHash, event.log.index);
    db.setLastProcessedBlock(event.log.blockNumber);
    reportEventBlock(event.log.blockNumber);
  });

  contract.on('UserActivityConfirmed', async (node, timestamp, event) => {
    await notifications.notifyActivityConfirmed(node, timestamp, event.log.transactionHash, event.log.index);
    db.setLastProcessedBlock(event.log.blockNumber);
    reportEventBlock(event.log.blockNumber);
  });

  contract.on('VaultAccessTransferred', async (fromNode, toNode, accessUnits, event) => {
    await notifications.notifyVaultAccessTransferred(fromNode, toNode, accessUnits, event.log.transactionHash, event.log.index);
    db.setLastProcessedBlock(event.log.blockNumber);
    reportEventBlock(event.log.blockNumber);
  });

  contract.on('SuccessorDesignated', async (node, successor, event) => {
    await notifications.notifySuccessorDesignated(node, successor, event.log.transactionHash, event.log.index);
    db.setLastProcessedBlock(event.log.blockNumber);
    reportEventBlock(event.log.blockNumber);
  });

  contract.on('NodeRegistered', async (node, timestamp, event) => {
    await notifications.notifyNodeRegistered(node, timestamp, event.log.transactionHash, event.log.index);
    db.setLastProcessedBlock(event.log.blockNumber);
    reportEventBlock(event.log.blockNumber);
  });

  contract.on('InactiveNodeRecycled', async (node, burned, recycled, maintainer, reward, event) => {
    const { ethers } = require('ethers');
    log('EVENT', `InactiveNodeRecycled: ${node}, burned: ${ethers.formatEther(burned)}, recycled: ${ethers.formatEther(recycled)}`);
    db.setLastProcessedBlock(event.log.blockNumber);
    reportEventBlock(event.log.blockNumber);
  });

  log('SUCCESS', 'Event listeners active');
}

module.exports = { init, catchUpMissedEvents, setupEventListeners };
