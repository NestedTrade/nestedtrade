const { ethers } = require("hardhat");
const { expect } = require("chai");

const { deployBirdswap } = require("../helpers/deploy_everything");

describe("BirdSwap", () => {
  let birdswap, moonbirds;
  let feePayout = "0x47A90D927DfA99EC3a3582D2C4DAbf12cF58f340";
  let feeBps = 200; // 2%

  let deployer, minterA, minterB, buyer, buyer2;

  let askPrice = ethers.utils.parseEther("20");
  let royaltyBps = 500; // 5% to MoonBirds
  let tokenId;

  beforeEach(async () => {
    [deployer, minterA, minterB, buyer, buyer2] = await ethers.getSigners();

    [birdswap, moonbirds] = await deployBirdswap(feePayout, feeBps);

    await moonbirds.mintUnclaimed(minterA.address, 2);
    await moonbirds.mintUnclaimed(minterB.address, 2);
    await moonbirds.connect(minterA).toggleNesting([0, 1]);
    await moonbirds.connect(minterB).toggleNesting([2]);

    tokenId = 0;
    await birdswap
      .connect(minterA)
      .createAsk(tokenId, buyer.address, askPrice, royaltyBps);
  });

  describe("send MB to contracts (success)", async () => {
    it("success after ask is created", async () => {
      expect(await birdswap.moonbirdTransferredFromOwner(tokenId)).equals(ethers.constants.AddressZero);
      expect(await moonbirds.ownerOf(tokenId)).equals(minterA.address);
      expect(await birdswap.isMoonbirdEscrowed(tokenId)).equals(false);

      // Send Nested MB
      await moonbirds.connect(minterA).safeTransferWhileNesting(minterA.address, birdswap.address, tokenId);

      expect(await birdswap.moonbirdTransferredFromOwner(tokenId)).equals(minterA.address);
      expect(await birdswap.isMoonbirdEscrowed(tokenId)).equals(true);
      expect(await moonbirds.ownerOf(tokenId)).equals(birdswap.address);

      const tx = await moonbirds.nestingPeriod(tokenId);
      expect(tx.nesting).equals(true)
    });

    it("success after ask is overriden", async () => {
      //Transfer MB
      await moonbirds.connect(minterA).safeTransferWhileNesting(minterA.address, minterB.address, tokenId)

      await birdswap
        .connect(minterB)
        .createAsk(tokenId, buyer2.address, askPrice.add(1), 0);

      expect(await birdswap.moonbirdTransferredFromOwner(tokenId)).equals(ethers.constants.AddressZero);
      expect(await moonbirds.ownerOf(tokenId)).equals(minterB.address);
      expect(await birdswap.isMoonbirdEscrowed(tokenId)).equals(false);

      // Send Nested MB
      await moonbirds.connect(minterB).safeTransferWhileNesting(minterB.address, birdswap.address, tokenId);

      expect(await birdswap.moonbirdTransferredFromOwner(tokenId)).equals(minterB.address);
      expect(await birdswap.isMoonbirdEscrowed(tokenId)).equals(true);
      expect(await moonbirds.ownerOf(tokenId)).equals(birdswap.address);

      const tx = await moonbirds.nestingPeriod(tokenId);
      expect(tx.nesting).equals(true)
    });
  })

  describe("failure scenarios", async () => {
    it("should not allow people to call directly the function", async () => {
      await expect(birdswap.onERC721Received(ethers.constants.AddressZero, minterA.address, tokenId, ethers.constants.HashZero)).to.revertedWith("onERC721Received Moonbirds not transferred");
    })

    it("should not allow sending MB without an existing ask", async() => {
      const tokenId = 2
      expect(await birdswap.moonbirdTransferredFromOwner(tokenId)).equals(ethers.constants.AddressZero);
      expect(await moonbirds.ownerOf(tokenId)).equals(minterB.address);
      expect(await birdswap.isMoonbirdEscrowed(tokenId)).equals(false);

      // Send Nested MB
      await expect(moonbirds.connect(minterB).safeTransferWhileNesting(minterB.address, birdswap.address, tokenId)).to.revertedWith("onERC721Received Cannot send Nested MB without active listing.");

      expect(await birdswap.moonbirdTransferredFromOwner(tokenId)).equals(ethers.constants.AddressZero);
      expect(await birdswap.isMoonbirdEscrowed(tokenId)).equals(false);
      expect(await moonbirds.ownerOf(tokenId)).equals(minterB.address);

      const tx = await moonbirds.nestingPeriod(tokenId);
      expect(tx.nesting).equals(true)
    })

    it("should not allow sending MB without override ask first", async() => {
      //Transfer MB
      await moonbirds.connect(minterA).safeTransferWhileNesting(minterA.address, minterB.address, tokenId)

      // Send Nested MB
      await expect(moonbirds.connect(minterB).safeTransferWhileNesting(minterB.address, birdswap.address, tokenId)).to.revertedWith("onERC721Received Cannot send Nested MB without active listing.");

      expect(await birdswap.moonbirdTransferredFromOwner(tokenId)).equals(ethers.constants.AddressZero);
      expect(await birdswap.isMoonbirdEscrowed(tokenId)).equals(false);
      expect(await moonbirds.ownerOf(tokenId)).equals(minterB.address);

      const tx = await moonbirds.nestingPeriod(tokenId);
      expect(tx.nesting).equals(true)
    })

    it.skip("should not allow sending unnested birds", async() => {
      await moonbirds.connect(minterA).toggleNesting([tokenId]);
      const tx = await moonbirds.nestingPeriod(tokenId);
      expect(tx.nesting).equals(false);
      //Transfer MB
      await expect(moonbirds.connect(minterA).transferFrom(minterA.address, birdswap.address, tokenId)).to.revertedWith("onERC721Received Moonbirds not nested");
    })
  });
});

