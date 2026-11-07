import { headers } from "next/headers";
import Link from "next/link";
import { GiftLetter } from "@/components/hero/GiftLetter";
import { SiteNav } from "@/components/nav/SiteNav";
import { ForJudges } from "@/components/sections/ForJudges";
import "./home.css";

const steps = [
  {
    number: "01",
    icon: "◈",
    title: "Pick a little something.",
    body: "Choose a stock from your wallet and how much you’d like to give.",
  },
  {
    number: "02",
    icon: "♡",
    title: "Make it personal.",
    body: "Add a private note. A few words can make a simple gift feel like theirs.",
  },
  {
    number: "03",
    icon: "↗",
    title: "Send a link. Make their day.",
    body: "They sign in with Google or email to open it. Santa takes care of the claim fee.",
  },
];

export default async function Home() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <div className="home">
      <SiteNav />
      <main id="main-content">
        <section className="landing-hero" aria-labelledby="home-title">
          <div className="landing-copy">
            <p className="eyebrow"><span className="status-dot" /> SMALL GESTURES. NEW POSSIBILITIES.</p>
            <h1 id="home-title">Send stocks.<br />Share a<br /><em>little love.</em></h1>
            <p className="landing-description">
              Send stocks to the people you love. For birthdays, big milestones,
              or just because. Pick a stock, add a note, and wrap it all up in a link.
            </p>
            <div className="landing-actions">
              <Link className="button-primary" href="/send" prefetch={false}>
                Send a gift <span aria-hidden="true">↗</span>
              </Link>
              <a className="button-text" href="#how">See how it works <span aria-hidden="true">↓</span></a>
            </div>
            <p className="landing-footnote"><span aria-hidden="true">✧</span> A new way to say, “I thought of you.”</p>
          </div>
          <GiftLetter />
        </section>

        <div className="network-strip">
          <span className="network-strip-title"><span className="status-dot" /> REAL-WORLD ASSETS. PERSONAL GIFTS.</span>
          <p>Built on Robinhood Chain Testnet<span aria-hidden="true"> · </span><strong>Stock gifting, now on testnet.</strong></p>
        </div>

        <section className="how-section" id="how" aria-labelledby="how-title">
          <div className="section-heading">
            <p className="eyebrow">THOUGHTFUL BY DESIGN</p>
            <h2 id="how-title">Big on thought.<br /><em>Light on effort.</em></h2>
            <p>From “this made me think of you”<br />to “you’ve got a gift.” In three simple steps.</p>
          </div>
          <ol className="how-steps">
            {steps.map((step) => (
              <li key={step.number}>
                <div className="how-step-top"><span>{step.number}</span><span className="how-step-icon" aria-hidden="true">{step.icon}</span></div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="thoughtful-section" aria-labelledby="thoughtful-title">
          <div className="little-note">
            <span aria-hidden="true">♡</span>
            <p>For the curious ones.<br />The “just because” ones.<br /><em>Your kind of people.</em></p>
            <span className="note-signature">with love, santa</span>
          </div>
          <div>
            <p className="eyebrow">A GIFT, WITHOUT THE GUESSWORK</p>
            <h2 id="thoughtful-title">You bring the thought.<br /><em>We’ll bring the wrap.</em></h2>
            <ul className="gift-benefits">
              <li>
                <span aria-hidden="true">✓</span>
                <div><h3>A first stock, a warm welcome.</h3><p>Your friend signs in with Google or email. A wallet is created for them.</p></div>
              </li>
              <li>
                <span aria-hidden="true">✓</span>
                <div><h3>Your words stay between you.</h3><p>Your note is encrypted. The gift link carries the key to open it.</p></div>
              </li>
              <li>
                <span aria-hidden="true">✓</span>
                <div><h3>A little peace of mind.</h3><p>If the gift expires unopened, you can reclaim your stock.</p></div>
              </li>
            </ul>
            <Link className="button-text" href="/docs/how-it-works" prefetch={false}>
              Get to know Santa <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </section>

        <ForJudges nonce={nonce} />

        <section className="closing-section">
          <span aria-hidden="true">✳</span>
          <p className="eyebrow">A LITTLE LINK CAN GO A LONG WAY</p>
          <h2>Someone came to mind?<br /><em>Make their day.</em></h2>
          <Link className="button-primary" href="/send" prefetch={false}>
            Send a gift <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-top">
          <Link className="footer-brand" href="/">santa<span aria-hidden="true">♡</span></Link>
          <p>A little thought, beautifully delivered.</p>
          <nav aria-label="Footer">
            <Link href="/docs" prefetch={false}>Documentation ↗</Link>
            <a href="#judges">For judges ↗</a>
          </nav>
        </div>
        <div className="footer-bottom">
          <p>Made for the joy of giving.</p>
          <p>Santa is an independent testnet project, not a Robinhood product.<br />Testnet stock tokens have no monetary value or equity ownership rights.</p>
          <span>ROBINHOOD CHAIN TESTNET</span>
        </div>
      </footer>
    </div>
  );
}
