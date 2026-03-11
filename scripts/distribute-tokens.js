/**
 * Distribute WILL tokens to beta testers.
 *
 * Usage:
 *   npx hardhat run scripts/distribute-tokens.js --network baseSepolia
 *
 * Configure TESTERS array below with addresses and amounts.
 * Requires PRIVATE_KEY in root .env (deployer wallet with WILL balance).
 */
const hre = require("hardhat");
const { ACTIVE_NETWORK } = require('../shared/contract-config');

// ── Configure testers here ──────────────────────────────────
const AMOUNT_DEFAULT = '5000'; // WILL tokens per tester (default)

const TESTERS = [
  // { address: '0x...', amount: '10000' },  // custom amount
  // { address: '0x...' },                    // uses AMOUNT_DEFAULT
];
// ─────────────────────────────────────────────────────────────

async function main() {
  if (TESTERS.length === 0) {
    console.log('No testers configured. Edit TESTERS array in this script.');
    process.exit(0);
  }

  const [signer] = await hre.ethers.getSigners();
  const contract = await hre.ethers.getContractAt('WillChain', ACTIVE_NETWORK.contractAddress);

  const balance = await contract.balanceOf(signer.address);
  console.log(`Sender: ${signer.address}`);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} WILL\n`);

  for (const tester of TESTERS) {
    const amount = hre.ethers.parseEther(tester.amount || AMOUNT_DEFAULT);
    const label = `${tester.address.slice(0, 6)}...${tester.address.slice(-4)}`;

    try {
      const tx = await contract.transfer(tester.address, amount);
      console.log(`→ ${label}: ${hre.ethers.formatEther(amount)} WILL — tx ${tx.hash}`);
      await tx.wait();
      console.log(`  ✓ confirmed`);
    } catch (err) {
      console.error(`  ✗ ${label}: ${err.message}`);
    }
  }

  const remaining = await contract.balanceOf(signer.address);
  console.log(`\nRemaining balance: ${hre.ethers.formatEther(remaining)} WILL`);
}

main().catch(console.error);
