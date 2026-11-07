import type { SendStep } from "@santa/core/src/client/send.js";
import type { Hex } from "viem";
import type { WalletPhase } from "./signer";

export type RowId = "quote" | "approve-vault" | "create" | "link";

/** "working" is a wait on Santa's server, with no wallet involved. */
export type RowState = "waiting" | "working" | "in-wallet" | "confirming" | "done" | "failed";

export type Row = { id: RowId; shown: boolean; state: RowState; hash: Hex | null };

/** The call sheet: one row per step, and which row is the one on screen now. */
export type Sheet = { rows: Row[]; active: RowId | null };

// The order shown while creating a held-token gift.
const ORDER: readonly RowId[] = ["quote", "approve-vault", "create", "link"];

export function newSheet(): Sheet {
  return { rows: ORDER.map((id) => ({ id, shown: true, state: "waiting", hash: null })), active: null };
}

export function rowLabel(id: RowId): string {
  switch (id) {
    case "quote":
      return "Check token balance";
    case "approve-vault":
      return "Let the vault hold it";
    case "create":
      return "Seal the gift";
    case "link":
      return "Link ready";
  }
}

function set(sheet: Sheet, id: RowId, patch: Partial<Row>): Sheet {
  return { ...sheet, rows: sheet.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)) };
}

function finish(sheet: Sheet, id: RowId): Sheet {
  const row = sheet.rows.find((entry) => entry.id === id);
  return row === undefined || row.state === "done" ? sheet : set(sheet, id, { state: "done" });
}

function activate(sheet: Sheet, id: RowId, state: RowState): Sheet {
  return { ...set(sheet, id, { state, hash: null, shown: true }), active: id };
}

/** Moves the sheet on when sendGift yields a step: the step before it is done, this one is active. */
export function applyStep(sheet: Sheet, step: SendStep): Sheet {
  switch (step.kind) {
    case "quote":
      return activate(sheet, "quote", "working");
    case "approve-vault":
      return activate(finish(sheet, "quote"), "approve-vault", "in-wallet");
    case "key-pending":
      return finish(sheet, "approve-vault");
    case "create":
      return activate(sheet, "create", "in-wallet");
    case "link-ready":
      return { ...finish(finish(sheet, "create"), "link"), active: null };
    case "done":
      return { ...set(sheet, "create", { state: "done", hash: step.txHash }), active: null };
  }
}

/** The wallet reported what it is doing for the active row. */
export function applyWallet(sheet: Sheet, phase: WalletPhase, hash?: Hex): Sheet {
  if (sheet.active === null) return sheet;
  if (phase === "in-wallet") return set(sheet, sheet.active, { state: "in-wallet" });
  if (phase === "confirming") return set(sheet, sheet.active, { state: "confirming" });
  return set(sheet, sheet.active, { state: "confirming", hash: hash ?? null });
}

/** The active row, if there is one, is where it stopped. */
export function failSheet(sheet: Sheet): Sheet {
  return sheet.active === null ? sheet : { ...set(sheet, sheet.active, { state: "failed" }), active: null };
}
