import type { Address, Hex32 } from './types';

export type AuthorizationTypedDataInput = {
  chainId: number;
  verifyingContract: Address;
  user: Address;
  agent: Address;
  actionType: Hex32;
  scopeHash: Hex32;
  maxValue: bigint;
  validAfter: bigint;
  validUntil: bigint;
  nonce: bigint;
  attestor: Address;
  singleUse: boolean;
};

export function buildAuthorizationTypedData(input: AuthorizationTypedDataInput) {
  return {
    domain: {
      name: 'Agentic Proof Protocol',
      version: '1',
      chainId: input.chainId,
      verifyingContract: input.verifyingContract,
    },
    types: {
      Authorization: [
        { name: 'user', type: 'address' },
        { name: 'agent', type: 'address' },
        { name: 'actionType', type: 'bytes32' },
        { name: 'scopeHash', type: 'bytes32' },
        { name: 'maxValue', type: 'uint256' },
        { name: 'validAfter', type: 'uint64' },
        { name: 'validUntil', type: 'uint64' },
        { name: 'nonce', type: 'uint256' },
        { name: 'attestor', type: 'address' },
        { name: 'singleUse', type: 'bool' },
      ],
    },
    primaryType: 'Authorization' as const,
    message: {
      user: input.user,
      agent: input.agent,
      actionType: input.actionType,
      scopeHash: input.scopeHash,
      maxValue: input.maxValue,
      validAfter: input.validAfter,
      validUntil: input.validUntil,
      nonce: input.nonce,
      attestor: input.attestor,
      singleUse: input.singleUse,
    },
  } as const;
}
