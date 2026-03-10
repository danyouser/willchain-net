/**
 * WillChain Telegram Bot — Entry Point
 *
 * Orchestrates all modules:
 *   commands.js     — Telegram command & callback handlers
 *   notifications.js — On-chain event → Telegram/email alerts
 *   events.js       — Historical catch-up + real-time listeners
 *   cron.js         — Scheduled jobs (weekly reminder, daily critical check)
 *   utils.js        — Logging, formatters
 */

require('dotenv').config();
const { Bot } = require('grammy');
const { ethers } = require('ethers');
const { startApi, reportContractStatus, reportProvider } = require('./api');
const db = require('./database');
const { log } = require('./utils');
const commands = require('./commands');
const notifications = require('./notifications');
const events = require('./events');
const cron = require('./cron');
const recycle = require('./recycle');

// ============ Configuration ============

const CONFIG = {
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  contractAddress: process.env.CONTRACT_ADDRESS,
  rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
  frontendUrl: process.env.FRONTEND_URL || 'https://willchain.net',
  explorerUrl: process.env.EXPLORER_URL || 'https://sepolia.basescan.org',
  deploymentBlock: parseInt(process.env.DEPLOYMENT_BLOCK || '0'),
  eventCatchupBlocks: parseInt(process.env.EVENT_CATCHUP_BLOCKS || '10000'),
  privateKey: process.env.PRIVATE_KEY || '',
  recycleEnabled: process.env.RECYCLE_ENABLED === 'true',
};

// Contract ABI — WillChain
const CONTRACT_ABI = [
  'function getNodeState(address node) view returns (uint256 lastActivityTimestamp, address designatedSuccessor, bool successorClaimInitiated, uint256 claimInitiationTimestamp, uint256 timeUntilInactive, uint256 timeUntilAbandoned, bool isActive, string serviceTier, uint256 inactivityPeriod)',
  'function getVaultStatus(address _node) view returns (uint8)',
  'function getInactivityPeriod(address node) view returns (uint256)',
  'function getTotalTimeout(address node) view returns (uint256)',
  'function getNetworkStatistics() view returns (uint256 totalSupply_, uint256 recycledToNetwork, uint256 removedFromCirculation, uint256 successfulTransfers, uint256 totalProtocolFees_, uint256 dividendPool_)',
  'function pendingDividends(address _node) view returns (uint256)',
  'function dividendPool() view returns (uint256)',
  'function getProtocolFeeInfo() view returns (address treasury, uint256 feeBps, uint256 totalCollected)',
  'event ActivityConfirmed(address indexed node, uint256 timestamp)',
  'event UserActivityConfirmed(address indexed node, uint256 timestamp)',
  'event SuccessorDesignated(address indexed node, address indexed successor)',
  'event SuccessorClaimInitiated(address indexed node, address indexed successor, uint256 timestamp)',
  'event SuccessorClaimCancelled(address indexed node)',
  'event VaultAccessTransferred(address indexed fromNode, address indexed toNode, uint256 amount)',
  'event InactiveNodeRecycled(address indexed node, uint256 removedFromCirculation, uint256 recycledToNetwork, address indexed maintainer, uint256 maintainerReward)',
  'event RecycleCommitted(address indexed committer, bytes32 commitHash, uint256 commitBlock)',
  'function commitRecycle(bytes32 _commitHash)',
  'function executeRecycle(address _abandonedNode, bytes32 _salt)',
  'function recycleInactiveNode(address _inactiveNode)',
  'function balanceOf(address account) view returns (uint256)',
  'event InactivityPeriodChanged(address indexed node, uint256 newPeriod)',
  'event DividendsClaimed(address indexed node, uint256 amount)',
  'event DividendsDistributed(uint256 amount, uint256 newDividendPerToken)',
  'event ProtocolFeeCollected(address indexed from, uint256 amount)',
  'event NodeRegistered(address indexed node, uint256 timestamp)',
];

// ============ Bootstrap ============

const bot = new Bot(CONFIG.botToken);
let provider;
let contract;

function initializeContract() {
  if (CONFIG.contractAddress) {
    provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
    contract = new ethers.Contract(CONFIG.contractAddress, CONTRACT_ABI, provider);
    log('INFO', `Contract initialized at ${CONFIG.contractAddress}`);
    reportProvider(provider);
    provider.getBlockNumber()
      .then(block => reportContractStatus(true, block))
      .catch(() => reportContractStatus(false, 0));
  } else {
    log('WARN', 'CONTRACT_ADDRESS not set - running without blockchain connection');
    reportContractStatus(false, 0);
  }
}

async function main() {
  log('INFO', '🔒 WillChain Bot starting...');

  const stats = db.getStats();
  log('INFO', `Database: ${stats.totalUsers} users, last block: ${stats.lastProcessedBlock || 'none'}`);

  initializeContract();

  if (!CONFIG.botToken) {
    log('ERROR', 'TELEGRAM_BOT_TOKEN not set in .env');
    process.exit(1);
  }

  // Initialize modules
  commands.init(bot, contract, CONFIG);
  commands.register();

  notifications.init(bot, contract, CONFIG);
  events.init(contract, provider, CONFIG);
  cron.init(bot, contract, CONFIG);

  // Auto-recycle module (requires PRIVATE_KEY + RECYCLE_ENABLED=true)
  if (CONFIG.recycleEnabled) {
    recycle.init(contract, provider, CONFIG);
  }

  // Start HTTP API
  startApi(bot);

  // Catch up on missed events before real-time listeners
  await events.catchUpMissedEvents();

  // Real-time blockchain listeners
  events.setupEventListeners();

  // Scheduled jobs
  cron.startAll();

  await bot.start({
    onStart: (botInfo) => {
      log('SUCCESS', `Bot @${botInfo.username} is running!`);
      log('INFO', `Contract: ${CONFIG.contractAddress || 'Not configured'}`);
      log('INFO', `RPC: ${CONFIG.rpcUrl}`);
    },
  });
}

// ============ Graceful Shutdown ============

async function gracefulShutdown(signal) {
  log('INFO', `${signal} received — shutting down gracefully...`);

  // 1. Stop accepting new Telegram updates
  try { bot.stop(); } catch { /* already stopped */ }

  // 2. Remove blockchain event listeners
  if (contract) {
    try { contract.removeAllListeners(); } catch { /* ignore */ }
    log('INFO', 'Blockchain listeners removed');
  }

  // 3. Close HTTP API server
  const { server } = require('./api');
  if (server?.listening) {
    await new Promise(resolve => server.close(resolve));
    log('INFO', 'HTTP server closed');
  }

  // 4. Close SQLite database (flush WAL)
  try { db.db.close(); log('INFO', 'Database closed'); } catch { /* ignore */ }

  log('SUCCESS', 'Clean shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

main().catch((error) => {
  log('ERROR', 'Fatal error', error);
  process.exit(1);
});
