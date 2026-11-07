"use client";

import "@/components/claim/zodNoEval";
import { useConnectWallet, usePrivy, useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { recoverPendingGift, sendGift, SendGiftError, type SendGiftDeps } from "@santa/core/src/client/send.js";
import type { WalletSigner } from "@santa/core/src/client/signer.js";
import { MAX_GIFT_USD, MIN_GIFT_USD } from "@santa/core/src/create.js";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getAddress, type Address } from "viem";
import { SiteNav } from "@/components/nav/SiteNav";
import { useSignInAvailable } from "@/components/privy/SantaPrivy";
import { publicClient, VAULT, VAULT_CONFIGURED } from "@/lib/chain";
import { displayName, useStocks } from "@/lib/stocks";
import { CallSheet } from "./CallSheet";
import { driveSend } from "./drive";
import { ErrorPanel } from "./ErrorPanel";
import { displayItalic } from "./fonts";
import { cleanAmount } from "./format";
import { LinkCard } from "./LinkCard";
import { MyGifts } from "./MyGifts";
import { Preview } from "./Preview";
import { eraseFinishedKeys, readBalances, readChainTime, readClaimKeyUsed, refundGift, wasDeclined, type Balances } from "./reads";
import { recoverRecord, type RecoveryIO, type RecoveryLine } from "./recovery";
import { RecoveryBanner } from "./RecoveryBanner";
import { newSheet } from "./rows";
import { advanceRun, stopRun, walletOnRun, type Run } from "./run";
import { ConnectRow, SendFields, sendHintFor, type AmountChoice, type Days, type StorageState, type WalletView } from "./SendForm";
import { openWallet, walletSigner, type WalletPhase } from "./signer";
import { isTradable } from "./StockPicker";
import { addLink, addPending, dropDeclined, listLinks, listPending, removePending, storageChecked } from "./storage";
import "./send.css";

const WALLET_LIST = ["metamask", "detected_ethereum_wallets", "wallet_connect"] as const;
const MAX_USD = Number(MAX_GIFT_USD);
const MIN_USD = Number(MIN_GIFT_USD);
const DEFAULT_SYMBOL = "TSLA";

const nothingToWatch = () => () => undefined;

const SWITCH_REFUSED = new SendGiftError("wallet_failed", "Your wallet did not switch to Robinhood Chain Testnet, so nothing was sent.", "Nothing was spent.", null);

type Held = { address: string; balances: Balances };

// `version` is not used inside: it changes after each save or removal, so the read happens again.
function readSaved(address: Address | null, version: number) {
  void version;
  return address === null ? { pending: [], links: [] } : { pending: listPending(address), links: listLinks(address) };
}

function pageDeps(signer: WalletSigner): SendGiftDeps {
  return { signer, publicClient, vault: VAULT, fetch: window.fetch.bind(window), origin: window.location.origin };
}

async function signerFor(wallet: ConnectedWallet, onWallet: (phase: WalletPhase, hash?: `0x${string}`) => void): Promise<WalletSigner> {
  return walletSigner(await openWallet(wallet), onWallet);
}

/**
 * The send page. A sender connects an Ethereum wallet, picks a stock, an amount and a note,
 * and walks sendGift's steps on a call sheet to a link. The gift key is saved before createGift is
 * asked for and the link before the key is dropped, so a closed tab never loses a gift. Nothing here
 * logs, sends or puts the claim key in an address (C12).
 */
