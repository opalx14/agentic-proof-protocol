/**
 * Stateless Streamable HTTP transport for the same four non-signing MCP tools as stdio.
 * The hosting agent API authenticates the bearer token before calling this handler.
 * Adapted from the MIT-licensed NexusWallet remote MCP transport.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from './tools.js';

export type RemoteMcpResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export async function handleRemoteMcpRequest(
  request: Request,
  parsedBody: unknown,
  apiUrl: string,
  fetchImpl: typeof fetch,
): Promise<RemoteMcpResponse> {
  const server = createServer(apiUrl, fetchImpl);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request, { parsedBody });
    const body = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    return { status: response.status, headers, body };
  } finally {
    await server.close();
  }
}
