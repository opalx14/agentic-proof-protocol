/**
 * Owner-provisioned, bearer-authenticated remote MCP endpoint.
 * Adapted from NexusWallet's MIT-licensed Streamable HTTP architecture.
 * Deliberately never exposes owner authorization, signing or policy mutation.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { handleRemoteMcpRequest } from '@agentic-proof/mcp/remote';
import type { AppConfig } from './config.js';

const INTERNAL_ORIGIN = 'http://agentic-proof.internal';
const MCP_ALLOWED_API = new Set([
  'GET /api/config',
  'GET /api/policy',
  'POST /api/policy/evaluate',
  'POST /api/action/prepare',
  'POST /api/verify',
]);

function bearerMatches(
  authorization: string | undefined,
  rawSecret: string | undefined,
  secretDigestHex: string | undefined,
): boolean {
  if (!authorization?.startsWith('Bearer ') || authorization.length > 1024) return false;
  const supplied = authorization.slice('Bearer '.length);
  const suppliedDigest = createHash('sha256').update(supplied).digest();
  const expectedDigest = rawSecret
    ? createHash('sha256').update(rawSecret).digest()
    : secretDigestHex
      ? Buffer.from(secretDigestHex, 'hex')
      : null;
  return expectedDigest ? timingSafeEqual(suppliedDigest, expectedDigest) : false;
}

function internalFetch(app: FastifyInstance): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.origin !== INTERNAL_ORIGIN || !MCP_ALLOWED_API.has(`${method} ${url.pathname}`)) {
      return Response.json({ error: 'mcp_route_not_allowed' }, { status: 403 });
    }
    const response = await app.inject({
      method: method as 'GET' | 'POST',
      url: `${url.pathname}${url.search}`,
      headers: { 'content-type': 'application/json' },
      payload: typeof init?.body === 'string' ? init.body : undefined,
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: { 'content-type': response.headers['content-type']?.toString() ?? 'application/json' },
    });
  }) as typeof fetch;
}

export function registerRemoteMcp(app: FastifyInstance, config: AppConfig): void {
  app.get('/api/mcp/status', async () => ({
    transport: 'streamable-http',
    authentication: 'bearer',
    enabled: Boolean(config.APP_MCP_BEARER_TOKEN || config.APP_MCP_BEARER_TOKEN_SHA256),
    tools: [
      'agenticproof_get_status',
      'agenticproof_evaluate_action',
      'agenticproof_prepare_action',
      'agenticproof_verify_action',
    ],
    tokenProvisioning: 'server-owner-only',
  }));

  app.post('/mcp', { bodyLimit: 128 * 1024 }, async (req, reply) => {
    const rawToken = config.APP_MCP_BEARER_TOKEN;
    const tokenDigest = config.APP_MCP_BEARER_TOKEN_SHA256;
    if (!rawToken && !tokenDigest) return reply.status(503).send({ error: 'remote_mcp_disabled' });
    if (!bearerMatches(req.headers.authorization, rawToken, tokenDigest)) {
      return reply.status(401).header('www-authenticate', 'Bearer').send({ error: 'mcp_authentication_required' });
    }

    const headers = new Headers();
    headers.set('accept', req.headers.accept ?? 'application/json, text/event-stream');
    headers.set('content-type', 'application/json');
    if (typeof req.headers['mcp-protocol-version'] === 'string') {
      headers.set('mcp-protocol-version', req.headers['mcp-protocol-version']);
    }

    const request = new Request(`${INTERNAL_ORIGIN}/mcp`, { method: 'POST', headers });
    try {
      const response = await handleRemoteMcpRequest(request, req.body, INTERNAL_ORIGIN, internalFetch(app));
      for (const [key, value] of Object.entries(response.headers)) {
        if (!['connection', 'content-length', 'transfer-encoding', 'keep-alive'].includes(key)) reply.header(key, value);
      }
      return reply.status(response.status).send(response.body);
    } catch {
      return reply.status(500).send({ error: 'mcp_transport_error' });
    }
  });

  app.route({
    method: ['GET', 'DELETE'],
    url: '/mcp',
    handler: async (_req, reply) =>
      reply.status(405).header('allow', 'POST').send({ error: 'mcp_post_required' }),
  });
}
