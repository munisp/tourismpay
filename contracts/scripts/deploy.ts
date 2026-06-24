/**
 * TourismPay Smart Contract Deployment Script
 *
 * Deploys:
 *   1. TourismPayStablecoin — ERC-20 mint/burn with caps, timelock, blacklist
 *   2. LPTreasury — multi-sig treasury for liquidity pool reserves
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network polygonAmoy   (testnet)
 *   npx hardhat run scripts/deploy.ts --network polygon       (mainnet)
 *   npx hardhat run scripts/deploy.ts --network base          (Base L2)
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY — deployer wallet private key
 *   TREASURY_MULTISIG   — multi-sig address for treasury admin
 *   MINTER_ADDRESS      — backend service address allowed to mint
 */
import { ethers, network, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface DeploymentRecord {
  network: string;
  chainId: number;
  deployer: string;
  timestamp: string;
  contracts: {
    stablecoin: { address: string; txHash: string };
    treasury: { address: string; txHash: string };
  };
  verification: { stablecoin: boolean; treasury: boolean };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  TourismPay Contract Deployment                             ║`);
  console.log(`║  Network: ${network.name.padEnd(20)} Chain ID: ${String(chainId).padEnd(10)}║`);
  console.log(`║  Deployer: ${deployer.address}  ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\n`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  Balance: ${ethers.formatEther(balance)} ETH/MATIC`);

  if (balance === 0n) {
    throw new Error("Deployer has zero balance — fund the wallet first");
  }

  // ─── Configuration ───────────────────────────────────────────────────────
  const SUPPLY_CAP = ethers.parseUnits("100000000", 6); // 100M USDC-equivalent (6 decimals)
  const EPOCH_MINT_CAP = ethers.parseUnits("1000000", 6); // 1M per 24h epoch
  const EPOCH_BURN_CAP = ethers.parseUnits("1000000", 6); // 1M per 24h epoch
  const TIMELOCK_DELAY = 48 * 60 * 60; // 48 hours
  const TREASURY_THRESHOLD = ethers.parseUnits("50000", 6); // $50K multi-sig threshold

  const TREASURY_MULTISIG = process.env.TREASURY_MULTISIG || deployer.address;
  const MINTER_ADDRESS = process.env.MINTER_ADDRESS || deployer.address;

  // ─── Deploy TourismPayStablecoin ─────────────────────────────────────────
  console.log("\n  [1/2] Deploying TourismPayStablecoin...");
  const StablecoinFactory = await ethers.getContractFactory("TourismPayStablecoin");
  const stablecoin = await StablecoinFactory.deploy(
    "TourismPay USD",      // name
    "tpUSD",               // symbol
    SUPPLY_CAP,
    EPOCH_MINT_CAP,
    EPOCH_BURN_CAP,
    TIMELOCK_DELAY
  );
  await stablecoin.waitForDeployment();
  const stablecoinAddress = await stablecoin.getAddress();
  const stablecoinTx = stablecoin.deploymentTransaction()!.hash;
  console.log(`  ✓ TourismPayStablecoin: ${stablecoinAddress}`);
  console.log(`    TX: ${stablecoinTx}`);

  // Grant MINTER_ROLE to backend service
  const MINTER_ROLE = await stablecoin.MINTER_ROLE();
  const grantTx = await stablecoin.grantRole(MINTER_ROLE, MINTER_ADDRESS);
  await grantTx.wait();
  console.log(`  ✓ MINTER_ROLE granted to: ${MINTER_ADDRESS}`);

  // ─── Deploy LPTreasury ───────────────────────────────────────────────────
  console.log("\n  [2/2] Deploying LPTreasury...");
  const TreasuryFactory = await ethers.getContractFactory("LPTreasury");
  const treasury = await TreasuryFactory.deploy(
    stablecoinAddress,
    TREASURY_MULTISIG,
    TREASURY_THRESHOLD
  );
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();
  const treasuryTx = treasury.deploymentTransaction()!.hash;
  console.log(`  ✓ LPTreasury: ${treasuryAddress}`);
  console.log(`    TX: ${treasuryTx}`);

  // ─── Verify Contracts ────────────────────────────────────────────────────
  let stablecoinVerified = false;
  let treasuryVerified = false;

  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\n  [3/3] Verifying on block explorer...");
    try {
      await run("verify:verify", {
        address: stablecoinAddress,
        constructorArguments: ["TourismPay USD", "tpUSD", SUPPLY_CAP, EPOCH_MINT_CAP, EPOCH_BURN_CAP, TIMELOCK_DELAY],
      });
      stablecoinVerified = true;
      console.log("  ✓ Stablecoin verified");
    } catch (e: any) {
      console.log(`  ⚠ Stablecoin verification: ${e.message}`);
    }

    try {
      await run("verify:verify", {
        address: treasuryAddress,
        constructorArguments: [stablecoinAddress, TREASURY_MULTISIG, TREASURY_THRESHOLD],
      });
      treasuryVerified = true;
      console.log("  ✓ Treasury verified");
    } catch (e: any) {
      console.log(`  ⚠ Treasury verification: ${e.message}`);
    }
  }

  // ─── Save Deployment Record ──────────────────────────────────────────────
  const record: DeploymentRecord = {
    network: network.name,
    chainId: Number(chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      stablecoin: { address: stablecoinAddress, txHash: stablecoinTx },
      treasury: { address: treasuryAddress, txHash: treasuryTx },
    },
    verification: { stablecoin: stablecoinVerified, treasury: treasuryVerified },
  };

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });
  const deploymentFile = path.join(deploymentsDir, `${network.name}-${chainId}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(record, null, 2));

  console.log(`\n  ═══════════════════════════════════════════════════════════`);
  console.log(`  Deployment saved: ${deploymentFile}`);
  console.log(`  ═══════════════════════════════════════════════════════════\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
