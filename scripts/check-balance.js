const hre = require("hardhat");
const { ACTIVE_NETWORK } = require('../shared/contract-config');

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log('Signer:', signer.address);

  const contract = await hre.ethers.getContractAt(
    'WillChain',
    ACTIVE_NETWORK.contractAddress
  );

  const balance = await contract.balanceOf(signer.address);
  console.log('Your WILL Balance:', hre.ethers.formatEther(balance), 'WILL');

  const totalSupply = await contract.totalSupply();
  console.log('Total Supply:', hre.ethers.formatEther(totalSupply), 'WILL');

  const treasury = await contract.protocolTreasury();
  console.log('Protocol Treasury:', treasury);

  const stats = await contract.getNetworkStatistics();
  console.log('Successful Transfers:', stats.successfulTransfers.toString());
}

main().catch(console.error);
