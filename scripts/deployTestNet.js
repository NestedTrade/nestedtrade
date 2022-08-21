// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");

async function main() {

    // deploy erc721 to simulate moonbirds
    const Moonbirds = await hre.ethers.getContractFactory("StubMoonbirds");
    const moonbirds = await Moonbirds.deploy();

    await moonbirds.deployed();

    console.log("erc721 deployed to:", moonbirds.address);

    const factory = await hre.ethers.getContractFactory("BirdSwap");

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
    console.log("Birdswap contract deployed to address:", instance.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
