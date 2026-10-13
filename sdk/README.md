# @agentic-proof/sdk

TypeScript SDK for **scoped AI-agent authorization, deterministic policy, commerce challenges, capability manifests, and independent Monad proof verification**.

The SDK is deliberately non-signing: it helps an agent **propose, evaluate, prepare and verify**. User authority and wallet signing stay outside the model boundary.

## Build locally

```bash
bun run sdk:build
bun run sdk:test
bun run sdk:pack
```

The package artifact is generated from the canonical implementation in `shared/src/` and exposes a stable public facade from `sdk/src/index.ts`.

## Quick start — deterministic policy

```ts
import {
  TRAVEL_REFERENCE_SCENARIO,
  actionForScenario,
  evaluatePolicy,
  policyForScenario,
} from '@agentic-proof/sdk';

const agent = '0x1111111111111111111111111111111111111111';
const policy = policyForScenario(agent, TRAVEL_REFERENCE_SCENARIO);

const allowed = evaluatePolicy(
  policy,
  actionForScenario(agent, TRAVEL_REFERENCE_SCENARIO),
);

const blocked = evaluatePolicy(
  policy,
  actionForScenario(agent, TRAVEL_REFERENCE_SCENARIO, {
    value: '401000000',
    nonce: '2',
  }),
);

console.log(allowed.verdict); // ALLOW
console.log(blocked.verdict, blocked.code); // BLOCK VALUE_EXCEEDS_HARD_LIMIT
```

## Quick start — verified travel quote binding

```ts
import { travelQuoteChanged, travelQuoteToAction } from '@agentic-proof/sdk';

const quote = {
  version: '1' as const,
  source: 'ATLAS' as const,
  provider: 'atlas-flight',
  offerId: 'offer-SGN-SIN-361',
  origin: 'SGN',
  destination: 'SIN',
  cabin: 'economy',
  total: '361000000',
  currency: 'USDC6',
  observedAt: '2026-10-14T00:00:00.000Z',
  expiresAt: '2026-10-14T00:05:00.000Z',
};

const verified = travelQuoteToAction({
  agent: '0x1111111111111111111111111111111111111111',
  nonce: '20',
  quote,
});
const requote = travelQuoteToAction({
  agent: verified.action.agent,
  nonce: '21',
  quote: { ...quote, total: '399000000', observedAt: '2026-10-14T00:01:00.000Z' },
});

console.log(travelQuoteChanged(verified.quote, requote.quote)); // true
console.log(verified.action.scopeHash === requote.action.scopeHash); // false
```

This is the Atlas-style safety pattern APP adopts: **search → verify exact provider quote → bind quote into authorization scope → execute/prove**. A provider re-quote or expired offer cannot silently reuse the previous exact quote scope. `ATLAS` is a supported source label in the adapter, not a claim that APP's public deployment currently runs the Atlas CLI; the canonical public travel proof remains clearly labelled `DEMO`.

## Quick start — machine-readable commerce challenge

```ts
import { commerceChallengeToAction } from '@agentic-proof/sdk';

const bundle = commerceChallengeToAction({
  agent: '0x1111111111111111111111111111111111111111',
  nonce: '7',
  challenge: {
    version: '1',
    network: 'monad-testnet',
    asset: 'USDC6',
    payTo: 'merchant:demo-airline',
    amount: '361000000',
    resource: 'travel:SFO-SIN',
  },
});

console.log(bundle.action.actionType); // PAY_SERVICE
console.log(bundle.action.scopeHash);  // binds network + asset + payee + resource
```

Changing only `payTo` changes the scope commitment. A payment proof prepared for one merchant cannot be silently redirected to another merchant while reusing the same authorized scope.

## Quick start — specialist agent manifest

```ts
import {
  createAgentManifest,
  createAgentManifestHash,
  manifestAllowsAction,
} from '@agentic-proof/sdk';

const agent = '0x1111111111111111111111111111111111111111';
const manifest = createAgentManifest(agent, {
  name: 'Procurement Agent',
  role: 'procurement',
  capabilities: [
    { actionType: 'PURCHASE_ITEM', description: 'Purchase approved catalog items.' },
    { actionType: 'PAY_SERVICE', description: 'Prepare approved service payments.' },
  ],
});

const metadataHash = createAgentManifestHash(manifest);
console.log(metadataHash);
console.log(manifestAllowsAction(manifest, { agent, actionType: 'PAY_SERVICE' })); // true
```

The manifest hash can be used as `metadataHash` when registering an agent in `AgenticProofRegistry`; the manifest declares capabilities but does not grant spending authority by itself.

## Quick start — smart spending scope

