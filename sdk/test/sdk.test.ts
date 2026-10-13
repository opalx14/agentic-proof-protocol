import { describe, expect, it } from 'bun:test';
import {
  TRAVEL_REFERENCE_SCENARIO,
  actionForScenario,
  commerceChallengeToAction,
  createAgentManifest,
  createAgentManifestHash,
  createSpendingActionHash,
  createSpendingActionId,
  createSpendingScopeHash,
  createUserProfile,
  createUserProfileHash,
  createProfilePolicyHash,
  createPersonalProfileReader,
  PERSONAL_PROFILE_REGISTRY_ABI,
  createEncryptionKeyCommitment,
  decryptPrivateReceipt,
  encryptPrivateReceipt,
  evaluatePolicy,
  evaluateProfilePolicy,
  generateProfileEncryptionKey,
  manifestAllowsAction,
  policyForScenario,
  travelQuoteChanged,
  travelQuoteToAction,
} from '../dist/index.js';

const agent = '0x1111111111111111111111111111111111111111' as const;

describe('@agentic-proof/sdk package artifact', () => {
  it('evaluates the reference $361 action and blocks $401', () => {
    const policy = policyForScenario(agent, TRAVEL_REFERENCE_SCENARIO);
    const allowed = evaluatePolicy(policy, actionForScenario(agent, TRAVEL_REFERENCE_SCENARIO));
    const blocked = evaluatePolicy(
      policy,
      actionForScenario(agent, TRAVEL_REFERENCE_SCENARIO, { value: '401000000', nonce: '2' }),
    );

    expect(allowed.verdict).toBe('ALLOW');
    expect(blocked.verdict).toBe('BLOCK');
    expect(blocked.code).toBe('VALUE_EXCEEDS_HARD_LIMIT');
  });

  it('binds an exact travel quote so a provider re-quote cannot reuse old consent', () => {
    const quote = {
      version: '1' as const,
      source: 'ATLAS' as const,
      provider: 'atlas-flight',
      offerId: 'offer-SGN-SIN-361',
      origin: 'SGN',
      destination: 'SIN',
      cabin: 'economy',
      total: '361000000',
      currency: 'USDC6',
      observedAt: '2026-10-14T00:00:00.000Z',
      expiresAt: '2026-10-14T00:05:00.000Z',
    };
    const original = travelQuoteToAction({ agent, nonce: '20', quote });
    const requote = travelQuoteToAction({
      agent,
      nonce: '21',
      quote: { ...quote, total: '399000000', observedAt: '2026-10-14T00:01:00.000Z' },
    });

    expect(original.action.actionType).toBe('BOOK_TRAVEL');
    expect(original.action.value).toBe('361000000');
    expect(travelQuoteChanged(original.quote, requote.quote)).toBe(true);
    expect(requote.action.scopeHash).not.toBe(original.action.scopeHash);
  });

  it('builds smart-spending commitments compatible with the vault contract', () => {
    const token = '0x2222222222222222222222222222222222222222' as const;
    const recipient = '0x3333333333333333333333333333333333333333' as const;
    const authorizationId = `0x${'44'.repeat(32)}` as const;
    const scopeHash = createSpendingScopeHash({
      chainId: 10143,
      token,
      recipient,
      resource: 'travel:SFO-SIN',
    });
    expect(scopeHash).toBe('0x38194844d6a4a8d71d7d8a1f73f08d1a06c9dd461fbba1c2f4eb6bd46101daf3');

    const actionInput = {
      chainId: 10143,
      vault: agent,
      authorizationId,
      token,
      recipient,
      amount: 361_000_000n,
      resource: 'travel:SFO-SIN',
      paymentNonce: 1n,
    };
    const actionId = createSpendingActionId(actionInput);
    const actionHash = createSpendingActionHash({ ...actionInput, actionId });
    expect(actionId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(actionHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('builds a personal profile policy and private payment receipt', async () => {
    const key = generateProfileEncryptionKey();
    const profile = createUserProfile('0x4444444444444444444444444444444444444444', {
      alias: 'traveler.one',
      persona: 'BUSINESS_TRAVELER',
      encryptionKeyCommitment: createEncryptionKeyCommitment(key),
      createdAt: '2026-10-13T12:00:00.000Z',
      policy: {
        allowedActionTypes: ['PAY_SERVICE'],
        allowedScopeHashes: [],
        maxPerAction: '400000000',
        dailyBudget: '600000000',
        approvalAboveValue: null,
      },
    });
    const profileHash = createUserProfileHash(profile);
    expect(profileHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(createProfilePolicyHash(profile.policy)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(PERSONAL_PROFILE_REGISTRY_ABI.length).toBeGreaterThan(0);
    const profileReader = createPersonalProfileReader({
      rpcUrl: 'http://127.0.0.1:8545',
      contractAddress: '0x5555555555555555555555555555555555555555',
    });
    expect(typeof profileReader.readProfile).toBe('function');
    expect(typeof profileReader.readPaymentReceipt).toBe('function');

    const action = {
      agent,
      actionType: 'PAY_SERVICE',
      scopeHash: `0x${'77'.repeat(32)}` as const,
      value: '361000000',
      currency: 'USDC6',
      resource: 'travel:SFO-SIN',
      nonce: '10',
    };
    expect(evaluateProfilePolicy(profile, action, { spentToday: '100000000' }).verdict).toBe('ALLOW');

    const aad = { profileHash, actionId: `0x${'88'.repeat(32)}` };
    const encrypted = await encryptPrivateReceipt({ invoice: 'PRIVATE', amount: '361000000' }, key, aad);
    expect(encrypted.ciphertext).not.toContain('PRIVATE');
    expect(await decryptPrivateReceipt(encrypted, key, aad)).toEqual({ invoice: 'PRIVATE', amount: '361000000' });
  });

  it('binds a commerce payment to its payee and creates deterministic agent metadata', () => {
    const baseChallenge = {
      version: '1' as const,
      network: 'monad-testnet',
      asset: 'USDC6',
      amount: '361000000',
      resource: 'travel:SFO-SIN',
    };

    const merchantA = commerceChallengeToAction({
      agent,
      nonce: '7',
      challenge: { ...baseChallenge, payTo: 'merchant:demo-airline' },
    });
    const merchantB = commerceChallengeToAction({
      agent,
      nonce: '8',
      challenge: { ...baseChallenge, payTo: 'merchant:evil-clone' },
    });

    expect(merchantA.action.actionType).toBe('PAY_SERVICE');
    expect(merchantA.action.scopeHash).not.toBe(merchantB.action.scopeHash);

    const manifest = createAgentManifest(agent, {
      name: 'Commerce Agent',
      role: 'commerce',
      capabilities: [
        { actionType: 'PAY_SERVICE', description: 'Prepare user-scoped service payments.' },
      ],
    });

    expect(createAgentManifestHash(manifest)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(manifestAllowsAction(manifest, { agent, actionType: 'PAY_SERVICE' })).toBe(true);
    expect(manifestAllowsAction(manifest, { agent, actionType: 'BOOK_TRAVEL' })).toBe(false);
  });
});
