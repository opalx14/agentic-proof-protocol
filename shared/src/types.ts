import { z } from 'zod';

export const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'expected EVM address');
export const Hex32Schema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'expected bytes32 hex');
export const UintStringSchema = z.string().regex(/^\d+$/, 'expected unsigned integer string');

export type Address = `0x${string}`;
export type Hex32 = `0x${string}`;

export const ProposedActionSchema = z.object({
  agent: AddressSchema,
  actionType: z.string().trim().min(1).max(64),
  scopeHash: Hex32Schema,
  value: UintStringSchema.default('0'),
  currency: z.string().trim().min(1).max(24).default('NONE'),
  resource: z.string().trim().max(256).default(''),
  nonce: UintStringSchema,
  expiresAt: z.string().datetime().nullable().optional(),
  payloadHash: Hex32Schema.optional(),
  traceRoot: Hex32Schema.optional(),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
});
export type ProposedAction = z.infer<typeof ProposedActionSchema>;

export const PolicySchema = z.object({
  version: z.number().int().positive(),
  agentAddress: AddressSchema,
  enabled: z.boolean().default(true),
  allowedActionTypes: z.array(z.string().trim().min(1).max(64)).max(64).default([]),
  allowedScopeHashes: z.array(Hex32Schema).max(128).default([]),
  maxValue: UintStringSchema.default('0'),
  approvalAboveValue: UintStringSchema.nullable().default(null),
  validUntil: z.string().datetime().nullable().default(null),
  updatedAt: z.string().datetime(),
});
export type Policy = z.infer<typeof PolicySchema>;

export type PolicyVerdict = 'ALLOW' | 'BLOCK' | 'ESCALATE';

export type PolicyCode =
  | 'AGENT_FROZEN'
  | 'WRONG_AGENT'
  | 'ACTION_NOT_ALLOWED'
  | 'SCOPE_NOT_ALLOWED'
  | 'POLICY_EXPIRED'
  | 'ACTION_EXPIRED'
  | 'AUTHORIZATION_NOT_YET_VALID'
  | 'AUTHORIZATION_EXPIRED'
  | 'AUTHORIZATION_REVOKED'
  | 'AUTHORIZATION_MISMATCH'
  | 'VALUE_EXCEEDS_HARD_LIMIT'
  | 'APPROVAL_REQUIRED'
  | 'REPLAYED_NONCE';

export type AuthorizationContext = {
  actionType: string;
  scopeHash: Hex32;
  maxValue: string;
  validAfter: number;
  validUntil: number;
  revoked: boolean;
};

export type PolicyEvaluationContext = {
  nowMs?: number;
  usedNonces?: ReadonlySet<string>;
  authorization?: AuthorizationContext | null;
};

export type PolicyDecision = {
  verdict: PolicyVerdict;
  code?: PolicyCode;
  reasons: string[];
  policyVersion: number;
  action: ProposedAction;
};

export type AgentRecord = {
  agentId: Hex32;
  agent: Address;
  owner: Address;
  metadataHash: Hex32;
  active: boolean;
};

export type AuthorizationRecord = {
  authorizationId: Hex32;
  user: Address;
  agent: Address;
  actionType: Hex32;
  scopeHash: Hex32;
  maxValue: bigint;
  validAfter: bigint;
  validUntil: bigint;
  nonce: bigint;
  revoked: boolean;
  revokedAt: bigint;
  attestor: Address;
  singleUse: boolean;
  actionCount: bigint;
};

export type ActionProofRecord = {
  actionId: Hex32;
  authorizationId: Hex32;
  actionType: Hex32;
  scopeHash: Hex32;
  actionHash: Hex32;
  traceRoot: Hex32;
  value: bigint;
  recordedAt: bigint;
  agent: Address;
};

export type OutcomeAttestationRecord = {
  actionId: Hex32;
  resultHash: Hex32;
  status: Hex32;
  attestor: Address;
  attestedAt: bigint;
};

export type ProofBundle = {
  authorization: AuthorizationRecord | null;
  action: ActionProofRecord | null;
  attestation: OutcomeAttestationRecord | null;
  checks: {
    existsOnchain: boolean;
    authorizationValidAtActionTime: boolean;
    authorizationCurrentlyActive: boolean;
    attested: boolean;
    payloadMatches?: boolean;
  };
};

export const ActionPrepareRequestSchema = z.object({
  authorizationId: Hex32Schema,
  action: ProposedActionSchema,
  payload: z.unknown(),
});
export type ActionPrepareRequest = z.infer<typeof ActionPrepareRequestSchema>;
