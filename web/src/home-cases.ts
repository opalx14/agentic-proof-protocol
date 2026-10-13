export const LIVE_ACTION_ID = '0x7606c8e32a09ffbcd524b37b6e82a27ecccd5c61ad8e7b4ed2d0162716f404cf';

export type HomeCase = {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  result: string;
  cta: string;
  href: string;
  live: boolean;
};

export const HOME_CASES: HomeCase[] = [
  {
    id: 'travel-proof',
    eyebrow: 'LIVE MONAD PROOF',
    title: 'Travel agent · $361',
    summary: 'AI proposes a trip under a $400 user limit.',
    result: 'Recorded proof stays valid after the authority is revoked.',
    cta: 'Verify $361 proof',
    href: `/verify/${LIVE_ACTION_ID}`,
    live: true,
  },
  {
    id: 'tamper-check',
    eyebrow: 'LIVE TAMPER CHECK',
    title: 'Change $361 → $399',
    summary: 'The payload changes while the onchain commitment does not.',
    result: 'Verifier returns a payload mismatch without trusting the agent.',
    cta: 'Test tamper',
    href: `/verify/${LIVE_ACTION_ID}`,
    live: true,
  },
  {
    id: 'policy-cap',
    eyebrow: 'DETERMINISTIC POLICY',
    title: 'Try a $401 action',
    summary: 'The model can ask for more. The control plane still owns the limit.',
    result: 'Expected result: BLOCK · VALUE_EXCEEDS_HARD_LIMIT.',
    cta: 'Open protocol lab',
    href: '/lab',
    live: false,
  },
  {
    id: 'remote-mcp',
    eyebrow: 'AI INTEGRATION',
    title: 'Connect an MCP client',
    summary: 'Claude Code, Codex or Antigravity can evaluate and verify proofs.',
    result: 'No MCP tool can grant authority, revoke, sign or broadcast.',
    cta: 'Connect MCP',
    href: '/connect',
    live: false,
  },
];

export const CASES_PER_PAGE = 2;

export function getCasePage(page: number, perPage = CASES_PER_PAGE): HomeCase[] {
  const safePage = Math.max(0, Math.floor(page));
  return HOME_CASES.slice(safePage * perPage, safePage * perPage + perPage);
}

export function getCasePageCount(perPage = CASES_PER_PAGE): number {
  return Math.ceil(HOME_CASES.length / perPage);
}
