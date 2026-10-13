# Agentic Proof Protocol

**Verifiable authority for AI agents.**

Agentic Proof Protocol (APP) is a user-owned authorization and proof layer for autonomous AI agents on Monad. A user grants narrowly-scoped authority, an AI agent proposes an action, deterministic policy decides whether it can proceed, and Monad records the authority plus a tamper-evident action commitment that another application can verify independently.

> **The model proposes. The protocol authorizes.**

## The problem

As AI agents move from answering questions to booking, purchasing and calling paid services, teams usually choose between two bad trust models:

1. **Trust the agent operator.** The same backend controls the model, permission database and audit log, so another application cannot independently prove what the user actually allowed.
2. **Ask the user every time.** This keeps authority with the human, but removes the autonomy that makes agents useful.

APP provides the missing middle: **scoped authority that an agent cannot grant to itself, deterministic execution policy, and portable proof that survives outside the original agent application.**

## How it works

```text
User wallet
   ↓ grants agent + action + scope + value cap + expiry
AI proposal
   ↓ schema validated
Deterministic Control Plane
   ↓ ALLOW / BLOCK / ESCALATE
Monad AgenticProofRegistry
   ↓ authority + action commitment
Independent verifier / another agent
   ↓ ACCEPT / REJECT under its own trust policy
```

1. **User grants authority.** The capability binds an agent address, action type, scope commitment, max value, time window and nonce.
2. **AI proposes; it does not authorize.** The reference proposal layer can use Groq when configured and otherwise shows an explicit deterministic fallback. It never receives a private key, signer handle or RPC authority.
3. **Policy fails closed.** A `$361` `BOOK_TRAVEL` proposal under the `$400` cap is `ALLOW`; a `$401` proposal is `BLOCK · VALUE_EXCEEDS_HARD_LIMIT` before chain execution.
4. **Monad records the proof.** Private payload data stays offchain; the registry stores commitments and authorization context.
5. **Anyone can verify.** `/verify/[actionId]` reads Monad directly, recomputes the payload commitment and exposes a portable agent-to-agent `ACCEPT / REJECT` decision.
6. **Revocation ends future authority without rewriting history.** A previously valid action stays valid-at-action-time, while new records under the revoked authorization fail.

## Judge-visible highlights

Every highlight below has a test or live Monad Testnet evidence behind it.

**1. AI cannot self-authorize.** Natural-language requests only create schema-validated proposals. Model output still passes through the same deterministic policy engine; the agent proposal regression test proves that an AI-selected `$401` offer is blocked. See [`agent/src/proposal.ts`](agent/src/proposal.ts) and [`agent/test/server.test.ts`](agent/test/server.test.ts).

**2. Authority is independently verifiable onchain.** The live registry records user-granted scope and action commitments rather than asking judges to trust a backend authorization table. See the deployment and transaction evidence below.

**3. Tampering is visible.** The recorded `$361` payload matches its action commitment; changing the supplied payload to `$399` returns `payloadMatches=false` without modifying chain state.

**4. Proofs are portable between agents/apps.** [`shared/src/trust.ts`](shared/src/trust.ts) lets a second application apply its own deterministic requirements to the same proof bundle. The original live proof is `ACCEPT`; the tampered proof is `REJECT`.

**5. Revocation has correct temporal semantics.** After revoke, `authorizationValidAtActionTime` remains true for the historical action while `authorizationCurrentlyActive` becomes false; a new `recordAction` simulation reverts `AuthorizationAlreadyRevoked()`.

**6. The primitive is not travel-specific.** Travel (`BOOK_TRAVEL`) and Procurement (`PURCHASE_ITEM`) use the same hashing, policy and registry primitives without a protocol fork.

## Who this is for

Primary users are **developers and teams operating autonomous agents that can trigger transactions or external services** and need a third party to verify the agent's authority without trusting the original backend.

Initial adoption path (product hypothesis, not claimed traction):

