const hre = require("hardhat");

async function main() {
  const SplitBill = await hre.ethers.getContractFactory("SplitBill");
  const splitBill = await SplitBill.deploy();
  await splitBill.waitForDeployment();

  const address = await splitBill.getAddress();
  console.log("SplitBill deployed to:", address);
  console.log("\nNext steps:");
  console.log("1. Copy this address into frontend/app.js (CONTRACT_ADDRESS).");
  console.log("2. If you deployed to Sepolia, verify with:");
  console.log(`   npx hardhat verify --network sepolia ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
