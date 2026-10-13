import { describe, expect, it } from 'vitest';
import { evaluatePolicy } from '../src/policy';
import { travelQuoteChanged, travelQuoteToAction } from '../src/travel-quote';
import type { Hex32, Policy, TravelQuote } from '../src/index';

const agent = '0x1111111111111111111111111111111111111111' as const;

const baseQuote: TravelQuote = {
  version: '1',
  source: 'ATLAS',
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

function policy(scopeHash: Hex32): Policy {
  return {
    version: 1,
    agentAddress: agent,
    enabled: true,
    allowedActionTypes: ['BOOK_TRAVEL'],
    allowedScopeHashes: [scopeHash],
    maxValue: '400000000',
    approvalAboveValue: null,
    validUntil: null,
    updatedAt: '2026-10-14T00:00:00.000Z',
  };
}

describe('verified travel quote binding', () => {
  it('allows the verified $361 quote but rejects a $399 re-quote under the old exact scope', () => {
    const original = travelQuoteToAction({ agent, nonce: '1', quote: baseQuote });
    const changed = travelQuoteToAction({
      agent,
      nonce: '2',
      quote: { ...baseQuote, total: '399000000', observedAt: '2026-10-14T00:01:00.000Z' },
    });

    expect(travelQuoteChanged(baseQuote, changed.quote)).toBe(true);
    expect(changed.action.scopeHash).not.toBe(original.action.scopeHash);

    const exactPolicy = policy(original.action.scopeHash as Hex32);
    expect(evaluatePolicy(exactPolicy, original.action, { nowMs: Date.parse('2026-10-14T00:02:00.000Z') }).verdict).toBe('ALLOW');
    expect(evaluatePolicy(exactPolicy, changed.action, { nowMs: Date.parse('2026-10-14T00:02:00.000Z') })).toMatchObject({
      verdict: 'BLOCK',
      code: 'SCOPE_NOT_ALLOWED',
    });
  });

  it('fails closed after the verified provider quote expires', () => {
    const bundle = travelQuoteToAction({ agent, nonce: '3', quote: baseQuote });
    const result = evaluatePolicy(policy(bundle.action.scopeHash as Hex32), bundle.action, {
      nowMs: Date.parse('2026-10-14T00:06:00.000Z'),
    });

    expect(result).toMatchObject({ verdict: 'BLOCK', code: 'ACTION_EXPIRED' });
  });
});
