import assert from "node:assert/strict";

// Smoke-test SSR routes against a local production server.
// SANTA_TEST_UNCONFIGURED=1 also verifies the missing-Privy fallback.
const origin = new URL(process.env.SANTA_TEST_ORIGIN ?? "http://127.0.0.1:3100");
assert(["127.0.0.1", "localhost"].includes(origin.hostname), "Use a local verification server.");
for (const path of ["/", "/send", "/docs", "/docs/getting-started"]) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, `${path} must render`);
  const html = await response.text();
  assert.match(html, /Santa/, `${path} must use the Santa brand`);
  assert.doesNotMatch(html, /\bMoi\b|\bMOI\b|@moi\//);
  if (path === "/send" && process.env.SANTA_TEST_UNCONFIGURED === "1") assert.match(html, /wallet connection is unavailable/);
  console.log(`PASS ${path}`);
}
