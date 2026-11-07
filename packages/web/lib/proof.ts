// Explorer links always point to the selected Robinhood Chain Testnet.
/** A hash or address as 0x, the first four characters, three dots and the last four: 0x6a16...a9f3. */
export function shortHex(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function txUrl(hash: string): string {
  return `https://explorer.testnet.chain.robinhood.com/tx/${hash}`;
}

export function addressUrl(address: string): string {
  return `https://explorer.testnet.chain.robinhood.com/address/${address}`;
}

/** The configured testnet contract’s source tab; verification is a deployment step. */
export function sourceUrl(address: string): string {
  return `https://explorer.testnet.chain.robinhood.com/address/${address}?tab=contract`;
}
