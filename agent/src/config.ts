import { z } from 'zod';

const emptyToUndefined = (value: unknown) => value === '' ? undefined : value;
const OptionalAddress = z.preprocess(emptyToUndefined, z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional());
const OptionalPrivateKey = z.preprocess(emptyToUndefined, z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional());

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default('0.0.0.0'),
  APP_RPC_URL: z.string().url().optional(),
  APP_CHAIN_ID: z.coerce.number().int().positive().optional(),
  APP_CONTRACT_ADDRESS: OptionalAddress,
  APP_EXPLORER_URL: z.string().url().optional(),
  APP_AGENT_PRIVATE_KEY: OptionalPrivateKey,
  APP_AGENT_ADDRESS: OptionalAddress,
  APP_AUDIT_PATH: z.string().default('./data/audit.jsonl'),
  // Provision server-side only. No public route can create or reveal this token.
  APP_MCP_BEARER_TOKEN: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  APP_MCP_BEARER_TOKEN_SHA256: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^[a-fA-F0-9]{64}$/).transform((value) => value.toLowerCase()).optional(),
  ),
  APP_MODEL_MODE: z.enum(['auto', 'deterministic']).default('auto'),
  GROQ_API_KEY: z.string().trim().default(''),
  GROQ_MODEL: z.string().trim().default('openai/gpt-oss-120b'),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  return EnvSchema.parse({ ...env, PORT: env.AGENT_PORT ?? env.PORT });
}
