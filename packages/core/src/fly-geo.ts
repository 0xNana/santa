import { canonicalClientIp } from "./judge.js";

type Place = { country: string | null; region: string | null };
type Lookup = (ip: string) => Promise<{ country?: string; region1?: string } | null>;
const UNKNOWN: Place = { country: null, region: null };

/** Only the IP supplied by Fly's proxy is resolved. Client country headers are never used. */
export async function flyPlace(ip: string | null, lookup: Lookup): Promise<Place> {
  const address = canonicalClientIp(ip);
  if (address === null) return UNKNOWN;
  try {
    const result = await lookup(address);
    if (!result?.country || !/^[A-Z]{2}$/.test(result.country)) return UNKNOWN;
    return { country: result.country, region: result.region1 || null };
  } catch {
    return UNKNOWN;
  }
}

let database: Promise<typeof import("ip-location-api")> | null = null;

/** Country/subdivision data stays on the server; visitor addresses are never sent to an API. */
export function flyGeoDatabase(): Promise<typeof import("ip-location-api")> {
  if (database === null) {
    database = import("ip-location-api").then(async (module) => {
      await module.reload();
      return module;
    }).catch(() => {
      database = null;
      throw new Error("Could not initialize the local country database.");
    });
  }
  return database;
}
