// Adapted from NexusWallet's MIT-licensed MCP boundary: agents may propose/read, never self-authorize.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { commerceChallengeToAction } from '@agentic-proof/shared';

export const TOOL_NAMES = [
  'agenticproof_get_status',
  'agenticproof_evaluate_action',
  'agenticproof_prepare_action',
  'agenticproof_verify_action',
] as const;

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const hex32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

function ok(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function fail(code: string, message: string, extra: Record<string, unknown> = {}): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: code, message, ...extra }, null, 2) }],
  };
}

async function callApi(apiUrl: string, path: string, init?: RequestInit, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const response = await fetchImpl(`${apiUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const record = body as Record<string, unknown>;
    throw new Error(String(record.message ?? record.error ?? `HTTP ${response.status}`));
  }
  return body;
}

export function createServer(apiUrl = process.env.AGENTIC_PROOF_API_URL ?? 'http://127.0.0.1:8787', fetchImpl: typeof fetch = fetch): McpServer {
  const server = new McpServer(
    { name: 'agentic-proof-protocol', version: '0.1.0' },
    {
      instructions: [
        'You may inspect protocol state, evaluate proposed actions and prepare action commitments.',
        'You cannot grant authorization, change policy, revoke owner authority, or attest a provider outcome.',
        'If policy returns BLOCK or ESCALATE, do not bypass it.',
        'If execution outcome is unknown, reuse the same idempotency key and verify before any retry.',
      ].join(' '),
    },
  );

  server.registerTool(
    'agenticproof_get_status',
    {
      title: 'Get Agentic Proof status',
      description: 'Read public runtime configuration and current deterministic policy.',
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const [config, policy] = await Promise.all([
          callApi(apiUrl, '/api/config', undefined, fetchImpl),
          callApi(apiUrl, '/api/policy', undefined, fetchImpl),
        ]);
        return ok({ config, policy });
      } catch (error) {
        return fail('agent_unreachable', error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'agenticproof_evaluate_action',
    {
      title: 'Evaluate an AI agent action',
      description: 'Submit a proposed action to the deterministic ALLOW/BLOCK/ESCALATE policy gate. This does not execute anything.',
      inputSchema: {
        agent: address,
        actionType: z.string().trim().min(1).max(64),
        scopeHash: hex32,
        value: z.string().regex(/^\d+$/),
        currency: z.string().trim().min(1).max(24).default('NONE'),
        resource: z.string().trim().max(256).default(''),
        nonce: z.string().regex(/^\d+$/),
        expiresAt: z.string().datetime().optional(),
        idempotencyKey: z.string().trim().min(1).max(128).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (action) => {
      try {
        return ok(await callApi(apiUrl, '/api/policy/evaluate', {
          method: 'POST',
          body: JSON.stringify(action),
        }, fetchImpl));
      } catch (error) {
        return fail('evaluation_failed', error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'agenticproof_prepare_action',
    {
      title: 'Prepare an action proof',
      description: 'Create deterministic action data after policy evaluation. Accepts either a typed APP action or a machine-readable commerce challenge. Preparation never signs or sends a transaction.',
      inputSchema: {
        authorizationId: hex32,
        action: z.object({
          agent: address,
          actionType: z.string().trim().min(1).max(64),
          scopeHash: hex32,
          value: z.string().regex(/^\d+$/),
          currency: z.string().trim().min(1).max(24).default('NONE'),
          resource: z.string().trim().max(256).default(''),
          nonce: z.string().regex(/^\d+$/),
          expiresAt: z.string().datetime().optional(),
          traceRoot: hex32.optional(),
          idempotencyKey: z.string().trim().min(1).max(128).optional(),
        }).optional(),
        payload: z.unknown().optional(),
        commerceChallenge: z.object({
          version: z.literal('1'),
          network: z.string().trim().min(1).max(64),
          asset: z.string().trim().min(1).max(64),
          payTo: z.string().trim().min(1).max(256),
          amount: z.string().regex(/^\d+$/),
          resource: z.string().trim().min(1).max(256),
          requestId: z.string().trim().min(1).max(128).optional(),
          expiresAt: z.string().datetime().nullable().optional(),
        }).optional(),
        commerceAgent: address.optional(),
        commerceNonce: z.string().regex(/^\d+$/).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      try {
        let requestBody: unknown;
        if (input.commerceChallenge) {
          if (!input.commerceAgent || !input.commerceNonce) {
            return fail('invalid_commerce_challenge', 'commerceAgent and commerceNonce are required with commerceChallenge');
          }
          if (input.action !== undefined || input.payload !== undefined) {
            return fail('ambiguous_prepare_input', 'provide either action + payload or commerceChallenge, not both');
          }
          const bundle = commerceChallengeToAction({
            agent: input.commerceAgent,
            nonce: input.commerceNonce,
            challenge: input.commerceChallenge,
          });
          requestBody = {
            authorizationId: input.authorizationId,
            action: bundle.action,
            payload: bundle.payload,
          };
        } else {
          if (!input.action || input.payload === undefined) {
            return fail('invalid_prepare_input', 'action and payload are required when commerceChallenge is not provided');
          }
          requestBody = {
            authorizationId: input.authorizationId,
            action: input.action,
            payload: input.payload,
          };
        }

        return ok(await callApi(apiUrl, '/api/action/prepare', {
          method: 'POST',
          body: JSON.stringify(requestBody),
        }, fetchImpl));
      } catch (error) {
        return fail('prepare_failed', error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'agenticproof_verify_action',
    {
      title: 'Verify an onchain action proof',
      description: 'Read the configured EVM registry and optionally compare a supplied private payload against the onchain action commitment.',
      inputSchema: {
        actionId: hex32,
        payload: z.unknown().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input) => {
      try {
        return ok(await callApi(apiUrl, '/api/verify', {
          method: 'POST',
          body: JSON.stringify(input),
        }, fetchImpl));
      } catch (error) {
        return fail('verification_failed', error instanceof Error ? error.message : String(error));
      }
    },
  );

  return server;
}
