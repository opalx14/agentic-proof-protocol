import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  AGENTIC_PROOF_ABI,
  ActionPrepareRequestSchema,
  AddressSchema,
  Hex32Schema,
  PolicySchema,
  ProposedActionSchema,
  buildAuthorizationTypedData,
  createActionHash,
  createRegistryReader,
  createScopeHash,
  defaultPolicy,
  emptyHash,
  evaluatePolicy,
  hashActionType,
  hashEvmValue,
  type Address,
  type Hex32,
  type PolicyDecision,
  type ProposedAction,
} from '@agentic-proof/shared';
import { AuditLog } from './audit.js';
import { type AppConfig, loadConfig } from './config.js';
import { AgentProposalRequestSchema, createAgentProposal } from './proposal.js';
import { registerRemoteMcp } from './mcp-remote.js';
import { Store, fingerprint, type ActionRequest } from './store.js';

const DEMO_AGENT = '0x1111111111111111111111111111111111111111' as const;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

const AuthorizationPrepareSchema = z.object({
  user: AddressSchema,
  agent: AddressSchema,
  actionType: z.string().trim().min(1).max(64),
  scopeHash: Hex32Schema.optional(),
  scope: z.unknown().optional(),
  maxValue: z.string().regex(/^\d+$/),
  validAfter: z.number().int().nonnegative(),
  validUntil: z.number().int().positive(),
  nonce: z.string().regex(/^\d+$/),
  attestor: AddressSchema.default(ZERO_ADDRESS),
  singleUse: z.boolean().default(false),
  chainId: z.number().int().positive().optional(),
  contractAddress: AddressSchema.optional(),
});

const VerifySchema = z.object({
  actionId: Hex32Schema,
  payload: z.unknown().optional(),
});

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function jsonSafe<T>(value: T): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map((item) => jsonSafe(item));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, jsonSafe(item)]),
    );
  }
  return value;
}

