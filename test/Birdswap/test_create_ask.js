const { ethers } = require("hardhat");
const { expect } = require("chai");

const { deployBirdswap } = require("../helpers/deploy_everything");

describe("Birdswap.createAsk", () => {
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
  });

  describe("Birdswap.createAsk (success)", async () => {
    it("create one swap", async () => {
      await birdswap
        .connect(minterA)
        .createAsk(tokenId, buyer.address, askPrice, royaltyBps);

      const ask = await birdswap.askForMoonbird(tokenId);
      expect(ask.seller).to.equal(minterA.address);
      expect(ask.buyer).to.equal(buyer.address);
      expect(ask.askPrice).to.equal(askPrice);
      expect(ask.royaltyFeeBps).to.equal(royaltyBps);
      expect(ask.uid).to.not.equal(ethers.constants.HashZero);
    });

    it("should allow to override a previous ask", async () => {
      await birdswap
        .connect(minterA)
        .createAsk(tokenId, buyer.address, askPrice, royaltyBps);

      //Transfer MB
      await moonbirds.connect(minterA).safeTransferWhileNesting(minterA.address, minterB.address, tokenId)

      await birdswap
        .connect(minterB)
        .createAsk(tokenId, buyer2.address, askPrice.add(1), 0);

      const ask = await birdswap.askForMoonbird(tokenId);
      expect(ask.seller).to.equal(minterB.address);
      expect(ask.buyer).to.equal(buyer2.address);
      expect(ask.askPrice).to.equal(askPrice.add(1));
      expect(ask.royaltyFeeBps).to.equal(0);
      expect(ask.uid).to.not.equal(ethers.constants.HashZero);
    });
  })

  describe("Birdswap.createAsk (failure)", async () => {
    it("not owner of moonbirds", async () => {
      await expect(birdswap
        .connect(minterB)
        .createAsk(tokenId, buyer.address, askPrice, royaltyBps)).to.revertedWith("caller must be token owner");
    });


    it("invalid buyer address(0)", async () => {
      await expect(birdswap
        .connect(minterA)
        .createAsk(tokenId, ethers.constants.AddressZero, askPrice, royaltyBps)).to.revertedWith("buyer address must be set");
    });

    it("invalid royalties", async () => {
      await expect(birdswap
        .connect(minterA)
        .createAsk(tokenId, buyer.address, askPrice, 1001)).to.revertedWith("createAsk royalty fee basis points must be less than or equal to 10%");
    });
  })
});
