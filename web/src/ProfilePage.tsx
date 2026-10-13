'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import {
  createEncryptionKeyCommitment,
  createProfileBoundScopeHash,
  createProfilePolicyHash,
  createScopeHash,
  createUserProfile,
  createUserProfileHash,
  decryptPrivateReceipt,
  encryptPrivateReceipt,
  evaluateProfilePolicy,
  generateProfileEncryptionKey,
  type EncryptedReceiptBundle,
  type ProfilePolicyDecision,
  type UserProfile,
} from '@agentic-proof/shared';

const USER = '0x1111111111111111111111111111111111111111' as const;
const AGENT = '0x2222222222222222222222222222222222222222' as const;
const PAYMENT_SCOPE = createScopeHash({
  version: '1',
  network: 'monad-testnet',
  asset: 'USDC6',
  payTo: 'merchant:demo-airline',
  resource: 'travel:SFO-SIN',
});
const ACTION_ID = `0x${'88'.repeat(32)}` as const;

function short(value: string) {
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

export default function ProfilePage() {
  const [key, setKey] = useState<`0x${string}` | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [decision, setDecision] = useState<ProfilePolicyDecision | null>(null);
  const [bundle, setBundle] = useState<EncryptedReceiptBundle | null>(null);
  const [decrypted, setDecrypted] = useState<Record<string, unknown> | null>(null);
  const [cryptoError, setCryptoError] = useState<string | null>(null);

  const profileHash = useMemo(() => profile ? createUserProfileHash(profile) : null, [profile]);
  const policyHash = useMemo(() => profile ? createProfilePolicyHash(profile.policy) : null, [profile]);
  const profileBoundScope = useMemo(
    () => profileHash ? createProfileBoundScopeHash(profileHash, PAYMENT_SCOPE) : null,
    [profileHash],
  );

  function createDemoProfile() {
    const nextKey = generateProfileEncryptionKey();
    const nextProfile = createUserProfile(USER, {
      alias: 'traveler.one',
      persona: 'BUSINESS_TRAVELER',
      encryptionKeyCommitment: createEncryptionKeyCommitment(nextKey),
      createdAt: '2026-10-13T12:00:00.000Z',
      policy: {
        allowedActionTypes: ['BOOK_TRAVEL', 'PAY_SERVICE'],
        allowedScopeHashes: [PAYMENT_SCOPE],
        maxPerAction: '400000000',
        dailyBudget: '600000000',
        approvalAboveValue: '300000000',
      },
    });
    setKey(nextKey);
    setProfile(nextProfile);
    setDecision(null);
    setBundle(null);
    setDecrypted(null);
    setCryptoError(null);
  }

  function testAmount(value: string) {
    if (!profile) return;
    setDecision(evaluateProfilePolicy(profile, {
      agent: AGENT,
      actionType: 'PAY_SERVICE',
      scopeHash: PAYMENT_SCOPE,
      value,
      currency: 'USDC6',
      resource: 'travel:SFO-SIN',
      nonce: value,
    }, { spentToday: '100000000' }));
  }

  async function encryptReceipt() {
    if (!key || !profileHash) return;
    const receipt = {
      invoiceId: 'INV-DEMO-361',
      passenger: 'PRIVATE USER',
      route: 'SFO → SIN',
      merchant: 'DEMO AIRLINE',
      amount: '361000000',
      currency: 'USDC6',
    };
    const nextBundle = await encryptPrivateReceipt(receipt, key, { profileHash, actionId: ACTION_ID });
    setBundle(nextBundle);
    setDecrypted(null);
    setCryptoError(null);
  }

  async function decryptReceipt() {
    if (!bundle || !key || !profileHash) return;
    try {
      const value = await decryptPrivateReceipt<Record<string, unknown>>(bundle, key, { profileHash, actionId: ACTION_ID });
      setDecrypted(value);
      setCryptoError(null);
    } catch (error) {
      setDecrypted(null);
      setCryptoError(error instanceof Error ? error.message : 'DECRYPTION_FAILED');
    }
  }

  async function testTamper() {
    if (!bundle || !key || !profileHash) return;
    const last = bundle.ciphertext.at(-1) ?? '0';
    const tampered = {
      ...bundle,
      ciphertext: `${bundle.ciphertext.slice(0, -1)}${last === '0' ? '1' : '0'}`,
    };
    try {
      await decryptPrivateReceipt(tampered, key, { profileHash, actionId: ACTION_ID });
      setCryptoError('UNEXPECTED_TAMPER_ACCEPTED');
    } catch (error) {
      setDecrypted(null);
      setCryptoError(error instanceof Error ? error.message : 'DECRYPTION_FAILED');
    }
  }

  return (
    <div className="min-h-screen bg-[#080b10] text-slate-100">
      <header className="border-b border-white/10 bg-[#080b10]/95">
        <div className="mx-auto flex min-h-16 w-[min(1160px,calc(100%-32px))] items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-3 text-sm font-semibold text-white no-underline"><Fingerprint size={18} className="text-violet-300" /> Agentic Proof Protocol</a>
          <a href="/use-cases" className="inline-flex items-center gap-2 text-xs text-slate-400 no-underline hover:text-white"><ArrowLeft size={13} /> Case studies</a>
        </div>
      </header>

      <main className="mx-auto w-[min(1160px,calc(100%-32px))] py-14 md:py-20">
        <section className="max-w-[850px]">
          <span className="text-[10px] font-extrabold tracking-[.18em] text-violet-300">IDENTITY · PRIVACY · POLICY</span>
          <h1 className="mt-3 text-[clamp(40px,7vw,72px)] font-black leading-[.96] tracking-[-.055em] text-white">Your identity is public.<br /><span className="text-violet-300">Your receipt is not.</span></h1>
          <p className="mt-6 max-w-[760px] text-sm leading-7 text-slate-400">A wallet-owned profile commits persona + policy onchain. Private payment details stay AES-256-GCM encrypted offchain; Monad only needs the profile, policy and receipt commitments linked to an existing APP payment proof.</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-amber-300/20 bg-amber-300/[0.05] px-3 py-2 text-[11px] text-amber-200"><ShieldAlert size={14} /> PersonalProfileRegistry is local-tested / Monad-ready. This page does not claim a live profile-contract deployment.</div>
        </section>

        <section className="mt-12 grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
            <div className="flex items-start justify-between gap-4"><div><span className="text-[10px] font-bold tracking-[.14em] text-violet-300">01 · PERSONAL PROFILE</span><h2 className="mt-2 text-2xl font-bold text-white">Identity + policy commitment</h2></div><Fingerprint className="text-violet-300" /></div>
            {!profile ? (
              <button data-tour="profile-create" type="button" onClick={createDemoProfile} className="mt-7 rounded-xl bg-violet-500 px-4 py-3 text-xs font-bold text-white">Create private demo profile</button>
            ) : (
              <div className="mt-6 space-y-3 text-xs">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4"><span className="text-slate-500">Wallet identity</span><strong className="mt-1 block break-all text-white">{USER}</strong></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 p-4"><span className="text-slate-500">Persona</span><strong className="mt-1 block text-emerald-300">{profile.persona}</strong></div>
                  <div className="rounded-xl border border-white/10 p-4"><span className="text-slate-500">Profile encryption key</span><strong className="mt-1 block text-white">Browser memory only · never the wallet key</strong></div>
                </div>
                <div className="rounded-xl border border-white/10 p-4"><span className="text-slate-500">Profile commitment</span><code className="mt-1 block break-all text-violet-200">{profileHash}</code></div>
                <div className="rounded-xl border border-white/10 p-4"><span className="text-slate-500">Policy commitment</span><code className="mt-1 block break-all text-violet-200">{policyHash}</code></div>
                <div className="rounded-xl border border-white/10 p-4"><span className="text-slate-500">Profile-bound payment scope</span><code className="mt-1 block break-all text-cyan-200">{profileBoundScope}</code><p className="mt-2 text-[10px] leading-4 text-slate-600">A payment recorded under profile v1 cannot later be relabelled under a different profile version.</p></div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 p-3"><span className="text-slate-500">Per action</span><strong className="mt-1 block text-white">$400</strong></div>
                  <div className="rounded-xl border border-white/10 p-3"><span className="text-slate-500">Daily</span><strong className="mt-1 block text-white">$600</strong></div>
                  <div className="rounded-xl border border-white/10 p-3"><span className="text-slate-500">Approval</span><strong className="mt-1 block text-white">&gt; $300</strong></div>
                </div>
              </div>
            )}
          </article>

          <article className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
            <div className="flex items-start justify-between gap-4"><div><span className="text-[10px] font-bold tracking-[.14em] text-emerald-300">02 · PROFILE POLICY</span><h2 className="mt-2 text-2xl font-bold text-white">The model cannot widen it</h2></div><ShieldCheck className="text-emerald-300" /></div>
            <p className="mt-4 text-xs leading-6 text-slate-500">With $100 already spent today: $250 can auto-execute, $361 requires owner approval, and $401 violates the hard per-action limit.</p>
            <div className="mt-5 flex flex-wrap gap-2" data-tour="profile-policy-tests">
              <button type="button" disabled={!profile} onClick={() => testAmount('250000000')} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold disabled:opacity-30">Test $250</button>
              <button type="button" disabled={!profile} onClick={() => testAmount('361000000')} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold disabled:opacity-30">Test $361</button>
              <button type="button" disabled={!profile} onClick={() => testAmount('401000000')} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold disabled:opacity-30">Test $401</button>
            </div>
            {decision && <div className={`mt-5 rounded-xl border p-4 text-xs ${decision.verdict === 'ALLOW' ? 'border-emerald-300/20 bg-emerald-300/[0.05]' : decision.verdict === 'ESCALATE' ? 'border-amber-300/20 bg-amber-300/[0.05]' : 'border-rose-300/20 bg-rose-300/[0.05]'}`}><strong className="text-white">{decision.verdict}{decision.code ? ` · ${decision.code}` : ''}</strong><p className="mt-1 text-slate-400">{decision.reasons[0]}</p></div>}
          </article>
        </section>

        <section className="mt-4 rounded-3xl border border-white/10 bg-white/[0.025] p-6 md:p-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start"><div><span className="text-[10px] font-bold tracking-[.14em] text-cyan-300">03 · PRIVATE PAYMENT LEDGER</span><h2 className="mt-2 text-3xl font-bold text-white">Encrypt the receipt. Commit the proof.</h2><p className="mt-3 max-w-[720px] text-xs leading-6 text-slate-500">The profile key never leaves this browser demo. Public observers get commitments; only the profile owner can decrypt receipt details.</p></div><LockKeyhole className="text-cyan-300" size={28} /></div>
          <div className="mt-6 flex flex-wrap gap-2">
            <button data-tour="profile-encrypt" type="button" disabled={!profile} onClick={encryptReceipt} className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-xs font-bold text-slate-950 disabled:opacity-30"><KeyRound size={14} /> Encrypt $361 receipt</button>
            <button data-tour="profile-decrypt" type="button" disabled={!bundle} onClick={decryptReceipt} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-bold disabled:opacity-30"><WalletCards size={14} /> Owner decrypt</button>
            <button data-tour="profile-tamper" type="button" disabled={!bundle} onClick={testTamper} className="rounded-xl border border-rose-300/20 px-4 py-3 text-xs font-bold text-rose-200 disabled:opacity-30">Tamper ciphertext</button>
          </div>

          {bundle && <div className="mt-6 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5"><span className="text-[10px] font-bold tracking-[.13em] text-slate-500">PUBLIC / COMMITTABLE</span><div className="mt-4 space-y-3 text-xs"><p><span className="text-slate-500">Algorithm</span><strong className="ml-2 text-white">{bundle.algorithm}</strong></p><p><span className="text-slate-500">Ciphertext</span><code className="mt-1 block break-all text-cyan-200">{short(bundle.ciphertext)}</code></p><p><span className="text-slate-500">Encrypted receipt commitment</span><code className="mt-1 block break-all text-cyan-200">{bundle.commitment}</code></p><p><span className="text-slate-500">Plaintext hash</span><code className="mt-1 block break-all text-slate-300">{bundle.plaintextHash}</code></p></div></div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5"><span className="text-[10px] font-bold tracking-[.13em] text-slate-500">OWNER-ONLY VIEW</span>{decrypted ? <div className="mt-4 space-y-2 text-xs">{Object.entries(decrypted).map(([name, value]) => <p key={name}><span className="text-slate-500">{name}</span><strong className="ml-2 text-white">{String(value)}</strong></p>)}<div className="mt-4 inline-flex items-center gap-2 text-emerald-300"><CheckCircle2 size={14} /> AES-GCM authentication passed</div></div> : <p className="mt-4 text-xs leading-6 text-slate-500">Encrypted. The invoice, traveler and merchant details are not visible from the public commitment.</p>}{cryptoError && <div className="mt-4 rounded-lg border border-rose-300/20 bg-rose-300/[0.05] p-3 text-xs font-bold text-rose-200">{cryptoError}</div>}</div>
          </div>}
        </section>

        <section className="mt-4 grid gap-3 md:grid-cols-3">
          {[['Identity anchor', 'Wallet address + profileHash bind the person to a versioned profile.'], ['Policy envelope', 'Persona rules run before the existing APP execution policy; stricter rules always win.'], ['Private ledger', 'PersonalProfileRegistry links only encrypted receipt commitments to existing PAY_SERVICE proofs.']].map(([title, copy]) => <article key={title} className="rounded-2xl border border-white/10 p-5"><strong className="text-sm text-white">{title}</strong><p className="mt-2 text-xs leading-5 text-slate-500">{copy}</p></article>)}
        </section>

        <div className="mt-8 flex flex-wrap gap-3 text-xs"><a href="https://github.com/opalx14/agentic-proof-protocol/blob/main/contracts/src/PersonalProfileRegistry.sol" className="inline-flex items-center gap-2 text-violet-300 no-underline">Review profile contract <ArrowUpRight size={13} /></a><a href="/connect" className="inline-flex items-center gap-2 text-violet-300 no-underline">AI privilege boundary <ArrowUpRight size={13} /></a></div>
      </main>
    </div>
  );
}
