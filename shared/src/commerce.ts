import { z } from 'zod';
import { createScopeHash } from './hash';
import { AddressSchema, UintStringSchema, type Address, type ProposedAction } from './types';

/**
 * A machine-readable service/payment requirement inspired by HTTP 402-style
 * agent commerce. APP never signs or settles the payment; it turns the
 * requirement into a typed action that must pass deterministic policy first.
 */
export const CommerceChallengeSchema = z.object({
  version: z.literal('1'),
  network: z.string().trim().min(1).max(64),
  asset: z.string().trim().min(1).max(64),
  payTo: z.string().trim().min(1).max(256),
  amount: UintStringSchema,
  resource: z.string().trim().min(1).max(256),
  requestId: z.string().trim().min(1).max(128).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});
export type CommerceChallenge = z.infer<typeof CommerceChallengeSchema>;

export const CommerceActionInputSchema = z.object({
  agent: AddressSchema,
  nonce: UintStringSchema,
  challenge: CommerceChallengeSchema,
});
export type CommerceActionInput = z.infer<typeof CommerceActionInputSchema>;

export type CommerceActionBundle = {
  action: ProposedAction;
  scope: {
    network: string;
    asset: string;
    payTo: string;
    resource: string;
  };
  payload: {
    kind: 'APP_COMMERCE_CHALLENGE';
    version: '1';
    network: string;
    asset: string;
    payTo: string;
    amount: string;
    resource: string;
    requestId?: string;
    expiresAt?: string | null;
  };
};

/**
 * Convert a payment/service challenge into APP's existing authorization model.
 * The amount remains the policy value while recipient/network/resource are
 * bound into the scope commitment so an approved proof cannot be redirected.
 */
export function commerceChallengeToAction(input: CommerceActionInput): CommerceActionBundle {
  const parsed = CommerceActionInputSchema.parse(input);
  const challenge = parsed.challenge;
  const scope = {
    network: challenge.network,
    asset: challenge.asset,
    payTo: challenge.payTo,
    resource: challenge.resource,
  };

  const payload: CommerceActionBundle['payload'] = {
    kind: 'APP_COMMERCE_CHALLENGE',
    version: '1',
    network: challenge.network,
    asset: challenge.asset,
    payTo: challenge.payTo,
    amount: challenge.amount,
    resource: challenge.resource,
    ...(challenge.requestId ? { requestId: challenge.requestId } : {}),
    ...(challenge.expiresAt !== undefined ? { expiresAt: challenge.expiresAt } : {}),
  };

  const action: ProposedAction = {
    agent: parsed.agent as Address,
    actionType: 'PAY_SERVICE',
    scopeHash: createScopeHash(scope),
    value: challenge.amount,
    currency: challenge.asset,
    resource: challenge.resource,
    nonce: parsed.nonce,
    ...(challenge.expiresAt ? { expiresAt: challenge.expiresAt } : {}),
  };

  return { action, scope, payload };
}
