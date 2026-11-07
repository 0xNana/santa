import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { keys } from "../src/store.js";

const vault = "0x808e0000000000000000000000000000000c975c";
const relayer = "0x93596EBf4e4B3ACEAb8Af2B4FeA6157e3F7fb7A9";
const payTo = "0x96e854abddc5c618ca843956d1303017b586ab75";

describe("store keys added for nonce gaps and judge claims", () => {
  it("builds canonical relayer transaction keys and refuses bad nonces", () => {
    expect(keys.relayerTx(relayer, 7n)).toBe("santa:v1:46630:0x93596EBf4e4B3ACEAb8Af2B4FeA6157e3F7fb7A9:relayertx:7");
    expect(() => keys.relayerTx(relayer, -1n)).toThrow(RangeError);
    expect(() => keys.relayerTx(relayer, 1n << 64n)).toThrow(RangeError);
  });
});

describe("judge gift keys", () => {
  const h = `0x${"cd".repeat(32)}`;
  it("builds canonical judge keys scoped to the vault", () => {
    expect(keys.judgeUser(vault, h)).toBe(`santa:v1:46630:${getAddress(vault)}:judgeuser:${h}`);
    expect(keys.judgeNetworkDay(vault, h, "2026-10-08")).toBe(`santa:v1:46630:${getAddress(vault)}:judgeip:${h}-2026-10-08`);
    expect(keys.judgeGiftTaken(vault, 12n)).toBe(`santa:v1:46630:${getAddress(vault)}:judgegift:12`);
  });
  it("refuses unhashed identities and bad days", () => {
    expect(() => keys.judgeUser(vault, "did:privy:abc")).toThrow(RangeError);
    expect(() => keys.judgeNetworkDay(vault, h, "2026-02-30")).toThrow(RangeError);
  });
});
