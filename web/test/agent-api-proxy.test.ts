import { describe, expect, test } from 'bun:test';
import { GET, POST } from '../app/agent-api/[...path]/route';

describe('public agent API proxy', () => {
  test('allows the non-signing agent proposal route through the public web surface', async () => {
    const previous = process.env.AGENT_API_INTERNAL_URL;
    process.env.AGENT_API_INTERNAL_URL = 'http://127.0.0.1:1';
    try {
      const response = await POST(
        new Request('http://localhost/agent-api/api/proposal', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        }),
        { params: Promise.resolve({ path: ['api', 'proposal'] }) },
      );
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({ error: 'agent_api_unavailable' });
    } finally {
      if (previous === undefined) delete process.env.AGENT_API_INTERNAL_URL;
      else process.env.AGENT_API_INTERNAL_URL = previous;
    }
  });

  test('forwards MCP bearer only to the explicit MCP route', async () => {
    const previous = globalThis.fetch;
    const observed: Array<{ url: string; authorization: string | null }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      observed.push({ url: String(input), authorization: headers.get('authorization') });
      return Response.json({ ok: true });
    }) as typeof fetch;
    try {
      const secret = 'Bearer test_secret_not_for_other_routes';
      const mcp = await POST(new Request('http://localhost/agent-api/mcp', {
        method: 'POST',
        headers: { authorization: secret, 'content-type': 'application/json' },
        body: '{"jsonrpc":"2.0","method":"tools/list","id":1}',
      }), { params: Promise.resolve({ path: ['mcp'] }) });
      expect(mcp.status).toBe(200);
      expect(observed[0]).toMatchObject({ authorization: secret });
      expect(observed[0]?.url).toBe('http://127.0.0.1:8787/mcp');

      const proposal = await POST(new Request('http://localhost/agent-api/api/proposal', {
        method: 'POST',
        headers: { authorization: secret, 'content-type': 'application/json' },
        body: '{}',
      }), { params: Promise.resolve({ path: ['api', 'proposal'] }) });
      expect(proposal.status).toBe(200);
      expect(observed[1]?.authorization).toBeNull();
    } finally {
      globalThis.fetch = previous;
    }
  });

  test('allows public MCP status but blocks remote token management routes', async () => {
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => Response.json({ enabled: false })) as typeof fetch;
    try {
      const status = await GET(new Request('http://localhost/agent-api/api/mcp/status'),
        { params: Promise.resolve({ path: ['api', 'mcp', 'status'] }) });
      expect(status.status).toBe(200);
      expect(await status.json()).toEqual({ enabled: false });
    } finally {
      globalThis.fetch = previous;
    }
    const blocked = await POST(new Request('http://localhost/agent-api/api/mcp/token', {
      method: 'POST', body: '{}',
    }), { params: Promise.resolve({ path: ['api', 'mcp', 'token'] }) });
    expect(blocked.status).toBe(404);
  });

  test('blocks backend transaction endpoints from the public web surface', async () => {
    const response = await POST(
      new Request('http://localhost/agent-api/api/action/record', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      { params: Promise.resolve({ path: ['api', 'action', 'record'] }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'public_agent_api_route_not_allowed' });
  });

  test('blocks backend agent registration from the public web surface', async () => {
    const response = await POST(
      new Request('http://localhost/agent-api/api/agent/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      { params: Promise.resolve({ path: ['api', 'agent', 'register'] }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'public_agent_api_route_not_allowed' });
  });
});
