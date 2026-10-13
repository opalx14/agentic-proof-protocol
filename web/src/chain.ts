'use client';

import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  http,
  type EIP1193Provider,
} from 'viem';
import {
  AGENTIC_PROOF_ABI,
  createAgentManifestHash,
  createRegistryReader,
  hashEvmValue,
  referenceAgentManifest,
  type Address,
  type Hex32,
} from '@agentic-proof/shared';
import { AGENTIC_PROOF_REGISTRY_BYTECODE } from './registry-bytecode';

const MONAD_TESTNET = {
  chainId: 10143,
  chainIdHex: '0x279f',
  name: 'Monad Testnet',
  rpcUrl: 'https://testnet-rpc.monad.xyz',
  explorerUrl: 'https://testnet.monadvision.com',
  currency: { name: 'MON', symbol: 'MON', decimals: 18 },
} as const;

const REGISTRY_OVERRIDE_KEY = 'agentic-proof:registry-address';

export type DirectChainConfig = {
  rpcUrl: string;
  contractAddress: Address;
  chainId: number;
  explorerUrl?: string;
};

function registryOverride(): Address | undefined {
  if (typeof window === 'undefined') return undefined;
  const value = window.localStorage.getItem(REGISTRY_OVERRIDE_KEY);
  return value && /^0x[a-fA-F0-9]{40}$/.test(value) ? value as Address : undefined;
}

export function setRegistryAddressOverride(address: Address): void {
  window.localStorage.setItem(REGISTRY_OVERRIDE_KEY, address);
}

export function getDirectChainConfig(): DirectChainConfig | null {
  const rpcUrl = process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? MONAD_TESTNET.rpcUrl;
  const contractAddress = (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as Address | undefined) ?? registryOverride();
  const rawChainId = process.env.NEXT_PUBLIC_CHAIN_ID ?? String(MONAD_TESTNET.chainId);
  const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL ?? MONAD_TESTNET.explorerUrl;
  const chainId = Number(rawChainId);
  if (!contractAddress || !Number.isInteger(chainId) || chainId <= 0) return null;
  return { rpcUrl, contractAddress, chainId, explorerUrl };
}

function injectedProvider(): EIP1193Provider {
  const provider = (window as typeof window & { ethereum?: EIP1193Provider }).ethereum;
  if (!provider) throw new Error('No injected EVM wallet found. Install or enable MetaMask, Rabby, or another EVM wallet.');
  return provider;
}

async function switchOrAddMonadTestnet(provider: EIP1193Provider): Promise<void> {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: MONAD_TESTNET.chainIdHex }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: MONAD_TESTNET.chainIdHex,
        chainName: MONAD_TESTNET.name,
        nativeCurrency: MONAD_TESTNET.currency,
        rpcUrls: [MONAD_TESTNET.rpcUrl],
        blockExplorerUrls: [MONAD_TESTNET.explorerUrl],
      }],
    });
  }
}

async function connectedWallet() {
  const provider = injectedProvider();
  await switchOrAddMonadTestnet(provider);
  const wallet = createWalletClient({ transport: custom(provider) });
  const [account] = await wallet.requestAddresses();
  if (!account) throw new Error('Wallet not connected');
  const walletChainId = await wallet.getChainId();
  if (walletChainId !== MONAD_TESTNET.chainId) {
    throw new Error(`Wallet chain ${walletChainId} does not match Monad Testnet ${MONAD_TESTNET.chainId}`);
  }
  return { provider, wallet, account };
}

export async function getAuthorizedWallet(): Promise<Address | null> {
  const provider = injectedProvider();
  const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
  const account = accounts[0];
  return account && /^0x[a-fA-F0-9]{40}$/.test(account) ? account as Address : null;
}

export async function connectWallet(): Promise<Address> {
  const provider = injectedProvider();
  const config = getDirectChainConfig();
  if ((config?.chainId ?? MONAD_TESTNET.chainId) === MONAD_TESTNET.chainId) {
    await switchOrAddMonadTestnet(provider);
  }
  const client = createWalletClient({ transport: custom(provider) });
  const [account] = await client.requestAddresses();
  if (!account) throw new Error('Wallet did not return an account');
  return account;
}

export async function deployRegistryWithWallet(): Promise<{
  contractAddress: Address;
  txHash: `0x${string}`;
}> {
  const { wallet, account } = await connectedWallet();
  const hash = await wallet.deployContract({
    account,
    chain: null,
    abi: AGENTIC_PROOF_ABI,
    bytecode: AGENTIC_PROOF_REGISTRY_BYTECODE,
  });
  const publicClient = createPublicClient({ transport: http(MONAD_TESTNET.rpcUrl) });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success' || !receipt.contractAddress) {
    throw new Error(`Registry deployment did not succeed: ${receipt.status}`);
  }
  const contractAddress = receipt.contractAddress as Address;
  setRegistryAddressOverride(contractAddress);
  return { contractAddress, txHash: hash };
}

export async function registerConnectedWalletAgent(): Promise<{
  agentId: Hex32;
  txHash: `0x${string}`;
}> {
  const config = getDirectChainConfig();
  if (!config) throw new Error('Deploy or configure the registry first');
  const { wallet, account } = await connectedWallet();
  const agentId = hashEvmValue({ namespace: 'agentic-proof', agent: account.toLowerCase() });
  const metadataHash = createAgentManifestHash(referenceAgentManifest(account as Address));
  const hash = await wallet.writeContract({
    account,
    chain: null,
    address: config.contractAddress,
    abi: AGENTIC_PROOF_ABI,
    functionName: 'registerAgent',
    args: [agentId, metadataHash],
  });
  const publicClient = createPublicClient({ transport: http(config.rpcUrl) });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Agent registration reverted');
  return { agentId, txHash: hash };
}

