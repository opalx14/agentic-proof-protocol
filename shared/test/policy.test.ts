import { describe, expect, it } from 'vitest';
import { defaultPolicy, evaluatePolicy, createScopeHash, type ProposedAction } from '../src/index.js';

const agent = '0x1111111111111111111111111111111111111111' as const;
const scopeHash = createScopeHash({ destination: 'Singapore' });

function action(overrides: Partial<ProposedAction> = {}): ProposedAction {
  return {
    agent,
    actionType: 'BOOK_TRAVEL',
    scopeHash,
    value: '300000000',
    currency: 'USDC6',
    resource: 'trip:sin',
    nonce: '1',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

describe('evaluatePolicy', () => {
  it('allows an in-scope action under automatic threshold', () => {
    const policy = { ...defaultPolicy(agent), allowedScopeHashes: [scopeHash] };
    const decision = evaluatePolicy(policy, action());
    expect(decision.verdict).toBe('ALLOW');
  });

  it('escalates an action above automatic threshold but below hard cap', () => {
    const policy = {
      ...defaultPolicy(agent),
      allowedScopeHashes: [scopeHash],
      approvalAboveValue: '350000000',
    };
    const decision = evaluatePolicy(policy, action({ value: '375000000' }));
    expect(decision.verdict).toBe('ESCALATE');
    expect(decision.code).toBe('APPROVAL_REQUIRED');
  });

  it('blocks an action above the hard cap', () => {
    const policy = { ...defaultPolicy(agent), allowedScopeHashes: [scopeHash] };
    const decision = evaluatePolicy(policy, action({ value: '401000000' }));
    expect(decision.verdict).toBe('BLOCK');
    expect(decision.code).toBe('VALUE_EXCEEDS_HARD_LIMIT');
  });

  it('blocks a wrong agent before any value escalation', () => {
    const policy = { ...defaultPolicy(agent), allowedScopeHashes: [scopeHash] };
    const decision = evaluatePolicy(policy, action({ agent: '0x2222222222222222222222222222222222222222' }));
    expect(decision.verdict).toBe('BLOCK');
    expect(decision.code).toBe('WRONG_AGENT');
  });

  it('blocks replayed nonce', () => {
    const policy = { ...defaultPolicy(agent), allowedScopeHashes: [scopeHash] };
    const decision = evaluatePolicy(policy, action(), { usedNonces: new Set(['1']) });
    expect(decision.verdict).toBe('BLOCK');
    expect(decision.code).toBe('REPLAYED_NONCE');
  });

  it('blocks revoked authorization context', () => {
    const policy = { ...defaultPolicy(agent), allowedScopeHashes: [scopeHash] };
    const now = Math.floor(Date.now() / 1000);
    const decision = evaluatePolicy(policy, action(), {
      authorization: {
        actionType: 'BOOK_TRAVEL',
        scopeHash,
        maxValue: '400000000',
        validAfter: now - 10,
        validUntil: now + 10,
        revoked: true,
      },
    });
    expect(decision.verdict).toBe('BLOCK');
    expect(decision.code).toBe('AUTHORIZATION_REVOKED');
  });
});
