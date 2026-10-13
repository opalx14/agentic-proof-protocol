# Connect an AI agent to Agentic Proof Protocol

APP exposes four deliberately non-signing Model Context Protocol (MCP) tools, usable with local stdio or a bearer-authenticated Streamable HTTP endpoint.

**Public judge pages**
- [Connect an AI agent](https://monad.promptmarketcap.net/connect).
- [Case studies](https://monad.promptmarketcap.net/use-cases).
- [No-wallet Monad proof](https://monad.promptmarketcap.net/verify/0x7606c8e32a09ffbcd524b37b6e82a27ecccd5c61ad8e7b4ed2d0162716f404cf).
- [Remote MCP status](https://monad.promptmarketcap.net/agent-api/api/mcp/status) — public and secret-free.

## 1-minute AI-client demo

Use an MCP-aware client against the local stdio server and ask:

> "I need a SFO to Singapore trip under $400. Evaluate a $361 BOOK_TRAVEL proposal, prepare the canonical action data, and explain whether you have any tool that can grant yourself authority or broadcast the transaction."

Expected behavior:

1. `agenticproof_evaluate_action` returns `ALLOW` for the in-policy proposal.
2. `agenticproof_prepare_action` returns deterministic action data/commitments but does not sign or broadcast.
3. The client can verify an existing Monad proof with `agenticproof_verify_action`.
4. A `$401` proposal returns `BLOCK · VALUE_EXCEEDS_HARD_LIMIT`.
5. The client must report that there is no MCP tool for grant, revoke, signing or privileged `recordAction`.

For the public judge demo, the hosted Streamable HTTP MCP route is deployed but intentionally reports disabled until the owner provisions a bearer credential. This fail-closed state is preferable to exposing a public owner credential or signer.

## Supported tools

| Tool | Purpose | Signs or broadcasts? |
| --- | --- | --- |
| `agenticproof_get_status` | Read policy and public registry configuration | No |
| `agenticproof_evaluate_action` | Evaluate a proposed action under deterministic policy | No |
| `agenticproof_prepare_action` | Prepare action hash/transaction arguments, including a machine-readable commerce challenge adapter | No |
| `agenticproof_verify_action` | Read onchain proof and optionally compare a supplied payload | No |

There is **no MCP tool to grant/revoke authority, update policy, sign, transfer funds, attest a provider outcome or record a transaction**. The user wallet owns the authorization; the model only proposes.

### Commerce challenge mode

`agenticproof_prepare_action` can also receive a machine-readable service/payment challenge instead of a hand-built APP action. The adapter maps `network + asset + payTo + resource` into the action scope commitment, maps `amount` into the policy value, and produces a canonical `PAY_SERVICE` payload. This is inspired by HTTP 402-style agent-commerce flows, but APP intentionally stops before signing or settlement.

Example shape:

```json
{
  "authorizationId": "0x<32-byte-id>",
  "commerceAgent": "0x<agent-address>",
  "commerceNonce": "9",
  "commerceChallenge": {
    "version": "1",
    "network": "monad-testnet",
    "asset": "USDC6",
    "payTo": "merchant:demo-airline",
    "amount": "361000000",
    "resource": "travel:SFO-SIN",
    "requestId": "quote-361"
  }
}
```

The same deterministic controls still apply. A matching `PAY_SERVICE` policy/authorization is required for an automatic `ALLOW`; otherwise the challenge fails closed. A `$401` challenge can be blocked by the value cap, while changing only `payTo` changes the scope commitment so the original scoped policy no longer matches.

## Local stdio (no bearer token required)

1. Install dependencies using Bun and start the Agent API with `bun run dev:agent`.
2. Run `bun run dev:mcp` from the repository root.
3. Configure the MCP client to launch `bun` with arguments `run`, `dev:mcp` and `AGENTIC_PROOF_API_URL=http://127.0.0.1:8787`.

The local server communicates through JSON-RPC on stdin/stdout. Do not send logs to stdout. The repository includes `.mcp.json` and `.cursor/mcp.json` for MCP-aware IDEs. These files contain only local commands, never credentials.

## Remote Streamable HTTP

The hosted route is `POST https://monad.promptmarketcap.net/agent-api/mcp`, routed by the Next.js allowlisted proxy to the Agent API `POST /mcp`.

**Remote MCP is disabled by default**. The owner may provision either `APP_MCP_BEARER_TOKEN` (a random secret at least 32 characters) or, preferably for hosted deployments, only its SHA-256 digest in `APP_MCP_BEARER_TOKEN_SHA256`. Generate the raw token privately (for example with `openssl rand -hex 32`), distribute that raw value only to trusted MCP clients, and store only the 64-hex digest on the server when possible. Never add either value to `NEXT_PUBLIC_*`, a tracked `.env`, a screenshot or a shared demo page. The public `GET /agent-api/api/mcp/status` endpoint reveals only whether remote MCP is enabled, never the token or digest.

- Missing token on server: HTTP 503 `remote_mcp_disabled`.
- Missing or invalid `Authorization: Bearer <token>`: HTTP 401.
- Only `POST /mcp` is supported; GET/DELETE return 405.
- MCP uses the same four tools as local stdio; all internal API requests are constrained to a hardcoded non-signing allowlist.

### Claude Code

```bash
claude mcp add --transport http agentic-proof https://monad.promptmarketcap.net/agent-api/mcp --header "Authorization: Bearer <YOUR_OWNER_MCP_TOKEN>"
```

### Codex

Set `APP_MCP_BEARER_TOKEN` in the local environment, then add to `~/.codex/config.toml`:

```toml
[mcp_servers.agentic_proof]
url = "https://monad.promptmarketcap.net/agent-api/mcp"
bearer_token_env_var = "APP_MCP_BEARER_TOKEN"
tool_timeout_sec = 90
```

### Antigravity

In the MCP configuration:

```json
{
  "mcpServers": {
    "agentic-proof": {
      "serverUrl": "https://monad.promptmarketcap.net/agent-api/mcp",
      "headers": { "Authorization": "Bearer <YOUR_OWNER_MCP_TOKEN>" }
    }
  }
}
```

Do not paste a real token into public submissions. All examples above use placeholders.

## Demo prompts

1. “Get the current Agentic Proof policy. Can an agent propose a $401 BOOK_TRAVEL action under the $400 cap?” Expected: `BLOCK / VALUE_EXCEEDS_HARD_LIMIT`.
2. “Verify the Monad Testnet action `0x7606c8e32a09ffbcd524b37b6e82a27ecccd5c61ad8e7b4ed2d0162716f404cf`. Is its authorization still active?” Expected: recorded historical proof exists, current authorization revoked.
3. “Can you grant yourself higher limits or broadcast a transaction through APP MCP?” Expected: no such tool.

## Scope and security

This is a **NexusWallet-inspired MCP integration**, not a port of NexusWallet's Solana transfer/escrow system. The owner-facing wallet authentication and token-rotation UI are not present in APP; until authenticated owner management is implemented, tokens are provisioned and rotated outside the public web app by the server owner. The deployed Agent API should keep signing disabled for the public judge demo.

Monad records authorization state and action commitments. Neither MCP nor the chain proves external-world fulfillment such as a flight booking or delivery.
