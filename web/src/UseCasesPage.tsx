import { ArrowLeft, ArrowUpRight, Bot, CheckCircle2, Fingerprint, LockKeyhole, Plane, ShieldCheck, ShoppingCart, ShieldAlert, WalletCards, Workflow } from 'lucide-react';

const LIVE_ACTION = '0x7606c8e32a09ffbcd524b37b6e82a27ecccd5c61ad8e7b4ed2d0162716f404cf';
const PROOF_URL = `/verify/${LIVE_ACTION}`;

const cases = [
  {
    index: '01',
    tag: 'LIVE MONAD TESTNET',
    tone: 'live',
    icon: Plane,
    name: 'Travel booking agent',
    subtitle: 'Give an AI a budget, not a blank cheque.',
    problem: 'An agent chooses a flight offer, but the user must control the maximum value, permitted route and expiry.',
    authority: 'BOOK_TRAVEL · SGN → SIN · $400 maximum · 30-minute grant',
    proposal: 'The reference agent proposes a $361 demo itinerary. A $401 alternative is rejected by policy.',
    proof: 'Grant, record and revoke transactions exist on Monad Testnet. The recorded payload matches its commitment.',
    boundary: 'The chain proves authorization and an action commitment, not that a flight was actually booked.',
    cta: 'Open live travel proof',
    href: PROOF_URL,
  },
  {
    index: '02',
    tag: 'REFERENCE SDK SCENARIO',
    tone: 'reference',
    icon: ShoppingCart,
    name: 'Procurement agent',
    subtitle: 'Purchasing limits across the same protocol.',
    problem: 'An enterprise wants an agent to request approved items without silently expanding its spending authority.',
    authority: 'PURCHASE_ITEM · approved vendor scope · $200 maximum',
    proposal: 'The reference scenario proposes a $120 purchase, evaluated with the same hashing and policy primitives.',
    proof: 'SDK examples and tests exercise the generalized action model. This is not a claimed live purchase.',
    boundary: 'No merchant fulfillment, AUSD settlement or live procurement transaction is claimed.',
    cta: 'Explore MCP integration',
    href: '/connect',
  },
  {
    index: '03',
    tag: 'LIVE PROOF · THIRD-PARTY READ',
    tone: 'live',
    icon: Fingerprint,
    name: 'Independent agent verifier',
    subtitle: 'Trust the proof, not the operator.',
    problem: 'A second AI application receives an action receipt from another operator and must decide whether to trust it.',
    authority: 'The consumer checks action existence, recorded authority, payload hash and its own risk requirements.',
    proposal: 'Original $361 payload passes historical proof checks. Changing it to $399 produces PAYLOAD_MISMATCH.',
    proof: 'The independent verifier reads Monad RPC directly and reports ACCEPT or REJECT without an agent signer.',
    boundary: 'The old action remains valid-at-action-time after revocation; new actions under the grant are rejected.',
    cta: 'Test original vs tampered',
    href: PROOF_URL,
  },
  {
    index: '04',
    tag: 'REPRODUCIBLE POLICY TEST',
    tone: 'reference',
    icon: ShieldAlert,
    name: 'Budget and revocation control',
    subtitle: 'Deterministic limits that models cannot override.',
    problem: 'An AI can be instructed to overspend or retry an action after the owner revokes permission.',
    authority: 'The deterministic control plane enforces action type, value cap, scope, expiry and nonce constraints.',
    proposal: 'A $401 travel proposal is BLOCKED by VALUE_EXCEEDS_HARD_LIMIT before execution.',
    proof: 'Policy regression tests and a post-revoke Monad simulation demonstrate fail-closed behavior.',
    boundary: 'MCP has no grant, revoke, signing or broadcast tool. A blocked action is not executed.',
    cta: 'See agent connection tools',
    href: '/connect',
  },
  {
    index: '05',
    tag: 'COMMERCE CHALLENGE ADAPTER',
    tone: 'reference',
    icon: ShoppingCart,
    name: 'Agent commerce · payment challenge',
    subtitle: 'Turn a machine-readable payment request into policy, not an automatic signature.',
    problem: 'An AI tool can return a recipient, amount and resource requirement, but directly signing that request gives the tool too much power.',
    authority: 'PAY_SERVICE binds network, asset, payee and resource into the scope commitment; the amount remains subject to the user cap.',
    proposal: 'A $361 service challenge can ALLOW. $401 is blocked, and changing only the payee produces a different scope that is rejected.',
    proof: 'The shared SDK now converts a 402-style challenge into the same typed action and deterministic policy path used by the rest of APP.',
    boundary: 'APP does not sign or settle the payment and does not claim x402 compliance; it governs the intent before an external executor acts.',
    cta: 'See the AI boundary',
    href: '/connect',
  },
  {
    index: '06',
    tag: 'SPECIALIST AGENT MANIFEST',
    tone: 'reference',
    icon: Bot,
    name: 'Specialized agent capability profile',
    subtitle: 'Declare what each agent role is meant to do before it acts.',
    problem: 'Multi-agent systems often launch trader, social, commerce or travel workers as separate scripts with no portable capability declaration.',
    authority: 'An offchain manifest binds agent address, role and declared action types; its deterministic hash can be used as registry metadataHash.',
    proposal: 'A commerce profile can declare PAY_SERVICE and PURCHASE_ITEM while a BOOK_TRAVEL proposal from the same role fails the manifest check.',
    proof: 'SDK tests prove the metadata hash changes when capabilities change and reject both wrong-role actions and a different agent address.',
    boundary: 'The manifest is a verifiable declaration, not the enforcement boundary. Deterministic policy and the Monad registry still enforce authority.',
    cta: 'Inspect protocol architecture',
    href: '/lab',
  },
  {
    index: '07',
    tag: 'LOCAL-TESTED SMART SPENDING',
    tone: 'reference',
    icon: WalletCards,
    name: 'Agentic smart spending vault',
    subtitle: 'Enforce AI payment authority at the fund boundary.',
    problem: 'A policy can say an AI may spend $400, but the payment account must still prevent redirection, replay, cumulative overspend and unauthorized executors.',
    authority: 'PAY_SERVICE binds token, recipient and resource; the vault enforces revocation, expiry, per-call cap, cumulative budget and an owner-selected executor.',
    proposal: 'An authorized $361 payment can record its APP proof and transfer value atomically. Wrong recipient, $401, replay, tampered resource or total spend above budget reverts.',
    proof: 'Foundry covers the smart-spending boundary and the packaged SDK shares exact Solidity-compatible scope/action vectors. The vault is not claimed as live-deployed yet.',
    boundary: 'This is a Monad-ready local-tested fund executor. The canonical live demo still uses the deployed registry and historical $361 proof until the owner separately signs a vault deployment.',
    cta: 'Review vault source',
    href: 'https://github.com/opalx14/agentic-proof-protocol/blob/main/contracts/src/AgenticSpendingVault.sol',
  },
] as const;

