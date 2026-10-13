import { z } from 'zod';
import { createActionHash, createScopeHash } from './hash';
import { AddressSchema, type Address, type Hex32, type ProposedAction } from './types';

export const TravelQuoteSourceSchema = z.enum(['DEMO', 'ATLAS', 'PROVIDER']);
export type TravelQuoteSource = z.infer<typeof TravelQuoteSourceSchema>;

/**
 * A provider quote that has been observed and (when the provider supports it)
 * re-verified immediately before policy/authorization. This mirrors the
 * search -> verify -> authorize separation used by production travel adapters.
 */
export const TravelQuoteSchema = z.object({
  version: z.literal('1'),
  source: TravelQuoteSourceSchema,
  provider: z.string().trim().min(1).max(96),
  offerId: z.string().trim().min(1).max(160),
  origin: z.string().trim().min(3).max(8).transform((value) => value.toUpperCase()),
  destination: z.string().trim().min(3).max(8).transform((value) => value.toUpperCase()),
  cabin: z.string().trim().min(1).max(32).transform((value) => value.toLowerCase()),
  total: z.string().regex(/^\d+$/, 'expected unsigned integer string'),
  currency: z.string().trim().min(1).max(24).transform((value) => value.toUpperCase()),
  observedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type TravelQuote = z.infer<typeof TravelQuoteSchema>;

export type TravelQuoteActionBundle = {
  quote: TravelQuote;
  quoteHash: Hex32;
  scope: {
    kind: 'APP_TRAVEL_VERIFIED_QUOTE';
    provider: string;
    offerId: string;
    origin: string;
    destination: string;
    cabin: string;
    currency: string;
    quoteHash: Hex32;
  };
  action: ProposedAction;
  payload: {
    kind: 'APP_TRAVEL_QUOTE';
    version: '1';
    source: TravelQuoteSource;
    provider: string;
    offerId: string;
    origin: string;
    destination: string;
    cabin: string;
    total: string;
    currency: string;
    observedAt: string;
    expiresAt: string;
  };
};

export function createTravelQuoteHash(input: TravelQuote): Hex32 {
  const quote = TravelQuoteSchema.parse(input);
  return createActionHash(quote);
}

/**
 * Exact-quote scope. Re-verification that changes provider, offer, amount,
 * expiry, route, cabin or currency creates a different quote hash and scope.
 */
export function createTravelQuoteScopeHash(input: TravelQuote): Hex32 {
  const quote = TravelQuoteSchema.parse(input);
  const quoteHash = createTravelQuoteHash(quote);
  return createScopeHash({
    kind: 'APP_TRAVEL_VERIFIED_QUOTE',
    provider: quote.provider,
    offerId: quote.offerId,
    origin: quote.origin,
    destination: quote.destination,
    cabin: quote.cabin,
    currency: quote.currency,
    quoteHash,
  });
}

export function travelQuoteToAction(input: {
  agent: Address;
  nonce: string;
  quote: TravelQuote;
}): TravelQuoteActionBundle {
  const agent = AddressSchema.parse(input.agent) as Address;
  const quote = TravelQuoteSchema.parse(input.quote);
  const quoteHash = createTravelQuoteHash(quote);
  const scope = {
    kind: 'APP_TRAVEL_VERIFIED_QUOTE' as const,
    provider: quote.provider,
    offerId: quote.offerId,
    origin: quote.origin,
    destination: quote.destination,
    cabin: quote.cabin,
    currency: quote.currency,
    quoteHash,
  };
  const payload = {
    kind: 'APP_TRAVEL_QUOTE' as const,
    version: '1' as const,
    source: quote.source,
    provider: quote.provider,
    offerId: quote.offerId,
    origin: quote.origin,
    destination: quote.destination,
    cabin: quote.cabin,
    total: quote.total,
    currency: quote.currency,
    observedAt: quote.observedAt,
    expiresAt: quote.expiresAt,
  };

  return {
    quote,
    quoteHash,
    scope,
    action: {
      agent,
      actionType: 'BOOK_TRAVEL',
      scopeHash: createScopeHash(scope),
      value: quote.total,
      currency: quote.currency,
      resource: `travel:${quote.origin}-${quote.destination}:${quote.offerId}`,
      nonce: input.nonce,
      expiresAt: quote.expiresAt,
      payloadHash: createActionHash(payload),
    },
    payload,
  };
}

export function travelQuoteChanged(previous: TravelQuote, current: TravelQuote): boolean {
  return createTravelQuoteHash(previous) !== createTravelQuoteHash(current);
}
