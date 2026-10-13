# Monad integration notes

Verified on 2026-10-12 against the Monad Developers organization and official Monad-configured Foundry examples.

Primary references:
- https://docs.monad.xyz/
- https://docs.monad.xyz/developer-essentials/testnet
- https://docs.monad.xyz/guides/deploy-smart-contract/foundry
- https://developers.monad.xyz/
- https://github.com/monad-developers
- https://github.com/monad-developers/foundry-monad

## Network target

The hackathon deployment target is Monad Testnet until a deliberate mainnet decision is made.

| Setting | Monad Testnet |
|---|---|
| Chain ID | `10143` |
| Native currency | `MON` |
| RPC | `https://testnet-rpc.monad.xyz` |
| Explorer | `https://testnet.monadvision.com` or `https://testnet.monadscan.com` |
| Faucet | `https://faucet.monad.xyz` |

`cast chain-id --rpc-url https://testnet-rpc.monad.xyz` was checked from the project environment and returned `10143`.

## Foundry CLI structure

Foundry `1.8.5` is installed locally. Foundry v1.8+ has Monad-aware execution support, so `contracts/foundry.toml` uses:

```toml
[profile.default]
network = "monad"
eth_rpc_url = "https://testnet-rpc.monad.xyz"
chain_id = 10143

[rpc_endpoints]
monad_testnet = "https://testnet-rpc.monad.xyz"
monad = "https://rpc.monad.xyz"
```

Project commands:

```bash
export PATH="$HOME/.foundry/bin:$PATH"
bun run monad:chain-id
bun run monad:wallet:list
bun run monad:wallet:new   # interactive hidden password prompt; run once manually
bun run monad:deployer
bun run monad:balance
bun run monad:faucet
bun run monad:deploy
REGISTRY_ADDRESS=0x... bun run monad:verify
```

The intended deployer account name is `monad-deployer`. As of setup time the local Foundry keystore directory is empty; no wallet was generated automatically. `bun run monad:wallet:new` uses Foundry's encrypted keystore flow and intentionally waits for a hidden password entered by the human operator. Never automate, log, commit, or send that password/private key through chat. Fund the resulting address from `https://faucet.monad.xyz` before deployment.

## Next.js browser structure

The web application now uses Next.js App Router under `web/app/`.

Public browser configuration:

```text
NEXT_PUBLIC_AGENT_API_URL=http://127.0.0.1:8787
NEXT_PUBLIC_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
NEXT_PUBLIC_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_CHAIN_ID=10143
NEXT_PUBLIC_EXPLORER_URL=https://testnet.monadvision.com
```

`NEXT_PUBLIC_REGISTRY_ADDRESS` remains blank until the registry is actually deployed. RPC, chain ID and explorer have safe public Testnet defaults. The browser wallet path can switch to or add Monad Testnet using EIP-1193 before the user grants/revokes authorization.

## Wallet compatibility note

As of 2026-10-12, Phantom is **not** a valid Monad wallet target. Phantom ended Monad support on 2026-08-26 and does not provide arbitrary custom-network support for unsupported chains. Use a currently compatible EVM wallet such as MetaMask, Rabby, Backpack, OKX Wallet or another Monad-supported wallet instead.

For the hackathon, prefer a fresh dedicated EVM wallet/account rather than reusing a wallet that holds valuable assets. The deployer account can remain a separate Foundry keystore (`monad-deployer`), while the user-facing authorization wallet can be MetaMask/Rabby/another compatible injected wallet.

Server-side agent configuration:

```text
APP_RPC_URL=https://testnet-rpc.monad.xyz
APP_CHAIN_ID=10143
APP_CONTRACT_ADDRESS=0x...
APP_EXPLORER_URL=https://testnet.monadvision.com
APP_AGENT_ADDRESS=0x...
APP_AGENT_PRIVATE_KEY=... # local secret only if the backend agent signs recordAction
```

## Current Monad Testnet deployment

Deployed from the connected Rabby wallet on 2026-10-12 after local Foundry/TypeScript gates passed:

```text
Contract: 0xC8E9E58ad418c6A2bf6229216068B16f32454010
Deployment tx: 0x1fe70584b3e52afe018397a48c531c41168555b21ff59be9f79349890cc8c08c
Block: 70398063
Chain ID: 10143
Explorer: https://testnet.monadvision.com/address/0xC8E9E58ad418c6A2bf6229216068B16f32454010
```

Browser-wallet deployment is supported for the hackathon/reference flow so the user never has to export a Rabby private key. Foundry keystore deployment remains the preferred unattended CLI path for later automated deployments.

## Deployment gate

Before claiming a Monad Testnet deployment:

1. create/import and fund the dedicated `monad-deployer` keystore;
2. confirm `bun run monad:chain-id` returns `10143`;
3. run `forge test --root contracts -vv`;
4. deploy the exact tested registry with `bun run monad:deploy`;
5. capture contract address and deployment transaction hash;
6. verify the source with `REGISTRY_ADDRESS=... bun run monad:verify`;
7. set `APP_CONTRACT_ADDRESS` and `NEXT_PUBLIC_REGISTRY_ADDRESS` to the deployed address;
8. run register → grant → record → direct verify → revoke → rejected next action against Testnet;
9. capture explorer evidence before updating README/demo/submission claims.

## Optional protocol extensions

- ERC-8004 identity/reputation can complement APP but is not required for the P0 authorization/action-provenance invariant.
- P256/WebAuthn can improve user authorization UX but should not replace the tested EVM-wallet flow until separately validated.
- EIP-7702/session-account patterns remain roadmap items unless the core Testnet flow is already green.
