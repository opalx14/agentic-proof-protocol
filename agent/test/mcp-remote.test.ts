import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';

const TOKEN = 'owner_provisioned_token_' + 'A'.repeat(48);

function server(options: { token?: string; digest?: string } = {}) {
  return buildServer(loadConfig({
    PORT: '8787',
    HOST: '127.0.0.1',
    APP_MCP_BEARER_TOKEN: options.token ?? '',
    APP_MCP_BEARER_TOKEN_SHA256: options.digest ?? '',
    APP_AUDIT_PATH: `/tmp/agentic-proof-mcp-${process.pid}-${Math.random().toString(16).slice(2)}.jsonl`,
  })).app;
}

describe('remote MCP bearer and tool boundary', () => {
  it('defaults to disabled and never exposes a token in status', async () => {
    const app = server();
    const status = await app.inject({ method: 'GET', url: '/api/mcp/status' });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ enabled: false, authentication: 'bearer' });
    expect(status.body).not.toContain(TOKEN);
    const attempt = await app.inject({ method: 'POST', url: '/mcp', payload: {} });
    expect(attempt.statusCode).toBe(503);
    await app.close();
  });

  it('rejects missing and incorrect credentials before dispatch', async () => {
    const app = server({ token: TOKEN });
    const payload = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
    const missing = await app.inject({ method: 'POST', url: '/mcp', payload });
    expect(missing.statusCode).toBe(401);
    expect(missing.headers['www-authenticate']).toBe('Bearer');
    const invalid = await app.inject({
      method: 'POST', url: '/mcp',
      headers: { authorization: 'Bearer wrong_token' },
      payload,
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.body).not.toContain(TOKEN);
    const get = await app.inject({ method: 'GET', url: '/mcp' });
    expect(get.statusCode).toBe(405);
    await app.close();
  });

  it('accepts a digest-only server secret without exposing the digest', async () => {
    const digest = createHash('sha256').update(TOKEN).digest('hex');
    const app = server({ digest });
    const status = await app.inject({ method: 'GET', url: '/api/mcp/status' });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ enabled: true, authentication: 'bearer' });
    expect(status.body).not.toContain(digest);
    expect(status.body).not.toContain(TOKEN);

    const accepted = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.body).not.toContain(digest);
    expect(accepted.body).not.toContain(TOKEN);
    await app.close();
  });

  it('connects with an actual MCP client, lists safe tools and enforces the $400 cap', async () => {
    const app = server({ token: TOKEN });
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const client = new Client({ name: 'agentic-proof-test', version: '1.0.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`${address}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
      }));
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      expect(names).toEqual([
        'agenticproof_get_status',
        'agenticproof_evaluate_action',
        'agenticproof_prepare_action',
        'agenticproof_verify_action',
      ]);
      expect(names.join(' ')).not.toMatch(/grant|revoke|sign|record|transfer/);
      const status = await client.callTool({ name: 'agenticproof_get_status', arguments: {} });
      expect(status.isError).toBeFalsy();
      expect(JSON.stringify(status)).not.toContain(TOKEN);

      const decision = await client.callTool({
        name: 'agenticproof_evaluate_action',
        arguments: {
          agent: '0x1111111111111111111111111111111111111111',
          actionType: 'BOOK_TRAVEL',
          scopeHash: '0x' + '1'.repeat(64),
          value: '401000000',
          currency: 'USDC6',
          resource: 'travel:SGN-SIN',
          nonce: '42',
        },
      });
      expect(decision.isError).toBeFalsy();
      expect(JSON.stringify(decision)).toContain('BLOCK');
      expect(JSON.stringify(decision)).toContain('VALUE_EXCEEDS_HARD_LIMIT');
    } finally {
      await client.close();
      await app.close();
    }
  });
});
