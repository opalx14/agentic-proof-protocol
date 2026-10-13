'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Ban,
  Bot,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  Radio,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Plane,
  TerminalSquare,
  XCircle,
} from 'lucide-react';
import {
  createActionHash,
  createScopeHash,
  evaluateProofTrust,
  hashActionType,
  hashEvmValue,
  type Address,
  type Hex32,
  type Policy,
  type ProposedAction,
  type ProofBundle,
} from '@agentic-proof/shared';
import {
  evaluateAction,
  getAudit,
  getPolicy,
  getRuntimeConfig,
  prepareAction,
  proposeAction,
  type AgentProposal,
  type PreparedAction,
  type RuntimeConfig,
} from './api';
import {
  connectWallet,
  deployRegistryWithWallet,
  explorerTxUrl,
  getAuthorizedWallet,
  getDirectChainConfig,
  grantAuthorization,
  readAuthorizationDirect,
  recordActionWithWallet,
  registerConnectedWalletAgent,
  revokeAuthorization,
  simulateRecordAction,
  verifyDirect,
} from './chain';
import {
  canRestoreHistoricalAction,
  validateRestoredAuthorization,
  type RestoredAuthorizationStatus,
} from './live-demo-state';
import { LIVE_PROOF, REFERENCE_TRAVEL_PAYLOAD } from './live-proof';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const LIVE_DEMO_STATE_KEY = 'agentic-proof:live-demo-state';
const TRAVEL_SCOPE = {
  origin: 'SGN',
  destination: 'SIN',
  tripType: 'round_trip',
  cabin: 'economy',
};
const TRAVEL_PAYLOAD = REFERENCE_TRAVEL_PAYLOAD;

function short(value?: string | null, left = 7, right = 5) {
  if (!value) return '—';
  if (value.length <= left + right + 1) return value;
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

function json(value: unknown) {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item, 2);
}

function statusClass(value: boolean | undefined) {
  if (value === undefined) return 'status neutral';
  return value ? 'status good' : 'status bad';
}

