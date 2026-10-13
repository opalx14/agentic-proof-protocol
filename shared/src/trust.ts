import type { Address, ProofBundle } from './types';

export type ProofTrustRequirements = {
  expectedAgent?: Address;
  maxValue?: bigint;
  requireCurrentAuthorization?: boolean;
  requirePayloadMatch?: boolean;
  requireAttestation?: boolean;
};

export type ProofTrustDecision = {
  verdict: 'ACCEPT' | 'REJECT';
  reasons: string[];
};

/**
 * Portable verifier policy for agent-to-agent / cross-application trust decisions.
 * It consumes only a ProofBundle and caller requirements; it never trusts the agent backend.
 */
export function evaluateProofTrust(
  proof: ProofBundle,
  requirements: ProofTrustRequirements = {},
): ProofTrustDecision {
  const reasons: string[] = [];

  if (!proof.checks.existsOnchain || !proof.action || !proof.authorization) {
    reasons.push('ACTION_NOT_FOUND_ONCHAIN');
  }

  if (!proof.checks.authorizationValidAtActionTime) {
    reasons.push('AUTHORIZATION_INVALID_AT_ACTION_TIME');
  }

  if (requirements.requireCurrentAuthorization && !proof.checks.authorizationCurrentlyActive) {
    reasons.push('AUTHORIZATION_NOT_CURRENTLY_ACTIVE');
  }

  if (requirements.requirePayloadMatch && proof.checks.payloadMatches !== true) {
    reasons.push(proof.checks.payloadMatches === false ? 'PAYLOAD_MISMATCH' : 'PAYLOAD_NOT_PROVIDED');
  }

  if (requirements.requireAttestation && !proof.checks.attested) {
    reasons.push('ATTESTATION_REQUIRED');
  }

  if (requirements.expectedAgent && proof.action
    && proof.action.agent.toLowerCase() !== requirements.expectedAgent.toLowerCase()) {
    reasons.push('UNEXPECTED_AGENT');
  }

  if (requirements.maxValue !== undefined && proof.action && proof.action.value > requirements.maxValue) {
    reasons.push('VALUE_EXCEEDS_TRUST_LIMIT');
  }

  return {
    verdict: reasons.length === 0 ? 'ACCEPT' : 'REJECT',
    reasons,
  };
}