- **First 10 integrations:** AI-agent/hackathon teams consume the SDK and `/verify` proof route for one high-value action.
- **First 100:** agent runtimes, wallets and agent marketplaces use reusable capability templates and proof-consumer policies.
- **At scale:** the protocol remains open; a hosted developer layer can monetize organization policy management, proof indexing, monitoring and enterprise controls.

## Why Monad

Agent authorization is not a one-time credential. Autonomous systems can generate frequent grants, revocations and action receipts inside an execution loop. Monad gives APP an EVM-compatible environment for that high-frequency trust layer while keeping Solidity/viem composability with the wider EVM ecosystem. The product uses Monad as the source of verifiable authority, not merely as a place to store a demo string.

The chain proves recorded authorization state, signer identity and action commitments. It does **not** prove that a flight happened, a merchant delivered goods, or any other physical-world event. Optional outcome attestations only prove that the configured attestor signed a particular result commitment.

## Monad Testnet deployment

`AgenticProofRegistry` is deployed on Monad Testnet (chain ID `10143`):

- Contract: `0xC8E9E58ad418c6A2bf6229216068B16f32454010`
- Deployment tx: `0x1fe70584b3e52afe018397a48c531c41168555b21ff59be9f79349890cc8c08c`
- Block: `70398063`
- Explorer: `https://testnet.monadvision.com/address/0xC8E9E58ad418c6A2bf6229216068B16f32454010`

The browser verifier reads this registry directly through Monad RPC. A shareable proof route is available at `/verify/[actionId]` after an action is recorded.

### Verified live proof

A fresh end-to-end flow was executed on the registry above on 2026-10-12:

- Authorization: `0xc928d524721a367defabf7a1bbef0a48ef022374589f5e8950df178cf63c1505`
- Grant tx: `0xcc1c68899329d4ddbd47484384d60642333af96ad248d70fb81be7bc88c8ef1c` (block `70415149`)
- Action ID: `0x7606c8e32a09ffbcd524b37b6e82a27ecccd5c61ad8e7b4ed2d0162716f404cf`
- Action hash: `0x1c758ec79d8a60261a929548c7a72c9cd0e2f5f6fd5b7bad0b558c6e2641eb9f`
- Record tx: `0x3ad43d492503683fd8f88efc834ee9cd81ce978648c8ec44c0d951c4398b70bc` (block `70415848`)
- Revoke tx: `0xea71925b9ee2a77e42c6f556815d3a9d4bb8f4a8a87c22ee81c77aa9fd53072a` (block `70416194`)

Before revocation the proof returned `(exists, valid-at-action-time, currently-active, attested) = (true, true, true, false)` and the deterministic proof consumer accepted the original `$361` payload. Changing `totalUsd` to `$399` made `payloadMatches=false` and the consumer rejected it. After revocation, the historical action remains valid-at-action-time while current authority becomes false. A post-revoke `recordAction` simulation from the same agent reverts with `AuthorizationAlreadyRevoked()` (`0x5138ff9d`) without broadcasting a failed transaction.

Explorer transactions use `https://testnet.monadvision.com/tx/<txHash>`.

### Judge walkthrough — no wallet or fresh transaction required

Open the home page and click **Verify recorded proof**, or navigate directly to `/verify/0x7606c8e32a09ffbcd524b37b6e82a27ecccd5c61ad8e7b4ed2d0162716f404cf`.

1. Click **Verify original $361**: the browser recomputes the recorded payload commitment and reports `payloadMatches=true`. The historical proof consumer returns `ACCEPT`.
2. Click **Test tampered $399**: `payloadMatches=false` and the historical proof consumer returns `REJECT` with `PAYLOAD_MISMATCH`.
3. In both cases, the **new-action consumer rejects** because this historical authorization has been revoked. This does not invalidate the action recorded before revocation.

