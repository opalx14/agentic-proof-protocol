import type {
  Policy,
  PolicyDecision,
  PolicyEvaluationContext,
  ProposedAction,
} from './types';

function block(policy: Policy, action: ProposedAction, code: PolicyDecision['code'], reason: string): PolicyDecision {
  return {
    verdict: 'BLOCK',
    code,
    reasons: [reason],
    policyVersion: policy.version,
    action,
  };
}

function escalation(policy: Policy, action: ProposedAction, reason: string): PolicyDecision {
  return {
    verdict: 'ESCALATE',
    code: 'APPROVAL_REQUIRED',
    reasons: [reason],
    policyVersion: policy.version,
    action,
  };
}

/**
 * Deterministic, synchronous, fail-closed policy engine adapted from the NexusWallet
 * policy boundary. The model may propose an action, but only this function decides
 * whether the application is allowed to continue automatically.
 */
export function evaluatePolicy(
  policy: Policy,
  action: ProposedAction,
  context: PolicyEvaluationContext = {},
): PolicyDecision {
  const nowMs = context.nowMs ?? Date.now();

  if (!policy.enabled) return block(policy, action, 'AGENT_FROZEN', 'agent is disabled by the owner');

  if (policy.agentAddress.toLowerCase() !== action.agent.toLowerCase()) {
    return block(policy, action, 'WRONG_AGENT', 'action was proposed by a different agent');
  }

  if (!policy.allowedActionTypes.includes(action.actionType)) {
    return block(policy, action, 'ACTION_NOT_ALLOWED', `action type ${action.actionType} is not allowed`);
  }

  if (
    policy.allowedScopeHashes.length > 0
    && !policy.allowedScopeHashes.some((hash) => hash.toLowerCase() === action.scopeHash.toLowerCase())
  ) {
    return block(policy, action, 'SCOPE_NOT_ALLOWED', 'scope commitment is not allowed by policy');
  }

  if (policy.validUntil && new Date(policy.validUntil).getTime() <= nowMs) {
    return block(policy, action, 'POLICY_EXPIRED', 'policy validity window has expired');
  }

  if (action.expiresAt && new Date(action.expiresAt).getTime() <= nowMs) {
    return block(policy, action, 'ACTION_EXPIRED', 'proposed action has expired');
  }

  if (context.usedNonces?.has(action.nonce)) {
    return block(policy, action, 'REPLAYED_NONCE', 'action nonce was already consumed');
  }

  const requestedValue = BigInt(action.value);
  const hardLimit = BigInt(policy.maxValue);
  if (requestedValue > hardLimit) {
    return block(
      policy,
      action,
      'VALUE_EXCEEDS_HARD_LIMIT',
      `requested value ${requestedValue} exceeds hard policy limit ${hardLimit}`,
    );
  }

  const auth = context.authorization;
  if (auth) {
    const nowSeconds = Math.floor(nowMs / 1000);
    if (auth.revoked) {
      return block(policy, action, 'AUTHORIZATION_REVOKED', 'onchain authorization is revoked');
    }
    if (nowSeconds < auth.validAfter) {
      return block(policy, action, 'AUTHORIZATION_NOT_YET_VALID', 'onchain authorization is not active yet');
    }
    if (nowSeconds > auth.validUntil) {
      return block(policy, action, 'AUTHORIZATION_EXPIRED', 'onchain authorization has expired');
    }
    if (
      auth.actionType !== action.actionType
      || auth.scopeHash.toLowerCase() !== action.scopeHash.toLowerCase()
      || requestedValue > BigInt(auth.maxValue)
    ) {
      return block(policy, action, 'AUTHORIZATION_MISMATCH', 'proposed action does not match onchain authorization');
    }
  }

  if (policy.approvalAboveValue !== null && requestedValue > BigInt(policy.approvalAboveValue)) {
    return escalation(
      policy,
      action,
      `requested value ${requestedValue} exceeds automatic execution threshold ${policy.approvalAboveValue}`,
    );
  }

  return {
    verdict: 'ALLOW',
    reasons: ['agent, action type, scope, time window and value satisfy deterministic policy'],
    policyVersion: policy.version,
    action,
  };
}

export function defaultPolicy(agentAddress: `0x${string}`): Policy {
  return {
    version: 1,
    agentAddress,
    enabled: true,
    allowedActionTypes: ['BOOK_TRAVEL'],
    allowedScopeHashes: [],
    maxValue: '400000000',
    approvalAboveValue: null,
    validUntil: null,
    updatedAt: new Date().toISOString(),
  };
}
