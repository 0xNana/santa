"use client";

import { useEffect, useRef } from "react";
import { Grain } from "@/components/hero/Grain";
import "./sections.css";

const TYPE_MS_PER_CHARACTER = 28;
const LINE_STEP_MS = 180;
const VISIBLE_FRACTION = 0.4;

type RunLine = { kind: "command" | "output"; text: string };

// Illustrative command; no historical mainnet activity is presented as testnet proof.
const RUN: readonly RunLine[] = [
  { kind: "command", text: 'npm run santa -- gift TSLA 5 --note "A little gift for you" --yes' },
  { kind: "output", text: "Illustration: approve 5 stock units, seal the gift, save the link." },
  { kind: "output", text: "Robinhood Chain Testnet · testnet stock tokens have no monetary value." },
];

const COMMAND = RUN.find((line) => line.kind === "command")?.text ?? "";
const OUTPUT = RUN.filter((line) => line.kind === "output");
// Types the command, then shows the output one line at a time. A blank line comes in with the line after it.
function playRun(terminal: HTMLElement, typed: HTMLElement, rows: readonly HTMLElement[]): () => void {
  const timers: number[] = [];
  let typedLength = 0;
  terminal.dataset.phase = "typing";
  const typing = window.setInterval(() => {
    typedLength += 1;
    typed.textContent = COMMAND.slice(0, typedLength);
    if (typedLength < COMMAND.length) return;
    window.clearInterval(typing);
    terminal.dataset.phase = "output";
    let step = 0;
    let blanks: HTMLElement[] = [];
    OUTPUT.forEach((line, index) => {
      const row = rows[index];
      if (!row) return;
      if (line.text === "") {
        blanks.push(row);
        return;
      }
      step += 1;
      const group = [...blanks, row];
      blanks = [];
      timers.push(
        window.setTimeout(() => {
          for (const member of group) member.dataset.shown = "true";
        }, step * LINE_STEP_MS),
      );
    });
    timers.push(
      window.setTimeout(() => {
        for (const member of blanks) member.dataset.shown = "true";
        terminal.dataset.phase = "done";
      }, (step + 1) * LINE_STEP_MS),
    );
  }, TYPE_MS_PER_CHARACTER);
  return () => {
    window.clearInterval(typing);
    for (const timer of timers) window.clearTimeout(timer);
  };
}

export function AgentRun() {
  const terminal = useRef<HTMLDivElement>(null);
  const typed = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = terminal.current;
    const typedText = typed.current;
    if (!element || !typedText) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rows = Array.from(element.querySelectorAll<HTMLElement>(".agent-line-output"));
    // Armed: the prompt waits empty and the output is hidden until the terminal is on screen.
    element.dataset.phase = "armed";
    typedText.textContent = "";
    let stop: () => void = () => undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        stop = playRun(element, typedText, rows);
      },
      { threshold: VISIBLE_FRACTION },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      stop();
      typedText.textContent = COMMAND;
      delete element.dataset.phase;
      for (const row of rows) delete row.dataset.shown;
    };
  }, []);

  return (
    <section className="agent" aria-labelledby="agent-title">
      <div className="agent-text">
        <p className="sec-label">THE AGENT</p>
        <h2 className="agent-title" id="agent-title">
          Or let your AI agent send it.
        </h2>
        <p className="agent-body">
          Santa’s CLI sends stocks you already hold on Robinhood Chain Testnet. It checks the token list and quantity,
          builds an exact approval, seals your note and saves the private gift link locally. Delivery has no wrapping fee.
        </p>
      </div>

      <div className="agent-stage">
        <p className="agent-recorded">EXAMPLE · ROBINHOOD CHAIN TESTNET</p>
        <div className="agent-terminal" ref={terminal}>
          <div className="agent-titlebar">santa · robinhood chain testnet</div>
          <div className="agent-screen">
            <div className="agent-line agent-line-command">
              <span className="agent-prompt">$ </span>
              <span ref={typed}>{COMMAND}</span>
              <span className="agent-cursor agent-cursor-inline" aria-hidden="true" />
            </div>
            {OUTPUT.map((line, index) => (
              <div className="agent-line agent-line-output" key={index}>
                {line.text === "" ? " " : line.text}
              </div>
            ))}
            <div className="agent-line agent-line-end">
              <span className="agent-cursor" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
      <Grain />
    </section>
  );
}
