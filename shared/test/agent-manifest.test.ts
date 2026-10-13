import { describe, expect, it } from 'vitest';
import {
  createAgentManifest,
  createAgentManifestHash,
  manifestAllowsAction,
  type ProposedAction,
} from '../src/index.js';

const agent = '0x1111111111111111111111111111111111111111' as const;
const otherAgent = '0x2222222222222222222222222222222222222222' as const;

function action(agentAddress: `0x${string}` = agent, actionType = 'PAY_SERVICE'): ProposedAction {
  return {
    agent: agentAddress,
    actionType,
    scopeHash: `0x${'11'.repeat(32)}`,
    value: '1',
    currency: 'USDC6',
    resource: 'service:demo',
    nonce: '1',
  };
}

describe('agent capability manifests', () => {
  it('binds a specialist role and capability set into a stable metadata hash', () => {
    const manifest = createAgentManifest(agent, {
      name: 'Commerce Agent',
      role: 'agent-commerce',
      capabilities: [
        { actionType: 'PAY_SERVICE', description: 'Pay for an approved machine-readable service challenge.' },
        { actionType: 'PURCHASE_ITEM', description: 'Purchase an approved catalog item.' },
      ],
    });

    expect(createAgentManifestHash(manifest)).toMatch(/^0x[a-f0-9]{64}$/);
    expect(manifestAllowsAction(manifest, action())).toBe(true);
    expect(manifestAllowsAction(manifest, action(agent, 'BOOK_TRAVEL'))).toBe(false);
    expect(manifestAllowsAction(manifest, action(otherAgent))).toBe(false);
  });

  it('changes metadataHash when declared capabilities change', () => {
    const commerce = createAgentManifest(agent, {
      name: 'Specialist Agent',
      role: 'commerce',
      capabilities: [{ actionType: 'PAY_SERVICE', description: 'Pay approved service challenges.' }],
    });
    const trader = createAgentManifest(agent, {
      name: 'Specialist Agent',
      role: 'trading',
      capabilities: [{ actionType: 'TRADE_ASSET', description: 'Trade assets inside a separately authorized scope.' }],
    });

    expect(createAgentManifestHash(commerce)).not.toBe(createAgentManifestHash(trader));
  });
});