These are read-only direct-RPC checks against the deployed Monad Testnet registry. They do not connect a wallet, sign, broadcast a transaction or pretend that a demo flight was fulfilled.

## Brand asset

Canonical vector logo / favicon: `web/app/icon.svg`.

## Monorepo

- `contracts/` — Solidity registry + Foundry tests.
- `shared/` — TypeScript SDK, canonical hashing, policy engine, EIP-712 data, viem reader.
- `agent/` — Fastify policy/control-plane API, idempotency, hash-chain audit, optional agent signer.
- `mcp/` — restricted MCP surface for proposal/evaluation/preparation/verification.
- `web/` — Next.js App Router product UI and independent direct-RPC verifier.
- `infra/` — Docker build and runtime configuration.
- `docs/` — public Monad integration and security documentation.

## Connect AI agents via MCP

APP exposes four non-signing MCP tools for status, deterministic policy evaluation, action preparation and independent onchain verification. The model can propose an action but cannot grant itself authority, revoke permissions, sign or broadcast a transaction.

- **Connect Claude Code / Codex / Antigravity:** `/connect` (after deployment)
- **Four explained case studies:** `/use-cases` (after deployment)
- **Local stdio:** `bun run dev:mcp` (requires local Agent API); safe `.mcp.json` and `.cursor/mcp.json` are included for MCP-aware IDEs
- **Remote Streamable HTTP:** `POST /agent-api/mcp` with an owner-provisioned Bearer token; disabled by default until `APP_MCP_BEARER_TOKEN` is configured server-side
- **Setup and security:** [docs/MCP.md](docs/MCP.md)

Live onchain evidence is available for the travel case and independent verification. Procurement is a reference SDK scenario, not a claim of a completed merchant purchase.

## Security model

Core invariants:

- The model cannot grant itself authority.
- Unknown/disallowed actions fail closed.
- User authorization is bound to agent, action type, scope commitment, max value, time window and nonce.
- Authorization nonces cannot be reused by the same user.
- `recordAction` rejects wrong caller, wrong action type, wrong scope, expiry, revocation, over-cap value and duplicate action IDs.
- Revocation only blocks future records; already-valid historical actions remain valid-at-record-time.
- Single-use authorization can record at most one action.
- Optional outcome attestation is restricted to the authorization's designated attestor.
- Private payloads stay offchain; the registry stores commitments only.
- Ambiguous network outcomes are not blindly retried; the same idempotency/action ID must be verified first.

## NexusWallet reuse / attribution

This project intentionally studies and adapts selected engineering patterns from the MIT-licensed NexusWallet/nexusPay codebase. See `THIRD_PARTY_NOTICES.md` for provenance and attribution.

Reused patterns include deterministic policy evaluation, replay/idempotency guards, fail-closed control-plane boundaries, append-only hash-chain audit logging and MCP privilege separation. The current web shell is a separately migrated Next.js App Router application.

The Solana/Anchor/PDA/lamports/SPL chain layer is **not** ported. APP's EVM/Solidity registry and generalized action-authorization semantics are separate implementations.

## Live HTTPS demo and submission

- **Public demo (official domain):** https://monad.promptmarketcap.net/
- **Read-only proof verifier:** https://monad.promptmarketcap.net/verify/0x7606c8e32a09ffbcd524b37b6e82a27ecccd5c61ad8e7b4ed2d0162716f404cf
- **Fallback URL:** https://monad.103.82.21.207.sslip.io/
- **Hosting:** owner-operated VPS Docker container `agentic-proof-protocol-app`, isolated host port 3400, Nginx HTTPS reverse proxy with a Let's Encrypt origin certificate and Cloudflare DNS/proxy. No private key on the hosted agent (`signerReady=false`).
- **Verified:** homepage/API/verifier HTTP 200, public backend write route HTTP 404, valid TLS, original proof historical `ACCEPT`, tampered payload `REJECT` and revoked current authority `REJECT`.

