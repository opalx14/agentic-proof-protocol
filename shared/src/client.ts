import { createPublicClient, http } from 'viem';
import { AGENTIC_PROOF_ABI } from './contract';
import { createActionHash } from './hash';
import type {
  ActionProofRecord,
  Address,
  AuthorizationRecord,
  Hex32,
  OutcomeAttestationRecord,
  ProofBundle,
} from './types';

export type RegistryReaderConfig = {
  rpcUrl: string;
  contractAddress: Address;
};

export function createRegistryReader(config: RegistryReaderConfig) {
  const client = createPublicClient({ transport: http(config.rpcUrl) });

  async function readAuthorization(authorizationId: Hex32): Promise<AuthorizationRecord | null> {
    const value = await client.readContract({
      address: config.contractAddress,
      abi: AGENTIC_PROOF_ABI,
      functionName: 'getAuthorization',
      args: [authorizationId],
    });
    if (!value || value.user === '0x0000000000000000000000000000000000000000') return null;
    return value as AuthorizationRecord;
  }

  async function readAction(actionId: Hex32): Promise<ActionProofRecord | null> {
    const value = await client.readContract({
      address: config.contractAddress,
      abi: AGENTIC_PROOF_ABI,
      functionName: 'getAction',
      args: [actionId],
    });
    if (!value || value.agent === '0x0000000000000000000000000000000000000000') return null;
    return value as ActionProofRecord;
  }

  async function readAttestation(actionId: Hex32): Promise<OutcomeAttestationRecord | null> {
    const value = await client.readContract({
      address: config.contractAddress,
      abi: AGENTIC_PROOF_ABI,
      functionName: 'getAttestation',
      args: [actionId],
    });
    if (!value || value.attestor === '0x0000000000000000000000000000000000000000') return null;
    return value as OutcomeAttestationRecord;
  }

  async function readProofBundle(actionId: Hex32, payload?: unknown): Promise<ProofBundle> {
    const [action, checksRaw, attestation] = await Promise.all([
      readAction(actionId),
      client.readContract({
        address: config.contractAddress,
        abi: AGENTIC_PROOF_ABI,
        functionName: 'verifyAction',
        args: [actionId],
      }),
      readAttestation(actionId),
    ]);

    const authorization = action ? await readAuthorization(action.authorizationId) : null;
    const [existsOnchain, authorizationValidAtActionTime, authorizationCurrentlyActive, attested] = checksRaw;
    const payloadMatches = payload !== undefined && action
      ? createActionHash(payload).toLowerCase() === action.actionHash.toLowerCase()
      : undefined;

    return {
      authorization,
      action,
      attestation,
      checks: {
        existsOnchain,
        authorizationValidAtActionTime,
        authorizationCurrentlyActive,
        attested,
        ...(payloadMatches === undefined ? {} : { payloadMatches }),
      },
    };
  }

  return {
    client,
    readAuthorization,
    readAction,
    readAttestation,
    readProofBundle,
  };
}
