import { describe, expect, test } from 'bun:test';
import { createActionHash } from '@agentic-proof/shared';
import { getLiveProofSample, LIVE_PROOF, REFERENCE_TRAVEL_PAYLOAD } from '../src/live-proof';

describe('public live-proof reference', () => {
  test('the documented $361 sample exactly matches the recorded Monad action commitment', () => {
    expect(createActionHash(REFERENCE_TRAVEL_PAYLOAD)).toBe(LIVE_PROOF.actionHash);
    expect(createActionHash({ ...REFERENCE_TRAVEL_PAYLOAD, totalUsd: 399 })).not.toBe(LIVE_PROOF.actionHash);
  });

  test('only the canonical action and live registry can offer the reference payload', () => {
    expect(getLiveProofSample(LIVE_PROOF.actionId, LIVE_PROOF.chainId, LIVE_PROOF.registry)).toEqual(REFERENCE_TRAVEL_PAYLOAD);
    expect(getLiveProofSample(LIVE_PROOF.actionId, 1, LIVE_PROOF.registry)).toBeNull();
    expect(getLiveProofSample(LIVE_PROOF.actionId, LIVE_PROOF.chainId, '0x1111111111111111111111111111111111111111')).toBeNull();
    expect(getLiveProofSample('0x' + '00'.repeat(32), LIVE_PROOF.chainId, LIVE_PROOF.registry)).toBeNull();
  });
});
