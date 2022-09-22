const { ethers } = require("hardhat");

const MULTISIG= "0x08A775ed86A563a77753727a1dbbcb29995531A1";  // GnosisSafe
const MB_ADDRESS = "0x23581767a106ae21c074b2276D25e5C3e136a68b"; // MoonBird NFT
const TIMELOCK = "0xF58129Ed3404f63CEC0d441b838dE65814D2470E"; // Timelock
const FEE_BPS = 200; // 2%

async function main() {
  const NestedTrade = await ethers.getContractFactory("NestedTrade");
  const nestedtrade = await upgrades.deployProxy(
    NestedTrade,
    [MB_ADDRESS, MULTISIG, FEE_BPS],
    {
      initializer: "initialize",
      kind: "uups",
      unsafeAllow: ["constructor"],
    }
  );
  await nestedtrade.deployed();

  console.log(`NestedTrade deployed a ${nestedtrade.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
