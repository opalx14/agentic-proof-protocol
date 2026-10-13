const DEFAULT_AGENT_API_INTERNAL_URL = 'http://127.0.0.1:8787';

type RouteParams = {
  params: Promise<{ path: string[] }>;
};

const PUBLIC_AGENT_API_ROUTES = new Set([
  'GET /health',
  'GET /api/config',
  'GET /api/policy',
  'POST /api/proposal',
  'POST /api/policy/evaluate',
  'POST /api/action/prepare',
  'GET /api/audit',
  'GET /api/mcp/status',
  'POST /mcp',
]);

async function proxyAgentRequest(request: Request, context: RouteParams): Promise<Response> {
  const { path } = await context.params;
  const method = request.method.toUpperCase();
  const upstreamPath = `/${path.join('/')}`;
  if (!PUBLIC_AGENT_API_ROUTES.has(`${method} ${upstreamPath}`)) {
    return Response.json({ error: 'public_agent_api_route_not_allowed' }, { status: 404 });
  }

  const upstreamBase = (process.env.AGENT_API_INTERNAL_URL ?? DEFAULT_AGENT_API_INTERNAL_URL).replace(/\/$/, '');
  const sourceUrl = new URL(request.url);
  const upstreamUrl = `${upstreamBase}/${path.map(encodeURIComponent).join('/')}${sourceUrl.search}`;
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();
  const contentType = request.headers.get('content-type');
  const isMcp = method === 'POST' && upstreamPath === '/mcp';

  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      body,
      cache: 'no-store',
      headers: {
        ...(contentType ? { 'content-type': contentType } : {}),
        accept: request.headers.get('accept') ?? 'application/json',
        // Forward credentials ONLY to the explicitly allowlisted MCP route.
        ...(isMcp && request.headers.get('authorization') ? { authorization: request.headers.get('authorization')! } : {}),
        ...(isMcp && request.headers.get('mcp-protocol-version') ? { 'mcp-protocol-version': request.headers.get('mcp-protocol-version')! } : {}),
      },
    });
    const responseBody = await upstream.arrayBuffer();
    const responseHeaders = new Headers();
    const upstreamContentType = upstream.headers.get('content-type');
    if (upstreamContentType) responseHeaders.set('content-type', upstreamContentType);
    if (isMcp && upstream.headers.get('mcp-session-id')) responseHeaders.set('mcp-session-id', upstream.headers.get('mcp-session-id')!);
    responseHeaders.set('cache-control', 'no-store');
    return new Response(responseBody, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return Response.json({
      error: 'agent_api_unavailable',
      message: error instanceof Error ? error.message : String(error),
    }, { status: 502 });
  }
}

export const dynamic = 'force-dynamic';

export const GET = proxyAgentRequest;
export const POST = proxyAgentRequest;
