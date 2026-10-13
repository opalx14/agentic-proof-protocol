import { describe, expect, it } from 'vitest';
import {
  commerceChallengeToAction,
  createActionHash,
  createScopeHash,
  evaluatePolicy,
  type Hex32,
  type Policy,
} from '../src/index.js';

const agent = '0x1111111111111111111111111111111111111111' as const;

function policy(scopeHash: Hex32, maxValue = '400000000'): Policy {
  return {
    version: 1,
    agentAddress: agent,
    enabled: true,
    allowedActionTypes: ['PAY_SERVICE'],
    allowedScopeHashes: [scopeHash],
    maxValue,
    approvalAboveValue: null,
    validUntil: null,
    updatedAt: new Date(0).toISOString(),
  };
}

describe('commerce challenge adapter', () => {
  it('turns a machine-readable payment requirement into a policy-governed APP action', () => {
    const bundle = commerceChallengeToAction({
      agent,
      nonce: '1',
      challenge: {
        version: '1',
        network: 'monad-testnet',
        asset: 'USDC6',
        payTo: 'merchant:demo-airline',
        amount: '361000000',
        resource: 'travel:SFO-SIN',
        requestId: 'quote-361',
      },
    });

    expect(bundle.action.actionType).toBe('PAY_SERVICE');
    expect(bundle.action.value).toBe('361000000');
    expect(bundle.action.scopeHash).toBe(createScopeHash(bundle.scope));
    expect(evaluatePolicy(policy(bundle.action.scopeHash as Hex32), bundle.action).verdict).toBe('ALLOW');
    expect(createActionHash(bundle.payload)).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('blocks an over-cap challenge and cannot silently redirect the payee', () => {
    const allowed = commerceChallengeToAction({
      agent,
      nonce: '1',
      challenge: {
        version: '1',
        network: 'monad-testnet',
        asset: 'USDC6',
        payTo: 'merchant:demo-airline',
        amount: '361000000',
        resource: 'travel:SFO-SIN',
      },
    });
    const overCap = commerceChallengeToAction({
      agent,
      nonce: '2',
      challenge: {
        version: '1',
        network: 'monad-testnet',
        asset: 'USDC6',
        payTo: 'merchant:demo-airline',
        amount: '401000000',
        resource: 'travel:SFO-SIN',
      },
    });
    const redirected = commerceChallengeToAction({
      agent,
      nonce: '3',
      challenge: {
        version: '1',
        network: 'monad-testnet',
        asset: 'USDC6',
        payTo: 'merchant:attacker',
        amount: '361000000',
        resource: 'travel:SFO-SIN',
      },
    });

    const fixedPolicy = policy(allowed.action.scopeHash as Hex32);
    const blocked = evaluatePolicy(fixedPolicy, overCap.action);
    const redirectBlocked = evaluatePolicy(fixedPolicy, redirected.action);

    expect(blocked.verdict).toBe('BLOCK');
    expect(blocked.code).toBe('VALUE_EXCEEDS_HARD_LIMIT');
    expect(redirected.action.scopeHash).not.toBe(allowed.action.scopeHash);
    expect(redirectBlocked.verdict).toBe('BLOCK');
    expect(redirectBlocked.code).toBe('SCOPE_NOT_ALLOWED');
  });
});
