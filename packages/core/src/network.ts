import { defineChain } from "viem";

// https://docs.robinhood.com/chain/connecting/
export const robinhood = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" } },
});
