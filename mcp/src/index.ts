import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './tools.js';

async function main(): Promise<void> {
  const apiUrl = process.env.AGENTIC_PROOF_API_URL ?? 'http://127.0.0.1:8787';
  const server = createServer(apiUrl);
  await server.connect(new StdioServerTransport());
  console.error(`agentic-proof-mcp ready: ${apiUrl}`);
}

main().catch((error) => {
  console.error('agentic-proof-mcp failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
