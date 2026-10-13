import { createPublicClient, http } from 'viem';
import type { Address, Hex32 } from './types';

export type OnchainPersonalProfileRecord = {
  owner: Address;
  profileHash: Hex32;
  policyHash: Hex32;
  encryptionKeyCommitment: Hex32;
  version: bigint;
  updatedAt: bigint;
  active: boolean;
  paymentCount: bigint;
  totalRecordedValue: bigint;
};

export type PrivatePaymentReceiptRecord = {
  receiptId: Hex32;
  user: Address;
  actionId: Hex32;
  authorizationId: Hex32;
  encryptedPayloadHash: Hex32;
  profileHash: Hex32;
  policyHash: Hex32;
  value: bigint;
  linkedAt: bigint;
};

export const PERSONAL_PROFILE_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'profileId',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'getProfile',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'owner', type: 'address' },
        { name: 'profileHash', type: 'bytes32' },
        { name: 'policyHash', type: 'bytes32' },
        { name: 'encryptionKeyCommitment', type: 'bytes32' },
        { name: 'version', type: 'uint64' },
        { name: 'updatedAt', type: 'uint64' },
        { name: 'active', type: 'bool' },
        { name: 'paymentCount', type: 'uint64' },
        { name: 'totalRecordedValue', type: 'uint256' },
      ],
    }],
  },
  {
    type: 'function',
    name: 'getPaymentReceipt',
    stateMutability: 'view',
    inputs: [{ name: 'receiptId', type: 'bytes32' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'receiptId', type: 'bytes32' },
        { name: 'user', type: 'address' },
        { name: 'actionId', type: 'bytes32' },
        { name: 'authorizationId', type: 'bytes32' },
        { name: 'encryptedPayloadHash', type: 'bytes32' },
        { name: 'profileHash', type: 'bytes32' },
        { name: 'policyHash', type: 'bytes32' },
        { name: 'value', type: 'uint256' },
        { name: 'linkedAt', type: 'uint64' },
      ],
    }],
  },
  {
    type: 'function',
    name: 'receiptIdByAction',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const;

export function createPersonalProfileReader(config: { rpcUrl: string; contractAddress: Address }) {
  const client = createPublicClient({ transport: http(config.rpcUrl) });

  async function readProfile(user: Address): Promise<OnchainPersonalProfileRecord | null> {
    const value = await client.readContract({
      address: config.contractAddress,
      abi: PERSONAL_PROFILE_REGISTRY_ABI,
      functionName: 'getProfile',
      args: [user],
    });
    if (value.owner === '0x0000000000000000000000000000000000000000') return null;
    return value as OnchainPersonalProfileRecord;
  }

  async function readPaymentReceipt(receiptId: Hex32): Promise<PrivatePaymentReceiptRecord | null> {
    const value = await client.readContract({
      address: config.contractAddress,
      abi: PERSONAL_PROFILE_REGISTRY_ABI,
      functionName: 'getPaymentReceipt',
      args: [receiptId],
    });
    if (value.user === '0x0000000000000000000000000000000000000000') return null;
    return value as PrivatePaymentReceiptRecord;
  }

  return { client, readProfile, readPaymentReceipt };
}
