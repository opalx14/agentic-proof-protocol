import { describe, expect, it } from 'vitest';
import {
  createSpendingActionHash,
  createSpendingActionId,
  createSpendingResourceHash,
  createSpendingScopeHash,
} from '../src/index.js';

const vault = '0x1111111111111111111111111111111111111111' as const;
const token = '0x2222222222222222222222222222222222222222' as const;
const recipient = '0x3333333333333333333333333333333333333333' as const;
const authorizationId = `0x${'44'.repeat(32)}` as const;

describe('smart spending commitments', () => {
  it('matches the canonical Monad spending scope vector', () => {
    expect(createSpendingResourceHash('travel:SFO-SIN')).toBe(
      '0x441b3c927ce49f1533386f1a9be1fd7954657afb140af420a41e3a7f29b6585a',
    );
    expect(createSpendingScopeHash({ chainId: 10143, token, recipient, resource: 'travel:SFO-SIN' })).toBe(
      '0x38194844d6a4a8d71d7d8a1f73f08d1a06c9dd461fbba1c2f4eb6bd46101daf3',
    );
  });

  it('binds action identity and commitment to recipient, amount, resource and nonce', () => {
    const base = {
      chainId: 10143,
      vault,
      authorizationId,
      token,
      recipient,
      amount: 361_000_000n,
      resource: 'travel:SFO-SIN',
      paymentNonce: 1n,
    };
    const actionId = createSpendingActionId(base);
    const actionHash = createSpendingActionHash({ ...base, actionId });

    expect(actionId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(actionHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(createSpendingActionId({ ...base, recipient: vault })).not.toBe(actionId);
    expect(createSpendingActionId({ ...base, amount: 362_000_000n })).not.toBe(actionId);
    expect(createSpendingActionId({ ...base, resource: 'travel:SFO-NRT' })).not.toBe(actionId);
    expect(createSpendingActionId({ ...base, paymentNonce: 2n })).not.toBe(actionId);
  });
});
