const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const NULL_ADDR = "0x0000000000000000000000000000000000000000";

describe("BirdSwap", function () {
  let moonbirds = null;
  let birdswap = null;
  let tokenId = 0;
  let currentAccount;

  async function cancelAsk(tokenId, shouldWithdrawBird) {
    const cancelAskTx = await birdswap.cancelAsk(tokenId, shouldWithdrawBird);
    return cancelAskTx.wait();
  }

  before(async function () {
    this.timeout(0);
    currentAccount = (await ethers.getSigners())[0].address;
    console.log('Using address: ' + currentAccount);

    const Moonbirds = await ethers.getContractFactory('StubMoonbirds');
    moonbirds = await Moonbirds.deploy();
    await moonbirds.deployed();

    console.log("Test Moonbirds contract deployed to:", moonbirds.address);

    const factory = await ethers.getContractFactory("BirdSwap");

    // Start deployment, returning a promise that resolves to a contract object
    const instance = await factory.deploy(moonbirds.address,
        currentAccount,
        200, // 2%
        "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6", //GOERLI
    ); // Instance of the contract
    await instance.deployed();
    console.log("Birdswap contract deployed to address:", instance.address);
    birdswap = instance;

    // mint a "moonbird" to myself and nest it.
    // token Id = 0
    const mintTx = await moonbirds.mint(1);
    await mintTx.wait();
    const toggleNestTx = await moonbirds.toggleNesting([tokenId]);
    await toggleNestTx.wait();
  });

  it("Token owner can create an ask", async function () {
    //this.timeout(0);
    const askPrice = '10000000000000000'; // 0.01 Ether
    const royaltyFeeBps = 0;
    const createAskTx = await birdswap.createAsk(tokenId, askPrice, royaltyFeeBps, NULL_ADDR, currentAccount);
    await createAskTx.wait();

    // confirm ask is registered in contract state

    const ask = await birdswap.askForMoonbird(tokenId);
    expect(currentAccount).to.equal(ask.seller);
    expect(currentAccount).to.equal(ask.sellerFundsRecipient);
    expect(NULL_ADDR).to.equal(ask.askCurrency);
    expect(askPrice).to.equal(ask.askPrice);
    expect(royaltyFeeBps).to.equal(ask.royaltyFeeBps);

  });
  
});
