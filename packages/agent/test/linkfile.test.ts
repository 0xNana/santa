import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { saveNewLink } from "../src/linkfile.js";
it("keeps private links owner-readable and never overwrites an existing gift link", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "santa-links-"));
  try {
    const dir = path.join(root, "gifts"); const first = await saveNewLink(dir, 1n, "first private link\n");
    const second = await saveNewLink(dir, 1n, "second private link\n");
    expect(first).not.toBe(second); expect(await readFile(first, "utf8")).toBe("first private link\n"); expect(await readFile(second, "utf8")).toBe("second private link\n");
    expect((await stat(first)).mode & 0o777).toBe(0o600); expect((await stat(dir)).mode & 0o777).toBe(0o700);
  } finally { await rm(root, { recursive: true }); }
});