export function SendPage() {
  const signInAvailable = useSignInAvailable();
  const { ready } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  // A wallet that cannot be disconnected from a page, such as MetaMask, stays in Privy's list after wallet.disconnect(), so the page also remembers that the sender asked to leave.
  const [left, setLeft] = useState<string | null>(null);
  const { connectWallet } = useConnectWallet({ onSuccess: () => setLeft(null) });
  const stocks = useStocks();

  const [selected, setSelected] = useState<string | null>(null);
  const [choice, setChoice] = useState<AmountChoice>("5");
  const [otherText, setOtherText] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState<Days>(30);
  const [run, setRun] = useState<Run>({ phase: "form" });
  const [held, setHeld] = useState<Held | null>(null);
  const [balanceTick, setBalanceTick] = useState(0);
  const [listsTick, setListsTick] = useState(0);
  const [bannerLines, setBannerLines] = useState<{ address: string; lines: RecoveryLine[] } | null>(null);
  const [bannerBusy, setBannerBusy] = useState(false);

  // "checking" on the server and while the page hydrates, then what this browser allows.
  const storage: StorageState = useSyncExternalStore(nothingToWatch, () => (storageChecked() ? "ok" : "blocked"), () => "checking");

  const listed = walletsReady ? (wallets.find((wallet) => wallet.walletClientType !== "privy") ?? null) : null;
  const external = listed !== null && listed.address.toLowerCase() === left ? null : listed;
  const address: Address | null = external === null ? null : getAddress(external.address);

  // What this browser has saved for the connected wallet, read again whenever a save or a removal is done.
  const saved = useMemo(() => readSaved(address, listsTick), [address, listsTick]);
  const reloadLists = useCallback(() => setListsTick((count) => count + 1), []);

  useEffect(() => {
    if (address === null) return;
    let alive = true;
    readBalances(address)
      .then((balances) => {
        if (alive) setHeld({ address, balances });
      })
      .catch(() => {
        if (alive) setHeld(null);
      });
    return () => {
      alive = false;
    };
  }, [address, balanceTick]);

  // Gifts that are opened or taken back no longer need their link, so the keys are erased as soon as the list loads.
  const openIds = saved.links
    .filter((entry) => entry.final === undefined)
    .map((entry) => entry.giftId)
    .join(",");
  useEffect(() => {
    if (address === null || openIds === "") return;
    let alive = true;
    eraseFinishedKeys(address)
      .then((changed) => {
        if (alive && changed) reloadLists();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [address, openIds, reloadLists]);

  const balances = held !== null && held.address === address ? held.balances : null;
  const pendingCount = saved.pending.length;
  const links = saved.links;
  const lines = bannerLines !== null && bannerLines.address === address ? bannerLines.lines : null;

  const stockList = stocks.status === "ready" ? stocks.stocks : [];
  const defaultStock = stockList.find((stock) => stock.symbol === DEFAULT_SYMBOL && isTradable(stock)) ?? stockList[0] ?? null;
  const stock = selected === null ? defaultStock : (stockList.find((entry) => entry.address === selected) ?? null);
  const stockName = stock === null ? null : displayName(stock.name);

  const amountText = cleanAmount(choice === "other" ? otherText : choice);
  const amount = Number(amountText);
  const amountOk = Number.isFinite(amount) && amount >= MIN_USD && amount <= MAX_USD;
  const connected = address !== null;
  // A gift is paid for only when this browser can keep the link: with storage blocked or still being checked, the button stays off.
  const canSend = VAULT_CONFIGURED && connected && stock !== null && isTradable(stock) && amountOk && storage === "ok" && run.phase === "form";

  const sendHint = !VAULT_CONFIGURED ? "Santa’s testnet vault has not been configured yet." : sendHintFor({ running: run.phase !== "form", storage, connected, stock, amountOk });

  const onWallet = useCallback((phase: WalletPhase, hash?: `0x${string}`) => setRun((current) => walletOnRun(current, phase, hash)), []);

  const finishSend = useCallback(() => {
    setBalanceTick((count) => count + 1);
    reloadLists();
  }, [reloadLists]);

  const start = async () => {
    if (!canSend || external === null || stock === null || address === null) return;
    const sender = address;
    const symbol = stock.symbol;
    setBannerLines(null);
    setRun({ phase: "sending", sheet: newSheet() });
    let signer: WalletSigner;
    try {
      signer = await signerFor(external, onWallet);
    } catch {
      setRun((current) => stopRun(current, SWITCH_REFUSED));
      return;
    }
    const deps: SendGiftDeps = pageDeps(signer);
    const result = await driveSend(sendGift(deps, { stock: stock.address, usdAmount: amountText, note, expiryDays: days }), {
      onStep: (step) => setRun((current) => advanceRun(current, step)),
      keepPending: (pending) => addPending(sender, pending),
      keepLink: (giftId, link) => addLink(sender, { giftId: giftId.toString(), link, symbol, createdAt: Date.now() }),
      dropPending: (claimKey) => {
        removePending(sender, claimKey);
      },
      dropDeclined: (claimKey) => dropDeclined(sender, claimKey),
      claimKeyUsed: readClaimKeyUsed,
    });
    if (!result.ok) setRun((current) => stopRun(current, result.error));
    finishSend();
  };

  const find = async () => {
    if (address === null) return;
    const owner = address;
    setBannerBusy(true);
    const io: RecoveryIO = {
      recover: (pending) => recoverPendingGift({ publicClient, vault: VAULT, origin: window.location.origin }, pending),
      latestBlockTime: readChainTime,
      saveLink: (record, found) => addLink(owner, { giftId: found.giftId.toString(), link: found.link, symbol: "", createdAt: record.createdAt * 1000 }),
      removeRecord: (record) => {
        removePending(owner, record.claimKey);
      },
    };
    const results: RecoveryLine[] = [];
    for (const record of listPending(owner)) results.push(await recoverRecord(record, io));
    setBannerLines({ address: owner, lines: results });
    setBannerBusy(false);
    reloadLists();
  };

  const takeBack = async (giftId: string, onPhase: (phase: "in-wallet" | "confirming") => void): Promise<string | null> => {
    if (external === null) return "Connect your wallet to take this gift back.";
    try {
      const signer = await signerFor(external, (phase) => onPhase(phase === "in-wallet" ? "in-wallet" : "confirming"));
      await refundGift(signer, giftId);
      setBalanceTick((count) => count + 1);
      // The gift is taken back, so its link is of no use any more.
      if (address !== null) {
        void eraseFinishedKeys(address)
          .then((changed) => {
            if (changed) reloadLists();
          })
          .catch(() => undefined);
      }
      return null;
    } catch (error) {
      return wasDeclined(error) ? "You declined in your wallet, so nothing changed." : "The refund did not go through. Try again in a minute.";
    }
  };

  const disconnect = () => {
    if (external === null) return;
    setLeft(external.address.toLowerCase());
    void external.disconnect();
  };

  const wallet: WalletView = !signInAvailable
    ? { kind: "unavailable" }
    : address !== null
      ? { kind: "connected", address, balances, onDisconnect: disconnect }
      : !ready || !walletsReady
        ? { kind: "loading" }
        : { kind: "disconnected", onConnect: () => connectWallet({ walletList: [...WALLET_LIST], walletChainType: "ethereum-only" }) };

  const showBanner = address !== null && run.phase === "form" && (pendingCount > 0 || lines !== null);

  const side =
    run.phase === "form" ? (
      <Preview stockName={stockName} amount={amountOk ? amount : 0} note={note} />
    ) : run.phase === "sending" ? (
      <CallSheet sheet={run.sheet} />
    ) : run.phase === "linked" ? (
      <>
        <LinkCard link={run.link} giftId={run.giftId} onSendAnother={() => setRun({ phase: "form" })} />
        <CallSheet sheet={run.sheet} />
      </>
    ) : (
      <>
        <ErrorPanel failure={run.failure} onRestart={() => setRun({ phase: "form" })} />
        <CallSheet sheet={run.sheet} />
      </>
    );

  return (
    <div className="send-page" data-run={run.phase}>
      <SiteNav page="send" />
      <main className="send-main" id="main-content">
        <header className="send-head">
          <p className="send-label">A LITTLE SOMETHING, FROM YOU</p>
          <h1 className="send-title">
            Make it <span className="send-title-italic" style={{ fontFamily: displayItalic.style.fontFamily }}>personal.</span>
          </h1>
          <p className="send-intro">Pick a stock, add a few words, and send a little love.</p>
          <ol className="send-progress" aria-label="Gift progress">
            <li aria-current={run.phase === "form" ? "step" : undefined}><span>1</span> Create your gift</li>
            <li aria-current={run.phase === "sending" || run.phase === "failed" ? "step" : undefined}><span>2</span> Wrap it up</li>
            <li aria-current={run.phase === "linked" ? "step" : undefined}><span>3</span> Share the link</li>
          </ol>
        </header>

        <div className="send-cols">
          <div className="send-form-col">
            <div className="send-form">
              {showBanner ? <RecoveryBanner lines={lines} busy={bannerBusy} onFind={() => void find()} /> : null}
              <ConnectRow wallet={wallet} />
              <SendFields
                stocks={stocks}
                selected={stock === null ? null : stock.address}
                onSelect={setSelected}
                onReloadStocks={() => window.location.reload()}

                stockName={stockName}
                choice={choice}
                otherText={otherText}
                onChoice={setChoice}
                onOtherText={setOtherText}
                amount={amountOk ? amount : 0}
                note={note}
                onNote={setNote}
                days={days}
                onDays={setDays}
                hint={sendHint}
                canSend={canSend}
                onSend={() => void start()}
                locked={run.phase !== "form"}
              />
            </div>
            <MyGifts entries={links} canRefund={connected} onRefund={takeBack} />
          </div>
          <aside className="send-side" data-mode={run.phase}>
            {side}
          </aside>
        </div>
      </main>
      <footer className="send-footer">Robinhood Chain Testnet · Testnet stock tokens have no monetary value or equity ownership rights.</footer>
    </div>
  );
}
