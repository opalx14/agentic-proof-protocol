import { bytesToHex, hexToBytes, keccak256 } from 'viem';
import { z } from 'zod';
import { canonicalize, emptyHash, hashPayload } from './hash';
import { Hex32Schema, type Hex32 } from './types';

const HexBytesSchema = z.string().regex(/^0x(?:[a-fA-F0-9]{2})+$/, 'expected even-length hex bytes');

export const EncryptedReceiptBundleSchema = z.object({
  version: z.literal('1'),
  algorithm: z.literal('A256GCM'),
  iv: HexBytesSchema,
  ciphertext: HexBytesSchema,
  plaintextHash: Hex32Schema,
  associatedDataHash: Hex32Schema,
  commitment: Hex32Schema,
});
export type EncryptedReceiptBundle = z.infer<typeof EncryptedReceiptBundleSchema>;

function cryptoApi(): Crypto {
  if (!globalThis.crypto?.subtle) throw new Error('WEBCRYPTO_UNAVAILABLE');
  return globalThis.crypto;
}

function validateKey(key: Hex32): Uint8Array {
  const bytes = hexToBytes(key);
  if (bytes.length !== 32) throw new Error('PROFILE_KEY_MUST_BE_32_BYTES');
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function generateProfileEncryptionKey(): Hex32 {
  const bytes = new Uint8Array(32);
  cryptoApi().getRandomValues(bytes);
  return bytesToHex(bytes) as Hex32;
}

export function createEncryptionKeyCommitment(key: Hex32): Hex32 {
  return keccak256(validateKey(key)) as Hex32;
}

export function createEncryptedReceiptCommitment(
  bundle: Omit<EncryptedReceiptBundle, 'commitment'>,
): Hex32 {
  return hashPayload({
    version: bundle.version,
    algorithm: bundle.algorithm,
    iv: bundle.iv,
    ciphertext: bundle.ciphertext,
    plaintextHash: bundle.plaintextHash,
    associatedDataHash: bundle.associatedDataHash,
  });
}

export async function encryptPrivateReceipt(
  payload: unknown,
  key: Hex32,
  associatedData?: unknown,
): Promise<EncryptedReceiptBundle> {
  const api = cryptoApi();
  const iv = new Uint8Array(12);
  api.getRandomValues(iv);
  const keyBytes = validateKey(key);
  const cryptoKey = await api.subtle.importKey('raw', toArrayBuffer(keyBytes), { name: 'AES-GCM' }, false, ['encrypt']);
  const plaintext = new TextEncoder().encode(canonicalize(payload));
  const aad = associatedData === undefined
    ? undefined
    : new TextEncoder().encode(canonicalize(associatedData));

  const encrypted = await api.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      ...(aad ? { additionalData: toArrayBuffer(aad) } : {}),
    },
    cryptoKey,
    toArrayBuffer(plaintext),
  );

  const base = {
    version: '1' as const,
    algorithm: 'A256GCM' as const,
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(encrypted)),
    plaintextHash: hashPayload(payload),
    associatedDataHash: associatedData === undefined ? emptyHash() : hashPayload(associatedData),
  };

  return EncryptedReceiptBundleSchema.parse({
    ...base,
    commitment: createEncryptedReceiptCommitment(base),
  });
}

export async function decryptPrivateReceipt<T = unknown>(
  bundleInput: EncryptedReceiptBundle,
  key: Hex32,
  associatedData?: unknown,
): Promise<T> {
  const bundle = EncryptedReceiptBundleSchema.parse(bundleInput);
  const expectedCommitment = createEncryptedReceiptCommitment({
    version: bundle.version,
    algorithm: bundle.algorithm,
    iv: bundle.iv,
    ciphertext: bundle.ciphertext,
    plaintextHash: bundle.plaintextHash,
    associatedDataHash: bundle.associatedDataHash,
  });
  if (expectedCommitment.toLowerCase() !== bundle.commitment.toLowerCase()) {
    throw new Error('ENCRYPTED_RECEIPT_COMMITMENT_MISMATCH');
  }

  const expectedAadHash = associatedData === undefined ? emptyHash() : hashPayload(associatedData);
  if (expectedAadHash.toLowerCase() !== bundle.associatedDataHash.toLowerCase()) {
    throw new Error('ENCRYPTED_RECEIPT_ASSOCIATED_DATA_MISMATCH');
  }

  try {
    const api = cryptoApi();
    const cryptoKey = await api.subtle.importKey('raw', toArrayBuffer(validateKey(key)), { name: 'AES-GCM' }, false, ['decrypt']);
    const iv = hexToBytes(bundle.iv as `0x${string}`);
    const ciphertext = hexToBytes(bundle.ciphertext as `0x${string}`);
    const aad = associatedData === undefined
      ? undefined
      : new TextEncoder().encode(canonicalize(associatedData));
    const decrypted = await api.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
        ...(aad ? { additionalData: toArrayBuffer(aad) } : {}),
      },
      cryptoKey,
      toArrayBuffer(ciphertext),
    );
    const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as T;
    if (hashPayload(parsed).toLowerCase() !== bundle.plaintextHash.toLowerCase()) {
      throw new Error('PRIVATE_RECEIPT_PLAINTEXT_MISMATCH');
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PRIVATE_RECEIPT_')) throw error;
    throw new Error('PRIVATE_RECEIPT_DECRYPTION_FAILED');
  }
}
