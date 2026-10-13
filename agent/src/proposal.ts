import { z } from 'zod';
import type { AppConfig } from './config.js';
import type { Address, Hex32, ProposedAction } from '@agentic-proof/shared';

const ProposalChoiceSchema = z.object({
  selectedOffer: z.enum(['DEMO-OFFER-361', 'DEMO-OFFER-399', 'DEMO-OFFER-401']),
  totalUsd: z.union([z.literal(361), z.literal(399), z.literal(401)]),
  rationale: z.string().trim().min(1).max(240),
});

export const AgentProposalRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(1_000),
  agent: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  scopeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

export type AgentProposal = {
  action: ProposedAction;
  payload: {
    tripId: string;
    route: 'SGN → SIN';
    cabin: 'economy';
    selectedOffer: 'DEMO-OFFER-361' | 'DEMO-OFFER-399' | 'DEMO-OFFER-401';
    totalUsd: 361 | 399 | 401;
    providerMode: 'DEMO';
  };
  rationale: string;
  model: {
    provider: 'groq' | 'deterministic';
    model: string;
    fallback: boolean;
    ms: number;
    error?: string;
  };
};

type GroqResponse = { choices?: { message?: { content?: string } }[] };

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('model did not return a JSON object');
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

async function callGroq(config: AppConfig, prompt: string): Promise<z.infer<typeof ProposalChoiceSchema>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: config.GROQ_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'You are the proposal layer for an AI travel agent. You never authorize actions.',
              'The user has already scoped authority to SGN → SIN, round trip, economy.',
              'Choose exactly one demo offer and return JSON only.',
              'Offers: DEMO-OFFER-361 costs 361 USD; DEMO-OFFER-399 costs 399 USD; DEMO-OFFER-401 costs 401 USD.',
              'Return {"selectedOffer":"...","totalUsd":361|399|401,"rationale":"short reason"}.',
              'Do not invent another route, price, offer, wallet operation, authorization or transaction.',
            ].join(' '),
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 180)}`);
    const payload = JSON.parse(text) as GroqResponse;
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('groq returned an empty choice');
    return ProposalChoiceSchema.parse(extractJson(content));
  } finally {
    clearTimeout(timer);
  }
}

function deterministicChoice(prompt: string): z.infer<typeof ProposalChoiceSchema> {
  const normalized = prompt.toLowerCase();
  if (/\b401\b|over\s*\$?400|exceed/.test(normalized)) {
    return {
      selectedOffer: 'DEMO-OFFER-401',
      totalUsd: 401,
      rationale: 'The request explicitly selected the $401 demo offer so the policy boundary can evaluate it.',
    };
  }
  if (/\b399\b|flexible|refundable/.test(normalized)) {
    return {
      selectedOffer: 'DEMO-OFFER-399',
      totalUsd: 399,
      rationale: 'The request prefers the flexible $399 demo offer while staying within the granted route scope.',
    };
  }
  return {
    selectedOffer: 'DEMO-OFFER-361',
    totalUsd: 361,
    rationale: 'The $361 demo offer is the lowest-priced option inside the pre-authorized travel scope.',
  };
}

export async function createAgentProposal(
  config: AppConfig,
  input: z.infer<typeof AgentProposalRequestSchema>,
): Promise<AgentProposal> {
  const startedAt = Date.now();
  const useGroq = config.APP_MODEL_MODE === 'auto' && config.GROQ_API_KEY.length > 0;
  let choice: z.infer<typeof ProposalChoiceSchema>;
  let model: AgentProposal['model'];

  if (useGroq) {
    try {
      choice = await callGroq(config, input.prompt);
      model = {
        provider: 'groq',
        model: config.GROQ_MODEL,
        fallback: false,
        ms: Date.now() - startedAt,
      };
    } catch (error) {
      choice = deterministicChoice(input.prompt);
      model = {
        provider: 'deterministic',
        model: 'rule-fallback',
        fallback: true,
        ms: Date.now() - startedAt,
        error: (error instanceof Error ? error.message : String(error)).slice(0, 180),
      };
    }
  } else {
    choice = deterministicChoice(input.prompt);
    model = {
      provider: 'deterministic',
      model: 'rule-fallback',
      fallback: true,
      ms: Date.now() - startedAt,
    };
  }

  const nonce = String(Date.now());
  const payload: AgentProposal['payload'] = {
    tripId: `travel-demo-sgn-sin-${nonce}`,
    route: 'SGN → SIN',
    cabin: 'economy',
    selectedOffer: choice.selectedOffer,
    totalUsd: choice.totalUsd,
    providerMode: 'DEMO',
  };
  const action: ProposedAction = {
    agent: input.agent as Address,
    actionType: 'BOOK_TRAVEL',
    scopeHash: input.scopeHash as Hex32,
    value: String(choice.totalUsd * 1_000_000),
    currency: 'USDC6',
    resource: 'travel:SGN-SIN',
    nonce,
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    idempotencyKey: `ai-travel-${nonce}`,
  };

  return { action, payload, rationale: choice.rationale, model };
}
