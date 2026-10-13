import { z } from 'zod';
import { hashEvmValue } from './hash';
import { AddressSchema, type Address, type Hex32, type ProposedAction } from './types';

export const AgentCapabilitySchema = z.object({
  actionType: z.string().trim().min(1).max(64),
  description: z.string().trim().min(1).max(240),
});
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

/**
 * Offchain capability metadata whose hash can be used as AgenticProofRegistry
 * metadataHash. Inspired by specialist-agent launchers, but explicit and
 * verifiable instead of selecting a privileged script only by environment.
 */
export const AgentManifestSchema = z.object({
  version: z.literal('1'),
  agent: AddressSchema,
  name: z.string().trim().min(1).max(96),
  role: z.string().trim().min(1).max(96),
  capabilities: z.array(AgentCapabilitySchema).min(1).max(32),
  endpoint: z.string().url().optional(),
});
export type AgentManifest = z.infer<typeof AgentManifestSchema>;

export function createAgentManifestHash(manifest: AgentManifest): Hex32 {
  const parsed = AgentManifestSchema.parse(manifest);
  return hashEvmValue(parsed);
}

export function manifestAllowsAction(manifest: AgentManifest, action: Pick<ProposedAction, 'agent' | 'actionType'>): boolean {
  const parsed = AgentManifestSchema.parse(manifest);
  if (parsed.agent.toLowerCase() !== action.agent.toLowerCase()) return false;
  return parsed.capabilities.some(
    (capability) => capability.actionType.trim().toUpperCase() === action.actionType.trim().toUpperCase(),
  );
}

export function createAgentManifest(
  agent: Address,
  input: Omit<AgentManifest, 'version' | 'agent'>,
): AgentManifest {
  return AgentManifestSchema.parse({ version: '1', agent, ...input });
}
