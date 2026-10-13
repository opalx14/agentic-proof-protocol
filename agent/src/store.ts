import { createHash } from 'node:crypto';
import type { Policy, PolicyDecision } from '@agentic-proof/shared';

export type ActionRequestStatus = 'prepared' | 'submitted' | 'confirmed' | 'outcome_unknown' | 'blocked';

export type ActionRequest = {
  idempotencyKey: string;
  fingerprint: string;
  actionId: `0x${string}`;
  authorizationId: `0x${string}`;
  decision: PolicyDecision;
  status: ActionRequestStatus;
  txHash?: `0x${string}`;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Small in-process store inspired by NexusWallet's idempotency/request persistence boundary.
 * It prevents the API from blindly sending the same logical action twice during one runtime.
 */
export class Store {
  private policy: Policy;
  private readonly requests = new Map<string, ActionRequest>();
  private readonly usedNonces = new Set<string>();

  constructor(policy: Policy) {
    this.policy = policy;
  }

  getPolicy(): Policy {
    return this.policy;
  }

  setPolicy(next: Policy): Policy {
    this.policy = next;
    return this.policy;
  }

  getRequest(idempotencyKey: string): ActionRequest | undefined {
    return this.requests.get(idempotencyKey);
  }

  putRequest(request: ActionRequest): ActionRequest {
    this.requests.set(request.idempotencyKey, request);
    return request;
  }

  listRequests(): ActionRequest[] {
    return [...this.requests.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  isNonceUsed(nonce: string): boolean {
    return this.usedNonces.has(nonce);
  }

  markNonceUsed(nonce: string): void {
    this.usedNonces.add(nonce);
  }

  usedNonceSet(): ReadonlySet<string> {
    return this.usedNonces;
  }
}
