const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("=".repeat(60));
  console.log("WillChain — Deploy WillChain");
  console.log("Network:", hre.network.name);
  console.log("=".repeat(60));

  const [deployer] = await hre.ethers.getSigners();
  console.log("\nDeployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH\n");

  if (balance === 0n) {
    console.error("ERROR: Deployer has no ETH.");
    if (hre.network.name === "baseSepolia") {
      console.log("\nGet testnet ETH from:");
      console.log("  https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet");
      console.log("  https://faucet.quicknode.com/base/sepolia");
    }
    process.exit(1);
  }

  // Deploy WillChain
  console.log("Deploying WillChain (WILL token)...");
  const WillChain = await hre.ethers.getContractFactory("WillChain");
  const willchain = await WillChain.deploy();
  await willchain.waitForDeployment();
  const contractAddress = await willchain.getAddress();
  console.log("WillChain:", contractAddress);

  // Wait 1 block so RPC indexes the contract before reading state
  await willchain.deploymentTransaction().wait(1);

  // Propose treasury change (2-day timelock — must call executeTreasuryChange() after delay)
  const treasuryAddress = process.env.TREASURY_ADDRESS;
  if (treasuryAddress) {
    console.log("\nProposing treasury change:", treasuryAddress);
    const tx = await willchain.proposeTreasuryChange(treasuryAddress);
    await tx.wait(1);
    console.log("Treasury change proposed ✓ (execute after 2-day timelock with executeTreasuryChange())");
  } else if (hre.network.name === "base") {
    console.error("\n⚠️  WARNING: TREASURY_ADDRESS not set! Deploy aborted for mainnet safety.");
    console.error("   Set TREASURY_ADDRESS=<gnosis_safe_address> in .env before deploying to mainnet.");
    process.exit(1);
  } else {
    console.log("\nℹ️  TREASURY_ADDRESS not set — treasury remains deployer address (ok for testnet)");
  }

  // Read token info
  const name        = await willchain.name();
  const symbol      = await willchain.symbol();
  const totalSupply = await willchain.totalSupply();

  console.log("\n--- Token Info ---");
  console.log("Name:         ", name);
  console.log("Symbol:       ", symbol);
  console.log("Total Supply: ", hre.ethers.formatEther(totalSupply), symbol);
  console.log("Deployer:     ", deployer.address);

  // Verify on Basescan (skip for local)
  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    console.log("\nWaiting for block confirmations before verification...");
    await willchain.deploymentTransaction().wait(5);

    console.log("Verifying on Basescan...");
    try {
      await hre.run("verify:verify", {
        address: contractAddress,
        constructorArguments: [],
      });
      console.log("Contract verified!");
    } catch (error) {
      if (error.message.includes("Already Verified")) {
        console.log("Already verified.");
      } else {
        console.log("Verification failed:", error.message);
        console.log("Verify manually:");
        console.log(`  npx hardhat verify --network ${hre.network.name} ${contractAddress}`);
      }
    }
  }

  // Save deployment info
  const deploymentInfo = {
    network:   hre.network.name,
    chainId:   (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer:  deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      WillChain: contractAddress,
    },
    tokenInfo: {
      name,
      symbol,
      totalSupply: hre.ethers.formatEther(totalSupply),
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const timestampedFile = path.join(deploymentsDir, `${hre.network.name}-${Date.now()}.json`);
  const latestFile      = path.join(deploymentsDir, `${hre.network.name}-latest.json`);

  fs.writeFileSync(timestampedFile, JSON.stringify(deploymentInfo, null, 2));
  fs.writeFileSync(latestFile,      JSON.stringify(deploymentInfo, null, 2));

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log("WillChain:", contractAddress);
  console.log("Saved to:     ", latestFile);

  if (hre.network.name === "baseSepolia") {
    console.log("\nView on Basescan:");
    console.log(`  https://sepolia.basescan.org/address/${contractAddress}`);
    console.log("\nNext steps:");
    console.log(`  1. npx hardhat verify --network baseSepolia ${contractAddress}`);
    console.log("  2. Update frontend/src/app.js → CONFIG.contractAddress");
    console.log("  3. Update frontend-react/src/config/contract.ts → CONTRACT_ADDRESS");
    console.log("  4. Update bot/.env → CONTRACT_ADDRESS");
    console.log("  5. Update scripts/check-balance.js and check-stats.js → contract address");
  } else if (hre.network.name === "base") {
    console.log("\nView on Basescan:");
    console.log(`  https://basescan.org/address/${contractAddress}`);
  }

  return contractAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
