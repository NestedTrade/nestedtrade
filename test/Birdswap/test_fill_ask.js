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
      const initialBalanceMarket = await birdswap.provider.getBalance(feePayout)

      const ask = await birdswap.askForMoonbird(tokenId);
      expect(await birdswap.connect(buyer).fillAsk(tokenId, {value: askPrice})).to.emit("BirdSwap", "AskFilled").withArgs(tokenId, minterA.address, buyer.address, askPrice, royaltyBps, ask.uid);

      expect(await moonbirds.ownerOf(tokenId)).equals(buyer.address);
      expect(await birdswap.moonbirdTransferredFromOwner(tokenId)).equals(ethers.constants.AddressZero);
      // Check ETH Balance
      expect(await birdswap.provider.getBalance(minterA.address)).equals(ethers.utils.parseEther("9.8").add(initialBalance))
      expect(await birdswap.totalSwap()).equals(1);
      expect(await birdswap.provider.getBalance(feePayout)).equals(ethers.utils.parseEther("0.2").add(initialBalanceMarket))
    });

    it("fill the ask (with royalties)", async () => {
      const tokenId = 2;
      const royaltyBps = 100; // 1%
      const tx = await moonbirds.royaltyInfo(tokenId, askPrice);
      const royaltyAddress = tx.moonbirdsRoyaltyPayoutAddress;

      // Create Ask
      await birdswap
        .connect(minterB)
        .createAsk(tokenId, buyer.address, askPrice, royaltyBps);
      // Send MB to Contracts
      await moonbirds.connect(minterB).safeTransferWhileNesting(minterB.address, birdswap.address, tokenId);
      const initialBalance = await birdswap.provider.getBalance(minterB.address);
      const initialBalanceRoyalties = await birdswap.provider.getBalance(royaltyAddress);
      const initialBalanceMarket = await birdswap.provider.getBalance(feePayout)

      const ask = await birdswap.askForMoonbird(tokenId);
      expect(await birdswap.connect(buyer).fillAsk(tokenId, {value: askPrice})).to.emit("BirdSwap", "AskFilled").withArgs(tokenId, minterB.address, buyer.address, askPrice, royaltyBps, ask.uid);

      expect(await moonbirds.ownerOf(tokenId)).equals(buyer.address);
      expect(await birdswap.moonbirdTransferredFromOwner(tokenId)).equals(ethers.constants.AddressZero);
      // Check ETH Balance
      expect(await birdswap.provider.getBalance(minterB.address)).equals(ethers.utils.parseEther("9.7").add(initialBalance))
      expect(await birdswap.provider.getBalance(feePayout)).equals(ethers.utils.parseEther("0.2").add(initialBalanceMarket))
      expect(await birdswap.provider.getBalance(royaltyAddress)).equals(ethers.utils.parseEther("0.1").add(initialBalanceRoyalties))
      expect(await birdswap.totalSwap()).equals(1);
    });
  })

  describe("BirdSwap.fillAsk (Error)", async () => {
    it("not the buyer set in Ask", async () => {
      await expect(birdswap.connect(minterB).fillAsk(tokenId, {value: askPrice}))
      .to.revertedWith("must be buyer");
    });

    it("Ask does not exist", async () => {
      await expect(birdswap.connect(buyer).fillAsk(10, {value: askPrice}))
      .to.revertedWith("fillAsk must be active ask");
    });

    it("Moonbird not escrowed yet", async () => {
      const tokenId = 1
      await birdswap.connect(minterA).createAsk(tokenId, buyer.address, askPrice, royaltyBps)
      await expect(birdswap.connect(buyer).fillAsk(tokenId, {value: askPrice}))
      .to.revertedWith("fillAsk The Moonbird associated with this ask must be escrowed within Birdswap before a purchase can be completed");
    });

    it("invalid askPrice", async () => {
      await expect(birdswap.connect(buyer).fillAsk(tokenId, {value: askPrice.sub(1)}))
      .to.revertedWith("_handleIncomingTransfer msg value less than expected amount");
    });
  })
});


