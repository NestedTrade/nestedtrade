const { ethers } = require("hardhat");

const { deployBirdswap } = require("../test/helpers/deploy_everything.js");

async function main() {
  // MoonBirds Address
  const MOONBIRDS_ADDRESS = "0x45C4a45B6dC1CB0F8bD4594C4EEEB0646787B4a6";

  const multiSig = "0xD6d2992F744f61ADf1A6f96ECA9dF10E54e57f7a";  // to be replaced with GnosisSafe
  const feePayout = multiSig;
  const feeBps = 200;  // 2%
  const BirdSwap = await ethers.getContractFactory("BirdSwap");
  const birdswap = await upgrades.deployProxy(
    BirdSwap,
    [MOONBIRDS_ADDRESS, feePayout, feeBps],
    {
      initializer: "initialize",
      kind: "uups",
      unsafeAllow: ["constructor"],
    }
  );
  await birdswap.deployed();

  console.log(`Moonbirds deployed a ${MOONBIRDS_ADDRESS}`);
  console.log(`BirdSwap deployed a ${birdswap.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

