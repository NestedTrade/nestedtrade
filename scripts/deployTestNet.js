const { ethers } = require("hardhat");

const { deployBirdswap } = require("../test/helpers/deploy_everything.js");

async function main() {
  const feeBps = 200;  // 2%
  const monty = "0xD6d2992F744f61ADf1A6f96ECA9dF10E54e57f7a";
  const multiSig = "0xD6d2992F744f61ADf1A6f96ECA9dF10E54e57f7a";  // to be replaced with GnosisSafe
  const feePayout = multiSig;
  const [birdswap, moonbirds] = await deployBirdswap(feePayout, feeBps)

  console.log(`Moonbirds deployed a ${moonbirds.address}`);
  console.log(`BirdSwap deployed a ${birdswap.address}`);
  let tx;

  tx = await moonbirds.mintUnclaimed(monty, 10); // 0-9 Nested
  await tx.wait();
  tx = await moonbirds.mintUnclaimed(monty, 2); // 10-11 UnNested
  await tx.wait();
  const tokenIdsToNest = [...Array(10).keys()];
  console.log({tokenIdsToNest})
  tx = await moonbirds.toggleNesting([tokenIdsToNest]);
  await tx.wait()

  console.log(`Moonbirds ${tokenIdsToNest} nested`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
