import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { GiftError } from "./errors.js";

/**
 * Writes a new link file `gift-<id>.txt` in `linkDir` (created with mode 0700) with mode 0600, and
 * never overwrites one: a name clash only happens across vaults, and losing either file would lose
 * a gift, so the new one takes the next free name, `gift-<id>-2.txt` and so on.
 */
export async function saveNewLink(linkDir: string, giftId: bigint, content: string): Promise<string> {
  await mkdir(linkDir, { recursive: true, mode: 0o700 });
  for (let n = 1; n <= 100; n += 1) {
    const file = path.join(linkDir, n === 1 ? `gift-${giftId}.txt` : `gift-${giftId}-${n}.txt`);
    try {
      await writeFile(file, content, { mode: 0o600, flag: "wx" });
      return file;
    } catch (err) {
      if (!(err instanceof Error && "code" in err && err.code === "EEXIST")) throw err;
    }
  }
  throw new GiftError("Santa could not find a free file name for the gift link.");
}
