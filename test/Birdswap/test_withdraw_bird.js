const { ethers } = require("hardhat");
const { expect } = require("chai");

const { deployBirdswap } = require("../helpers/deploy_everything");

describe("BirdSwap", () => {
  let birdswap, moonbirds;
  let feePayout = "0x47A90D927DfA99EC3a3582D2C4DAbf12cF58f340";
  let feeBps = 200; // 2%

  let deployer, minterA, minterB, buyer, buyer2;

  let askPrice = ethers.utils.parseEther("10");
  let royaltyBps = 0; // 0% to MoonBirds

  let tokenId;

  beforeEach(async () => {
    [deployer, minterA, minterB, buyer, buyer2] = await ethers.getSigners();

    [birdswap, moonbirds] = await deployBirdswap(feePayout, feeBps);

    await moonbirds.mintUnclaimed(minterA.address, 2);
    await moonbirds.mintUnclaimed(minterB.address, 2);
    await moonbirds.connect(minterA).toggleNesting([0, 1]);
    await moonbirds.connect(minterB).toggleNesting([2]);

    tokenId = 0;

  });

  describe("BirdSwap.withdrawBird (Success)", async () => {
    it("withdraw Bird before listing", async () => {
      // Send MB to Contracts
      await moonbirds.connect(minterA).safeTransferWhileNesting(minterA.address, birdswap.address, tokenId);

      let tx = await birdswap.askForMoonbird(tokenId);
      expect(tx.seller).equals(ethers.constants.AddressZero);
      expect(await birdswap.moonbirdTransferredFromOwner(tokenId)).equals(minterA.address);
      expect(await moonbirds.ownerOf(tokenId)).equals(birdswap.address);

      await birdswap.connect(minterA).withdrawBird(tokenId);

      tx = await birdswap.askForMoonbird(tokenId);
      expect(await birdswap.moonbirdTransferredFromOwner(tokenId)).equals(ethers.constants.AddressZero);
      expect(await moonbirds.ownerOf(tokenId)).equals(minterA.address);
      expect(await tx.seller).equals(ethers.constants.AddressZero)
    });


    it("withdrawBird after listing", async() => {
      // Create Ask
      await birdswap
        .connect(minterA)
        .createAsk(tokenId, buyer.address, askPrice, royaltyBps);
      // Send MB to Contracts
      await moonbirds.connect(minterA).safeTransferWhileNesting(minterA.address, birdswap.address, tokenId);

      let tx = await birdswap.askForMoonbird(tokenId);
      expect(tx.seller).equals(minterA.address);
      expect(await birdswap.moonbirdTransferredFromOwner(tokenId)).equals(minterA.address);
      expect(await moonbirds.ownerOf(tokenId)).equals(birdswap.address);

      await birdswap.connect(minterA).withdrawBird(tokenId);

      tx = await birdswap.askForMoonbird(tokenId);
      expect(tx.seller).equals(minterA.address);
      expect(await birdswap.moonbirdTransferredFromOwner(tokenId)).equals(ethers.constants.AddressZero);
      expect(await moonbirds.ownerOf(tokenId)).equals(minterA.address);
    })
  })
});




