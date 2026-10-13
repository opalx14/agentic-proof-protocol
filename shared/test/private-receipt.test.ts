import { describe, expect, it } from 'vitest';
import {
  createEncryptionKeyCommitment,
  decryptPrivateReceipt,
  encryptPrivateReceipt,
  generateProfileEncryptionKey,
} from '../src/private-receipt';

const receipt = {
  paymentId: 'pay-demo-361',
  passenger: 'PRIVATE USER',
  route: 'SFO-SIN',
  provider: 'DEMO-AIRLINE',
  amount: '361000000',
  currency: 'USDC6',
};

const aad = {
  profile: `0x${'11'.repeat(32)}`,
  actionId: `0x${'22'.repeat(32)}`,
};

describe('private payment receipts', () => {
  it('encrypts/decrypts private receipt data and commits to the encryption key', async () => {
    const key = generateProfileEncryptionKey();
    expect(key).toMatch(/^0x[0-9a-f]{64}$/);
    expect(createEncryptionKeyCommitment(key)).toMatch(/^0x[0-9a-f]{64}$/);

    const encrypted = await encryptPrivateReceipt(receipt, key, aad);
    expect(encrypted.algorithm).toBe('A256GCM');
    expect(encrypted.iv).not.toBe('0x');
    expect(encrypted.ciphertext).not.toContain('PRIVATE USER');
    expect(encrypted.commitment).toMatch(/^0x[0-9a-f]{64}$/);

    const decrypted = await decryptPrivateReceipt<typeof receipt>(encrypted, key, aad);
    expect(decrypted).toEqual(receipt);
  });

  it('fails closed for wrong key, tampered ciphertext and wrong associated data', async () => {
    const key = generateProfileEncryptionKey();
    const encrypted = await encryptPrivateReceipt(receipt, key, aad);

    await expect(
      decryptPrivateReceipt(encrypted, generateProfileEncryptionKey(), aad),
    ).rejects.toThrow('PRIVATE_RECEIPT_DECRYPTION_FAILED');

    const last = encrypted.ciphertext.at(-1) ?? '0';
    const replacement = last === '0' ? '1' : '0';
    const tampered = {
      ...encrypted,
      ciphertext: `${encrypted.ciphertext.slice(0, -1)}${replacement}`,
    };
    await expect(
      decryptPrivateReceipt(tampered, key, aad),
    ).rejects.toThrow('ENCRYPTED_RECEIPT_COMMITMENT_MISMATCH');

    await expect(
      decryptPrivateReceipt(encrypted, key, { ...aad, actionId: `0x${'33'.repeat(32)}` }),
    ).rejects.toThrow('ENCRYPTED_RECEIPT_ASSOCIATED_DATA_MISMATCH');
  });
});
