import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { defaultPolicy, evaluatePolicy, type ProposedAction } from '@agentic-proof/shared';
import { createServer, TOOL_NAMES } from '../src/tools.js';

const AGENT = '0x1111111111111111111111111111111111111111' as const;
const SCOPE = `0x${'22'.repeat(32)}` as const;

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function policyBackedFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));

    if (url.pathname === '/api/policy/evaluate' && init?.method === 'POST') {
      const action = JSON.parse(String(init.body)) as ProposedAction;
      return jsonResponse(evaluatePolicy(defaultPolicy(AGENT), action));
    }

    if (url.pathname === '/api/action/prepare' && init?.method === 'POST') {
      return jsonResponse({ prepared: true, request: JSON.parse(String(init.body)) });
    }

    if (url.pathname === '/api/config') {
      return jsonResponse({ chainId: 10143, agentAddress: AGENT });
    }

    if (url.pathname === '/api/policy') {
      return jsonResponse(defaultPolicy(AGENT));
    }

    return jsonResponse({ error: 'not_found' }, 404);
  }) as typeof fetch;
}

async function connectClient() {
  const server = createServer('http://agent.test', policyBackedFetch());
  const client = new Client({ name: 'judge-smoke-client', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, server };
}

describe('MCP protocol integration', () => {
  it('exposes exactly the four safe tools to an MCP client', async () => {
    const { client, server } = await connectClient();
    try {
      const result = await client.listTools();
      expect(result.tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
      expect(result.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('lets an AI client evaluate $361 while deterministic policy blocks $401', async () => {
    const { client, server } = await connectClient();
    try {
      const baseAction = {
        agent: AGENT,
        actionType: 'BOOK_TRAVEL',
        scopeHash: SCOPE,
        currency: 'USDC',
        resource: 'SFO-SIN',
      };

      const allowed = await client.callTool({
        name: 'agenticproof_evaluate_action',
        arguments: { ...baseAction, value: '361000000', nonce: '1' },
      });
      const blocked = await client.callTool({
        name: 'agenticproof_evaluate_action',
        arguments: { ...baseAction, value: '401000000', nonce: '2' },
      });

      const allowedContent = allowed.content as Array<{ type: string; text?: string }>;
      const blockedContent = blocked.content as Array<{ type: string; text?: string }>;
      const allowedText = allowedContent.find((item) => item.type === 'text');
      const blockedText = blockedContent.find((item) => item.type === 'text');
      const allowedBody = JSON.parse(allowedText?.text ?? '{}') as Record<string, unknown>;
      const blockedBody = JSON.parse(blockedText?.text ?? '{}') as Record<string, unknown>;

      expect(allowedBody.verdict).toBe('ALLOW');
      expect(blockedBody.verdict).toBe('BLOCK');
      expect(blockedBody.code).toBe('VALUE_EXCEEDS_HARD_LIMIT');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('adapts a commerce payment challenge through the existing non-signing prepare tool', async () => {
    const { client, server } = await connectClient();
    try {
      const result = await client.callTool({
        name: 'agenticproof_prepare_action',
        arguments: {
          authorizationId: `0x${'33'.repeat(32)}`,
          commerceAgent: AGENT,
          commerceNonce: '9',
          commerceChallenge: {
            version: '1',
            network: 'monad-testnet',
            asset: 'USDC6',
            payTo: 'merchant:demo-airline',
            amount: '361000000',
            resource: 'travel:SFO-SIN',
            requestId: 'quote-361',
          },
        },
      });

      const content = result.content as Array<{ type: string; text?: string }>;
      const body = JSON.parse(content.find((item) => item.type === 'text')?.text ?? '{}') as {
        prepared?: boolean;
        request?: { action?: ProposedAction; payload?: Record<string, unknown> };
      };

      expect(body.prepared).toBe(true);
      expect(body.request?.action?.actionType).toBe('PAY_SERVICE');
      expect(body.request?.action?.value).toBe('361000000');
      expect(body.request?.payload?.kind).toBe('APP_COMMERCE_CHALLENGE');
    } finally {
      await client.close();
      await server.close();
    }
  });
});
