export type Address = `0x${string}`;
export type Hex32 = `0x${string}`;

export type ProposedAction = {
  agent: Address;
  actionType: string;
  scopeHash: Hex32;
  value: string;
  currency: string;
  resource: string;
  nonce: string;
  expiresAt?: string | null;
  payloadHash?: Hex32;
  traceRoot?: Hex32;
  idempotencyKey?: string;
};

export type Policy = {
  version: number;
  agentAddress: Address;
  enabled: boolean;
  allowedActionTypes: string[];
  allowedScopeHashes: Hex32[];
  maxValue: string;
  approvalAboveValue: string | null;
  validUntil: string | null;
  updatedAt: string;
};

export type AuthorizationContext = {
  actionType: string;
  scopeHash: Hex32;
  maxValue: string;
  validAfter: number;
  validUntil: number;
  revoked: boolean;
};

export type PolicyEvaluationContext = {
  nowMs?: number;
  usedNonces?: ReadonlySet<string>;
  authorization?: AuthorizationContext | null;
};

export type PolicyDecision = {
  verdict: 'ALLOW' | 'BLOCK' | 'ESCALATE';
  code?: string;
  reasons: string[];
  policyVersion: number;
  action: ProposedAction;
};

export type AuthorizationRecord = {
  authorizationId: Hex32;
  user: Address;
  agent: Address;
  actionType: Hex32;
  scopeHash: Hex32;
  maxValue: bigint;
  validAfter: bigint;
  validUntil: bigint;
  nonce: bigint;
  revoked: boolean;
  revokedAt: bigint;
  attestor: Address;
  singleUse: boolean;
  actionCount: bigint;
};

export type ActionProofRecord = {
  actionId: Hex32;
  authorizationId: Hex32;
  actionType: Hex32;
  scopeHash: Hex32;
  actionHash: Hex32;
  traceRoot: Hex32;
  value: bigint;
  recordedAt: bigint;
  agent: Address;
};

export type OutcomeAttestationRecord = {
  actionId: Hex32;
  resultHash: Hex32;
  status: Hex32;
  attestor: Address;
  attestedAt: bigint;
};

export type ProofBundle = {
  authorization: AuthorizationRecord | null;
  action: ActionProofRecord | null;
  attestation: OutcomeAttestationRecord | null;
  checks: {
    existsOnchain: boolean;
    authorizationValidAtActionTime: boolean;
    authorizationCurrentlyActive: boolean;
    attested: boolean;
    payloadMatches?: boolean;
  };
};

export type ProofTrustRequirements = {
  expectedAgent?: Address;
  maxValue?: bigint;
  requireCurrentAuthorization?: boolean;
  requirePayloadMatch?: boolean;
  requireAttestation?: boolean;
};

export type ProofTrustDecision = {
  verdict: 'ACCEPT' | 'REJECT';
  reasons: string[];
};

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

export type CommerceChallenge = {
  version: '1';
  network: string;
  asset: string;
  payTo: string;
  amount: string;
  resource: string;
  requestId?: string;
  expiresAt?: string | null;
};

export type CommerceActionInput = {
  agent: Address;
  nonce: string;
  challenge: CommerceChallenge;
};

export type CommerceActionBundle = {
  action: ProposedAction;
  scope: { network: string; asset: string; payTo: string; resource: string };
  payload: {
    kind: 'APP_COMMERCE_CHALLENGE';
    version: '1';
    network: string;
    asset: string;
    payTo: string;
    amount: string;
    resource: string;
    requestId?: string;
    expiresAt?: string | null;
  };
};

export type TravelQuoteSource = 'DEMO' | 'ATLAS' | 'PROVIDER';
export type TravelQuote = {
  version: '1';
  source: TravelQuoteSource;
  provider: string;
  offerId: string;
  origin: string;
  destination: string;
  cabin: string;
  total: string;
  currency: string;
  observedAt: string;
  expiresAt: string;
};
export type TravelQuoteActionBundle = {
  quote: TravelQuote;
  quoteHash: Hex32;
  scope: {
    kind: 'APP_TRAVEL_VERIFIED_QUOTE';
    provider: string;
    offerId: string;
    origin: string;
    destination: string;
    cabin: string;
    currency: string;
    quoteHash: Hex32;
  };
  action: ProposedAction;
  payload: {
    kind: 'APP_TRAVEL_QUOTE';
    version: '1';
    source: TravelQuoteSource;
    provider: string;
    offerId: string;
    origin: string;
    destination: string;
    cabin: string;
    total: string;
    currency: string;
    observedAt: string;
    expiresAt: string;
  };
};

export type AgentCapability = { actionType: string; description: string };
export type AgentManifest = {
  version: '1';
  agent: Address;
  name: string;
  role: string;
  capabilities: AgentCapability[];
  endpoint?: string;
};

export type ProfilePersona = 'PERSONAL' | 'BUSINESS_TRAVELER' | 'PROCUREMENT_OFFICER' | 'DEFI_OPERATOR';
export type ProfilePolicy = {
  allowedActionTypes: string[];
  allowedScopeHashes: Hex32[];
  maxPerAction: string;
  dailyBudget: string;
  approvalAboveValue: string | null;
};
export type UserProfile = {
  version: '1';
  user: Address;
  alias: string;
  persona: ProfilePersona;
  policy: ProfilePolicy;
  encryptionKeyCommitment: Hex32;
  createdAt: string;
};
export type ProfilePolicyDecision = {
  verdict: 'ALLOW' | 'BLOCK' | 'ESCALATE';
  code?: 'PROFILE_ACTION_NOT_ALLOWED' | 'PROFILE_SCOPE_NOT_ALLOWED' | 'PROFILE_VALUE_EXCEEDS_LIMIT' | 'PROFILE_DAILY_BUDGET_EXCEEDED' | 'PROFILE_APPROVAL_REQUIRED';
  reasons: string[];
  profileHash: Hex32;
  action: ProposedAction;
};
export type EncryptedReceiptBundle = {
  version: '1';
  algorithm: 'A256GCM';
  iv: string;
  ciphertext: string;
  plaintextHash: Hex32;
  associatedDataHash: Hex32;
  commitment: Hex32;
};
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