export function buildServer(config: AppConfig = loadConfig()) {
  const app = Fastify({ logger: false });
  void app.register(cors, { origin: true });
  registerRemoteMcp(app, config);

  const account = config.APP_AGENT_PRIVATE_KEY
    ? privateKeyToAccount(config.APP_AGENT_PRIVATE_KEY as `0x${string}`)
    : undefined;
  const agentAddress = (config.APP_AGENT_ADDRESS ?? account?.address ?? DEMO_AGENT) as Address;
  const store = new Store(defaultPolicy(agentAddress));
  const audit = new AuditLog(config.APP_AUDIT_PATH);

  const publicClient = config.APP_RPC_URL ? createPublicClient({ transport: http(config.APP_RPC_URL) }) : null;
  const walletClient = config.APP_RPC_URL && account
    ? createWalletClient({ account, transport: http(config.APP_RPC_URL) })
    : null;

  function chainReady(): boolean {
    return Boolean(config.APP_RPC_URL && config.APP_CONTRACT_ADDRESS);
  }

  function policyForAction(action: ProposedAction) {
    return { ...store.getPolicy(), agentAddress: action.agent as Address };
  }

  function prepare(input: z.infer<typeof ActionPrepareRequestSchema>) {
    const authorizationId = input.authorizationId as Hex32;
    const scopeHash = input.action.scopeHash as Hex32;
    const actionHash = createActionHash(input.payload);
    if (input.action.payloadHash && input.action.payloadHash.toLowerCase() !== actionHash.toLowerCase()) {
      throw new Error('payload hash does not match action.payloadHash');
    }

    const decision = evaluatePolicy(policyForAction(input.action), input.action, {
      usedNonces: store.usedNonceSet(),
    });
    const actionTypeHash = hashActionType(input.action.actionType);
    const actionId = hashEvmValue({
      authorizationId,
      actionHash,
      nonce: input.action.nonce,
      agent: input.action.agent.toLowerCase(),
    });

    return {
      actionHash,
      actionTypeHash,
      actionId,
      traceRoot: input.action.traceRoot ?? emptyHash(),
      decision,
      txArgs: [
        authorizationId,
        actionId,
        actionTypeHash,
        scopeHash,
        actionHash,
        (input.action.traceRoot ?? emptyHash()) as Hex32,
        BigInt(input.action.value),
      ] as const,
    };
  }

  app.get('/health', async () => ({
    ok: true,
    service: 'agentic-proof-agent',
    chainReady: chainReady(),
    signerReady: Boolean(walletClient),
  }));

  app.get('/api/config', async () => ({
    chainId: config.APP_CHAIN_ID ?? null,
    rpcConfigured: Boolean(config.APP_RPC_URL),
    contractAddress: config.APP_CONTRACT_ADDRESS ?? null,
    explorerUrl: config.APP_EXPLORER_URL ?? null,
    agentAddress,
  }));

  app.get('/api/policy', async () => store.getPolicy());

  app.post('/api/proposal', async (request, reply) => {
    const parsed = AgentProposalRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_proposal_request', issues: parsed.error.issues });
    try {
      const proposal = await createAgentProposal(config, parsed.data);
      audit.record('agent.proposed', proposal.action.idempotencyKey ?? null, {
        provider: proposal.model.provider,
        fallback: proposal.model.fallback,
        actionType: proposal.action.actionType,
        scopeHash: proposal.action.scopeHash,
        value: proposal.action.value,
      });
      return proposal;
    } catch (error) {
      return reply.code(502).send({ error: 'proposal_failed', message: safeError(error) });
    }
  });

  app.post('/api/agent/register', async (_request, reply) => {
    if (!walletClient || !publicClient || !config.APP_CONTRACT_ADDRESS) {
      return reply.code(503).send({ error: 'chain_execution_not_configured' });
    }

    const agentId = hashEvmValue({ namespace: 'agentic-proof', agent: agentAddress.toLowerCase() });
    const metadataHash = hashEvmValue({
      name: 'Agentic Proof Reference Agent',
      version: '0.1.0',
      role: 'reference-agent',
    });

    try {
      const existing = await publicClient.readContract({
        address: config.APP_CONTRACT_ADDRESS as Address,
        abi: AGENTIC_PROOF_ABI,
        functionName: 'getAgent',
        args: [agentId],
      });
      if (existing.agent !== ZERO_ADDRESS) {
        return { alreadyRegistered: true, agentId, agent: existing };
      }

      const txHash = await walletClient.writeContract({
        chain: null,
        address: config.APP_CONTRACT_ADDRESS as Address,
        abi: AGENTIC_PROOF_ABI,
        functionName: 'registerAgent',
        args: [agentId, metadataHash],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      audit.record('agent.registered', null, { agentId, txHash, status: receipt.status });
      return { alreadyRegistered: false, agentId, txHash, status: receipt.status };
    } catch (error) {
      return reply.code(502).send({ error: 'agent_registration_failed', message: safeError(error) });
    }
  });

  app.put('/api/policy', async (request, reply) => {
    const parsed = PolicySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_policy', issues: parsed.error.issues });
    const current = store.getPolicy();
    const next = {
      ...parsed.data,
      version: Math.max(current.version + 1, parsed.data.version),
      updatedAt: new Date().toISOString(),
    };
    store.setPolicy(next);
    audit.record('policy.updated', null, { version: next.version, enabled: next.enabled });
    return next;
  });

  app.post('/api/policy/evaluate', async (request, reply) => {
    const parsed = ProposedActionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_action', issues: parsed.error.issues });
    const decision = evaluatePolicy(policyForAction(parsed.data), parsed.data, { usedNonces: store.usedNonceSet() });
    audit.record('policy.evaluated', parsed.data.idempotencyKey ?? null, {
      verdict: decision.verdict,
      code: decision.code ?? null,
      actionType: parsed.data.actionType,
      scopeHash: parsed.data.scopeHash,
      value: parsed.data.value,
    });
    return decision;
  });

  app.post('/api/authorization/prepare', async (request, reply) => {
    const parsed = AuthorizationPrepareSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_authorization', issues: parsed.error.issues });
    const input = parsed.data;
    const chainId = input.chainId ?? config.APP_CHAIN_ID;
    const contractAddress = (input.contractAddress ?? config.APP_CONTRACT_ADDRESS) as Address | undefined;
    if (!chainId || !contractAddress) {
      return reply.code(400).send({ error: 'chain_configuration_required' });
    }
    if (input.validUntil <= input.validAfter) {
      return reply.code(400).send({ error: 'invalid_time_window' });
    }
    const scopeHash = (input.scopeHash ?? createScopeHash(input.scope ?? {})) as Hex32;
    const actionType = hashActionType(input.actionType);
    const typedData = buildAuthorizationTypedData({
      chainId,
      verifyingContract: contractAddress,
      user: input.user as Address,
      agent: input.agent as Address,
      actionType,
      scopeHash,
      maxValue: BigInt(input.maxValue),
      validAfter: BigInt(input.validAfter),
      validUntil: BigInt(input.validUntil),
      nonce: BigInt(input.nonce),
      attestor: input.attestor as Address,
      singleUse: input.singleUse,
    });

    return {
      actionType,
      scopeHash,
      typedData: jsonSafe(typedData),
      directGrantArgs: [
        input.agent,
        actionType,
        scopeHash,
        input.maxValue,
        input.validAfter,
        input.validUntil,
        input.nonce,
        input.attestor,
        input.singleUse,
      ],
      note: 'MVP contract uses direct user transaction for grantAuthorization; typed data is prepared for wallet/DX and relayed authorization work.',
    };
  });

  app.post('/api/action/prepare', async (request, reply) => {
    const parsed = ActionPrepareRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_action_request', issues: parsed.error.issues });
    try {
      return jsonSafe(prepare(parsed.data));
    } catch (error) {
      return reply.code(400).send({ error: 'prepare_failed', message: safeError(error) });
    }
  });

  app.post('/api/action/record', async (request, reply) => {
    const parsed = ActionPrepareRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_action_request', issues: parsed.error.issues });
    const input = parsed.data;
    const key = input.action.idempotencyKey;
    if (!key) return reply.code(400).send({ error: 'idempotency_key_required' });

    let prepared: ReturnType<typeof prepare>;
    try {
      prepared = prepare(input);
    } catch (error) {
      return reply.code(400).send({ error: 'prepare_failed', message: safeError(error) });
    }

    const requestFingerprint = fingerprint({
      authorizationId: input.authorizationId,
      action: input.action,
      actionHash: prepared.actionHash,
    });
    const existing = store.getRequest(key);
    if (existing) {
      if (existing.fingerprint !== requestFingerprint) {
        return reply.code(409).send({ error: 'idempotency_conflict', request: existing });
      }
      return existing;
    }

    const now = new Date().toISOString();
    const record: ActionRequest = {
      idempotencyKey: key,
      fingerprint: requestFingerprint,
      actionId: prepared.actionId,
      authorizationId: input.authorizationId as Hex32,
      decision: prepared.decision,
      status: prepared.decision.verdict === 'ALLOW' ? 'prepared' : 'blocked',
      createdAt: now,
      updatedAt: now,
    };
    store.putRequest(record);

    if (prepared.decision.verdict !== 'ALLOW') {
      audit.record('action.blocked', key, {
        verdict: prepared.decision.verdict,
        code: prepared.decision.code ?? null,
        actionId: prepared.actionId,
      });
      return reply.code(409).send(record);
    }

    if (!walletClient || !publicClient || !config.APP_CONTRACT_ADDRESS) {
      audit.record('action.prepared', key, { actionId: prepared.actionId, chainReady: chainReady() });
      return reply.code(503).send({
        error: 'chain_execution_not_configured',
        request: record,
        txArgs: prepared.txArgs.map((value) => typeof value === 'bigint' ? value.toString() : value),
      });
    }

    try {
      const submitted = store.putRequest({ ...record, status: 'submitted', updatedAt: new Date().toISOString() });
      const txHash = await walletClient.writeContract({
        chain: null,
        address: config.APP_CONTRACT_ADDRESS as Address,
        abi: AGENTIC_PROOF_ABI,
        functionName: 'recordAction',
        args: prepared.txArgs,
      });
      store.markNonceUsed(input.action.nonce);
      store.putRequest({ ...submitted, txHash, updatedAt: new Date().toISOString() });
      audit.record('action.submitted', key, { actionId: prepared.actionId, txHash });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const confirmed = store.putRequest({
        ...submitted,
        txHash,
        status: receipt.status === 'success' ? 'confirmed' : 'outcome_unknown',
        updatedAt: new Date().toISOString(),
        ...(receipt.status === 'success' ? {} : { error: 'transaction receipt reverted' }),
      });
      audit.record('action.receipt', key, { actionId: prepared.actionId, txHash, status: receipt.status });
      return confirmed;
    } catch (error) {
      const uncertain = store.putRequest({
        ...record,
        status: 'outcome_unknown',
        updatedAt: new Date().toISOString(),
        error: safeError(error),
      });
      audit.record('action.outcome_unknown', key, { actionId: prepared.actionId, message: safeError(error) });
      return reply.code(502).send({
        error: 'outcome_unknown',
        message: 'The action may or may not have reached the chain. Do not blindly resend; verify the action ID first.',
        request: uncertain,
      });
    }
  });

  app.post('/api/verify', async (request, reply) => {
    const parsed = VerifySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_verify_request', issues: parsed.error.issues });
    if (!config.APP_RPC_URL || !config.APP_CONTRACT_ADDRESS) {
      return reply.code(503).send({ error: 'chain_configuration_required' });
    }
    try {
      const reader = createRegistryReader({
        rpcUrl: config.APP_RPC_URL,
        contractAddress: config.APP_CONTRACT_ADDRESS as Address,
      });
      const bundle = await reader.readProofBundle(parsed.data.actionId as Hex32, parsed.data.payload);
      return jsonSafe(bundle);
    } catch (error) {
      return reply.code(502).send({ error: 'verification_failed', message: safeError(error) });
    }
  });

  app.get('/api/requests', async () => store.listRequests());
  app.get('/api/audit', async () => ({ integrity: audit.verifyIntegrity(), entries: audit.list(100) }));

  return { app, store, audit, agentAddress };
}
