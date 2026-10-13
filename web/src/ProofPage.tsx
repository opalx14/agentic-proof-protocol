'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, Fingerprint, ShieldCheck, XCircle } from 'lucide-react';
import { evaluateProofTrust, type Hex32, type ProofBundle } from '@agentic-proof/shared';
import { getDirectChainConfig, verifyDirect } from './chain';
import { getLiveProofSample } from './live-proof';

function json(value: unknown) {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item, 2);
}

function short(value?: string | null, left = 9, right = 7) {
  if (!value) return '—';
  return value.length <= left + right + 1 ? value : `${value.slice(0, left)}…${value.slice(-right)}`;
}

export default function ProofPage({ actionId }: { actionId: string }) {
  const [payload, setPayload] = useState('');
  const [proof, setProof] = useState<ProofBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Reading the proof directly from Monad RPC…');
  const chain = getDirectChainConfig();
  const referencePayload = getLiveProofSample(actionId, chain?.chainId, chain?.contractAddress);

  const historicalDecision = useMemo(() => proof ? evaluateProofTrust(proof, {
    requirePayloadMatch: payload.trim().length > 0,
  }) : null, [proof, payload]);

  const currentDecision = useMemo(() => proof ? evaluateProofTrust(proof, {
    requirePayloadMatch: payload.trim().length > 0,
    requireCurrentAuthorization: true,
  }) : null, [proof, payload]);

  async function verify(nextPayload = payload) {
    if (!/^0x[a-fA-F0-9]{64}$/.test(actionId)) {
      setMessage('Invalid action ID. Expected a bytes32 0x… identifier.');
      return;
    }
    if (!chain) {
      setMessage('Registry address is not configured for this deployment.');
      return;
    }
    setBusy(true);
    try {
      const decodedPayload = nextPayload.trim() ? JSON.parse(nextPayload) : undefined;
      const result = await verifyDirect(actionId as Hex32, decodedPayload);
      setProof(result);
      setMessage('Verified independently from Monad. No agent-backend response was trusted.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void verify('');
    // actionId identifies the immutable onchain proof; payload verification is opt-in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionId]);

  const explorerContract = chain?.explorerUrl && chain.contractAddress
    ? `${chain.explorerUrl.replace(/\/$/, '')}/address/${chain.contractAddress}`
    : null;

  return (
    <main className="proof-page-shell">
      <section className="proof-page-hero">
        <a href="/" className="proof-home-link">← Agentic Proof Protocol</a>
        <div className="eyebrow">PORTABLE ACTION PROOF · MONAD</div>
        <h1>Verify an agent action<br /><span>without trusting its operator.</span></h1>
        <p>Anyone with this Action ID can read the registry directly, inspect historical authority, and optionally recompute the private payload commitment.</p>
        <div className="proof-id-row">
          <code>{actionId}</code>
          <button className="secondary" onClick={() => void navigator.clipboard.writeText(window.location.href)}><Copy size={14} /> Copy proof URL</button>
        </div>
      </section>

      <section className="proof-page-grid">
        <article className="panel proof-summary-panel">
          <div className="panel-title"><Fingerprint size={18} /> Onchain verification</div>
          {!proof ? <div className="empty-state">{busy ? 'Reading Monad…' : 'No proof loaded.'}</div> : <>
            <div className={proof.checks.existsOnchain ? 'status good' : 'status bad'}>{proof.checks.existsOnchain ? <CheckCircle2 /> : <XCircle />} Action exists onchain</div>
            <div className={proof.checks.authorizationValidAtActionTime ? 'status good' : 'status bad'}>{proof.checks.authorizationValidAtActionTime ? <CheckCircle2 /> : <XCircle />} Authority valid at action time</div>
            <div className={proof.checks.authorizationCurrentlyActive ? 'status good' : 'status bad'}>{proof.checks.authorizationCurrentlyActive ? <CheckCircle2 /> : <XCircle />} Authority currently active</div>
            <div className={proof.checks.payloadMatches === undefined ? 'status neutral' : proof.checks.payloadMatches ? 'status good' : 'status bad'}>{proof.checks.payloadMatches ? <CheckCircle2 /> : <XCircle />} Payload commitment {proof.checks.payloadMatches === undefined ? 'not supplied' : proof.checks.payloadMatches ? 'matches' : 'MISMATCH'}</div>
            <div className={proof.checks.attested ? 'status good' : 'status neutral'}>{proof.checks.attested ? <CheckCircle2 /> : <XCircle />} Provider attestation {proof.checks.attested ? 'present' : 'absent'}</div>

            <dl className="detail-list proof-details">
              <div><dt>User</dt><dd>{short(proof.authorization?.user)}</dd></div>
              <div><dt>Agent</dt><dd>{short(proof.action?.agent)}</dd></div>
              <div><dt>Authorization</dt><dd>{short(proof.action?.authorizationId)}</dd></div>
              <div><dt>Recorded value</dt><dd>{proof.action ? proof.action.value.toString() : '—'}</dd></div>
              <div><dt>Recorded at</dt><dd>{proof.action ? new Date(Number(proof.action.recordedAt) * 1000).toLocaleString() : '—'}</dd></div>
              <div><dt>Current revoke state</dt><dd>{proof.authorization?.revoked ? 'REVOKED' : 'ACTIVE'}</dd></div>
            </dl>
          </>}
        </article>

        <article className="panel verify-form">
          <div className="panel-title"><ShieldCheck size={18} /> Recompute private commitment</div>
          <p className="proof-help">Paste the exact private/offchain JSON payload. It is hashed locally in your browser and is not written to Monad.</p>
          {referencePayload && (
            <div className="reference-proof-tools">
              <strong>Reproduce the recorded Monad Testnet proof</strong>
              <p>This $361 demo payload was committed onchain before the user revoked its authorization. Compare the exact payload with a modified $399 version. Neither button signs or sends a transaction.</p>
              <div className="reference-proof-buttons">
                <button data-tour="proof-original" className="secondary" disabled={busy} onClick={() => {
                  const sample = json(referencePayload);
                  setPayload(sample);
                  void verify(sample);
                }}>Verify original $361</button>
                <button data-tour="proof-tamper" className="secondary" disabled={busy} onClick={() => {
                  const tampered = json({ ...referencePayload, totalUsd: 399 });
                  setPayload(tampered);
                  void verify(tampered);
                }}>Test tampered $399</button>
              </div>
            </div>
          )}
          <textarea value={payload} onChange={(event) => setPayload(event.target.value)} rows={12} placeholder={'{\n  "route": "SGN → SIN",\n  "totalUsd": 361\n}'} />
          <button className="primary wide" onClick={() => void verify()} disabled={busy || !chain}>Verify payload</button>
          {proof && <div className="trust-verdicts" data-tour="proof-trust">
            <div className={`trust-verdict ${historicalDecision?.verdict === 'ACCEPT' ? 'accept' : 'reject'}`}><span>Historical proof consumer</span><strong>{historicalDecision?.verdict}</strong><small>{historicalDecision?.reasons.join(' · ') || 'Valid proof at action time'}</small></div>
            <div className={`trust-verdict ${currentDecision?.verdict === 'ACCEPT' ? 'accept' : 'reject'}`}><span>New-action consumer</span><strong>{currentDecision?.verdict}</strong><small>{currentDecision?.reasons.join(' · ') || 'Current authority can still be trusted'}</small></div>
          </div>}
        </article>
      </section>

      <section className="panel proof-json-panel">
        <div className="panel-title">Proof Bundle</div>
        <pre>{proof ? json(proof) : message}</pre>
        <div className="proof-page-actions">
          <span>{message}</span>
          {explorerContract && <a data-tour="proof-explorer" className="explorer-link" href={explorerContract} target="_blank" rel="noreferrer">Registry on MonadVision <ExternalLink size={13} /></a>}
        </div>
      </section>
    </main>
  );
}
