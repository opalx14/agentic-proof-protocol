import { createScopeHash } from './hash';
import { createAgentManifest, type AgentManifest } from './agent-manifest';
import type { Address, Policy, ProposedAction } from './types';

export type ReferenceScenario = {
  id: 'travel' | 'procurement';
  name: string;
  actionType: string;
  scope: Record<string, unknown>;
  maxValue: string;
  proposedValue: string;
  rejectedValue: string;
  currency: string;
  resource: string;
};

export const TRAVEL_REFERENCE_SCENARIO: ReferenceScenario = {
  id: 'travel',
  name: 'Travel Agent',
  actionType: 'BOOK_TRAVEL',
  scope: {
    origin: 'SGN',
    destination: 'SIN',
    tripType: 'round_trip',
    cabin: 'economy',
  },
  maxValue: '400000000',
  proposedValue: '361000000',
  rejectedValue: '401000000',
  currency: 'USDC6',
  resource: 'travel:SGN-SIN',
};

export const PROCUREMENT_REFERENCE_SCENARIO: ReferenceScenario = {
  id: 'procurement',
  name: 'Procurement Agent',
  actionType: 'PURCHASE_ITEM',
  scope: {
    vendor: 'APPROVED_VENDOR_A',
    category: 'WORK_EQUIPMENT',
  },
  maxValue: '200000000',
  proposedValue: '120000000',
  rejectedValue: '500000000',
  currency: 'USDC6',
  resource: 'catalog:keyboard-pro',
};

export const REFERENCE_SCENARIOS = [
  TRAVEL_REFERENCE_SCENARIO,
  PROCUREMENT_REFERENCE_SCENARIO,
] as const;

export function referenceAgentManifest(agentAddress: Address): AgentManifest {
  return createAgentManifest(agentAddress, {
    name: 'Agentic Proof Reference Agent',
    role: 'travel-procurement-commerce',
    capabilities: [
      { actionType: 'BOOK_TRAVEL', description: 'Book travel inside a user-authorized route, budget and time window.' },
      { actionType: 'PURCHASE_ITEM', description: 'Purchase an approved catalog item inside a user-owned procurement scope.' },
      { actionType: 'PAY_SERVICE', description: 'Prepare a policy-governed machine-readable service payment challenge.' },
    ],
  });
}

export function policyForScenario(agentAddress: Address, scenario: ReferenceScenario): Policy {
  return {
    version: 1,
    agentAddress,
    enabled: true,
    allowedActionTypes: [scenario.actionType],
    allowedScopeHashes: [createScopeHash(scenario.scope)],
    maxValue: scenario.maxValue,
    approvalAboveValue: null,
    validUntil: null,
    updatedAt: new Date(0).toISOString(),
  };
}

export function actionForScenario(
  agentAddress: Address,
  scenario: ReferenceScenario,
  options: { value?: string; nonce?: string } = {},
): ProposedAction {
  return {
    agent: agentAddress,
    actionType: scenario.actionType,
    scopeHash: createScopeHash(scenario.scope),
    value: options.value ?? scenario.proposedValue,
    currency: scenario.currency,
    resource: scenario.resource,
    nonce: options.nonce ?? '1',
  };
}
