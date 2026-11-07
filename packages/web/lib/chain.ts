import { createPublicClient, getAddress, http, zeroAddress } from "viem";
import { robinhood } from "@santa/core/src/network.js";

export { robinhood };
export const ROBINHOOD_RPC = robinhood.rpcUrls.default.http[0];
export const publicClient = createPublicClient({ chain: robinhood, transport: http(ROBINHOOD_RPC) });

// A fresh testnet deployment is required. No mainnet address is reused.
const configuredVault = process.env.NEXT_PUBLIC_SANTA_VAULT_ADDRESS;
export const VAULT = configuredVault ? getAddress(configuredVault) : zeroAddress;
export const VAULT_CONFIGURED = VAULT !== zeroAddress;
