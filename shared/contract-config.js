/**
 * @file contract-config.js
 * Single source of truth for WillChain contract addresses and chain IDs.
 *
 * Used by: bot/src/index.js, scripts/check-stats.js, scripts/observer/
 * React/frontend use their own config files (contract.ts, wagmi.ts) which
 * must be kept in sync with these values.
 *
 * IMPORTANT: When redeploying to a new address, update ONLY this file
 * and the corresponding React config files. Do NOT scatter addresses
 * across individual scripts.
 */

'use strict';

const NETWORKS = Object.freeze({
  BASE_SEPOLIA: {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    blockExplorer: 'https://sepolia.basescan.org',
    contractAddress: '0x5f89852D3a2457a5C4FDA64b783DF1e040D696F8',
  },
  BASE: {
    chainId: 8453,
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    blockExplorer: 'https://basescan.org',
    contractAddress: null, // TODO: fill after mainnet deploy
  },
});

/** Active network — driven by NETWORK env var, defaults to testnet */
const ACTIVE_NETWORK = process.env.NETWORK === 'base'
  ? NETWORKS.BASE
  : NETWORKS.BASE_SEPOLIA;

/**
 * Re-export VaultStatus from vault-status.js for convenience.
 * Single source of truth is shared/vault-status.js.
 */
const { VAULT_STATUS: VaultStatus } = require('./vault-status');

module.exports = { NETWORKS, ACTIVE_NETWORK, VaultStatus };
