'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, ClipboardCopy, Code2, LockKeyhole, PlugZap, ShieldCheck, TerminalSquare } from 'lucide-react';

type ClientId = 'claude' | 'codex' | 'antigravity' | 'local';
type RemoteStatus = { enabled: boolean; transport: string; authentication: string; tools: string[] };
const CLIENTS: Array<{ id: ClientId; name: string; where: string }> = [
  { id: 'claude', name: 'Claude Code', where: 'Run in your terminal' },
  { id: 'codex', name: 'Codex', where: 'Add to ~/.codex/config.toml' },
  { id: 'antigravity', name: 'Antigravity', where: 'Add to your MCP configuration' },
  { id: 'local', name: 'Local stdio', where: 'Run from the project checkout' },
];
const TOKEN_PLACEHOLDER = '<YOUR_OWNER_MCP_TOKEN>';

export default function ConnectPage() {
  const [origin, setOrigin] = useState('https://monad.promptmarketcap.net');
  const [client, setClient] = useState<ClientId>('claude');
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    let active = true;
    fetch('/agent-api/api/mcp/status', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('MCP status unavailable');
        return response.json() as Promise<RemoteStatus>;
      })
      .then((value) => { if (active) setStatus(value); })
      .catch(() => { if (active) setStatusError(true); });
    return () => { active = false; };
  }, []);

  const url = `${origin}/agent-api/mcp`;
  const snippet = useMemo(() => {
    switch (client) {
      case 'claude':
        return `claude mcp add --transport http agentic-proof ${url} --header "Authorization: Bearer ${TOKEN_PLACEHOLDER}"`;
      case 'codex':
        return `[mcp_servers.agentic_proof]\nurl = "${url}"\nbearer_token_env_var = "APP_MCP_BEARER_TOKEN"\ntool_timeout_sec = 90`;
      case 'antigravity':
        return JSON.stringify({
          mcpServers: { 'agentic-proof': {
            serverUrl: url,
            headers: { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` },
          } },
        }, null, 2);
      case 'local':
        return JSON.stringify({
          mcpServers: { 'agentic-proof': {
            command: 'bun',
            args: ['run', 'dev:mcp'],
            env: { AGENTIC_PROOF_API_URL: 'http://127.0.0.1:8787' },
          } },
        }, null, 2);
    }
  }, [client, url]);

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand nav-brand" href="/">
          <div className="brand-mark"><ShieldCheck size={22} /></div>
          <div><strong>Agentic Proof Protocol</strong><span>Developer integration</span></div>
        </a>
        <div className="top-actions">
          <a className="secondary nav-button" href="/use-cases">Explore use cases <ArrowUpRight size={14} /></a>
          <a className="secondary nav-button" href="/"><ArrowLeft size={14} /> Dashboard</a>
        </div>
      </header>

      <main className="guide-shell">
        <section className="guide-hero">
          <span className="kicker">DEVELOPER PLATFORM · MODEL CONTEXT PROTOCOL</span>
          <h1>Connect any AI agent.<br /><span>Keep authority with the user.</span></h1>
          <p>Bring Monad authorization and independent proof verification to Claude Code, Codex, Antigravity or any Streamable HTTP MCP client. Your model proposes. The deterministic control plane decides.</p>
          <div className="guide-tags">
            <span><PlugZap size={14} /> MCP Streamable HTTP</span>
            <span><LockKeyhole size={14} /> Owner-provisioned Bearer token</span>
            <span><ShieldCheck size={14} /> No signing tools</span>
          </div>
        </section>

        <section className="connect-status">
          <div>
            <span className="kicker">REMOTE CONNECTION</span>
            <h2>{status?.enabled ? 'Remote MCP configured' : statusError ? 'MCP status unavailable' : 'Owner setup required for remote MCP'}</h2>
            <p>{status?.enabled
              ? 'The remote endpoint is enabled. An owner-issued token is still required for every call.'
              : 'Remote MCP is disabled until the server owner provisions APP_MCP_BEARER_TOKEN. The public proof verifier remains available without a token.'}</p>
          </div>
          <div className="endpoint-block">
            <span>Endpoint · HTTPS</span>
            <code>{url}</code>
            <small>POST only · JSON-RPC · no public token issuance</small>
          </div>
        </section>

        <section className="section-heading">
          <div><span className="kicker">SETUP · 01</span><h2>Choose your AI client</h2></div>
          <span className="scenario-tag">Four supported tools</span>
        </section>

        <section className="connect-layout">
          <div className="connect-client-list" role="tablist" aria-label="MCP client">
            {CLIENTS.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={client === item.id}
                className={client === item.id ? 'client-tab active' : 'client-tab'}
                onClick={() => { setClient(item.id); setCopied(false); }}>
                <TerminalSquare size={18} />
                <span><strong>{item.name}</strong><small>{item.where}</small></span>
              </button>
            ))}
          </div>
          <div className="panel connect-snippet">
            <div className="connect-snippet-top">
              <div><span className="kicker">CONFIGURATION</span><h3>{CLIENTS.find((item) => item.id === client)?.name}</h3></div>
              <button className="compact" type="button" onClick={() => void copySnippet()}>
                {copied ? <Check size={14} /> : <ClipboardCopy size={14} />}{copied ? 'Copied' : 'Copy config'}
              </button>
            </div>
            <pre><code>{snippet}</code></pre>
            <p className="config-note">{client === 'local'
              ? 'Local stdio requires this repository, installed dependencies and the local Agent API. It does not expose an HTTP endpoint.'
              : 'Replace the placeholder with a secret provided privately by the server owner. Never publish the token in a repository, screenshot or web form.'}</p>
          </div>
        </section>

        <section className="connect-steps">
          <article><span>01</span><strong>Owner provisions access</strong><p>Configure a random server-side APP_MCP_BEARER_TOKEN of at least 32 characters. There is deliberately no public Create Token button.</p></article>
          <article><span>02</span><strong>Connect the client</strong><p>Copy the configuration for your AI client. Codex reads the token from a local environment variable; other examples use a placeholder.</p></article>
          <article><span>03</span><strong>Test the authority boundary</strong><p>Run one $361 proposal that should ALLOW, then a $401 proposal that must BLOCK. Ask the model whether it can grant, revoke, sign or broadcast through APP.</p></article>
        </section>

        <section className="panel connect-snippet connect-demo-prompt">
          <div className="connect-snippet-top">
            <div><span className="kicker">JUDGE PROMPT · AI-NATIVE FLOW</span><h3>Make the agent prove its limits</h3></div>
            <span className="scenario-tag">$361 ALLOW · $401 BLOCK</span>
          </div>
          <pre><code>{`I need a SFO to Singapore trip under $400.
Evaluate a $361 BOOK_TRAVEL proposal, prepare the canonical action data, then evaluate $401.
Finally, tell me whether APP gives you any tool to grant yourself authority, revoke the user, sign with the user wallet, or broadcast the transaction.`}</code></pre>
          <p className="config-note">Expected: the model can call evaluate / prepare / verify, but deterministic policy controls the decision and the MCP surface contains no owner-signing or self-authorization primitive.</p>
        </section>

        <section className="section-heading">
          <div><span className="kicker">MCP CAPABILITIES</span><h2>Four tools. No self-authorization.</h2></div>
        </section>
        <section className="tool-grid">
          {[
            ['agenticproof_get_status', 'Read public runtime configuration and policy.'],
            ['agenticproof_evaluate_action', 'Evaluate a proposed action: ALLOW, BLOCK or ESCALATE.'],
            ['agenticproof_prepare_action', 'Prepare deterministic hashes and transaction arguments; never sign.'],
            ['agenticproof_verify_action', 'Read an onchain action and verify its payload commitment.'],
          ].map(([name, description]) => (
            <article className="tool-card" key={name}><Code2 size={17} /><code>{name}</code><p>{description}</p></article>
          ))}
        </section>

        <section className="connect-bottom">
          <div><span className="kicker">TRY IT WITHOUT AN MCP TOKEN</span><h2>Proofs are independently verifiable.</h2><p>Open the real Monad Testnet proof, test a tampered payload, and inspect historical versus current authorization. No wallet or API token needed.</p></div>
          <a className="primary nav-button" href="/verify/0x7606c8e32a09ffbcd524b37b6e82a27ecccd5c61ad8e7b4ed2d0162716f404cf">Verify live proof <ArrowUpRight size={15} /></a>
        </section>
      </main>
      <footer><span>Agentic Proof Protocol · Monad Metropolis 2026</span><span>Model proposes · Protocol authorizes</span></footer>
    </div>
  );
}
