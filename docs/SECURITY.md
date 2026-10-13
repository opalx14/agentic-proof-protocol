# Security model and trust boundaries

Agentic Proof Protocol separates four claims that are often collapsed into one word: "verified".

## 1. User authorization

The registry can prove that an EVM account created a scoped authorization for a registered agent with an action type, scope commitment, value cap, validity window and nonce.

The registry enforces:
- registered and active agent;
- user-scoped nonce uniqueness;
- exact agent address;
- exact action type and scope hash;
- maximum value;
- `validAfter` / `validUntil`;
- revocation;
- optional single-use behavior.

## 2. Agent action commitment

`recordAction` proves that the authorized agent address recorded a particular commitment while the authorization was usable.

The commitment contains:
- authorization ID;
- action ID;
- action type;
- scope hash;
- private payload hash;
- optional trace root;
- value;
- record timestamp.

This is provenance, not a statement that the physical-world outcome happened.

## 3. Supplied-payload verification

An independent verifier can be given the offchain payload, canonicalize it and recompute the SHA-256 commitment. A match means the supplied payload is the payload committed by the recorded agent action.

If no payload is supplied, the UI/API must not claim payload verification.

## 4. Outcome attestation

If an authorization names an attestor, only that address may call `attestOutcome` for the action. This proves that the configured signer attested the result hash/status. It does not independently prove the truth of the attested real-world fact.

## Deterministic control plane

Model output is treated as untrusted proposal data. The TypeScript policy engine decides `ALLOW`, `BLOCK` or `ESCALATE` before the application signer submits an action.

The Solidity contract is the final chain-side enforcement boundary for recorded actions. Local policy cannot override contract authorization state.

### AI / MCP privilege boundary

The AI integration is intentionally capability-limited. The model may help reason about a request, but it is not trusted with owner authority.

| Allowed to AI / MCP | Not exposed to AI / MCP |
| --- | --- |
| Read public protocol status | Grant or widen authorization |
| Evaluate a typed proposal under deterministic policy | Revoke user authorization |
| Prepare deterministic action data and commitments | Access a user private key or wallet signer |
| Verify an existing onchain proof | Broadcast or privileged `recordAction` execution |

The MCP surface therefore contains exactly four non-signing tools: `agenticproof_get_status`, `agenticproof_evaluate_action`, `agenticproof_prepare_action`, and `agenticproof_verify_action`. A compromised or hallucinating model cannot obtain an owner-signing primitive from APP MCP because that primitive is not part of the tool surface.

### Commerce challenge boundary

Machine-readable payment/service challenges are treated as untrusted proposal input, not permission to pay. The commerce adapter binds `network`, `asset`, `payTo` and `resource` into the APP scope commitment and maps `amount` to the deterministic policy value. Redirecting the payee changes the scope hash; increasing the amount remains subject to the hard value cap. The adapter never accepts a wallet key, never signs and never broadcasts a settlement transaction.

### Agent capability manifests

Capability manifests are declarations, not authority. Their deterministic hash can be used as an agent `metadataHash` so another application can compare an advertised role/capability set with registry metadata, but the manifest cannot grant itself permissions. User authorization, deterministic policy and contract checks remain the enforcement boundaries.

### Smart spending vault boundary

`AgenticSpendingVault` is a stricter fund-boundary executor for `PAY_SERVICE`. The vault itself is the registered APP agent; it accepts execution only from the owner or an owner-selected executor, then checks the owner authorization, action type, recipient/token/resource scope, revocation/expiry, per-call amount and cumulative amount already spent under that authorization. The vault marks replay state and cumulative spend before recording the APP action and transferring funds; EVM atomicity rolls all of those effects back if proof recording or token/native transfer fails. Emergency withdrawals remain owner-only. The vault is currently local/tested and is not presented as part of the canonical live Monad deployment until separately deployed.

### Personal profile + encrypted receipt boundary

`PersonalProfileRegistry` is an optional identity/privacy layer. The wallet is the profile owner; onchain state contains only `profileHash`, `policyHash`, an encryption-key commitment, aggregate payment counters and encrypted-receipt commitments. Plaintext PII, invoice content and the AES-256-GCM key remain offchain. Profile-enabled payments use `profileBoundScopeHash(profileHash, basePaymentScope)`: `AgenticSpendingVault.executeProfileAuthorizedPayment` records that bound scope, and the profile registry accepts a private receipt only when the APP action carries the exact same current profile-bound scope. This prevents another wallet from attaching the payment and prevents an action created under profile v1 from being relabelled under profile v2. Profile policy runs before the existing APP execution policy and cannot widen a stricter APP/onchain authorization. MCP exposes no encryption-key, decryption, profile-mutation or receipt-linking tool. These profile modules are currently local/tested and must not be described as live on Monad until separately deployed.

## Replay and ambiguity

- Authorization nonces are unique per user.
- Action IDs cannot be recorded twice.
- Single-use authorizations reject a second action.
- API idempotency keys bind one logical request to one fingerprint.
- If the network result is ambiguous, the API returns `outcome_unknown` rather than blindly generating another logical action.

## Revocation semantics

Revocation is prospective.

An action correctly recorded before revocation remains `authorizationValidAtActionTime = true`. The same authorization becomes `authorizationCurrentlyActive = false` after revocation and future `recordAction` calls revert.

This distinction prevents historical facts from being rewritten by a later revocation.

## Privacy

Do not put private travel/user data onchain. The P0 registry stores fixed-size commitments and authorization metadata.

Examples that should remain offchain:
- passport data;
- email/name/phone;
- PNR and full itinerary;
- prompts and conversations;
- merchant/provider private records.

## Known MVP limitations

- The request/idempotency store is process-local; it is not durable across agent-service restarts. Onchain action IDs remain the authoritative replay boundary.
- The local audit log is SHA-256 hash chained but is not blockchain-immutable and is not encrypted in this implementation. Only sanitized metadata should be written to it.
- EIP-712 authorization data is generated for wallet/DX compatibility, but P0 `grantAuthorization` is a direct user transaction. The contract does not yet accept a relayed EIP-712 signature.
- The control plane does not continuously mirror all onchain authorization state before every local `ALLOW`; the contract remains the final enforcement boundary.
- No external outcome should be labelled independent unless the real provider/counterparty controls the attestor key.

## Demo claim language

Safe:
- "The user authorized this agent to record this class of action under these limits."
- "This agent address committed this payload hash while the authorization was valid."
- "The supplied payload matches the recorded commitment."
- "The configured provider address attested this result hash."

Unsafe without additional evidence:
- "The blockchain proves the flight happened."
- "The blockchain proves the merchant delivered."
- "This hash proves the AI result is correct."
