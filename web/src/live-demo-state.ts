import type { Address, AuthorizationRecord, Hex32 } from '@agentic-proof/shared';

export type RestoredAuthorizationStatus =
  | 'VALIDATING'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'REVOKED'
  | 'MISSING'
  | 'WALLET_MISMATCH'
  | 'AGENT_MISMATCH'
  | 'SCOPE_MISMATCH'
  | 'NOT_YET_ACTIVE';

export type RestoredAuthorizationCheck = {
  status: Exclude<RestoredAuthorizationStatus, 'VALIDATING'>;
  usable: boolean;
  detail: string;
};

export function canRestoreHistoricalAction(status: RestoredAuthorizationStatus): boolean {
  return status === 'ACTIVE' || status === 'REVOKED';
}

export function validateRestoredAuthorization(input: {
  authorization: AuthorizationRecord | null;
  wallet: Address | null;
  expectedAgent: Address | null;
  expectedActionType: Hex32;
  expectedScopeHash: Hex32;
  nowSeconds?: bigint;
}): RestoredAuthorizationCheck {
  const {
    authorization,
    wallet,
    expectedAgent,
    expectedActionType,
    expectedScopeHash,
    nowSeconds = BigInt(Math.floor(Date.now() / 1000)),
  } = input;

  if (!authorization) {
    return { status: 'MISSING', usable: false, detail: 'Saved authorization does not exist on the configured registry.' };
  }
  if (!wallet || authorization.user.toLowerCase() !== wallet.toLowerCase()) {
    return { status: 'WALLET_MISMATCH', usable: false, detail: 'Saved authorization belongs to a different user wallet.' };
  }
  if (!expectedAgent || authorization.agent.toLowerCase() !== expectedAgent.toLowerCase()) {
    return { status: 'AGENT_MISMATCH', usable: false, detail: 'Saved authorization targets a different agent signer.' };
  }
  if (
    authorization.actionType.toLowerCase() !== expectedActionType.toLowerCase()
    || authorization.scopeHash.toLowerCase() !== expectedScopeHash.toLowerCase()
  ) {
    return { status: 'SCOPE_MISMATCH', usable: false, detail: 'Saved authorization does not match the BOOK_TRAVEL demo scope.' };
  }
  if (authorization.revoked) {
    return { status: 'REVOKED', usable: false, detail: 'Saved authorization has been revoked onchain.' };
  }
  if (authorization.validUntil < nowSeconds) {
    return { status: 'EXPIRED', usable: false, detail: 'Saved authorization has expired onchain.' };
  }
  if (authorization.validAfter > nowSeconds) {
    return { status: 'NOT_YET_ACTIVE', usable: false, detail: 'Saved authorization is not active yet.' };
  }

  return { status: 'ACTIVE', usable: true, detail: 'Saved authorization was validated directly against the configured registry.' };
}
