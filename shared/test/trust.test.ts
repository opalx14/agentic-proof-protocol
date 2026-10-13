import { describe, expect, it } from 'vitest';
import { evaluateProofTrust, type ProofBundle } from '../src/index';

const AGENT = '0x1111111111111111111111111111111111111111' as const;
const USER = '0x2222222222222222222222222222222222222222' as const;
const ZERO = '0x0000000000000000000000000000000000000000' as const;
const H1 = `0x${'1'.repeat(64)}` as const;
const H2 = `0x${'2'.repeat(64)}` as const;
const H3 = `0x${'3'.repeat(64)}` as const;

function proof(overrides: Partial<ProofBundle['checks']> = {}): ProofBundle {
  return {
    authorization: {
      authorizationId: H1,
      user: USER,
      agent: AGENT,
      actionType: H2,
      scopeHash: H3,
      maxValue: 400_000_000n,
      validAfter: 1n,
      validUntil: 9999999999n,
      nonce: 1n,
      revoked: false,
      revokedAt: 0n,
      attestor: ZERO,
      singleUse: false,
      actionCount: 1n,
    },
    action: {
      actionId: H2,
      authorizationId: H1,
      actionType: H2,
      scopeHash: H3,
      actionHash: H1,
      traceRoot: H3,
      value: 361_000_000n,
      recordedAt: 10n,
      agent: AGENT,
    },
    attestation: null,
    checks: {
      existsOnchain: true,
      authorizationValidAtActionTime: true,
      authorizationCurrentlyActive: true,
      attested: false,
      payloadMatches: true,
      ...overrides,
    },
  };
}

describe('evaluateProofTrust', () => {
  it('accepts a valid portable action proof under the consumer limit', () => {
    expect(evaluateProofTrust(proof(), {
      expectedAgent: AGENT,
      maxValue: 400_000_000n,
      requireCurrentAuthorization: true,
      requirePayloadMatch: true,
    })).toEqual({ verdict: 'ACCEPT', reasons: [] });
  });

  it('rejects a tampered payload', () => {
    const decision = evaluateProofTrust(proof({ payloadMatches: false }), { requirePayloadMatch: true });
    expect(decision.verdict).toBe('REJECT');
    expect(decision.reasons).toContain('PAYLOAD_MISMATCH');
  });

  it('separates historical validity from current revocation', () => {
    const historical = proof({ authorizationCurrentlyActive: false });
    expect(evaluateProofTrust(historical, { requirePayloadMatch: true }).verdict).toBe('ACCEPT');
    expect(evaluateProofTrust(historical, {
      requirePayloadMatch: true,
      requireCurrentAuthorization: true,
    }).reasons).toContain('AUTHORIZATION_NOT_CURRENTLY_ACTIVE');
  });

  it('can require a third-party attestation', () => {
    expect(evaluateProofTrust(proof(), { requireAttestation: true }).reasons).toContain('ATTESTATION_REQUIRED');
  });
});
