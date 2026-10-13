# The Next.js standalone server runs with Node 22; the API and build scripts use Bun.
# Copy Bun into the Node runtime rather than assuming the Bun-only image ships Node.
FROM oven/bun:1.2.18 AS bun-runtime
FROM node:22-bookworm-slim AS deps
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
COPY shared/package.json shared/package.json
COPY agent/package.json agent/package.json
COPY mcp/package.json mcp/package.json
COPY web/package.json web/package.json
RUN bun install --frozen-lockfile

FROM deps AS app
WORKDIR /app

ARG NEXT_PUBLIC_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
ARG NEXT_PUBLIC_REGISTRY_ADDRESS=0xC8E9E58ad418c6A2bf6229216068B16f32454010
ARG NEXT_PUBLIC_CHAIN_ID=10143
ARG NEXT_PUBLIC_EXPLORER_URL=https://testnet.monadvision.com
ENV NEXT_PUBLIC_MONAD_RPC_URL=$NEXT_PUBLIC_MONAD_RPC_URL
ENV NEXT_PUBLIC_REGISTRY_ADDRESS=$NEXT_PUBLIC_REGISTRY_ADDRESS
ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID
ENV NEXT_PUBLIC_EXPLORER_URL=$NEXT_PUBLIC_EXPLORER_URL
ENV NODE_ENV=production

COPY package.json tsconfig.json ./
COPY shared ./shared
COPY agent ./agent
COPY mcp ./mcp
COPY web ./web
COPY docs ./docs
COPY THIRD_PARTY_NOTICES.md README.md ./

RUN bun run build

EXPOSE 3000
CMD ["bun", "run", "start"]
