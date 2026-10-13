import { encodeAbiParameters, keccak256, sha256, stringToHex } from 'viem';
import type { Address, Hex32 } from './types';

export const SPENDING_SCOPE_DOMAIN = keccak256(stringToHex('APP_SPENDING_SCOPE_V1')) as Hex32;
export const SPENDING_ACTION_DOMAIN = keccak256(stringToHex('APP_SPENDING_ACTION_V1')) as Hex32;

export function createSpendingResourceHash(resource: string): Hex32 {
  return keccak256(stringToHex(resource)) as Hex32;
}

export function createSpendingScopeHash(input: {
  chainId: bigint | number;
  token: Address;
  recipient: Address;
  resource: string;
}): Hex32 {
  const encoded = encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'uint256' },
      { type: 'address' },
      { type: 'address' },
      { type: 'bytes32' },
    ],
    [
      SPENDING_SCOPE_DOMAIN,
      BigInt(input.chainId),
      input.token,
      input.recipient,
      createSpendingResourceHash(input.resource),
    ],
  );
  return keccak256(encoded) as Hex32;
}

export function createSpendingActionId(input: {
  chainId: bigint | number;
  vault: Address;
  authorizationId: Hex32;
  token: Address;
  recipient: Address;
  amount: bigint;
  resource: string;
  paymentNonce: bigint;
}): Hex32 {
  const encoded = encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'uint256' },
      { type: 'address' },
      { type: 'bytes32' },
      { type: 'address' },
      { type: 'address' },
      { type: 'uint256' },
      { type: 'bytes32' },
      { type: 'uint256' },
    ],
    [
      SPENDING_ACTION_DOMAIN,
      BigInt(input.chainId),
      input.vault,
      input.authorizationId,
      input.token,
      input.recipient,
      input.amount,
      createSpendingResourceHash(input.resource),
      input.paymentNonce,
    ],
  );
  return keccak256(encoded) as Hex32;
}

export function createSpendingActionHash(input: {
  chainId: bigint | number;
  vault: Address;
  authorizationId: Hex32;
  actionId: Hex32;
  token: Address;
  recipient: Address;
  amount: bigint;
  resource: string;
  paymentNonce: bigint;
}): Hex32 {
  const encoded = encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'uint256' },
      { type: 'address' },
      { type: 'bytes32' },
      { type: 'bytes32' },
      { type: 'address' },
      { type: 'address' },
      { type: 'uint256' },
      { type: 'bytes32' },
      { type: 'uint256' },
    ],
    [
      SPENDING_ACTION_DOMAIN,
      BigInt(input.chainId),
      input.vault,
      input.authorizationId,
      input.actionId,
      input.token,
      input.recipient,
      input.amount,
      createSpendingResourceHash(input.resource),
      input.paymentNonce,
    ],
  );
  return sha256(encoded) as Hex32;
}
