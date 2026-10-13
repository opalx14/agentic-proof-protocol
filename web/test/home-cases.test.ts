import { describe, expect, test } from 'bun:test';
import { getCasePage, getCasePageCount, HOME_CASES, LIVE_ACTION_ID } from '../src/home-cases';

describe('homepage case pagination', () => {
  test('shows two compact cases per page', () => {
    expect(getCasePageCount()).toBe(2);
    expect(getCasePage(0).map((item) => item.id)).toEqual(['travel-proof', 'tamper-check']);
    expect(getCasePage(1).map((item) => item.id)).toEqual(['policy-cap', 'remote-mcp']);
  });

  test('clamps negative pages and leaves out-of-range pages empty', () => {
    expect(getCasePage(-10)[0]?.id).toBe('travel-proof');
    expect(getCasePage(99)).toEqual([]);
  });

  test('keeps live proof cases wired to the canonical action', () => {
    const live = HOME_CASES.filter((item) => item.live);
    expect(live).toHaveLength(2);
    for (const item of live) {
      expect(item.href).toBe(`/verify/${LIVE_ACTION_ID}`);
    }
  });
});
