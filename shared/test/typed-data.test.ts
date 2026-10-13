import { describe, expect, it } from 'vitest';
import { buildAuthorizationTypedData, createScopeHash, hashActionType } from '../src/index.js';

describe('authorization typed data', () => {
  it('binds chain, contract, nonce and expiry', () => {
    const typed = buildAuthorizationTypedData({
      chainId: 10143,
      verifyingContract: '0x1111111111111111111111111111111111111111',
      user: '0x2222222222222222222222222222222222222222',
      agent: '0x3333333333333333333333333333333333333333',
      actionType: hashActionType('BOOK_TRAVEL'),
      scopeHash: createScopeHash({ destination: 'SIN' }),
      maxValue: 400000000n,
      validAfter: 1n,
      validUntil: 2n,
      nonce: 7n,
      attestor: '0x0000000000000000000000000000000000000000',
      singleUse: true,
    });
    expect(typed.domain.chainId).toBe(10143);
    expect(typed.domain.verifyingContract).toBe('0x1111111111111111111111111111111111111111');
    expect(typed.message.nonce).toBe(7n);
    expect(typed.message.validUntil).toBe(2n);
  });
});
