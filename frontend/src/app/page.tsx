import { TransformationShowcase } from "@/components/transformation-showcase";
import Link from "next/link";

const capabilities = [
  ["Structured by design", "The interface renders a validated workflow DSL—not model-generated application code.", "01"],
  ["Safe under pressure", "Commands are parameterized, reviewable, and never executed from the browser.", "02"],
  ["Built for the handoff", "Shared state, audit context, and verifiable outcomes travel with every SOP.", "03"],
];

const schema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "ContextSOP",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: "ContextSOP transforms incident transcripts into safe, interactive, and validated operational runbooks.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function Home() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <div className="top-glow" />
      <nav className="nav shell" aria-label="Primary navigation">
        <Link className="brand" href="/" aria-label="ContextSOP home">Context<span>SOP</span></Link>
        <div className="nav-actions">
          <a className="text-link" href="#how-it-works">How it works</a>
          <a className="button button-small button-quiet" href="/dashboard">Open workspace <span>↗</span></a>
        </div>
      </nav>

      <section className="hero shell">
        <div className="hero-copy">
          <p className="eyebrow motion-enter delay-1"><i /> Incident operations, compiled</p>
          <h1 className="motion-enter delay-2">Turn incident noise into <em>reliable action.</em></h1>
          <p className="lede motion-enter delay-3">ContextSOP compiles scattered incident context into living, validated runbooks your team can execute with confidence.</p>
          <div className="hero-actions motion-enter delay-4">
            <a className="button button-primary" href="#demo">Explore the live demo <span>↓</span></a>
            <a className="button button-quiet" href="/dashboard">Open workspace <span>↗</span></a>
          </div>
          <div className="trust-row motion-enter delay-5"><span><b>✓</b> Schema-validated</span><span><b>✓</b> Human-in-the-loop</span><span><b>✓</b> No browser execution</span></div>
        </div>

        <div className="hero-visual motion-enter delay-3" aria-hidden="true">
          <div className="signal-grid" />
          <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
          <div className="signal-card primary-signal"><small>INCIDENT SIGNAL</small><strong>OOMKilled</strong><span><i className="status-dot amber" /> memory limit breached</span></div>
          <div className="signal-card action-signal"><small>RECOVERY STEP</small><strong>03 / 03</strong><span><i className="status-dot emerald" /> rollout healthy</span></div>
          <div className="hero-core"><div className="core-mark">◌</div><span>CONTEXT<br />COMPILER</span></div>
        </div>
      </section>

      <section className="proof shell" aria-label="Product benefits">
        <div><strong>messy context</strong><span>chat · alerts · shell output</span></div><b>→</b><div><strong>operational clarity</strong><span>steps · variables · verification</span></div><b>→</b><div><strong>safer response</strong><span>shared state · audit trail</span></div>
      </section>

      <TransformationShowcase />

      <section className="capabilities shell" id="how-it-works" aria-labelledby="capabilities-heading">
        <div className="section-heading"><div><p className="eyebrow">Designed for the moment that matters</p><h2 id="capabilities-heading">Confidence, without the theater.</h2></div><p>Directly useful for a responder; deliberately constrained for everyone else.</p></div>
        <div className="capability-grid">{capabilities.map(([title, body, number]) => <article className="capability-card" key={title}><span>{number}</span><h3>{title}</h3><p>{body}</p><div className="card-line" /></article>)}</div>
      </section>

      <section className="closing shell"><p className="eyebrow">The runbook, reimagined</p><h2>Less archaeology.<br /><em>More recovery.</em></h2><Link className="button button-primary" href="/dashboard">Start with your incident context <span>→</span></Link></section>
      <footer className="footer shell"><Link className="brand" href="/">Context<span>SOP</span></Link><p>Operational clarity for teams under pressure.</p><span>© {new Date().getFullYear()} ContextSOP</span></footer>
    </main>
  );
}
