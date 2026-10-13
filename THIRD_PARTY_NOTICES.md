# Third-party notices

## NexusWallet / nexusPay

Parts of this repository are adapted from architecture and source patterns in NexusWallet (reference revision `staging@536599c`). NexusWallet is distributed under the MIT License.

Copyright (c) 2026 nexusPay contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### Adaptation boundary

Reused/adapted ideas include deterministic policy evaluation, fail-closed approvals, replay/idempotency patterns, append-only hash-chain audit logging, MCP privilege boundaries, and the Fastify + React/Vite monorepo shape.

Solana-specific code (Anchor programs, PDAs, lamports/SPL transactions, Phantom-Solana execution) is not used as the Agentic Proof Protocol chain layer. The protocol's EVM/Solidity registry, Monad client, generalized authorization model and independent verifier are authored for this project.

## Hackathon benchmark references — no source copied

Two public Solana Breakout 2025 AI-track submissions were reviewed as product/architecture benchmarks while preparing the Monad submission:

- `dennj/latinum-colosseum` — observed payment-challenge → wallet → facilitator flow. The reviewed repository does not declare an explicit source license, so no source code from it is copied or adapted here. APP independently implements a generic commerce-challenge adapter that converts a machine-readable payment requirement into APP's existing typed action + deterministic policy model; it deliberately does not inherit Latinum's server-side signing pattern.
- `ProjectPlutusAI/breakout` — reviewed as a specialist-agent orchestration example (trading/social/token-launch roles). APP independently implements an explicit capability manifest whose hash can bind declared agent role/capabilities to registry metadata instead of copying those agent scripts.

These references informed feature selection and demo packaging only. APP's commerce adapter, capability manifest, tests and UI text are independently authored for this repository.
