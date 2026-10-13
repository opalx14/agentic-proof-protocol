import { describe, expect, it } from 'vitest';
import {
  PROCUREMENT_REFERENCE_SCENARIO,
  TRAVEL_REFERENCE_SCENARIO,
  actionForScenario,
  evaluatePolicy,
  policyForScenario,
} from '../src/index.js';

const agent = '0x1111111111111111111111111111111111111111' as const;

describe('reference integrations share the same protocol policy engine', () => {
  for (const scenario of [TRAVEL_REFERENCE_SCENARIO, PROCUREMENT_REFERENCE_SCENARIO]) {
    it(`${scenario.id}: allows an in-scope action and blocks an over-cap action`, () => {
      const policy = policyForScenario(agent, scenario);
      const allowed = evaluatePolicy(policy, actionForScenario(agent, scenario));
      expect(allowed.verdict).toBe('ALLOW');

      const blocked = evaluatePolicy(
        policy,
        actionForScenario(agent, scenario, { value: scenario.rejectedValue, nonce: '2' }),
      );
      expect(blocked.verdict).toBe('BLOCK');
      expect(blocked.code).toBe('VALUE_EXCEEDS_HARD_LIMIT');
    });
  }

  it('binds each integration to a different action type and scope', () => {
    const travelPolicy = policyForScenario(agent, TRAVEL_REFERENCE_SCENARIO);
    const procurementAction = actionForScenario(agent, PROCUREMENT_REFERENCE_SCENARIO);
    const decision = evaluatePolicy(travelPolicy, procurementAction);
    expect(decision.verdict).toBe('BLOCK');
    expect(decision.code).toBe('ACTION_NOT_ALLOWED');
  });
});
