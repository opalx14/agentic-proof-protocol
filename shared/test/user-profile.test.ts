import { describe, expect, it } from 'vitest';
import {
  createProfileBoundScopeHash,
  createProfilePolicyHash,
  createUserProfile,
  createUserProfileHash,
  evaluateProfilePolicy,
} from '../src/user-profile';

const USER = '0x1111111111111111111111111111111111111111' as const;
const AGENT = '0x2222222222222222222222222222222222222222' as const;
const SCOPE = `0x${'33'.repeat(32)}` as const;
const OTHER_SCOPE = `0x${'44'.repeat(32)}` as const;
const KEY_COMMITMENT = `0x${'55'.repeat(32)}` as const;

function profile() {
  return createUserProfile(USER, {
    alias: 'traveler.one',
    persona: 'BUSINESS_TRAVELER',
    encryptionKeyCommitment: KEY_COMMITMENT,
    createdAt: '2026-10-13T12:00:00.000Z',
    policy: {
      allowedActionTypes: ['BOOK_TRAVEL', 'PAY_SERVICE'],
      allowedScopeHashes: [SCOPE],
      maxPerAction: '400000000',
      dailyBudget: '600000000',
      approvalAboveValue: '300000000',
    },
  });
}

function action(value: string, overrides: Partial<{
  actionType: string;
  scopeHash: `0x${string}`;
}> = {}) {
  return {
    agent: AGENT,
    actionType: overrides.actionType ?? 'PAY_SERVICE',
    scopeHash: overrides.scopeHash ?? SCOPE,
    value,
    currency: 'USDC6',
    resource: 'travel:SFO-SIN',
    nonce: '1',
  };
}

describe('personal profile policy', () => {
  it('creates deterministic profile/policy hashes and binds action scope to the profile', () => {
    const first = profile();
    const second = profile();
    expect(createUserProfileHash(first)).toBe(createUserProfileHash(second));
    expect(createProfilePolicyHash(first.policy)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(
      createProfileBoundScopeHash(
        `0x${'11'.repeat(32)}` as const,
        `0x${'22'.repeat(32)}` as const,
      ),
    ).toBe('0xb3f076a7f172dee349e892654fc75175b457c88748e8fe94fdaa26aa919c8c51');
    expect(createProfileBoundScopeHash(createUserProfileHash(first), SCOPE)).not.toBe(SCOPE);

    const changed = createUserProfile(USER, {
      alias: first.alias,
      persona: first.persona,
      encryptionKeyCommitment: first.encryptionKeyCommitment,
      createdAt: first.createdAt,
      policy: { ...first.policy, dailyBudget: '700000000' },
    });
    expect(createUserProfileHash(changed)).not.toBe(createUserProfileHash(first));
  });

  it('returns ALLOW / ESCALATE / BLOCK from the identity-level policy envelope', () => {
    const p = profile();

    expect(evaluateProfilePolicy(p, action('250000000'), { spentToday: '100000000' }).verdict).toBe('ALLOW');

    const escalated = evaluateProfilePolicy(p, action('361000000'), { spentToday: '100000000' });
    expect(escalated.verdict).toBe('ESCALATE');
    expect(escalated.code).toBe('PROFILE_APPROVAL_REQUIRED');

    const perAction = evaluateProfilePolicy(p, action('401000000'));
    expect(perAction.verdict).toBe('BLOCK');
    expect(perAction.code).toBe('PROFILE_VALUE_EXCEEDS_LIMIT');

    const daily = evaluateProfilePolicy(p, action('250000000'), { spentToday: '400000000' });
    expect(daily.verdict).toBe('BLOCK');
    expect(daily.code).toBe('PROFILE_DAILY_BUDGET_EXCEEDED');

    const wrongScope = evaluateProfilePolicy(p, action('100', { scopeHash: OTHER_SCOPE }));
    expect(wrongScope.code).toBe('PROFILE_SCOPE_NOT_ALLOWED');

    const wrongAction = evaluateProfilePolicy(p, action('100', { actionType: 'TRANSFER_ETH' }));
    expect(wrongAction.code).toBe('PROFILE_ACTION_NOT_ALLOWED');
  });
});