The Docker configuration uses Node 22 for the Next.js standalone server and Bun for the agent service; the container build was verified on the VPS. Local planning notes, agent instructions and submission checklists are intentionally excluded from the public repository.

## Local setup

Requirements:

- Bun 1.2+
- Node 22+
- Foundry

Install JavaScript dependencies:

```bash
bun install
```

Run checks:

```bash
bun run typecheck
bun run test
bun run build
$HOME/.foundry/bin/forge test --root contracts -vv
```

Run the development stack with one long-lived command:

```bash
bun run dev
```

This keeps the Fastify agent service and Next.js dev server alive together until you stop the command. For debugging, they can still be run separately with `bun run dev:agent` and `bun run dev:web`.

Default URLs:

- Agent API: `http://127.0.0.1:8787`
- Web (Next.js): `http://127.0.0.1:3000`

Copy `.env.example` for the agent/API process and `web/.env.example` → `web/.env.local` for Next.js browser configuration. Monad Testnet defaults are preconfigured for chain ID `10143`, RPC `https://testnet-rpc.monad.xyz` and MonadVision testnet explorer. Do not commit private keys or Foundry keystore passwords.

## Chain configuration

Agent service:

```text
APP_RPC_URL
APP_CHAIN_ID
APP_CONTRACT_ADDRESS
APP_EXPLORER_URL
APP_AGENT_PRIVATE_KEY   # optional local/testnet agent signer only
APP_AGENT_ADDRESS
```

Web independent verifier:

```text
NEXT_PUBLIC_MONAD_RPC_URL
NEXT_PUBLIC_REGISTRY_ADDRESS
NEXT_PUBLIC_CHAIN_ID
NEXT_PUBLIC_EXPLORER_URL
```

The verifier intentionally uses its own browser-safe Next.js public chain configuration rather than trusting `/api/verify`, so the demo can show a direct RPC read independent of the agent backend.

### Monad Testnet CLI

Foundry v1.8+ is configured natively for Monad in `contracts/foundry.toml` (`network = "monad"`, chain ID `10143`). Useful commands:

```bash
export PATH="$HOME/.foundry/bin:$PATH"
bun run monad:chain-id
cast wallet list
cast wallet import monad-deployer --private-key <TESTNET_ONLY_PRIVATE_KEY>
bun run monad:deployer
bun run monad:balance
bun run monad:deploy
REGISTRY_ADDRESS=0x... bun run monad:verify
```

Prefer a dedicated testnet deployer key stored in Foundry's encrypted keystore. The repository never needs the deployer private key in source or `.env`.

## Contract API

Primary methods:

```text
registerAgent(agentId, metadataHash)
grantAuthorization(agent, actionType, scopeHash, maxValue, validAfter, validUntil, nonce, attestor, singleUse)
revokeAuthorization(authorizationId)
recordAction(authorizationId, actionId, actionType, scopeHash, actionHash, traceRoot, value)
attestOutcome(actionId, resultHash, status)
verifyAction(actionId)
```

## Reference demo

Travel reference flow:

1. Reference agent registers itself.
2. User connects an EVM wallet.
3. User grants `BOOK_TRAVEL`, Singapore scope, max `$400 USDC`, 30-minute validity.
4. Demo agent proposes a `$361` itinerary.
5. Deterministic policy returns `ALLOW`.
6. Agent records the SHA-256 payload commitment onchain.
7. Independent verifier reads the registry directly and recomputes the payload hash.
8. User revokes authorization.
9. A later action is blocked/rejected.
10. Negative `$401` proposal demonstrates the hard cap fail-closed path.

The selected offer/provider in the reference UI is explicitly labelled demo unless a real provider integration is connected.

## Development status

The public Monad Testnet registry and transaction evidence above demonstrate the deployed reference flow. Never interpret a local simulation, Anvil transaction or configured-but-unverified chain setting as proof of a Monad deployment. Explorer evidence is required before claiming testnet/mainnet deployment.
