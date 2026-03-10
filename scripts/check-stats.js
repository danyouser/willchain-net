const hre = require("hardhat");
const { statusName } = require('../shared/vault-status');
const { ACTIVE_NETWORK } = require('../shared/contract-config');

const CONTRACT_ADDRESS = ACTIVE_NETWORK.contractAddress;


async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log('Signer:', signer.address);

  const contract = await hre.ethers.getContractAt('WillChain', CONTRACT_ADDRESS);

  console.log('\n--- Network Statistics ---');
  const stats = await contract.getNetworkStatistics();
  console.log('Total Supply:            ', hre.ethers.formatEther(stats.totalSupply_), 'WILL');
  console.log('Recycled to Holders:     ', hre.ethers.formatEther(stats.recycledToNetwork), 'WILL');
  console.log('Removed from Circulation:', hre.ethers.formatEther(stats.removedFromCirculation), 'WILL');
  console.log('Successful Transfers:    ', stats.successfulTransfers.toString());

  console.log('\n--- Node State ---');
  const state = await contract.getNodeState(signer.address);
  console.log('Last Activity:   ', new Date(Number(state.lastActivityTimestamp) * 1000).toISOString());
  console.log('Successor:       ', state.designatedSuccessor);
  console.log('Claim Initiated: ', state.successorClaimInitiated);
  console.log('Time Until Inactive:', Number(state.timeUntilInactive) / 86400, 'days');
  console.log('Time Until Abandoned:', Number(state.timeUntilAbandoned) / 86400, 'days');
  console.log('Is Active:       ', state.isActive);
  console.log('Service Tier:    ', state.serviceTier);
  console.log('Inactivity Period:', Number(state.inactivityPeriod) / 86400, 'days');

  console.log('\n--- Vault Status ---');
  const status = await contract.getVaultStatus(signer.address);
  console.log('Status:', statusName(status));

  console.log('\n--- Dividends ---');
  const pending = await contract.pendingDividends(signer.address);
  const pool    = await contract.dividendPool();
  console.log('Pending for signer:', hre.ethers.formatEther(pending), 'WILL');
  console.log('Total pool:        ', hre.ethers.formatEther(pool), 'WILL');

  console.log('\n--- Protocol Fees ---');
  const [treasury, feeBps, totalCollected] = await contract.getProtocolFeeInfo();
  console.log('Treasury:        ', treasury);
  console.log('Fee:             ', Number(feeBps) / 100, '%');
  console.log('Total Collected: ', hre.ethers.formatEther(totalCollected), 'WILL');
}

main().catch(console.error);
