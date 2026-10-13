import { describe, expect, it } from 'bun:test';
import {
  TRAVEL_REFERENCE_SCENARIO,
  actionForScenario,
  commerceChallengeToAction,
  createAgentManifest,
  createAgentManifestHash,
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
