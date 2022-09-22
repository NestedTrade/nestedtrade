const { ethers } = require("hardhat");
const { expect } = require("chai");

const { deployBirdswap } = require("../helpers/deploy_everything");

describe("Birdswap.setMarketplaceFeeBps", () => {
  let birdswap, moonbirds;
  let feePayout = "0x47A90D927DfA99EC3a3582D2C4DAbf12cF58f340";
  let feeBps = 200; // 2%

  let deployer, minterA, minterB, buyer, buyer2;

  let askPrice = ethers.utils.parseEther("20");
  let royaltyBps = 500; // 5% to MoonBirds

  beforeEach(async () => {
    [deployer, minterA, minterB, buyer, buyer2] = await ethers.getSigners();

    [birdswap, moonbirds] = await deployBirdswap(feePayout, feeBps);

    await moonbirds.mintUnclaimed(minterA.address, 2);
    await moonbirds.mintUnclaimed(minterB.address, 2);
    await moonbirds.connect(minterA).toggleNesting([0, 1]);
    await moonbirds.connect(minterB).toggleNesting([2]);
  });

  describe("Birdswap.setMarketplaceFeeBps(success)", async () => {
    it("update bps", async () => {
      const newFeeBps = 500;
      await birdswap.connect(deployer).setMarketplaceFeeBps(newFeeBps)

      expect(await birdswap.marketplaceFeeBps()).equals(newFeeBps)
    });
  })

  describe("Birdswap.setMarketplaceFeeBps(error)", async () => {
    it("not admin", async () => {
      const newFeeBps = 500;
      await expect(birdswap.connect(minterA).setMarketplaceFeeBps(newFeeBps)).to.revertedWith("Ownable: caller is not the owner")
    });
  })
});

