import * as dotenv from "dotenv";
import { ProxyAgent, setGlobalDispatcher } from "undici";

import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-verify";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-vyper";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";

dotenv.config();

if (process.env.PROXY) {
  const proxyAgent = new ProxyAgent(process.env.PROXY);
  setGlobalDispatcher(proxyAgent);
}

const accounts = process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [];

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: "shanghai",
        },
      },
    ],
  },
  networks: {
    fuji: {
      url: process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts: [process.env.PRIVATE_KEY_MAINNET!],
    },
    avalanche: {
      url: process.env.AVALANCHE_RPC_URL || "https://api.avax.network/ext/bc/C/rpc",
      chainId: 43114,
      accounts: [process.env.PRIVATE_KEY_MAINNET!],
    },
    virtualAvalancheCChain: {
      url: "https://virtual.avalanche.rpc.tenderly.co/2c42db45-5f38-4eb0-a2d3-e7c036531d5b",
    },
  },
  typechain: {
    outDir: "./scripts/@types",
    target: "ethers-v6",
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  sourcify: {
    enabled: false,
  },
  mocha: {
    timeout: 400000,
  },
};

export default config;
