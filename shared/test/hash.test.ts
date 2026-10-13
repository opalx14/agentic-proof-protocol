import { describe, expect, it } from 'vitest';
import { canonicalize, createActionHash, createScopeHash } from '../src/index.js';

describe('canonical hashing', () => {
  it('sorts object keys deterministically', () => {
    expect(canonicalize({ b: 2, a: 1 })).toBe(canonicalize({ a: 1, b: 2 }));
    expect(createActionHash({ b: 2, a: 1 })).toBe(createActionHash({ a: 1, b: 2 }));
  });

  it('changes action hash when payload changes', () => {
    expect(createActionHash({ amount: 361 })).not.toBe(createActionHash({ amount: 362 }));
  });

  it('produces a bytes32 EVM scope hash', () => {
    expect(createScopeHash({ vendor: 'demo' })).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
