import { describe, expect, test } from 'bun:test';
import type { Address, AuthorizationRecord, Hex32 } from '@agentic-proof/shared';
import { canRestoreHistoricalAction, validateRestoredAuthorization } from '../src/live-demo-state';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const AGENT = '0x2222222222222222222222222222222222222222' as Address;
const ACTION_TYPE = `0x${'aa'.repeat(32)}` as Hex32;
const SCOPE_HASH = `0x${'bb'.repeat(32)}` as Hex32;

function authorization(overrides: Partial<AuthorizationRecord> = {}): AuthorizationRecord {
  return {
    authorizationId: `0x${'01'.repeat(32)}` as Hex32,
    user: USER,
    agent: AGENT,
    actionType: ACTION_TYPE,
    scopeHash: SCOPE_HASH,
    maxValue: 400_000_000n,
    validAfter: 900n,
    validUntil: 2_000n,
    nonce: 1n,
    revoked: false,
    revokedAt: 0n,
    attestor: '0x0000000000000000000000000000000000000000' as Address,
    singleUse: false,
    actionCount: 0n,
    ...overrides,
  };
}

const baseInput = {
  wallet: USER,
  expectedAgent: AGENT,
  expectedActionType: ACTION_TYPE,
  expectedScopeHash: SCOPE_HASH,
  nowSeconds: 1_000n,
};

describe('live demo recovery helpers', () => {
  test('preserves only active or revoked historical recorded actions across reloads', () => {
    expect(canRestoreHistoricalAction('ACTIVE')).toBe(true);
    expect(canRestoreHistoricalAction('REVOKED')).toBe(true);
    expect(canRestoreHistoricalAction('EXPIRED')).toBe(false);
    expect(canRestoreHistoricalAction('MISSING')).toBe(false);
    expect(canRestoreHistoricalAction('WALLET_MISMATCH')).toBe(false);
  });

  test('accepts only an active matching authorization', () => {
    expect(validateRestoredAuthorization({ ...baseInput, authorization: authorization() })).toMatchObject({
      status: 'ACTIVE',
      usable: true,
    });
  });

  test('fails closed for missing and expired records', () => {
    expect(validateRestoredAuthorization({ ...baseInput, authorization: null })).toMatchObject({ status: 'MISSING', usable: false });
    expect(validateRestoredAuthorization({ ...baseInput, authorization: authorization({ validUntil: 999n }) })).toMatchObject({ status: 'EXPIRED', usable: false });
  });

  test('fails closed for revoked, wrong-wallet and wrong-scope records', () => {
    expect(validateRestoredAuthorization({ ...baseInput, authorization: authorization({ revoked: true }) })).toMatchObject({ status: 'REVOKED', usable: false });
    expect(validateRestoredAuthorization({ ...baseInput, wallet: '0x3333333333333333333333333333333333333333' as Address, authorization: authorization() })).toMatchObject({ status: 'WALLET_MISMATCH', usable: false });
    expect(validateRestoredAuthorization({ ...baseInput, authorization: authorization({ scopeHash: `0x${'cc'.repeat(32)}` as Hex32 }) })).toMatchObject({ status: 'SCOPE_MISMATCH', usable: false });
  });
});