export type ReferenceScenario = {
  id: 'travel' | 'procurement';
  name: string;
  actionType: string;
  scope: Record<string, unknown>;
  maxValue: string;
  proposedValue: string;
  rejectedValue: string;
  currency: string;
  resource: string;
};

export type RegistryReaderConfig = { rpcUrl: string; contractAddress: Address };
export type RegistryReader = {
  client: unknown;
  readAuthorization(authorizationId: Hex32): Promise<AuthorizationRecord | null>;
  readAction(actionId: Hex32): Promise<ActionProofRecord | null>;
  readAttestation(actionId: Hex32): Promise<OutcomeAttestationRecord | null>;
  readProofBundle(actionId: Hex32, payload?: unknown): Promise<ProofBundle>;
};

export const AGENTIC_PROOF_ABI: readonly unknown[];
export const TRAVEL_REFERENCE_SCENARIO: ReferenceScenario;
export const PROCUREMENT_REFERENCE_SCENARIO: ReferenceScenario;
export const SPENDING_SCOPE_DOMAIN: Hex32;
export const SPENDING_ACTION_DOMAIN: Hex32;
export const PERSONAL_PROFILE_REGISTRY_ABI: readonly unknown[];
export const PROFILE_SCOPE_DOMAIN: Hex32;

export function canonicalize(value: unknown): string;
export function hashPayload(value: unknown): Hex32;
export function hashEvmValue(value: unknown): Hex32;
export function hashActionType(actionType: string): Hex32;
export function createScopeHash(scope: unknown): Hex32;
export function createActionHash(payload: unknown): Hex32;
export function createSpendingResourceHash(resource: string): Hex32;
export function createSpendingScopeHash(input: {
  chainId: bigint | number;
  token: Address;
  recipient: Address;
  resource: string;
}): Hex32;
export function createSpendingActionId(input: {
  chainId: bigint | number;
  vault: Address;
  authorizationId: Hex32;
  token: Address;
  recipient: Address;
  amount: bigint;
  resource: string;
  paymentNonce: bigint;
}): Hex32;
export function createUserProfile(user: Address, input: Omit<UserProfile, 'version' | 'user'>): UserProfile;
export function createUserProfileHash(profile: UserProfile): Hex32;
export function createProfilePolicyHash(policy: ProfilePolicy): Hex32;
export function createProfileBoundScopeHash(profileHash: Hex32, actionScopeHash: Hex32): Hex32;
export function evaluateProfilePolicy(profile: UserProfile, action: ProposedAction, context?: { spentToday?: bigint | string }): ProfilePolicyDecision;
export function generateProfileEncryptionKey(): Hex32;
export function createEncryptionKeyCommitment(key: Hex32): Hex32;
export function createEncryptedReceiptCommitment(bundle: Omit<EncryptedReceiptBundle, 'commitment'>): Hex32;
export function encryptPrivateReceipt(payload: unknown, key: Hex32, associatedData?: unknown): Promise<EncryptedReceiptBundle>;
export function decryptPrivateReceipt<T = unknown>(bundle: EncryptedReceiptBundle, key: Hex32, associatedData?: unknown): Promise<T>;
export function createPersonalProfileReader(config: { rpcUrl: string; contractAddress: Address }): {
  client: unknown;
  readProfile(user: Address): Promise<OnchainPersonalProfileRecord | null>;
  readPaymentReceipt(receiptId: Hex32): Promise<PrivatePaymentReceiptRecord | null>;
};

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
}): Hex32;
export function emptyHash(): Hex32;

export function evaluatePolicy(policy: Policy, action: ProposedAction, context?: PolicyEvaluationContext): PolicyDecision;
export function defaultPolicy(agentAddress: Address): Policy;
export function evaluateProofTrust(proof: ProofBundle, requirements?: ProofTrustRequirements): ProofTrustDecision;

export function buildAuthorizationTypedData(input: AuthorizationTypedDataInput): Readonly<Record<string, unknown>>;
export function createRegistryReader(config: RegistryReaderConfig): RegistryReader;

export function commerceChallengeToAction(input: CommerceActionInput): CommerceActionBundle;
export function createTravelQuoteHash(quote: TravelQuote): Hex32;
export function createTravelQuoteScopeHash(quote: TravelQuote): Hex32;
export function travelQuoteChanged(previous: TravelQuote, current: TravelQuote): boolean;
export function travelQuoteToAction(input: { agent: Address; nonce: string; quote: TravelQuote }): TravelQuoteActionBundle;
export function createAgentManifest(agent: Address, input: Omit<AgentManifest, 'version' | 'agent'>): AgentManifest;
export function createAgentManifestHash(manifest: AgentManifest): Hex32;
export function manifestAllowsAction(manifest: AgentManifest, action: Pick<ProposedAction, 'agent' | 'actionType'>): boolean;

export function policyForScenario(agentAddress: Address, scenario: ReferenceScenario): Policy;
export function actionForScenario(agentAddress: Address, scenario: ReferenceScenario, options?: { value?: string; nonce?: string }): ProposedAction;
