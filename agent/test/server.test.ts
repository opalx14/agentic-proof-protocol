import { describe, expect, it } from 'vitest';
import { createScopeHash } from '@agentic-proof/shared';
import { buildServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';

function createTestServer() {
  const config = loadConfig({
    PORT: '8787',
    HOST: '127.0.0.1',
    APP_AUDIT_PATH: `/tmp/agentic-proof-test-${process.pid}-${Math.random().toString(16).slice(2)}.jsonl`,
  });
  return buildServer(config);
}

function action(value = '300000000', agent = '0x1111111111111111111111111111111111111111') {
  return {
    agent,
    actionType: 'BOOK_TRAVEL',
    scopeHash: createScopeHash({ destination: 'Singapore' }),
    value,
    currency: 'USDC6',
    resource: 'trip:sin',
    nonce: '1',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

describe('agent API', () => {
  it('prefers AGENT_PORT over hosting PORT for single-service deployment', () => {
    expect(loadConfig({ PORT: '3000', AGENT_PORT: '8787' }).PORT).toBe(8787);
  });

  it('treats blank optional secret/address env values as unset', () => {
    const config = loadConfig({ APP_AGENT_PRIVATE_KEY: '', APP_AGENT_ADDRESS: '', APP_CONTRACT_ADDRESS: '' });
    expect(config.APP_AGENT_PRIVATE_KEY).toBeUndefined();
    expect(config.APP_AGENT_ADDRESS).toBeUndefined();
    expect(config.APP_CONTRACT_ADDRESS).toBeUndefined();
  });

  it('exposes health without chain secrets', async () => {
    const { app } = createTestServer();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, chainReady: false, signerReady: false });
    await app.close();
  });

  it('turns an agent prompt into a schema-validated proposal that still obeys deterministic policy', async () => {
    const { app } = createTestServer();
    const scopeHash = createScopeHash({ origin: 'SGN', destination: 'SIN', tripType: 'round_trip', cabin: 'economy' });

    const cheapest = await app.inject({
      method: 'POST',
      url: '/api/proposal',
      payload: {
        prompt: 'Choose the cheapest demo offer for my Singapore trip.',
        agent: '0x1111111111111111111111111111111111111111',
        scopeHash,
      },
    });
    expect(cheapest.statusCode).toBe(200);
    expect(cheapest.json()).toMatchObject({
      payload: { selectedOffer: 'DEMO-OFFER-361', totalUsd: 361, providerMode: 'DEMO' },
      model: { provider: 'deterministic', fallback: true },
      action: { actionType: 'BOOK_TRAVEL', value: '361000000', scopeHash },
    });

    const overCap = await app.inject({
      method: 'POST',
      url: '/api/proposal',
      payload: {
        prompt: 'Choose the $401 demo offer even though it exceeds the cap.',
        agent: '0x1111111111111111111111111111111111111111',
        scopeHash,
      },
    });
    expect(overCap.statusCode).toBe(200);
    const proposal = overCap.json();
    expect(proposal.payload.totalUsd).toBe(401);

    const decision = await app.inject({ method: 'POST', url: '/api/policy/evaluate', payload: proposal.action });
    expect(decision.statusCode).toBe(200);
    expect(decision.json()).toMatchObject({ verdict: 'BLOCK', code: 'VALUE_EXCEEDS_HARD_LIMIT' });
    await app.close();
  });

  it('returns deterministic ALLOW and BLOCK policy decisions', async () => {
    const { app } = createTestServer();
    const allowed = await app.inject({ method: 'POST', url: '/api/policy/evaluate', payload: action() });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().verdict).toBe('ALLOW');

    const differentSessionAgent = await app.inject({
      method: 'POST',
      url: '/api/policy/evaluate',
      payload: action('300000000', '0x2222222222222222222222222222222222222222'),
    });
    expect(differentSessionAgent.statusCode).toBe(200);
    expect(differentSessionAgent.json().verdict).toBe('ALLOW');

    const blocked = await app.inject({ method: 'POST', url: '/api/policy/evaluate', payload: action('401000000') });
    expect(blocked.statusCode).toBe(200);
    expect(blocked.json()).toMatchObject({ verdict: 'BLOCK', code: 'VALUE_EXCEEDS_HARD_LIMIT' });
    await app.close();
  });

  it('serializes authorization typed data without leaking BigInt into JSON', async () => {
    const { app } = createTestServer();
    const now = Math.floor(Date.now() / 1000);
    const response = await app.inject({
      method: 'POST',
      url: '/api/authorization/prepare',
      payload: {
        user: '0x2222222222222222222222222222222222222222',
        agent: '0x1111111111111111111111111111111111111111',
        actionType: 'BOOK_TRAVEL',
        scope: { origin: 'SGN', destination: 'SIN' },
        maxValue: '400000000',
        validAfter: now - 5,
        validUntil: now + 600,
        nonce: '9001',
        attestor: '0x0000000000000000000000000000000000000000',
        singleUse: false,
        chainId: 31337,
        contractAddress: '0x3333333333333333333333333333333333333333',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.typedData.message.maxValue).toBe('400000000');
    expect(body.typedData.message.nonce).toBe('9001');
    expect(body.actionType).toMatch(/^0x[0-9a-f]{64}$/);
    expect(body.scopeHash).toMatch(/^0x[0-9a-f]{64}$/);
    await app.close();
  });

  it('serializes prepared action tx args without leaking BigInt into JSON', async () => {
    const { app } = createTestServer();
    const response = await app.inject({
      method: 'POST',
      url: '/api/action/prepare',
      payload: {
        authorizationId: `0x${'c'.repeat(64)}`,
        action: action('361000000'),
        payload: { tripId: 'sin-prepare', totalUsd: 361 },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.decision.verdict).toBe('ALLOW');
    expect(body.txArgs[6]).toBe('361000000');
    expect(body.actionId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(body.actionHash).toMatch(/^0x[0-9a-f]{64}$/);
    await app.close();
  });

  it('deduplicates identical record retries by idempotency key', async () => {
    const { app } = createTestServer();
    const payload = {
      authorizationId: `0x${'a'.repeat(64)}`,
      action: { ...action(), idempotencyKey: 'travel-1' },
      payload: { tripId: 'sin-1', total: 300 },
    };

    const first = await app.inject({ method: 'POST', url: '/api/action/record', payload });
    expect(first.statusCode).toBe(503);
    expect(first.json().request.status).toBe('prepared');

    const retry = await app.inject({ method: 'POST', url: '/api/action/record', payload });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toMatchObject({ idempotencyKey: 'travel-1', status: 'prepared' });
    await app.close();
  });

  it('rejects idempotency key reuse for a different action', async () => {
    const { app } = createTestServer();
    const base = {
      authorizationId: `0x${'b'.repeat(64)}`,
      action: { ...action(), idempotencyKey: 'same-key' },
      payload: { tripId: 'sin-1' },
    };
    await app.inject({ method: 'POST', url: '/api/action/record', payload: base });
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/action/record',
      payload: { ...base, payload: { tripId: 'sin-2' } },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error).toBe('idempotency_conflict');
    await app.close();
  });
});
