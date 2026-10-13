# Agentic Proof Protocol — Judge Quick Start

> **Before an AI agent spends money or triggers a real action, prove what the user actually authorized.**

Agentic Proof Protocol (APP) is a user-owned authorization and evidence layer for AI agents on Monad. The AI may propose an action, but deterministic policy decides whether it can proceed; Monad stores the scoped authority and tamper-evident action commitment; any verifier can check the proof independently.

## 60-second walkthrough

1. Open the [live proof](https://monad.promptmarketcap.net/verify/0x7606c8e32a09ffbcd524b37b6e82a27ecccd5c61ad8e7b4ed2d0162716f404cf). No wallet is required.
2. Click **Verify original $361** → the recorded payload commitment matches and the historical proof consumer returns `ACCEPT`.
3. Click **Test tampered $399** → the same onchain action still exists, but the supplied payload no longer matches and the consumer returns `REJECT · PAYLOAD_MISMATCH`.
4. Open the [interactive lab](https://monad.promptmarketcap.net/lab) and run the `$401` negative path → deterministic policy returns `BLOCK · VALUE_EXCEEDS_HARD_LIMIT` against the `$400` cap.
5. Re-open the recorded proof after revocation → the action remains valid at action time, while current authorization is revoked and new-action trust returns `REJECT`.
6. For a terminal-only smoke, run `bun run demo:judge` → it checks the live Monad proof, `$361/$399/$401`, merchant-scope binding and the SDK/Solidity smart-spending commitment vector without a wallet.

## The AI-native flow

```text
Human intent
   ↓
AI / agent proposes a typed action
   ↓
Deterministic policy → ALLOW / BLOCK / ESCALATE
   ↓
Scoped user authority + action commitment on Monad
   ↓
Independent verifier / another agent → ACCEPT / REJECT
```

The model is deliberately **not** the authority boundary.

| AI / MCP can | AI / MCP cannot |
| --- | --- |
| Read protocol status | Grant itself authority |
| Evaluate a proposed action | Revoke user authority |
| Prepare canonical action data | Sign with the user wallet |
| Verify an onchain action proof | Broadcast or record privileged transactions |

APP exposes exactly four safe MCP tools: `agenticproof_get_status`, `agenticproof_evaluate_action`, `agenticproof_prepare_action`, and `agenticproof_verify_action`. The existing prepare tool also accepts a machine-readable commerce challenge and converts it into a policy-governed `PAY_SERVICE` action without adding a signing capability.

## Live evidence

- Product: https://monad.promptmarketcap.net/
- AI/MCP setup: https://monad.promptmarketcap.net/connect
- Use cases: https://monad.promptmarketcap.net/use-cases
- Canonical proof: https://monad.promptmarketcap.net/verify/0x7606c8e32a09ffbcd524b37b6e82a27ecccd5c61ad8e7b4ed2d0162716f404cf
- Monad Testnet chain ID: `10143`
- `AgenticProofRegistry`: `0xC8E9E58ad418c6A2bf6229216068B16f32454010`
- Deployment tx: `0x1fe70584b3e52afe018397a48c531c41168555b21ff59be9f79349890cc8c08c`
- Grant tx: `0xcc1c68899329d4ddbd47484384d60642333af96ad248d70fb81be7bc88c8ef1c`
- Record tx: `0x3ad43d492503683fd8f88efc834ee9cd81ce978648c8ec44c0d951c4398b70bc`
- Revoke tx: `0xea71925b9ee2a77e42c6f556815d3a9d4bb8f4a8a87c22ee81c77aa9fd53072a`
- Action ID: `0x7606c8e32a09ffbcd524b37b6e82a27ecccd5c61ad8e7b4ed2d0162716f404cf`

Explorer: https://testnet.monadvision.com/address/0xC8E9E58ad418c6A2bf6229216068B16f32454010

## Why the three demo amounts matter

| Case | Result | What it proves |
| --- | --- | --- |
| `$361` | `ALLOW` + historical `ACCEPT` | The action was inside policy and the supplied payload matches the recorded commitment. |
| `$399` tamper | `REJECT · PAYLOAD_MISMATCH` | A modified payload cannot reuse the original proof. |
| `$401` proposal | `BLOCK · VALUE_EXCEEDS_HARD_LIMIT` | Model output cannot override deterministic policy. |

Revocation is prospective: the historical `$361` action remains valid-at-action-time, but the revoked authorization cannot be used for a new action.

## AI integration

Local stdio MCP is ready for MCP-aware clients through the tracked `.mcp.json` / `.cursor/mcp.json` configuration and `bun run dev:mcp`. The production Streamable HTTP MCP route is deployed at `/agent-api/mcp`, but is intentionally fail-closed until the owner provisions a bearer credential. The public status route is https://monad.promptmarketcap.net/agent-api/api/mcp/status.

This is intentional security behavior: APP does not expose a public signing agent or a public owner token merely to make a demo appear connected.

## Technical evidence

- Core TypeScript/Bun suite: **56/56 PASS** in the current release candidate, including an in-memory MCP protocol client that lists the exact safe tool surface, proves `$361 → ALLOW` / `$401 → BLOCK`, adapts a commerce challenge through the non-signing prepare path, and verifies Solidity-compatible spending-scope commitments.
- Packaged SDK smoke suite: **3/3 PASS**; `npm pack --dry-run` produces the `@agentic-proof/sdk@0.1.0` artifact with runtime bundle, type declarations and quick-start README without publishing it.
- Foundry contract suite: **24/24 PASS**: 11 registry tests plus 13 `AgenticSpendingVault` tests covering authorized ERC-20 payment + atomic proof recording, wrong recipient, per-call over-cap amount, cumulative authorization-budget overspend, revoked authorization, replay, single-use reuse, unauthorized executor/front-run protection, configured executor execution, tampered resource, wrong action type, frozen agent, and SDK/Solidity scope-vector parity.
- `bun run typecheck`, `bun run lint`, and `bun run build`: PASS in the current release candidate.
- Public backend write route is blocked; hosted agent reports `signerReady=false`.
- The verifier reads Monad RPC directly rather than trusting the agent backend to declare itself valid.
- Specialist-agent manifests now bind agent address + declared role/capabilities into a deterministic metadata hash; manifests remain declarations, while policy + Monad authorization remain enforcement.
- `AgenticSpendingVault` is implemented and locally verified as the fund-boundary enforcement layer. It is deliberately listed as local/tested until separately deployed; the canonical live evidence above remains the already-deployed registry flow. Case 07 on `/use-cases` exposes this distinction explicitly to judges.

See [README.md](README.md) for architecture and setup, [docs/SECURITY.md](docs/SECURITY.md) for threat boundaries, and [docs/MCP.md](docs/MCP.md) for AI-client integration.

## One-line thesis

**AI proposes. Deterministic policy authorizes. Monad records the proof. Anyone can verify.**
