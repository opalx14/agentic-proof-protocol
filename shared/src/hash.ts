import { keccak256, sha256, stringToHex } from 'viem';
import type { Hex32 } from './types';

function normalize(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalize);

  const record = value as Record<string, unknown>;
  return Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      const current = record[key];
      if (current !== undefined) acc[key] = normalize(current);
      return acc;
    }, {});
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value));
}

/** SHA-256 commitment used for private/offchain payloads and Travel trace compatibility. */
export function hashPayload(value: unknown): Hex32 {
  return sha256(stringToHex(canonicalize(value))) as Hex32;
}

/** Keccak-256 commitment used for EVM-oriented identifiers such as scope/action type IDs. */
export function hashEvmValue(value: unknown): Hex32 {
  return keccak256(stringToHex(canonicalize(value))) as Hex32;
}

export function hashActionType(actionType: string): Hex32 {
  return keccak256(stringToHex(actionType.trim().toUpperCase())) as Hex32;
}

export function createScopeHash(scope: unknown): Hex32 {
  return hashEvmValue(scope);
}

export function createActionHash(payload: unknown): Hex32 {
  return hashPayload(payload);
}

export function emptyHash(): Hex32 {
  return `0x${'0'.repeat(64)}`;
}
