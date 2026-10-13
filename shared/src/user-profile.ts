import { encodeAbiParameters, keccak256, stringToHex } from 'viem';
import { z } from 'zod';
import { hashEvmValue } from './hash';
import {
  AddressSchema,
  Hex32Schema,
  UintStringSchema,
  type Address,
  type Hex32,
  type ProposedAction,
} from './types';

export const PROFILE_SCOPE_DOMAIN = keccak256(stringToHex('APP_PROFILE_SCOPE_V1')) as Hex32;

export const ProfilePersonaSchema = z.enum([
  'PERSONAL',
  'BUSINESS_TRAVELER',
  'PROCUREMENT_OFFICER',
  'DEFI_OPERATOR',
]);
export type ProfilePersona = z.infer<typeof ProfilePersonaSchema>;

export const ProfilePolicySchema = z.object({
  allowedActionTypes: z.array(z.string().trim().min(1).max(64)).min(1).max(64),
  allowedScopeHashes: z.array(Hex32Schema).max(128).default([]),
  maxPerAction: UintStringSchema,
  dailyBudget: UintStringSchema,
  approvalAboveValue: UintStringSchema.nullable().default(null),
});
export type ProfilePolicy = z.infer<typeof ProfilePolicySchema>;

export const UserProfileSchema = z.object({
  version: z.literal('1'),
  user: AddressSchema,
  alias: z.string().trim().min(1).max(64),
  persona: ProfilePersonaSchema,
  policy: ProfilePolicySchema,
  encryptionKeyCommitment: Hex32Schema,
  createdAt: z.string().datetime(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export type ProfilePolicyCode =
  | 'PROFILE_ACTION_NOT_ALLOWED'
  | 'PROFILE_SCOPE_NOT_ALLOWED'
  | 'PROFILE_VALUE_EXCEEDS_LIMIT'
  | 'PROFILE_DAILY_BUDGET_EXCEEDED'
  | 'PROFILE_APPROVAL_REQUIRED';

export type ProfilePolicyDecision = {
  verdict: 'ALLOW' | 'BLOCK' | 'ESCALATE';
  code?: ProfilePolicyCode;
  reasons: string[];
  profileHash: Hex32;
  action: ProposedAction;
};

export type ProfilePolicyContext = {
  spentToday?: bigint | string;
};

export function createUserProfile(
  user: Address,
  input: Omit<UserProfile, 'version' | 'user'>,
): UserProfile {
  return UserProfileSchema.parse({ version: '1', user, ...input });
}

export function createUserProfileHash(profile: UserProfile): Hex32 {
  return hashEvmValue(UserProfileSchema.parse(profile));
}

export function createProfilePolicyHash(policy: ProfilePolicy): Hex32 {
  return hashEvmValue(ProfilePolicySchema.parse(policy));
}

export function createProfileBoundScopeHash(profileHash: Hex32, actionScopeHash: Hex32): Hex32 {
  return keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }],
    [PROFILE_SCOPE_DOMAIN, profileHash, actionScopeHash],
  )) as Hex32;
}

export function evaluateProfilePolicy(
  profile: UserProfile,
  action: ProposedAction,
  context: ProfilePolicyContext = {},
): ProfilePolicyDecision {
  const parsed = UserProfileSchema.parse(profile);
  const profileHash = createUserProfileHash(parsed);
  const policy = parsed.policy;
  const requestedValue = BigInt(action.value);

  const actionAllowed = policy.allowedActionTypes.some(
    (allowed) => allowed.trim().toUpperCase() === action.actionType.trim().toUpperCase(),
  );
  if (!actionAllowed) {
    return {
      verdict: 'BLOCK',
      code: 'PROFILE_ACTION_NOT_ALLOWED',
      reasons: [`${action.actionType} is outside the personal profile policy`],
      profileHash,
      action,
    };
  }

  if (
    policy.allowedScopeHashes.length > 0
    && !policy.allowedScopeHashes.some((scope) => scope.toLowerCase() === action.scopeHash.toLowerCase())
  ) {
    return {
      verdict: 'BLOCK',
      code: 'PROFILE_SCOPE_NOT_ALLOWED',
      reasons: ['action scope is outside the personal profile policy'],
      profileHash,
      action,
    };
  }

  if (requestedValue > BigInt(policy.maxPerAction)) {
    return {
      verdict: 'BLOCK',
      code: 'PROFILE_VALUE_EXCEEDS_LIMIT',
      reasons: [`requested value ${requestedValue} exceeds profile per-action limit ${policy.maxPerAction}`],
      profileHash,
      action,
    };
  }

  const spentToday = BigInt(context.spentToday ?? 0n);
  if (spentToday + requestedValue > BigInt(policy.dailyBudget)) {
    return {
      verdict: 'BLOCK',
      code: 'PROFILE_DAILY_BUDGET_EXCEEDED',
      reasons: [`daily profile budget ${policy.dailyBudget} would be exceeded`],
      profileHash,
      action,
    };
  }

  if (policy.approvalAboveValue !== null && requestedValue > BigInt(policy.approvalAboveValue)) {
    return {
      verdict: 'ESCALATE',
      code: 'PROFILE_APPROVAL_REQUIRED',
      reasons: [`requested value ${requestedValue} requires explicit profile-owner approval`],
      profileHash,
      action,
    };
  }

  return {
    verdict: 'ALLOW',
    reasons: ['action satisfies the personal profile policy envelope'],
    profileHash,
    action,
  };
}
