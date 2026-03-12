export const CONTRACT_ADDRESS = '0x5f89852D3a2457a5C4FDA64b783DF1e040D696F8' as const

export const WILLCHAIN_ABI = [
  // Events
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
  // Read functions
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'protocolTreasury',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'GRACE_PERIOD',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'CLAIM_PERIOD',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'nodeStates',
    outputs: [
      { name: 'lastActivityTimestamp', type: 'uint256' },
      { name: 'claimInitiationTimestamp', type: 'uint256' },
      { name: 'inactivityPeriod', type: 'uint256' },
      { name: 'vaultDataHash', type: 'bytes32' },
      { name: 'designatedSuccessor', type: 'address' },
      { name: 'successorClaimInitiated', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'node', type: 'address' }],
    name: 'getNodeState',
    outputs: [
      { name: 'lastActivityTimestamp', type: 'uint256' },
      { name: 'designatedSuccessor', type: 'address' },
      { name: 'successorClaimInitiated', type: 'bool' },
      { name: 'claimInitiationTimestamp', type: 'uint256' },
      { name: 'timeUntilInactive', type: 'uint256' },
      { name: 'timeUntilAbandoned', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
      { name: 'serviceTier', type: 'string' },
      { name: 'inactivityPeriod', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getNetworkStatistics',
    outputs: [
      { name: 'totalSupply_', type: 'uint256' },
      { name: 'recycledToNetwork', type: 'uint256' },
      { name: 'removedFromCirculation', type: 'uint256' },
      { name: 'successfulTransfers', type: 'uint256' },
      { name: 'totalProtocolFees_', type: 'uint256' },
      { name: 'dividendPool_', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_node', type: 'address' }],
    name: 'pendingDividends',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Write functions
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'confirmActivity',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'successor', type: 'address' }],
    name: 'designateSuccessor',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'period', type: 'uint256' }],
    name: 'setInactivityPeriod',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'claimDividends',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Vault lifecycle functions
  {
    inputs: [{ name: '_node', type: 'address' }],
    name: 'getVaultStatus',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_node', type: 'address' }],
    name: 'initiateSuccessorClaim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'cancelSuccessorClaim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: '_node', type: 'address' }],
    name: 'completeVaultTransfer',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: '_abandonedNode', type: 'address' }],
    name: 'recycleInactiveNode',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: '_commitHash', type: 'bytes32' }],
    name: 'commitRecycle',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: '_abandonedNode', type: 'address' },
      { name: '_salt', type: 'bytes32' },
    ],
    name: 'executeRecycle',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: '_dataHash', type: 'bytes32' }],
    name: 'updateVaultData',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

// Service tier thresholds
export const SERVICE_TIERS = {
  NONE: { name: 'None', threshold: 0n },
  BASIC: { name: 'Basic Vault', threshold: 1_000n * 10n ** 18n },
  FAMILY: { name: 'Family Vault', threshold: 10_000n * 10n ** 18n },
  LEGACY: { name: 'Legacy Vault', threshold: 100_000n * 10n ** 18n },
} as const

// Inactivity periods in seconds
export const INACTIVITY_PERIODS = {
  DAYS_30: 30 * 24 * 60 * 60,
  DAYS_90: 90 * 24 * 60 * 60,
  DAYS_180: 180 * 24 * 60 * 60,
  DAYS_365: 365 * 24 * 60 * 60,
} as const

// Contract timing constants (must match WillChain.sol GRACE_PERIOD and CLAIM_PERIOD)
// If the contract constants change, update these values to match.
export const GRACE_PERIOD_SECONDS = 30 * 24 * 60 * 60  // 30 days
export const CLAIM_PERIOD_SECONDS = 30 * 24 * 60 * 60  // 30 days
export const COMMIT_REVEAL_WINDOW = 24 * 60 * 60       // 1 day — must match contract
