import {
  TRAVEL_REFERENCE_SCENARIO,
  actionForScenario,
  commerceChallengeToAction,
  createRegistryReader,
  createSpendingActionHash,
  createSpendingActionId,
  createSpendingScopeHash,
  evaluatePolicy,
  evaluateProofTrust,
  policyForScenario,
} from '../shared/src/index.ts';

const AGENT = '0x1111111111111111111111111111111111111111' as const;
const REGISTRY = '0xC8E9E58ad418c6A2bf6229216068B16f32454010' as const;
const ACTION_ID = '0x7606c8e32a09ffbcd524b37b6e82a27ecccd5c61ad8e7b4ed2d0162716f404cf' as const;
const RPC = 'https://testnet-rpc.monad.xyz';

const green = '\x1b[32m';
const red = '\x1b[31m';
const cyan = '\x1b[36m';
const reset = '\x1b[0m';

function check(condition: boolean, label: string, detail: string) {
  if (!condition) {
    console.error(`${red}FAIL${reset} ${label} — ${detail}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`${green}PASS${reset} ${label} — ${detail}`);
  return true;
}

console.log(`${cyan}Agentic Proof Protocol · judge quick run${reset}`);
console.log('No wallet, signer, private key, or transaction broadcast is used.\n');

const policy = policyForScenario(AGENT, TRAVEL_REFERENCE_SCENARIO);
const allowed = evaluatePolicy(policy, actionForScenario(AGENT, TRAVEL_REFERENCE_SCENARIO));
const blocked = evaluatePolicy(
  policy,
  actionForScenario(AGENT, TRAVEL_REFERENCE_SCENARIO, { value: '401000000', nonce: '2' }),
);
check(allowed.verdict === 'ALLOW', '$361 policy', `verdict=${allowed.verdict}`);
check(
  blocked.verdict === 'BLOCK' && blocked.code === 'VALUE_EXCEEDS_HARD_LIMIT',
  '$401 policy',
  `verdict=${blocked.verdict} code=${blocked.code}`,
);

const baseChallenge = {
  version: '1' as const,
  network: 'monad-testnet',
  asset: 'USDC6',
  amount: '361000000',
  resource: 'travel:SFO-SIN',
};
const merchantA = commerceChallengeToAction({
  agent: AGENT,
  nonce: '7',
  challenge: { ...baseChallenge, payTo: 'merchant:demo-airline' },
});
const merchantB = commerceChallengeToAction({
  agent: AGENT,
  nonce: '8',
  challenge: { ...baseChallenge, payTo: 'merchant:evil-clone' },
});
check(
  merchantA.action.scopeHash !== merchantB.action.scopeHash,
  'merchant binding',
  'changing only payTo changes the authorized scope',
);

const scopeVector = createSpendingScopeHash({
  chainId: 10143,
  token: '0x2222222222222222222222222222222222222222',
  recipient: '0x3333333333333333333333333333333333333333',
  resource: 'travel:SFO-SIN',
});
check(
  scopeVector === '0x38194844d6a4a8d71d7d8a1f73f08d1a06c9dd461fbba1c2f4eb6bd46101daf3',
  'SDK ↔ Solidity scope vector',
  scopeVector,
);

const spendingInput = {
  chainId: 10143,
  vault: '0x4444444444444444444444444444444444444444' as const,
  authorizationId: `0x${'55'.repeat(32)}` as const,
  token: '0x2222222222222222222222222222222222222222' as const,
  recipient: '0x3333333333333333333333333333333333333333' as const,
  amount: 361_000_000n,
  resource: 'travel:SFO-SIN',
  paymentNonce: 9n,
};
const spendingActionId = createSpendingActionId(spendingInput);
const spendingActionHash = createSpendingActionHash({ ...spendingInput, actionId: spendingActionId });
check(
  /^0x[0-9a-f]{64}$/.test(spendingActionId) && /^0x[0-9a-f]{64}$/.test(spendingActionHash),
  'smart-spending commitments',
  `actionId=${spendingActionId.slice(0, 12)}… actionHash=${spendingActionHash.slice(0, 12)}…`,
);

const reader = createRegistryReader({ rpcUrl: RPC, contractAddress: REGISTRY });
const canonicalPayload = {
  tripId: 'travel-demo-sgn-sin',
  route: 'SGN → SIN',
  cabin: 'economy',
  selectedOffer: 'DEMO-OFFER-361',
  totalUsd: 361,
  providerMode: 'DEMO',
};
const tamperedPayload = {
  ...canonicalPayload,
  selectedOffer: 'DEMO-OFFER-399',
  totalUsd: 399,
};

try {
  const original = await reader.readProofBundle(ACTION_ID, canonicalPayload);
  const tampered = await reader.readProofBundle(ACTION_ID, tamperedPayload);
  const historicalTrust = evaluateProofTrust(original, { requirePayloadMatch: true });
  const tamperedTrust = evaluateProofTrust(tampered, { requirePayloadMatch: true });
  const currentTrust = evaluateProofTrust(original, { requirePayloadMatch: true, requireCurrentAuthorization: true });

  check(original.checks.existsOnchain, 'Monad proof exists', `action=${ACTION_ID.slice(0, 12)}…`);
  check(original.checks.payloadMatches === true && historicalTrust.verdict === 'ACCEPT', '$361 live proof', 'payload MATCH · historical ACCEPT');
  check(tampered.checks.payloadMatches === false && tamperedTrust.verdict === 'REJECT', '$399 tamper', `payload mismatch · ${tamperedTrust.reasons.join(',')}`);
  check(currentTrust.verdict === 'REJECT', 'revocation semantics', 'historical action remains valid; current authorization is inactive');
} catch (error) {
  console.error(`${red}FAIL${reset} live Monad read — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

if (!process.exitCode) {
  console.log(`\n${green}ALL JUDGE CHECKS PASSED${reset}`);
  console.log('Live verifier: https://monad.promptmarketcap.net/verify/' + ACTION_ID);
}
