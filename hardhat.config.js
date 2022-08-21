require('dotenv').config();
require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-etherscan");

const { API_URL_PROD, API_URL_BETA, PRIVATE_KEY_PROD, PRIVATE_KEY_BETA, ETHERSCAN_API_KEY} = process.env;


/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.10",
  defaultNetwork: "goerli",
  networks: {
    mainnet: {
      url: API_URL_PROD,
      accounts: [`0x${PRIVATE_KEY_PROD}`]
    },
    goerli: {
      url: API_URL_BETA,
      accounts: [`0x${PRIVATE_KEY_BETA}`]
    }
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: `${ETHERSCAN_API_KEY}`
  }
};
