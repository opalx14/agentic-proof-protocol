// Adapted from NexusWallet's MIT-licensed append-only SHA-256 audit-chain pattern.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

const GENESIS = '0'.repeat(64);

export type AuditEntry = {
  id: string;
  at: string;
  event: string;
  requestId: string | null;
  detail: Record<string, unknown>;
  prevHash: string;
  hash: string;
};

export class AuditLog {
  private lastHash = GENESIS;

  constructor(private readonly path: string) {
    this.lastHash = this.readAll().at(-1)?.hash ?? GENESIS;
  }

  private readAll(): AuditEntry[] {
    try {
      return readFileSync(this.path, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as AuditEntry);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  record(event: string, requestId: string | null, detail: Record<string, unknown> = {}): AuditEntry {
    const id = randomUUID();
    const at = new Date().toISOString();
    const prevHash = this.lastHash;
    const body = JSON.stringify({ id, at, event, requestId, detail, prevHash });
    const hash = createHash('sha256').update(body).digest('hex');
    const entry: AuditEntry = { id, at, event, requestId, detail, prevHash, hash };

    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`);
    this.lastHash = hash;
    return entry;
  }

  list(limit = 100): AuditEntry[] {
    return this.readAll().slice(-limit).reverse();
  }

  verifyIntegrity(): { valid: boolean; compromisedIndex?: number; reason?: string } {
    const entries = this.readAll();
    let expectedPrev = GENESIS;

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry) continue;
      if (entry.prevHash !== expectedPrev) {
        return { valid: false, compromisedIndex: index, reason: 'broken_hash_chain' };
      }
      const body = JSON.stringify({
        id: entry.id,
        at: entry.at,
        event: entry.event,
        requestId: entry.requestId,
        detail: entry.detail,
        prevHash: entry.prevHash,
      });
      const calculated = createHash('sha256').update(body).digest('hex');
      if (calculated !== entry.hash) {
        return { valid: false, compromisedIndex: index, reason: 'tampered_entry_hash' };
      }
      expectedPrev = entry.hash;
    }

    return { valid: true };
  }
}