export async function recordActionWithWallet(input: {
  authorizationId: Hex32;
  actionId: Hex32;
  actionType: Hex32;
  scopeHash: Hex32;
  actionHash: Hex32;
  traceRoot: Hex32;
  value: bigint;
}): Promise<`0x${string}`> {
  const config = getDirectChainConfig();
  if (!config) throw new Error('Deploy or configure the registry first');
  const { wallet, account } = await connectedWallet();
  const hash = await wallet.writeContract({
    account,
    chain: null,
    address: config.contractAddress,
    abi: AGENTIC_PROOF_ABI,
    functionName: 'recordAction',
    args: [
      input.authorizationId,
      input.actionId,
      input.actionType,
      input.scopeHash,
      input.actionHash,
      input.traceRoot,
      input.value,
    ],
  });
  const publicClient = createPublicClient({ transport: http(config.rpcUrl) });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Action recording reverted');
  return hash;
}

export async function simulateRecordAction(input: {
  account: Address;
  authorizationId: Hex32;
  actionId: Hex32;
  actionType: Hex32;
  scopeHash: Hex32;
  actionHash: Hex32;
  traceRoot: Hex32;
  value: bigint;
}): Promise<void> {
  const config = getDirectChainConfig();
  if (!config) throw new Error('Deploy or configure the registry first');
  const publicClient = createPublicClient({ transport: http(config.rpcUrl) });
  await publicClient.simulateContract({
    account: input.account,
    address: config.contractAddress,
    abi: AGENTIC_PROOF_ABI,
    functionName: 'recordAction',
    args: [
      input.authorizationId,
      input.actionId,
      input.actionType,
      input.scopeHash,
      input.actionHash,
      input.traceRoot,
      input.value,
    ],
  });
}

export async function grantAuthorization(input: {
  agent: Address;
  actionType: Hex32;
  scopeHash: Hex32;
  maxValue: bigint;
  validAfter: bigint;
  validUntil: bigint;
  nonce: bigint;
  attestor: Address;
  singleUse: boolean;
}): Promise<{ authorizationId: Hex32; txHash: `0x${string}` }> {
  const config = getDirectChainConfig();
  if (!config) throw new Error('Direct chain config is missing NEXT_PUBLIC_REGISTRY_ADDRESS');

  const provider = injectedProvider();
  if (config.chainId === MONAD_TESTNET.chainId) await switchOrAddMonadTestnet(provider);
  const wallet = createWalletClient({ transport: custom(provider) });
  const [account] = await wallet.requestAddresses();
  if (!account) throw new Error('Wallet not connected');
  const walletChainId = await wallet.getChainId();
  if (walletChainId !== config.chainId) {
    throw new Error(`Wallet chain ${walletChainId} does not match configured chain ${config.chainId}`);
  }

  const hash = await wallet.writeContract({
    account,
    chain: null,
    address: config.contractAddress,
    abi: AGENTIC_PROOF_ABI,
    functionName: 'grantAuthorization',
    args: [
      input.agent,
      input.actionType,
      input.scopeHash,
      input.maxValue,
      input.validAfter,
      input.validUntil,
      input.nonce,
      input.attestor,
      input.singleUse,
    ],
  });

  const publicClient = createPublicClient({ transport: http(config.rpcUrl) });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: AGENTIC_PROOF_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName === 'AuthorizationGranted') {
        return { authorizationId: decoded.args.authorizationId as Hex32, txHash: hash };
      }
    } catch {
      // Ignore logs from other contracts/events in the receipt.
    }
  }
  throw new Error('AuthorizationGranted event was not found in receipt');
}

export async function revokeAuthorization(authorizationId: Hex32): Promise<`0x${string}`> {
  const config = getDirectChainConfig();
  if (!config) throw new Error('Direct chain config is missing NEXT_PUBLIC_REGISTRY_ADDRESS');
  const { wallet, account } = await connectedWallet();
  const hash = await wallet.writeContract({
    account,
    chain: null,
    address: config.contractAddress,
    abi: AGENTIC_PROOF_ABI,
    functionName: 'revokeAuthorization',
    args: [authorizationId],
  });
  const publicClient = createPublicClient({ transport: http(config.rpcUrl) });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Authorization revocation reverted');
  return hash;
}

export async function readAuthorizationDirect(authorizationId: Hex32) {
  const config = getDirectChainConfig();
  if (!config) throw new Error('Direct chain config is missing NEXT_PUBLIC_REGISTRY_ADDRESS');
  const reader = createRegistryReader({ rpcUrl: config.rpcUrl, contractAddress: config.contractAddress });
  return reader.readAuthorization(authorizationId);
}

export async function verifyDirect(actionId: Hex32, payload?: unknown) {
  const config = getDirectChainConfig();
  if (!config) throw new Error('Direct verifier chain config is missing NEXT_PUBLIC_REGISTRY_ADDRESS');
  const reader = createRegistryReader({ rpcUrl: config.rpcUrl, contractAddress: config.contractAddress });
  return reader.readProofBundle(actionId, payload);
}

export function explorerTxUrl(txHash: string): string | null {
  const base = getDirectChainConfig()?.explorerUrl;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/tx/${txHash}`;
}

export function monadTestnetMetadata() {
  return MONAD_TESTNET;
}
