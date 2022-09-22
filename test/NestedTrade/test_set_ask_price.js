const { ethers } = require("hardhat");
const { expect } = require("chai");

const { deployBirdswap } = require("../helpers/deploy_everything");

describe("Birdswap.setAskPrice", () => {
  let birdswap, moonbirds;
  let feePayout = "0x47A90D927DfA99EC3a3582D2C4DAbf12cF58f340";
  let feeBps = 200; // 2%

  let deployer, minterA, minterB, buyer, buyer2;

  let askPrice = ethers.utils.parseEther("20");
  let royaltyBps = 500; // 5% to MoonBirds
  const tokenId = 0;

  beforeEach(async () => {
    [deployer, minterA, minterB, buyer, buyer2] = await ethers.getSigners();

    [birdswap, moonbirds] = await deployBirdswap(feePayout, feeBps);

    await moonbirds.mintUnclaimed(minterA.address, 2);
    await moonbirds.mintUnclaimed(minterB.address, 2);
    await moonbirds.connect(minterA).toggleNesting([0, 1]);
    await moonbirds.connect(minterB).toggleNesting([2]);

    await birdswap
      .connect(minterA)
      .createAsk(tokenId, buyer.address, askPrice, royaltyBps);
  });

  describe("Birdswap.setAskPrice (success)", async () => {
    it("update price", async () => {
      const newAskPrice = ethers.utils.parseEther("10");
      await birdswap.connect(minterA).setAskPrice(tokenId, newAskPrice)
      const ask = await birdswap.askForMoonbird(tokenId)

      expect(ask.askPrice).equals(newAskPrice)
    });
  })

  describe("Birdswap.setAskPrice (error)", async () => {
    it("increase price", async () => {
      const newAskPrice = ethers.utils.parseEther("30");
      await expect(birdswap.connect(minterA).setAskPrice(tokenId, newAskPrice)).to.revertedWith("setAskPrice can only be used to lower the price");
    });

    it("must be seller", async () => {
      const newAskPrice = ethers.utils.parseEther("10");
      await expect(birdswap.connect(minterA).setAskPrice(1, newAskPrice)).to.revertedWith("setAskPrice must be seller");
    });
  })
});
