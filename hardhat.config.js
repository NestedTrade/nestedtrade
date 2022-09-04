require('dotenv').config();
require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-etherscan");
require('solidity-coverage')
require("hardhat-gas-reporter");
require('@openzeppelin/hardhat-upgrades');


const { API_URL_MAINNET, API_URL_GOERLI, PRIVATE_KEY_MAINNET, PRIVATE_KEY_GOERLI, ETHERSCAN_API_KEY} = process.env;


/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.10",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  networks: {
    mainnet: {
      url: API_URL_MAINNET,
      accounts: [`0x${PRIVATE_KEY_MAINNET}`]
    },
    goerli: {
      url: API_URL_GOERLI,
      accounts: [`0x${PRIVATE_KEY_GOERLI}`]
    }
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: `${ETHERSCAN_API_KEY}`
  }
};
