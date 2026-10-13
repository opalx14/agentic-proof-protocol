import type { Policy, PolicyDecision, ProposedAction } from '@agentic-proof/shared';

export const AGENT_API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL ?? '/agent-api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${AGENT_API_URL.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const record = body as Record<string, unknown>;
    throw new Error(String(record.message ?? record.error ?? `HTTP ${response.status}`));
  }
  return body as T;
}

export type RuntimeConfig = {
  chainId: number | null;
  rpcConfigured: boolean;
  contractAddress: `0x${string}` | null;
  explorerUrl: string | null;
  agentAddress: `0x${string}`;
};

export function getRuntimeConfig() {
  return request<RuntimeConfig>('/api/config');
}

export function getPolicy() {
  return request<Policy>('/api/policy');
}

export type AgentProposal = {
  action: ProposedAction;
  payload: {
    tripId: string;
    route: 'SGN → SIN';
    cabin: 'economy';
    selectedOffer: 'DEMO-OFFER-361' | 'DEMO-OFFER-399' | 'DEMO-OFFER-401';
    totalUsd: 361 | 399 | 401;
    providerMode: 'DEMO';
  };
  rationale: string;
  model: {
    provider: 'groq' | 'deterministic';
    model: string;
    fallback: boolean;
    ms: number;
    error?: string;
  };
};

export function proposeAction(input: { prompt: string; agent: `0x${string}`; scopeHash: `0x${string}` }) {
  return request<AgentProposal>('/api/proposal', { method: 'POST', body: JSON.stringify(input) });
}

export function updatePolicy(policy: Policy) {
  return request<Policy>('/api/policy', { method: 'PUT', body: JSON.stringify(policy) });
}

export function registerReferenceAgent() {
  return request<{ alreadyRegistered: boolean; agentId: `0x${string}`; txHash?: `0x${string}`; status?: string }>(
    '/api/agent/register',
    { method: 'POST', body: '{}' },
  );
}

export function evaluateAction(action: ProposedAction) {
  return request<PolicyDecision>('/api/policy/evaluate', { method: 'POST', body: JSON.stringify(action) });
}

export type PrepareActionInput = {
  authorizationId: `0x${string}`;
  action: ProposedAction;
  payload: unknown;
};

export type PreparedAction = {
  actionHash: `0x${string}`;
  actionTypeHash: `0x${string}`;
  actionId: `0x${string}`;
  traceRoot: `0x${string}`;
  decision: PolicyDecision;
  txArgs: unknown[];
};

export function prepareAction(input: PrepareActionInput) {
  return request<PreparedAction>('/api/action/prepare', { method: 'POST', body: JSON.stringify(input) });
}

export function recordAction(input: PrepareActionInput) {
  return request<Record<string, unknown>>('/api/action/record', { method: 'POST', body: JSON.stringify(input) });
}

export function getAudit() {
  return request<{ integrity: { valid: boolean; reason?: string }; entries: Array<Record<string, unknown>> }>('/api/audit');
}
