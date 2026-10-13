import { describe, expect, it } from 'vitest';
import { TOOL_NAMES } from '../src/tools.js';

describe('MCP privilege boundary', () => {
  it('does not expose self-authorization or owner-control tools', () => {
    const joined = TOOL_NAMES.join(' ').toLowerCase();
    expect(joined).not.toContain('grant');
    expect(joined).not.toContain('revoke');
    expect(joined).not.toContain('policy_update');
    expect(joined).not.toContain('attest_outcome');
  });

  it('only exposes read/evaluate/prepare/verify operations', () => {
    expect(TOOL_NAMES).toEqual([
      'agenticproof_get_status',
      'agenticproof_evaluate_action',
      'agenticproof_prepare_action',
      'agenticproof_verify_action',
    ]);
  });
});
