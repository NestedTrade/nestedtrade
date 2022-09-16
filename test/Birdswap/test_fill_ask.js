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
    // Create Ask
    await birdswap
      .connect(minterA)
      .createAsk(tokenId, buyer.address, askPrice, royaltyBps);

    // Send MB to Contracts
    await moonbirds.connect(minterA).safeTransferWhileNesting(minterA.address, birdswap.address, tokenId);
  });

  describe("BirdSwap.fillAsk (Success)", async () => {
    it("fill the ask", async () => {
      const initialBalance = await birdswap.provider.getBalance(minterA.address);

      const ask = await birdswap.askForMoonbird(tokenId);
      expect(await birdswap.connect(buyer).fillAsk(tokenId, {value: askPrice})).to.emit("BirdSwap", "AskFilled").withArgs(tokenId, minterA.address, buyer.address, askPrice, royaltyBps, ask.uid);

      expect(await moonbirds.ownerOf(tokenId)).equals(buyer.address);
      expect(await birdswap.moonbirdTransferredFromOwner(tokenId)).equals(ethers.constants.AddressZero);
      // Check ETH Balance
      expect(await birdswap.provider.getBalance(minterA.address)).equals(ethers.utils.parseEther("9.8").add(initialBalance))
      expect(await birdswap.totalSwap()).equals(1);
    });

  })
});


