import { describe, expect, it } from "vitest";
import { flyPlace } from "../src/fly-geo.js";

const ghana = async () => ({ country: "GH", region1: "AA" });

describe("Fly server-side geolocation", () => {
  it("resolves a Fly-normalized client IP without trusting country headers", async () => {
    expect(await flyPlace("8.8.8.8", ghana)).toEqual({ country: "GH", region: "AA" });
  });
  it("keeps missing and malformed IPs unknown without a lookup", async () => {
    const never = async () => { throw new Error("must not be called"); };
    expect(await flyPlace(null, never)).toEqual({ country: null, region: null });
    expect(await flyPlace("invalid", never)).toEqual({ country: null, region: null });
  });
  it("fails closed when the lookup fails or has no result", async () => {
    expect(await flyPlace("8.8.8.8", async () => null)).toEqual({ country: null, region: null });
    expect(await flyPlace("8.8.8.8", async () => { throw new Error("offline"); })).toEqual({ country: null, region: null });
  });
  it("preserves the Ukrainian subdivision for the existing eligibility policy", async () => {
    expect(await flyPlace("8.8.8.8", async () => ({ country: "UA", region1: "43" }))).toEqual({ country: "UA", region: "43" });
  });
  it("does not invent a country or region from malformed lookup data", async () => {
    expect(await flyPlace("8.8.8.8", async () => ({ country: "USA", region1: "" }))).toEqual({ country: null, region: null });
  });
});
