import type { NextRequest } from "next/server";
import { EnvError } from "@santa/core/src/env.js";
import { clientFromHeaders, json, MAX_BODY_BYTES, route, type SantaRequest, type SantaResponse, type ServerDeps } from "@santa/core/src/http.js";
import { flyGeoDatabase, flyPlace } from "@santa/core/src/fly-geo.js";
import { BootError, createServerDeps } from "@santa/core/src/server-deps.js";

export const runtime = "nodejs";
// Allow pending relayer operations to finish within the server request.
export const maxDuration = 150;
export const dynamic = "force-dynamic";

// A failed boot is kept this long before a later request tries again: a node that is briefly down
// at boot must not take the instance offline for its whole life, and a burst of requests must not
// become a burst of boot attempts.
const BOOT_RETRY_MS = 30_000;
const PLATFORM = process.env.FLY_APP_NAME ? "fly" : process.env.VERCEL === "1" ? "vercel" : "local";
const LOCAL_SOCKET_IP = "127.0.0.1";

type Boot = { deps: Promise<ServerDeps>; failedAt: number | null };
let boot: Boot | null = null;

function bootMessage(err: unknown): string {
  if (err instanceof EnvError || err instanceof BootError) return err.message;
  // Anything else is unexpected, and its text could quote a setting, so only its kind is printed.
  return err instanceof Error ? `${err.name} while building the server.` : "an unknown error while building the server.";
}

function startBoot(): Boot {
  const deps = createServerDeps().then(async (ready) => {
    if (PLATFORM === "fly") await flyGeoDatabase();
    return ready;
  });
  const attempt: Boot = { deps, failedAt: null };
  attempt.deps.catch((err: unknown) => {
    attempt.failedAt = Date.now();
    console.error(`Santa API did not start: ${bootMessage(err)}`);
  });
  return attempt;
}

async function serverDeps(): Promise<ServerDeps | null> {
  if (boot === null || (boot.failedAt !== null && Date.now() - boot.failedAt >= BOOT_RETRY_MS)) boot = startBoot();
  try {
    return await boot.deps;
  } catch {
    return null;
  }
}

// A null-prototype record, so a header named __proto__ is only ever a header. Headers already
// yields lower-case names, with repeated headers joined by a comma.
function plainHeaders(headers: Headers): Record<string, string | undefined> {
  const out = Object.create(null) as Record<string, string | undefined>;
  headers.forEach((value, name) => {
    out[name.toLowerCase()] = value;
  });
  return out;
}

// The same standard URL parser as core's local server, so both hand route() the same path.
function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

// Stops reading one byte past the cap, which is all route() needs to answer 413; the rest of an
// oversized body is never read.
async function readCappedBody(request: NextRequest): Promise<string | null> {
  if (request.body === null) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size <= MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const part = value.subarray(0, MAX_BODY_BYTES + 1 - size);
      chunks.push(part);
      size += part.byteLength;
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return size === 0 ? null : Buffer.concat(chunks, size).toString("utf8");
}

async function handle(request: NextRequest): Promise<Response> {
  let answer: SantaResponse;
  try {
    const deps = await serverDeps();
    if (deps === null) {
      answer = json(503, { ok: false, error: "server_not_configured" });
    } else {
      const headers = plainHeaders(request.headers);
      const place = clientFromHeaders(headers, PLATFORM, { socketIp: LOCAL_SOCKET_IP, devCountry: process.env.SANTA_DEV_COUNTRY ?? null });
      if (PLATFORM === "fly") {
        const database = await flyGeoDatabase();
        Object.assign(place, await flyPlace(place.clientIp, async (ip) => database.lookup(ip)));
      }
      const santaRequest: SantaRequest = { method: request.method, path: pathOf(request.url), headers, body: await readCappedBody(request), ...place };
      answer = await route(deps, santaRequest);
    }
  } catch {
    answer = json(500, { ok: false, error: "internal" });
  }
  return new Response(answer.body, { status: answer.status, headers: answer.headers });
}

export const GET = handle;
export const POST = handle;
