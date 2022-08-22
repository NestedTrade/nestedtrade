const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const NULL_ADDR = "0x0000000000000000000000000000000000000000";

describe("BirdSwap", function () {
  let moonbirdsContract = null;
  let birdswapContract = null;
  let tokenId = 0;

  before(async function () {
    this.timeout(0);
    const Moonbirds = await ethers.getContractFactory('StubMoonbirds');
    const moonbirds = await Moonbirds.deploy();

    await moonbirds.deployed();
    moonbirdsContract = moonbirds;

    console.log("Test Moonbirds contract deployed to:", moonbirds.address);

    const factory = await ethers.getContractFactory("BirdSwap");

    // Start deployment, returning a promise that resolves to a contract object
    const instance = await factory.deploy(moonbirds.address,
        "0xD6d2992F744f61ADf1A6f96ECA9dF10E54e57f7a",
        200, // 2%
        "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6", //GOERLI
        {
          gasPrice: 13000000000,
          gasLimit: 4000000
        }
    ); // Instance of the contract
    await instance.deployed();
    console.log("Birdswap contract deployed to address:", instance.address);
    birdswapContract = instance;

    // mint a "moonbird" to myself and nest it.
    // token Id = 0
    const mintTx = await moonbirds.mint(1);
    await mintTx.wait();
    const toggleNestTx = await moonbirds.toggleNesting([tokenId]);
    await toggleNestTx.wait();
  });

  it("Implement me", async function () {
    // TODO: implement tests
  });
  
});