```ts
import {
  createSpendingActionHash,
  createSpendingActionId,
  createSpendingScopeHash,
} from '@agentic-proof/sdk';

const scopeHash = createSpendingScopeHash({
  chainId: 10143,
  token: '0x2222222222222222222222222222222222222222',
  recipient: '0x3333333333333333333333333333333333333333',
  resource: 'travel:SFO-SIN',
});

const payment = {
  chainId: 10143,
  vault: '0x1111111111111111111111111111111111111111',
  authorizationId: `0x${'44'.repeat(32)}`,
  token: '0x2222222222222222222222222222222222222222',
  recipient: '0x3333333333333333333333333333333333333333',
  amount: 361_000_000n,
  resource: 'travel:SFO-SIN',
  paymentNonce: 1n,
} as const;

const actionId = createSpendingActionId(payment);
const actionHash = createSpendingActionHash({ ...payment, actionId });
```

These helpers match `AgenticSpendingVault.sol`: recipient, token, resource, amount and nonce are bound into deterministic commitments before value can move.

## Quick start — personal profile + encrypted payment receipt

```ts
import {
  createEncryptionKeyCommitment,
  createUserProfile,
  createUserProfileHash,
  encryptPrivateReceipt,
  decryptPrivateReceipt,
  evaluateProfilePolicy,
  generateProfileEncryptionKey,
} from '@agentic-proof/sdk';

const key = generateProfileEncryptionKey(); // keep this user-side; never send it to MCP
const profile = createUserProfile('0x1111111111111111111111111111111111111111', {
  alias: 'traveler.one',
  persona: 'BUSINESS_TRAVELER',
  encryptionKeyCommitment: createEncryptionKeyCommitment(key),
  createdAt: new Date().toISOString(),
  policy: {
    allowedActionTypes: ['PAY_SERVICE'],
    allowedScopeHashes: [],
    maxPerAction: '400000000',
    dailyBudget: '600000000',
    approvalAboveValue: '300000000',
  },
});

const profileHash = createUserProfileHash(profile);
const decision = evaluateProfilePolicy(profile, {
  agent: '0x2222222222222222222222222222222222222222',
  actionType: 'PAY_SERVICE',
  scopeHash: `0x${'33'.repeat(32)}`,
  value: '361000000',
  currency: 'USDC6',
  resource: 'travel:SFO-SIN',
  nonce: '1',
}, { spentToday: '100000000' });

const aad = { profileHash, actionId: `0x${'44'.repeat(32)}` };
const encrypted = await encryptPrivateReceipt(
  { invoice: 'PRIVATE', amount: '361000000' },
  key,
  aad,
);
const plaintext = await decryptPrivateReceipt(encrypted, key, aad);
```

`PersonalProfileRegistry.sol` can store the profile/policy/key commitments and link `encrypted.commitment` to an existing `PAY_SERVICE` proof while keeping the key and plaintext receipt offchain.

## Quick start — independent Monad verifier

```ts
import { createRegistryReader, evaluateProofTrust } from '@agentic-proof/sdk';

const reader = createRegistryReader({
  rpcUrl: 'https://testnet-rpc.monad.xyz',
  contractAddress: '0xC8E9E58ad418c6A2bf6229216068B16f32454010',
});

const proof = await reader.readProofBundle(
  '0x7606c8e32a09ffbcd524b37b6e82a27ecccd5c61ad8e7b4ed2d0162716f404cf',
  {
    tripId: 'travel-demo-sgn-sin',
    route: 'SGN → SIN',
    cabin: 'economy',
    selectedOffer: 'DEMO-OFFER-361',
    totalUsd: 361,
    providerMode: 'DEMO',
  },
);

const trust = evaluateProofTrust(proof, { requirePayloadMatch: true });
console.log(trust.verdict); // ACCEPT for the canonical historical payload
```

## Public surface

- deterministic canonical hashing and scope commitments;
- `ALLOW / BLOCK / ESCALATE` policy evaluation;
- EIP-712 authorization typed-data construction;
- Monad/EVM registry reader and proof bundles;
- portable `ACCEPT / REJECT` proof-consumer policy;
- exact travel-quote commitments with provider re-quote / expiry invalidation;
- machine-readable `PAY_SERVICE` commerce challenge adapter;
- specialist-agent capability manifests and deterministic metadata hashes;
- Solidity-compatible smart-spending scope/action commitments for `AgenticSpendingVault`;
- wallet-owned profile manifests + identity-level ALLOW/BLOCK/ESCALATE policy;
- AES-256-GCM private payment receipt encryption/decryption + commitment helpers;
- read helpers/ABI for `PersonalProfileRegistry`;
- reusable travel/procurement reference scenarios.

## Security boundary

This SDK does **not** expose a user wallet private key, profile encryption key, owner signer, `grantAuthorization`, `revokeAuthorization`, privileged `recordAction`, token transfer, or transaction broadcast primitive to an AI model. Those are explicit authority/execution/privacy boundaries controlled by the user or a separate trusted executor.

The current hackathon package is a release candidate built from the public repository. npm publication is intentionally a separate release step so package ownership/versioning cannot block the submission.
