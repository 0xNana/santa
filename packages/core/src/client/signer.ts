import type { Address, Hex } from "viem";

/** The connected wallet capabilities used by Santa. Keys stay with the wallet. */
export type WalletSigner = {
  address: Address;
  sendTransaction(tx: { to: Address; data: Hex; value: bigint; chainId: number }): Promise<Hex>;
  signMessage(message: string): Promise<Hex>;
};