export default function App() {
  const [runtime, setRuntime] = useState<RuntimeConfig | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [wallet, setWallet] = useState<Address | null>(null);
  const [authorizationId, setAuthorizationId] = useState<Hex32 | null>(null);
  const [grantTx, setGrantTx] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedAction | null>(null);
  const [recordResult, setRecordResult] = useState<Record<string, unknown> | null>(null);
  const [proof, setProof] = useState<ProofBundle | null>(null);
  const [auditOk, setAuditOk] = useState<boolean | null>(null);
  const [verifierActionId, setVerifierActionId] = useState('');
  const [verifierPayload, setVerifierPayload] = useState(json(TRAVEL_PAYLOAD));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('Ready. Start by registering the reference agent and connecting your wallet.');
  const [negativeDecision, setNegativeDecision] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [postRevokeDecision, setPostRevokeDecision] = useState<string | null>(null);
  const [demoStateRestored, setDemoStateRestored] = useState(false);
  const [restoredAuthorizationStatus, setRestoredAuthorizationStatus] = useState<RestoredAuthorizationStatus | null>(null);
  const [restoredAuthorizationDetail, setRestoredAuthorizationDetail] = useState<string | null>(null);
  const [restoredActionStatus, setRestoredActionStatus] = useState<'VALIDATING' | 'RECORDED' | 'MISSING' | null>(null);
  const [proposalPrompt, setProposalPrompt] = useState('Choose the cheapest demo offer for my Singapore trip under $400.');
  const [agentProposal, setAgentProposal] = useState<AgentProposal | null>(null);

  const directChain = getDirectChainConfig();
  const referenceAgentAddress = wallet ?? runtime?.agentAddress ?? null;
  const proofConsumerDecision = proof ? evaluateProofTrust(proof, {
    expectedAgent: referenceAgentAddress ?? undefined,
    maxValue: 400_000_000n,
    requireCurrentAuthorization: true,
    requirePayloadMatch: true,
  }) : null;
  const scopeHash = useMemo(() => createScopeHash(TRAVEL_SCOPE), []);
  const authorizationUsable = Boolean(authorizationId && restoredAuthorizationStatus === 'ACTIVE');
  const actionNonce = useMemo(() => String(Date.now()), []);
  const idempotencyKey = useMemo(() => `travel-demo-${Date.now()}`, []);
  const travelPayload = agentProposal?.payload ?? TRAVEL_PAYLOAD;

  const action: ProposedAction | null = referenceAgentAddress
    ? agentProposal?.action ?? {
        agent: referenceAgentAddress,
        actionType: 'BOOK_TRAVEL',
        scopeHash,
        value: '361000000',
        currency: 'USDC6',
        resource: 'travel:SGN-SIN',
        nonce: actionNonce,
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        idempotencyKey,
      }
    : null;

  async function refresh() {
    setBusy('refresh');
    try {
      const [nextRuntime, nextPolicy, audit] = await Promise.all([
        getRuntimeConfig(),
        getPolicy(),
        getAudit(),
      ]);
      setRuntime(nextRuntime);
      setPolicy(nextPolicy);
      setAuditOk(audit.integrity.valid);
      setMessage('Runtime, deterministic policy and local audit state refreshed.');
    } catch (error) {
      setMessage(`Agent service unavailable: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void refresh();
    let cancelled = false;

    async function restoreLiveDemoState() {
      let saved: {
        registry?: string;
        wallet?: Address | null;
        authorizationId?: Hex32 | null;
        prepared?: PreparedAction | null;
        recordResult?: Record<string, unknown> | null;
        verifierActionId?: string;
        revoked?: boolean;
        negativeDecision?: string | null;
        postRevokeDecision?: string | null;
      } | null = null;

      try {
        const raw = window.localStorage.getItem(LIVE_DEMO_STATE_KEY);
        saved = raw ? JSON.parse(raw) : null;
      } catch {
        window.localStorage.removeItem(LIVE_DEMO_STATE_KEY);
      }

      const currentRegistry = getDirectChainConfig()?.contractAddress?.toLowerCase();
      if (saved?.registry && currentRegistry && saved.registry.toLowerCase() !== currentRegistry) {
        window.localStorage.removeItem(LIVE_DEMO_STATE_KEY);
        saved = null;
      }

      let account: Address | null = null;
      try {
        account = await getAuthorizedWallet();
      } catch {
        account = null;
      }
      if (cancelled) return;
      setWallet(account);
      setNegativeDecision(saved?.negativeDecision ?? null);
      setPostRevokeDecision(saved?.postRevokeDecision ?? null);

      if (!saved?.authorizationId) {
        setDemoStateRestored(true);
        return;
      }

      setAuthorizationId(saved.authorizationId);
      setRestoredAuthorizationStatus('VALIDATING');
      setRestoredAuthorizationDetail('Checking saved authorization directly against Monad Testnet…');
      setRestoredActionStatus(saved.recordResult && saved.prepared ? 'VALIDATING' : null);

      try {
        const authorization = await readAuthorizationDirect(saved.authorizationId);
        if (cancelled) return;
        const checked = validateRestoredAuthorization({
          authorization,
          wallet: account,
          expectedAgent: account,
          expectedActionType: hashActionType('BOOK_TRAVEL'),
          expectedScopeHash: scopeHash,
        });
        setRestoredAuthorizationStatus(checked.status);
        setRestoredAuthorizationDetail(checked.detail);
        setRevoked(checked.status === 'REVOKED');

        if (!checked.usable && !canRestoreHistoricalAction(checked.status)) {
          setPrepared(null);
          setRecordResult(null);
          setVerifierActionId('');
          setProof(null);
          setRestoredActionStatus(null);
          setMessage(`Recovered demo state is ${checked.status}: ${checked.detail} Create a fresh authorization before continuing.`);
          setDemoStateRestored(true);
          return;
        }

        if (checked.status === 'REVOKED' && !(saved.recordResult && saved.prepared)) {
          setPrepared(null);
          setRecordResult(null);
          setVerifierActionId('');
          setProof(null);
          setRestoredActionStatus(null);
          setMessage('Recovered authorization is REVOKED. No matching recorded action was saved, so transaction controls remain fail-closed.');
          setDemoStateRestored(true);
          return;
        }

        if (saved.recordResult && saved.prepared) {
          const restoredProof = await verifyDirect(saved.prepared.actionId, TRAVEL_PAYLOAD);
          if (cancelled) return;
          const actionMatches = Boolean(
            restoredProof.checks.existsOnchain
            && restoredProof.checks.payloadMatches
            && restoredProof.action?.authorizationId.toLowerCase() === saved.authorizationId.toLowerCase()
            && restoredProof.action?.actionHash.toLowerCase() === saved.prepared.actionHash.toLowerCase(),
          );
          if (!actionMatches) {
            setPrepared(null);
            setRecordResult(null);
            setVerifierActionId('');
            setProof(null);
            setRestoredActionStatus('MISSING');
            setMessage('Saved action state was not found as a matching proof on the live registry. The stale prepared/recorded state was cleared.');
            setDemoStateRestored(true);
            return;
          }
          setProof(restoredProof);
          setRestoredActionStatus('RECORDED');
        }

        setPrepared(saved.prepared ?? null);
        setRecordResult(saved.recordResult ?? null);
        setVerifierActionId(saved.verifierActionId ?? saved.prepared?.actionId ?? '');
        setMessage(checked.status === 'REVOKED'
          ? 'Recovered the recorded historical proof from Monad. Authorization is revoked, so new transaction controls remain disabled.'
          : 'Saved live-demo state was validated against the configured registry before transaction controls were enabled.');
      } catch (error) {
        if (cancelled) return;
        setRestoredAuthorizationStatus('MISSING');
        setRestoredAuthorizationDetail(`Onchain validation failed: ${error instanceof Error ? error.message : String(error)}`);
        setPrepared(null);
        setRecordResult(null);
        setVerifierActionId('');
        setProof(null);
        setRestoredActionStatus(null);
        setMessage('Saved demo state could not be validated onchain, so transaction controls remain fail-closed.');
      } finally {
        if (!cancelled) setDemoStateRestored(true);
      }
    }

    void restoreLiveDemoState();
    return () => {
      cancelled = true;
    };
  }, [scopeHash]);

  useEffect(() => {
    if (!demoStateRestored) return;
    window.localStorage.setItem(LIVE_DEMO_STATE_KEY, JSON.stringify({
      registry: directChain?.contractAddress ?? null,
      wallet,
      authorizationId,
      prepared,
      recordResult,
      verifierActionId,
      revoked,
      negativeDecision,
      postRevokeDecision,
    }));
  }, [demoStateRestored, directChain?.contractAddress, wallet, authorizationId, prepared, recordResult, verifierActionId, revoked, negativeDecision, postRevokeDecision]);

  async function onConnectWallet() {
    setBusy('wallet');
    try {
      const account = await connectWallet();
      if (wallet && wallet.toLowerCase() !== account.toLowerCase()) {
        setAgentProposal(null);
        setVerifierPayload(json(TRAVEL_PAYLOAD));
      }
      setWallet(account);
      if (authorizationId) {
        setRestoredAuthorizationStatus('VALIDATING');
        setRestoredAuthorizationDetail('Wallet changed or reconnected; revalidating saved authorization onchain…');
        const authorization = await readAuthorizationDirect(authorizationId);
        const checked = validateRestoredAuthorization({
          authorization,
          wallet: account,
          expectedAgent: account,
          expectedActionType: hashActionType('BOOK_TRAVEL'),
          expectedScopeHash: scopeHash,
        });
        setRestoredAuthorizationStatus(checked.status);
        setRestoredAuthorizationDetail(checked.detail);
        setRevoked(checked.status === 'REVOKED');
        if (!checked.usable) {
          setPrepared(null);
          setRecordResult(null);
          setVerifierActionId('');
          setProof(null);
          setRestoredActionStatus(null);
        }
      }
      setMessage(`Rabby / EVM wallet connected on Monad: ${short(account)}. This wallet is the reference-agent signer for the live Testnet demo.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function onDeployRegistry() {
    if (!wallet) {
      setMessage('Connect Rabby / an EVM wallet before deploying the registry.');
      return;
    }
    setBusy('deploy');
    try {
      const result = await deployRegistryWithWallet();
      setAuthorizationId(null);
      setRestoredAuthorizationStatus(null);
      setRestoredAuthorizationDetail(null);
      setRestoredActionStatus(null);
      setPrepared(null);
      setRecordResult(null);
      setProof(null);
      setVerifierActionId('');
      setRevoked(false);
      setNegativeDecision(null);
      setPostRevokeDecision(null);
      setAgentProposal(null);
      setVerifierPayload(json(TRAVEL_PAYLOAD));
      window.localStorage.removeItem(LIVE_DEMO_STATE_KEY);
      setMessage(`AgenticProofRegistry deployed on Monad Testnet: ${short(result.contractAddress)} · ${short(result.txHash)}`);
    } catch (error) {
      setMessage(`Registry deployment failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function onRegisterAgent() {
    if (!wallet || !directChain) {
      setMessage('Connect the wallet and deploy/configure the registry first.');
      return;
    }
    setBusy('register');
    try {
      const result = await registerConnectedWalletAgent();
      setMessage(`Reference agent registered on Monad: ${short(result.agentId)} · ${short(result.txHash)}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text.includes('AgentAlreadyRegistered')
        ? 'This connected reference-agent signer is already registered onchain.'
        : `Agent registration failed: ${text}`);
    } finally {
      setBusy(null);
    }
  }

  async function onGrantAuthorization() {
    if (!referenceAgentAddress || !wallet) {
      setMessage('Connect the user wallet first.');
      return;
    }
    setBusy('grant');
    try {
      const now = BigInt(Math.floor(Date.now() / 1000));
      const result = await grantAuthorization({
        agent: referenceAgentAddress,
        actionType: hashActionType('BOOK_TRAVEL'),
        scopeHash,
        maxValue: 400_000_000n,
        validAfter: now > 5n ? now - 5n : 0n,
        validUntil: now + 30n * 60n,
        nonce: BigInt(Date.now()),
        attestor: ZERO_ADDRESS,
        singleUse: false,
      });
      setAuthorizationId(result.authorizationId);
      setGrantTx(result.txHash);
      setRestoredAuthorizationStatus('ACTIVE');
      setRestoredAuthorizationDetail('Fresh authorization confirmed on Monad Testnet.');
      setRestoredActionStatus(null);
      setPrepared(null);
      setRecordResult(null);
      setProof(null);
      setVerifierActionId('');
      setRevoked(false);
      setPostRevokeDecision(null);
      setMessage(`Scoped BOOK_TRAVEL authorization granted: ${short(result.authorizationId)}`);
    } catch (error) {
      setMessage(`Authorization failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function onPropose() {
    if (!referenceAgentAddress) {
      setMessage('Connect the reference-agent wallet before asking the agent to propose an action.');
      return;
    }
    setBusy('proposal');
    try {
      const result = await proposeAction({
        prompt: proposalPrompt,
        agent: referenceAgentAddress,
        scopeHash,
      });
      setAgentProposal(result);
      setPrepared(null);
      setRecordResult(null);
      setProof(null);
      setVerifierActionId('');
      setVerifierPayload(json(result.payload));
      setPostRevokeDecision(null);
      setMessage(
        `Agent proposed $${result.payload.totalUsd} via ${result.model.provider}${result.model.fallback ? ' fallback' : ''}. ` +
        'This is only a proposal; deterministic policy still decides whether it may proceed.',
      );
    } catch (error) {
      setMessage(`Agent proposal failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function onPrepare() {
    if (!authorizationId || !action || !authorizationUsable) {
      setMessage('Grant a fresh, onchain-validated authorization first.');
      return;
    }
    setBusy('prepare');
    try {
      const result = await prepareAction({ authorizationId, action, payload: travelPayload });
      setPrepared(result);
      setVerifierActionId(result.actionId);
      setMessage(`Control plane: ${result.decision.verdict}. Action commitment ${short(result.actionHash)} prepared.`);
    } catch (error) {
      setMessage(`Prepare failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function onRecord() {
    if (!authorizationId || !action || !prepared || !authorizationUsable) {
      setMessage('Prepare the action under a fresh, onchain-validated authorization first.');
      return;
    }
    if (prepared.decision.verdict !== 'ALLOW') {
      setMessage(`Control plane refused execution: ${prepared.decision.verdict}.`);
      return;
    }
    setBusy('record');
    try {
      const txHash = await recordActionWithWallet({
        authorizationId,
        actionId: prepared.actionId,
        actionType: prepared.actionTypeHash,
        scopeHash: action.scopeHash as Hex32,
        actionHash: prepared.actionHash,
        traceRoot: prepared.traceRoot,
        value: BigInt(action.value),
      });
      setRecordResult({ status: 'confirmed', txHash });
      setRestoredActionStatus('RECORDED');
      setMessage(`Agent action recorded on Monad Testnet: ${short(txHash)}. Open the portable proof URL or verify below.`);
    } catch (error) {
      setMessage(`Record action failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function onVerify() {
    if (!verifierActionId) {
      setMessage('Enter or prepare an action ID first.');
      return;
    }
    setBusy('verify');
    try {
      const payload = verifierPayload.trim() ? JSON.parse(verifierPayload) : undefined;
      const result = await verifyDirect(verifierActionId as Hex32, payload);
      setProof(result);
      setMessage('Independent verifier read the registry directly through the configured RPC.');
    } catch (error) {
      setMessage(`Verification failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function onTamperDemo() {
    if (!verifierActionId) {
      setMessage('Record an action first, then run the tamper demo.');
      return;
    }
    setBusy('tamper');
    try {
      const tampered = { ...travelPayload, totalUsd: 399 }; 
      setVerifierPayload(json(tampered));
      const result = await verifyDirect(verifierActionId as Hex32, tampered);
      setProof(result);
      setMessage(result.checks.payloadMatches === false
        ? `Tamper detected: changing $${travelPayload.totalUsd} → $399 breaks the onchain payload commitment.`
        : 'Tamper demo did not produce the expected mismatch.');
    } catch (error) {
      setMessage(`Tamper demo failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function onRevoke() {
    if (!authorizationId || !authorizationUsable) {
      setMessage('Only an active, onchain-validated authorization can be revoked from this demo state.');
      return;
    }
    setBusy('revoke');
    try {
      const hash = await revokeAuthorization(authorizationId);
      setRevoked(true);
      setRestoredAuthorizationStatus('REVOKED');
      setRestoredAuthorizationDetail('Authorization was revoked on Monad Testnet.');
      setMessage(`Authorization revoked on Monad: ${short(hash)}. Historical proof stays valid-at-action-time; new actions must fail.`);
    } catch (error) {
      setMessage(`Revocation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  async function onPostRevokeTest() {
    if (!revoked || !authorizationId || !prepared || !action) {
      setMessage('Revoke the authorization after recording an action first.');
      return;
    }
    setBusy('post-revoke');
    const retryPayload = { ...travelPayload, attempt: 'post-revoke' };
    const retryActionHash = createActionHash(retryPayload);
    const retryActionId = hashEvmValue({
      authorizationId,
      actionHash: retryActionHash,
      nonce: `${Date.now()}-post-revoke`,
    });
    try {
      if (!wallet) throw new Error('Connect the reference-agent wallet before running the post-revoke simulation.');
      await simulateRecordAction({
        account: wallet,
        authorizationId,
        actionId: retryActionId,
        actionType: prepared.actionTypeHash,
        scopeHash: action.scopeHash as Hex32,
        actionHash: retryActionHash,
        traceRoot: prepared.traceRoot,
        value: BigInt(action.value),
      });
      setPostRevokeDecision('UNEXPECTEDLY ALLOWED');
      setMessage('Invariant failure: post-revoke recordAction simulation unexpectedly succeeded.');
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      const revokedError = text.includes('AuthorizationAlreadyRevoked');
      setPostRevokeDecision(revokedError ? 'BLOCKED · AUTHORIZATION_REVOKED' : 'BLOCKED · ONCHAIN_REVERT');
      setMessage(`Post-revoke action simulation blocked as required: ${revokedError ? 'AuthorizationAlreadyRevoked' : text}`);
    } finally {
      setBusy(null);
    }
  }

  async function onNegativeTest() {
    if (!action) return;
    setBusy('negative');
    try {
      const decision = await evaluateAction({ ...action, value: '401000000', nonce: `${actionNonce}9` });
      setNegativeDecision(`${decision.verdict}${decision.code ? ` · ${decision.code}` : ''}`);
      setMessage(`Negative test result: ${decision.verdict}. The $401 action exceeds the $400 hard cap.`);
    } catch (error) {
      setMessage(`Negative test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  }

  const txLink = grantTx ? explorerTxUrl(grantTx) : null;
  const showingLiveRegistry = directChain?.chainId === LIVE_PROOF.chainId
    && directChain.contractAddress.toLowerCase() === LIVE_PROOF.registry.toLowerCase();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Fingerprint size={22} /></div>
          <div>
            <strong>Agentic Proof Protocol</strong>
            <span>Verifiable authority for AI agents</span>
          </div>
        </div>
        <div className="top-actions">
          <a className="secondary nav-button header-link" href="/use-cases">Case studies</a>
          <a className="secondary nav-button header-link" href="/connect">Connect AI</a>
          <div className={directChain ? 'network-pill live' : 'network-pill'}>
            <Radio size={13} /> {directChain ? `Monad ${directChain.chainId}` : 'Registry pending'}
          </div>
          {wallet && <button className="secondary" onClick={() => void onDeployRegistry()} disabled={busy === 'deploy'} title="Deploy the exact locally-tested registry build with the connected wallet">
            <ShieldCheck size={15} /> {directChain ? 'Redeploy registry' : 'Deploy registry'}
          </button>}
          <button className="secondary" onClick={() => void refresh()} disabled={busy === 'refresh'}>
            <RefreshCw size={15} /> Refresh
          </button>
          <button className="primary" onClick={() => void onConnectWallet()} disabled={busy === 'wallet'}>
            <KeyRound size={15} /> {wallet ? short(wallet) : 'Connect wallet'}
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow">MONAD · TRUST, IDENTITY & AI INFRASTRUCTURE</div>
          <h1>The model proposes.<br /><span>The protocol authorizes.</span></h1>
          <p>
            Give autonomous agents scoped authority, record tamper-evident action commitments,
            and let any application independently verify what happened without trusting the agent operator.
          </p>
          <div className="hero-cta-row">
            <a className="primary nav-button" href={`/verify/${LIVE_PROOF.actionId}`}>Try live proof <ExternalLink size={15} /></a>
            <a className="secondary nav-button" href="/use-cases">Explore 4 case studies <ExternalLink size={15} /></a>
            <a className="secondary nav-button" href="/connect">Connect your AI <ExternalLink size={15} /></a>
          </div>
          <div className="hero-flow">
            <div><Bot size={18} /><span>AI proposal</span></div>
            <i>→</i>
            <div><ShieldCheck size={18} /><span>Policy gate</span></div>
            <i>→</i>
            <div><LockKeyhole size={18} /><span>Scoped authority</span></div>
            <i>→</i>
            <div><FileCheck2 size={18} /><span>Proof onchain</span></div>
          </div>
        </section>

        {showingLiveRegistry && (
          <section className="live-proof-spotlight" aria-label="Verified Monad Testnet action">
            <div>
              <span className="kicker">REAL TESTNET TRANSACTIONS · NO WALLET REQUIRED</span>
              <h2>Inspect the recorded $361 agent action.</h2>
              <p>See the original payload match its onchain commitment, then change $361 to $399 and watch the proof fail. This authorization has since been revoked: the historical action remains valid, but new actions are blocked.</p>
            </div>
            <div className="live-proof-links">
              <a className="live-proof-cta" href={`/verify/${LIVE_PROOF.actionId}`}>
                Verify recorded proof <ExternalLink size={15} />
              </a>
              <a href={`${directChain.explorerUrl ?? 'https://testnet.monadvision.com'}/tx/${LIVE_PROOF.recordTx}`} target="_blank" rel="noreferrer">Record transaction ↗</a>
              <a href={`${directChain.explorerUrl ?? 'https://testnet.monadvision.com'}/tx/${LIVE_PROOF.revokeTx}`} target="_blank" rel="noreferrer">Revoke transaction ↗</a>
            </div>
          </section>
        )}

        <section className="metrics-grid">
          <article className="metric-card">
            <span>Agent service</span>
            <strong>{runtime ? 'ONLINE' : 'OFFLINE'}</strong>
            <small>{runtime ? short(runtime.agentAddress) : 'Waiting for API'}</small>
          </article>
          <article className="metric-card">
            <span>Deterministic policy</span>
            <strong>{policy?.enabled ? 'ACTIVE' : 'UNKNOWN'}</strong>
            <small>{policy ? `v${policy.version} · cap $${Number(BigInt(policy.maxValue)) / 1_000_000}` : 'No policy loaded'}</small>
          </article>
          <article className="metric-card">
            <span>Audit integrity</span>
            <strong>{auditOk === null ? '—' : auditOk ? 'INTACT' : 'COMPROMISED'}</strong>
            <small>Local SHA-256 hash chain</small>
          </article>
          <article className="metric-card">
            <span>Independent verifier</span>
            <strong>{directChain ? 'DIRECT RPC' : 'CONFIGURE'}</strong>
            <small>{directChain ? short(directChain.contractAddress) : 'No backend trust required'}</small>
          </article>
        </section>

        <section className="section-heading">
          <div>
            <span className="kicker">REFERENCE FLOW</span>
            <h2>Travel agent · scoped booking authority</h2>
          </div>
          <div className="scenario-tag">BOOK_TRAVEL ≤ $400 · 30 min</div>
        </section>

        <section className="demo-grid">
          <article className="panel workflow-panel">
            <div className="panel-title"><TerminalSquare size={18} /> Live protocol workflow</div>

            <div className="step-row">
              <div className="step-index">01</div>
              <div className="step-content">
                <strong>Register the reference agent</strong>
                <span>The agent wallet binds its own address to an onchain Agent ID.</span>
              </div>
              <button className="compact" onClick={() => void onRegisterAgent()} disabled={!wallet || !directChain || busy === 'register'}>Register</button>
            </div>

            <div className="step-row">
              <div className="step-index">02</div>
              <div className="step-content">
                <strong>Grant scoped authority</strong>
                <span>User wallet → BOOK_TRAVEL · scope {short(scopeHash)} · max $400.</span>
                {authorizationId && <code>{authorizationId}</code>}
                {authorizationId && restoredAuthorizationStatus && (
                  <div className={`decision ${restoredAuthorizationStatus === 'ACTIVE' ? 'allow' : 'block'}`}>
                    {restoredAuthorizationStatus}{restoredActionStatus ? ` · ACTION ${restoredActionStatus}` : ''}
                  </div>
                )}
                {restoredAuthorizationDetail && <small>{restoredAuthorizationDetail}</small>}
              </div>
              <button className="compact" onClick={() => void onGrantAuthorization()} disabled={!wallet || busy === 'grant'}>Authorize</button>
            </div>

            <div className="step-row">
              <div className="step-index">03</div>
              <div className="step-content">
                <strong>AI agent proposes an itinerary</strong>
                <span>The model may choose an offer, but it cannot grant authority or bypass deterministic policy.</span>
                <textarea
                  className="proposal-input"
                  value={proposalPrompt}
                  onChange={(event) => setProposalPrompt(event.target.value)}
                  rows={2}
                  aria-label="Agent proposal prompt"
                />
                <div className="proposal-controls">
                  <button className="compact" onClick={() => void onPropose()} disabled={!referenceAgentAddress || busy === 'proposal'}>
                    <Bot size={14} /> Ask agent
                  </button>
                  {agentProposal && (
                    <span className={`model-source ${agentProposal.model.fallback ? 'fallback' : 'live'}`}>
                      {agentProposal.model.provider === 'groq' ? `GROQ · ${agentProposal.model.model}` : 'DETERMINISTIC FALLBACK'}
                    </span>
                  )}
                </div>
                {agentProposal && (
                  <small>
                    Proposed {agentProposal.payload.selectedOffer} · ${agentProposal.payload.totalUsd} · {agentProposal.rationale}
                  </small>
                )}
                {prepared && <code>{prepared.actionHash}</code>}
              </div>
              <button className="compact" onClick={() => void onPrepare()} disabled={!authorizationUsable || busy === 'prepare'}>Policy check</button>
            </div>

            <div className="step-row">
              <div className="step-index">04</div>
              <div className="step-content">
                <strong>Record agent action</strong>
                <span>The deterministic policy must return ALLOW before the agent signer can submit.</span>
                {prepared && <div className={`decision ${prepared.decision.verdict.toLowerCase()}`}>{prepared.decision.verdict}</div>}
                {Boolean(recordResult?.txHash) && <a className="inline-proof-link" href={`/verify/${prepared?.actionId ?? ''}`}>Open portable proof →</a>}
              </div>
              <button className="compact" onClick={() => void onRecord()} disabled={!authorizationUsable || !prepared || prepared.decision.verdict !== 'ALLOW' || busy === 'record'}>Record</button>
            </div>

            <div className="step-row danger-row">
              <div className="step-index">05</div>
              <div className="step-content">
                <strong>Negative proof: try $401</strong>
                <span>Hard cap must fail closed before chain execution.</span>
                {negativeDecision && <div className="decision block">{negativeDecision}</div>}
              </div>
              <button className="compact danger" onClick={() => void onNegativeTest()} disabled={!action || busy === 'negative'}><Ban size={14} /> Test block</button>
            </div>
          </article>

          <aside className="panel detail-panel">
            <div className="panel-title"><Activity size={18} /> Current proof context</div>
            <dl className="detail-list">
              <div><dt>User wallet</dt><dd>{short(wallet)}</dd></div>
              <div><dt>Agent</dt><dd>{short(referenceAgentAddress)}</dd></div>
              <div><dt>Action</dt><dd>BOOK_TRAVEL</dd></div>
              <div><dt>Scope hash</dt><dd>{short(scopeHash)}</dd></div>
              <div><dt>Authorized max</dt><dd>$400 USDC</dd></div>
              <div><dt>Proposed value</dt><dd>${travelPayload.totalUsd} USDC</dd></div>
              <div><dt>Authorization</dt><dd>{short(authorizationId)}</dd></div>
              <div><dt>Action ID</dt><dd>{short(prepared?.actionId)}</dd></div>
            </dl>
            <div className="trust-note">
              <ShieldCheck size={17} />
              <p><strong>What this proves</strong> Authorization state, agent commitment, replay-safe identity and optional signer attestation.</p>
            </div>
            <div className="trust-note muted-note">
              <XCircle size={17} />
              <p><strong>What this does not prove</strong> That a flight physically occurred or a merchant delivered service.</p>
            </div>
            {txLink && <a className="explorer-link" href={txLink} target="_blank" rel="noreferrer">Grant transaction <ExternalLink size={13} /></a>}
          </aside>
        </section>

        <section className="section-heading verifier-heading">
          <div>
            <span className="kicker">INDEPENDENT VERIFIER</span>
            <h2>Verify without trusting the agent backend</h2>
          </div>
          <div className="verifier-actions">
            <button className="secondary" onClick={() => void onRevoke()} disabled={!authorizationUsable || revoked || busy === 'revoke'}>{revoked ? 'Authorization revoked' : 'Revoke authorization'}</button>
            <button className="secondary" onClick={() => void onPostRevokeTest()} disabled={!revoked || busy === 'post-revoke'}><Ban size={14} /> Test post-revoke action</button>
          </div>
        </section>

        <section className="verifier-grid">
          <article className="panel verify-form">
            <label>
              <span>Action ID</span>
              <input value={verifierActionId} onChange={(event) => setVerifierActionId(event.target.value)} placeholder="0x…" />
            </label>
            <label>
              <span>Optional private payload to recompute commitment</span>
              <textarea value={verifierPayload} onChange={(event) => setVerifierPayload(event.target.value)} rows={9} />
            </label>
            <button className="primary wide" onClick={() => void onVerify()} disabled={!directChain || busy === 'verify'}>
              <Fingerprint size={16} /> Verify directly from chain
            </button>
            <button className="secondary wide" onClick={() => void onTamperDemo()} disabled={!proof || busy === 'tamper'}>
              <Ban size={15} /> Tamper demo: change payload total → $399
            </button>
            {prepared && <a className="portable-proof-link" href={`/verify/${prepared.actionId}`}>Shareable proof URL · /verify/{short(prepared.actionId)} <ExternalLink size={13} /></a>}
            {postRevokeDecision && <div className="decision block post-revoke-decision">{postRevokeDecision}</div>}
            {!directChain && <p className="config-warning">Connect Rabby and deploy the registry, or set NEXT_PUBLIC_REGISTRY_ADDRESS, to enable direct verification.</p>}
          </article>

          <article className="panel proof-panel">
            <div className="panel-title"><FileCheck2 size={18} /> Verification result</div>
            {!proof ? (
              <div className="empty-state">No proof loaded yet.</div>
            ) : (
              <>
                <div className={statusClass(proof.checks.existsOnchain)}>{proof.checks.existsOnchain ? <CheckCircle2 /> : <XCircle />} Action exists onchain</div>
                <div className={statusClass(proof.checks.authorizationValidAtActionTime)}>{proof.checks.authorizationValidAtActionTime ? <CheckCircle2 /> : <XCircle />} Authorization valid at action time</div>
                <div className={statusClass(proof.checks.authorizationCurrentlyActive)}>{proof.checks.authorizationCurrentlyActive ? <CheckCircle2 /> : <XCircle />} Authorization currently active</div>
                <div className={statusClass(proof.checks.payloadMatches)}>{proof.checks.payloadMatches ? <CheckCircle2 /> : <XCircle />} Supplied payload commitment matches</div>
                <div className={statusClass(proof.checks.attested)}>{proof.checks.attested ? <CheckCircle2 /> : <XCircle />} Independent outcome attestation present</div>
                {proofConsumerDecision && <div className={`agent-trust-decision ${proofConsumerDecision.verdict.toLowerCase()}`}>
                  <span>Agent-to-agent consumer</span>
                  <strong>{proofConsumerDecision.verdict}</strong>
                  <small>{proofConsumerDecision.reasons.join(' · ') || 'Another app can trust this proof under its own deterministic requirements.'}</small>
                </div>}
                <pre>{json(proof)}</pre>
              </>
            )}
          </article>
        </section>

        <section className="section-heading portability-heading">
          <div>
            <span className="kicker">PORTABLE PRIMITIVES</span>
            <h2>One protocol, more than one agent</h2>
          </div>
          <div className="scenario-tag">Same SDK · same registry</div>
        </section>

        <section className="portability-grid">
          <article className="portability-card">
            <div className="portability-icon"><Plane size={20} /></div>
            <div>
              <span>Reference integration #1</span>
              <strong>Travel Agent</strong>
              <p><code>BOOK_TRAVEL</code> · Singapore scope · max $400 · proposed $361.</p>
            </div>
          </article>
          <article className="portability-card">
            <div className="portability-icon"><ShoppingCart size={20} /></div>
            <div>
              <span>Reference integration #2</span>
              <strong>Procurement Agent</strong>
              <p><code>PURCHASE_ITEM</code> · approved vendor scope · max $200 · proposed $120.</p>
            </div>
          </article>
        </section>

        <section className="panel integration-panel">
          <div>
            <span className="kicker">CONNECT AN EXTERNAL AI AGENT</span>
            <h3>MCP privilege boundary</h3>
            <p>
              Claude Code, Codex and Antigravity can inspect status, evaluate proposals, prepare commitments and verify proofs.
              Remote MCP uses an owner-provisioned Bearer token; local stdio is also supported. Neither can grant authority, revoke a user capability or sign a transaction.
            </p>
          </div>
          <div className="integration-command">
            <a className="secondary nav-button" href="/connect">Get MCP connection config <ExternalLink size={14} /></a>
            <span>Remote Streamable HTTP + local stdio · owner-controlled token</span>
          </div>
          <div className="tool-chips">
            <code>get_status</code>
            <code>evaluate_action</code>
            <code>prepare_action</code>
            <code>verify_action</code>
          </div>
        </section>

        <section className="case-teaser">
          <div><span className="kicker">BEYOND A SINGLE DEMO</span><h2>Four agent scenarios. One trust primitive.</h2><p>Travel booking, procurement, third-party verification and budget enforcement — each case explains the authority, AI proposal and proof boundary.</p></div>
          <a className="primary nav-button" href="/use-cases">View all case studies <ExternalLink size={15} /></a>
        </section>

        <section className="architecture-strip">
          <div><Bot /><strong>Agent</strong><span>proposes</span></div>
          <b>→</b>
          <div><ShieldCheck /><strong>Control Plane</strong><span>ALLOW / BLOCK / ESCALATE</span></div>
          <b>→</b>
          <div><LockKeyhole /><strong>Monad Registry</strong><span>authority + commitments</span></div>
          <b>→</b>
          <div><Fingerprint /><strong>Verifier</strong><span>direct RPC</span></div>
        </section>

        <div className="toast-line"><Activity size={14} /> {message}</div>
      </main>

      <footer>
        <span>Agentic Proof Protocol · Monad Metropolis 2026</span>
        <span>Built in public · #vibecodingvn</span>
      </footer>
    </div>
  );
}
