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
  evaluatePolicy,
  manifestAllowsAction,
  policyForScenario,
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