export default function UseCasesPage() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand nav-brand" href="/">
          <div className="brand-mark"><Fingerprint size={22} /></div>
          <div><strong>Agentic Proof Protocol</strong><span>Real evidence · honest boundaries</span></div>
        </a>
        <div className="top-actions">
          <a className="secondary nav-button" href="/connect">Connect AI <ArrowUpRight size={14} /></a>
          <a className="secondary nav-button" href="/"><ArrowLeft size={14} /> Dashboard</a>
        </div>
      </header>
      <main className="guide-shell">
        <section className="guide-hero">
          <span className="kicker">CASE STUDIES · ONE AUTHORIZATION PRIMITIVE</span>
          <h1>Different agents.<br /><span>One verifiable trust layer.</span></h1>
          <p>APP separates what an AI proposes from what a human authorizes and what a third party can verify. Explore live onchain evidence alongside clearly labelled SDK reference scenarios.</p>
          <div className="guide-tags">
            <span><CheckCircle2 size={14} /> Live Monad Testnet proof</span>
            <span><Workflow size={14} /> Reusable action model</span>
            <span><ShieldCheck size={14} /> Fail-closed policy</span>
          </div>
        </section>

        <section className="case-overview">
          {cases.map((item) => (
            <a className="case-overview-card" href={`#case-${item.index}`} key={item.index}>
              <span className={`case-tag ${item.tone}`}>{item.tag}</span>
              <item.icon size={22} />
              <strong>{item.name}</strong>
              <small>{item.subtitle}</small>
              <span className="case-overview-arrow">Explore case {item.index} ↗</span>
            </a>
          ))}
        </section>

        <section className="case-rule">
          <div><Bot size={21} /><span>AI proposes</span><strong>Action + intent</strong></div>
          <b>→</b>
          <div><ShieldCheck size={21} /><span>Policy authorizes</span><strong>ALLOW / BLOCK</strong></div>
          <b>→</b>
          <div><LockKeyhole size={21} /><span>Monad records</span><strong>Authority + commitment</strong></div>
          <b>→</b>
          <div><Fingerprint size={21} /><span>Anyone verifies</span><strong>Proof + trust decision</strong></div>
        </section>

        {cases.map((item) => (
          <section className="case-detail" id={`case-${item.index}`} key={item.index}>
            <div className="case-detail-header">
              <div className="case-number">{item.index}</div>
              <div>
                <span className={`case-tag ${item.tone}`}>{item.tag}</span>
                <h2>{item.name}</h2>
                <p>{item.subtitle}</p>
              </div>
              <item.icon size={34} className="case-large-icon" />
            </div>
            <div className="case-detail-grid">
              <article><span>THE PROBLEM</span><p>{item.problem}</p></article>
              <article><span>USER-OWNED AUTHORITY</span><p>{item.authority}</p></article>
              <article><span>AI PROPOSAL & POLICY</span><p>{item.proposal}</p></article>
              <article><span>PROOF / EVIDENCE</span><p>{item.proof}</p></article>
            </div>
            <div className="case-detail-footer">
              <div><ShieldAlert size={17} /><span><strong>Proof boundary:</strong> {item.boundary}</span></div>
              <a className="secondary nav-button" href={item.href}>{item.cta} <ArrowUpRight size={14} /></a>
            </div>
          </section>
        ))}

        <section className="connect-bottom">
          <div><span className="kicker">INTEGRATE WITH ANOTHER AGENT</span><h2>Use the same checks through MCP.</h2><p>Connect Claude Code, Codex or Antigravity to the four non-signing tools. The model can evaluate and verify, but cannot self-authorize.</p></div>
          <a className="primary nav-button" href="/connect">Connect your AI <ArrowUpRight size={15} /></a>
        </section>
      </main>
      <footer><span>Agentic Proof Protocol · Monad Metropolis 2026</span><span>Reference scenarios are not claimed live transactions</span></footer>
    </div>
  );
}
