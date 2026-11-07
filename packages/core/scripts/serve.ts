// npm run serve: every Santa endpoint on this machine, for the sender agent and local development. Listens on 127.0.0.1 only, at PORT (default 3000). Settings come from the
// repo-root .env exactly as for the hosted server, plus SANTA_DEV_COUNTRY: the country every local
// request is treated as coming from, since there is no hosting platform here to say. Unset, the
// claim, quote and judge routes refuse every request unless SANTA_DEV_ALLOW_UNKNOWN_COUNTRY=1.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { EnvError } from "../src/env.js";
import { clientFromHeaders, json, MAX_BODY_BYTES, route, type SantaRequest, type SantaResponse, type ServerDeps } from "../src/http.js";
import { BootError, createServerDeps } from "../src/server-deps.js";

const HOST = "127.0.0.1";
const DEFAULT_PORT = "3000";
// Node applies this timeout to receiving the request body.
const REQUEST_TIMEOUT_MS = 30_000;
const HEADERS_TIMEOUT_MS = 20_000;
// Give active requests a short window to finish during shutdown.
const SHUTDOWN_GRACE_MS = 5_000;

function parsePort(text: string | undefined): number {
  const value = text === undefined || text.trim() === "" ? DEFAULT_PORT : text.trim();
  const port = /^[1-9][0-9]{0,4}$/.test(value) ? Number(value) : 0;
  if (port < 1 || port > 65_535) throw new EnvError(["PORT"]);
  return port;
}

// Reads at most one byte past the cap and then stops reading, so an oversized body costs no more
// than that, and route still sees enough to answer 413.
function readBody(req: IncomingMessage): Promise<{ body: string | null; cut: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = (cut: boolean) => {
      if (done) return;
      done = true;
      req.off("data", onData);
      resolve({ body: size === 0 ? null : Buffer.concat(chunks, size).toString("utf8"), cut });
    };
    const onData = (chunk: Buffer) => {
      const room = MAX_BODY_BYTES + 1 - size;
      chunks.push(chunk.subarray(0, room));
      size += Math.min(chunk.length, room);
      if (size > MAX_BODY_BYTES) {
        req.pause();
        finish(true);
      }
    };
    const fail = () => {
      if (done) return;
      done = true;
      reject(new Error("the request ended before its body"));
    };
    req.on("data", onData);
    req.once("end", () => finish(false));
    req.once("error", fail);
    req.once("close", fail);
  });
}

// A null-prototype record, so a header named __proto__ is only ever a header.
function plainHeaders(raw: IncomingMessage["headers"]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = Object.create(null) as Record<string, string | undefined>;
  for (const [name, value] of Object.entries(raw)) out[name] = Array.isArray(value) ? value.join(", ") : value;
  return out;
}

// The standard URL parser gives the path alone, without the query string; route matches it exactly.
function pathOf(target: string | undefined): string {
  try {
    return new URL(target ?? "", `http://${HOST}`).pathname;
  } catch {
    return "";
  }
}

function send(res: ServerResponse, answer: SantaResponse, close: boolean): void {
  if (res.headersSent || res.destroyed) return;
  for (const [name, value] of Object.entries(answer.headers)) res.setHeader(name, value);
  // Unread body bytes would otherwise be taken as the start of the next request on this socket.
  if (close) res.setHeader("Connection", "close");
  res.statusCode = answer.status;
  res.end(answer.body);
}

async function handle(deps: ServerDeps, devCountry: string | null, req: IncomingMessage, res: ServerResponse): Promise<void> {
  let cut = true;
  try {
    const read = await readBody(req);
    cut = read.cut;
    const headers = plainHeaders(req.headers);
    const place = clientFromHeaders(headers, "local", { socketIp: req.socket.remoteAddress ?? null, devCountry });
    const request: SantaRequest = { method: req.method ?? "", path: pathOf(req.url), headers, body: read.body, ...place };
    send(res, await route(deps, request), cut);
  } catch {
    send(res, json(500, { ok: false, error: "internal" }), true);
  }
}

function bootMessage(err: unknown): string {
  if (err instanceof EnvError || err instanceof BootError) return err.message;
  // Anything else is unexpected, and its text could quote a setting, so only its kind is printed.
  return err instanceof Error ? `${err.name} while building the server.` : "an unknown error while building the server.";
}

async function main(): Promise<void> {
  let deps: ServerDeps;
  let port: number;
  try {
    deps = await createServerDeps();
    port = parsePort(process.env.PORT);
  } catch (err) {
    console.error(`Santa API did not start: ${bootMessage(err)}`);
    process.exitCode = 1;
    return;
  }
  const devCountry = process.env.SANTA_DEV_COUNTRY?.trim() || null;

  const server = createServer({ requestTimeout: REQUEST_TIMEOUT_MS, headersTimeout: HEADERS_TIMEOUT_MS }, (req, res) => {
    void handle(deps, devCountry, req, res);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    console.error(`Santa API stopped: ${err.code === "EADDRINUSE" ? `port ${port} is already in use.` : "the server failed."}`);
    process.exitCode = 1;
  });
  server.listen(port, HOST, () => {
    console.log(`Santa API listening on http://${HOST}:${port}`);
    console.log(`Store: ${deps.storeKind === "upstash" ? "Upstash (shared)" : deps.storeKind === "sqlite" ? "SQLite (persistent, one Machine)" : "memory, this process only (SANTA_ALLOW_MEMORY_STORE=1)"}`);
    console.log(`Vault: ${deps.vault}`);
    console.log(`Local requests count as country: ${devCountry ?? "none (SANTA_DEV_COUNTRY is unset)"}${deps.devAllowUnknownCountry ? ", unknown allowed" : ""}`);
    console.log(`Judge gifts: ${deps.judge === null ? "closed (SANTA_JUDGE_POOL is unset)" : `open, ${deps.judge.pool.size} in the pool`}`);
  });

  process.once("SIGINT", () => {
    console.log(`Shutting down: no new requests, up to ${SHUTDOWN_GRACE_MS / 1000} s for open ones. Press Ctrl+C again to stop at once.`);
    process.once("SIGINT", () => process.exit(1));
    server.close(() => {
      console.log("Santa API stopped.");
      process.exit(0);
    });
    server.closeIdleConnections();
    setTimeout(() => server.closeAllConnections(), SHUTDOWN_GRACE_MS).unref();
  });
}

await main();
