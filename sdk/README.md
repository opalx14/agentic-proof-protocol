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
- machine-readable `PAY_SERVICE` commerce challenge adapter;
- specialist-agent capability manifests and deterministic metadata hashes;
- reusable travel/procurement reference scenarios.

## Security boundary

This SDK does **not** expose a user private key, owner signer, `grantAuthorization`, `revokeAuthorization`, privileged `recordAction`, token transfer, or transaction broadcast primitive to an AI model. Those are explicit authority/execution boundaries controlled by the user or a separate trusted executor.

The current hackathon package is a release candidate built from the public repository. npm publication is intentionally a separate release step so package ownership/versioning cannot block the submission.
