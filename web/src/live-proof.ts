import type { Address, Hex32 } from '@agentic-proof/shared';

// Public Monad Testnet evidence, not a mock or an authorization that is still active.
// Keep these identifiers in sync with docs/SUBMISSION.md and the verified explorer receipts.
export const LIVE_PROOF = {
  chainId: 10143,
  registry: '0xC8E9E58ad418c6A2bf6229216068B16f32454010' as Address,
  actionId: '0x7606c8e32a09ffbcd524b37b6e82a27ecccd5c61ad8e7b4ed2d0162716f404cf' as Hex32,
  actionHash: '0x1c758ec79d8a60261a929548c7a72c9cd0e2f5f6fd5b7bad0b558c6e2641eb9f' as Hex32,
  grantTx: '0xcc1c68899329d4ddbd47484384d60642333af96ad248d70fb81be7bc88c8ef1c' as Hex32,
  recordTx: '0x3ad43d492503683fd8f88efc834ee9cd81ce978648c8ec44c0d951c4398b70bc' as Hex32,
  revokeTx: '0xea71925b9ee2a77e42c6f556815d3a9d4bb8f4a8a87c22ee81c77aa9fd53072a' as Hex32,
} as const;

export const REFERENCE_TRAVEL_PAYLOAD = {
  tripId: 'travel-demo-sgn-sin',
  route: 'SGN → SIN',
  cabin: 'economy',
  selectedOffer: 'DEMO-OFFER-361',
  totalUsd: 361,
  providerMode: 'DEMO',
} as const;

// A sample payload is only offered for the specific, historically recorded proof.
// Other actions must supply their own private payload and must never inherit this demo sample.
export function getLiveProofSample(actionId: string, chainId?: number, registry?: string) {
  if (chainId !== LIVE_PROOF.chainId
    || registry?.toLowerCase() !== LIVE_PROOF.registry.toLowerCase()
    || actionId.toLowerCase() !== LIVE_PROOF.actionId.toLowerCase()) {
    return null;
  }
  return REFERENCE_TRAVEL_PAYLOAD;
}
