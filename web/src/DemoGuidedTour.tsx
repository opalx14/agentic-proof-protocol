'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type GuideStep = {
  title: string;
  detail: string;
  selector: string;
  actionLabel: string;
};

type AnchorState = {
  top: number;
  left: number;
  placement: 'left' | 'right' | 'top' | 'bottom';
} | null;

type SpotlightState = {
  top: number;
  left: number;
  right: number;
  bottom: number;
} | null;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function stepsForPath(pathname: string): GuideStep[] {
  if (pathname === '/') {
    return [
      {
        title: '1. Start with the live proof',
        detail: 'Judges can reproduce the canonical Monad proof without a wallet. Open this first if you want the fastest working-product path.',
        selector: '[data-tour="home-live-proof"]',
        actionLabel: 'Show live proof entry',
      },
      {
        title: '2. Read the authority flow',
        detail: 'The product invariant is AI proposal → deterministic policy → scoped authority → proof on Monad. The model is never the authority boundary.',
        selector: '[data-tour="home-flow"]',
        actionLabel: 'Show the four-stage flow',
      },
      {
        title: '3. Let the AI propose',
        detail: 'Use the travel prompt here. The proposal layer can choose an offer, but it cannot grant itself authority or bypass the policy gate.',
        selector: '[data-tour="home-ai-proposal"]',
        actionLabel: 'Show AI proposal control',
      },
      {
        title: '4. Run deterministic policy',
        detail: 'This is the authorization decision. A valid proposal can proceed only after the deterministic policy returns ALLOW.',
        selector: '[data-tour="home-policy-check"]',
        actionLabel: 'Show policy gate',
      },
      {
        title: '5. Prove the hard boundary',
        detail: 'Run the $401 negative path. It must fail closed before execution with VALUE_EXCEEDS_HARD_LIMIT.',
        selector: '[data-tour="home-block-test"]',
        actionLabel: 'Show $401 test',
      },
      {
        title: '6. Connect an external AI',
        detail: 'The MCP surface exposes status, evaluate, prepare and verify only. There is no grant, revoke, wallet signing or broadcast tool.',
        selector: '[data-tour="home-connect-ai"]',
        actionLabel: 'Show AI integration',
      },
    ];
  }

  if (pathname.startsWith('/verify/')) {
    return [
      {
        title: '1. Verify the original $361 payload',
        detail: 'This reproduces the recorded Monad Testnet action. The browser recomputes the private payload commitment and should return MATCH / ACCEPT.',
        selector: '[data-tour="proof-original"]',
        actionLabel: 'Show original proof button',
      },
      {
        title: '2. Tamper with the same proof',
        detail: 'Change only the supplied payload to $399. The action still exists onchain, but the commitment must become PAYLOAD_MISMATCH / REJECT.',
        selector: '[data-tour="proof-tamper"]',
        actionLabel: 'Show tamper test',
      },
      {
        title: '3. Compare historical vs current authority',
        detail: 'The recorded action remains valid at action time even after revocation, while a new-action consumer rejects the now-inactive authorization.',
        selector: '[data-tour="proof-trust"]',
        actionLabel: 'Show trust decisions',
      },
      {
        title: '4. Inspect the real Monad source',
        detail: 'Open the registry in MonadVision when you want chain-level evidence. Verification here reads Monad directly rather than trusting the agent backend.',
        selector: '[data-tour="proof-explorer"]',
        actionLabel: 'Show Monad explorer link',
      },
    ];
  }

  if (pathname === '/profile') {
    return [
      {
        title: '1. Create a private demo profile',
        detail: 'Generate a wallet-owned profile, policy commitment and a separate profile encryption key. The encryption key is not the wallet private key.',
        selector: '[data-tour="profile-create"]',
        actionLabel: 'Show profile creation',
      },
      {
        title: '2. Test the personal policy envelope',
        detail: 'Try $250, $361 and $401. The profile demonstrates ALLOW, ESCALATE and BLOCK before the existing APP execution policy.',
        selector: '[data-tour="profile-policy-tests"]',
        actionLabel: 'Show policy tests',
      },
      {
        title: '3. Encrypt the private receipt',
        detail: 'AES-256-GCM keeps invoice and traveler details offchain. Public observers receive only cryptographic commitments.',
        selector: '[data-tour="profile-encrypt"]',
        actionLabel: 'Show encryption action',
      },
      {
        title: '4. Decrypt as the profile owner',
        detail: 'Use the user-side profile key to recover the private receipt. This demonstrates the privacy boundary without exposing PII on Monad.',
        selector: '[data-tour="profile-decrypt"]',
        actionLabel: 'Show owner decrypt',
      },
      {
        title: '5. Tamper and fail closed',
        detail: 'Modify the ciphertext and try again. Authentication must fail instead of returning altered or unauthenticated private data.',
        selector: '[data-tour="profile-tamper"]',
        actionLabel: 'Show tamper control',
      },
    ];
  }

  if (pathname === '/use-cases') {
    return [
      {
        title: '1. Start with Travel',
        detail: 'Travel is the clearest AI-agent story: mutable provider quotes, deterministic authority and a portable proof on Monad.',
        selector: '[data-tour="case-travel"]',
        actionLabel: 'Show Travel case',
      },
      {
        title: '2. Follow SEARCH → VERIFY → AUTHORIZE → PROVE',
        detail: 'The SDK binds the exact verified quote. If a provider re-quotes $361 to $399, quoteHash and scope change so old consent cannot be silently reused.',
        selector: '[data-tour="case-travel-lifecycle"]',
        actionLabel: 'Show quote lifecycle',
      },
      {
        title: '3. Reproduce the live proof',
        detail: 'Use this CTA to open the canonical $361 Monad proof and compare the original payload against the $399 tamper case.',
        selector: '[data-tour="case-travel-proof"]',
        actionLabel: 'Show proof CTA',
      },
      {
        title: '4. Then show identity and privacy',
        detail: 'Case 08 extends the same authority model with a versioned personal profile and encrypted payment receipts without putting PII onchain.',
        selector: '[data-tour="case-profile"]',
        actionLabel: 'Show Personal Profile case',
      },
    ];
  }

  if (pathname === '/connect') {
    return [
      {
        title: '1. Choose an AI client',
        detail: 'Pick Claude Code, Codex, Antigravity or local stdio. The endpoint exposes the same restricted MCP authority boundary.',
        selector: '[data-tour="connect-clients"]',
        actionLabel: 'Show client picker',
      },
      {
        title: '2. Copy the connection config',
        detail: 'Remote MCP requires an owner-provisioned bearer token. Never publish that credential in a repository, screenshot or demo.',
        selector: '[data-tour="connect-config"]',
        actionLabel: 'Show connection config',
      },
      {
        title: '3. Run the judge prompt',
        detail: 'The prompt demonstrates $361 ALLOW, $401 BLOCK, a scoped PAY_SERVICE challenge, and asks the model to prove it has no owner-signing capability.',
        selector: '[data-tour="connect-judge-prompt"]',
        actionLabel: 'Show judge prompt',
      },
      {
        title: '4. Verify the exact MCP boundary',
        detail: 'Only four non-signing tools are exposed: status, evaluate, prepare and verify. The model cannot grant, revoke, sign or broadcast.',
        selector: '[data-tour="connect-tools"]',
        actionLabel: 'Show safe tool surface',
      },
    ];
  }

  return [];
}

export function DemoGuidedTour() {
  const pathname = usePathname();
  const steps = useMemo(() => stepsForPath(pathname), [pathname]);
  const guideRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [anchor, setAnchor] = useState<AnchorState>(null);
  const [spotlight, setSpotlight] = useState<SpotlightState>(null);
  const [targetMissing, setTargetMissing] = useState(false);

  const current = steps[index] ?? steps[0];

  useEffect(() => {
    if (steps.length === 0) return;
    const key = `agentic-proof-guide:${pathname}`;
    if (window.sessionStorage.getItem(key)) return;
    const timer = window.setTimeout(() => {
      setIndex(0);
      setOpen(true);
      window.sessionStorage.setItem(key, 'seen');
    }, 250);
    return () => window.clearTimeout(timer);
  }, [pathname, steps.length]);

  useEffect(() => {
    if (!open || !current?.selector) {
      setAnchor(null);
      setSpotlight(null);
      return;
    }

    let raf = 0;
    let highlighted: HTMLElement | null = null;

    const update = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const target = document.querySelector<HTMLElement>(current.selector);
        const guide = guideRef.current;
        if (!target || !guide) {
          setTargetMissing(true);
          setAnchor(null);
          setSpotlight(null);
          return;
        }

        setTargetMissing(false);
        const rect = target.getBoundingClientRect();
        const guideRect = guide.getBoundingClientRect();
        const pad = 6;
        const edge = 12;
        const gap = 12;
        const width = guideRect.width || Math.min(320, window.innerWidth - edge * 2);
        const height = guideRect.height || 190;
        const top = Math.max(0, rect.top - pad);
        const left = Math.max(0, rect.left - pad);
        const right = Math.min(window.innerWidth, rect.right + pad);
        const bottom = Math.min(window.innerHeight, rect.bottom + pad);
        setSpotlight({ top, left, right, bottom });

        if (window.innerWidth <= 720) {
          setAnchor({
            placement: 'bottom',
            left: edge,
            top: Math.max(edge, window.innerHeight - height - edge),
          });
          return;
        }

        const fitsLeft = rect.left - gap - width >= edge;
        const fitsRight = rect.right + gap + width <= window.innerWidth - edge;
        const fitsBelow = rect.bottom + gap + height <= window.innerHeight - edge;

        if (fitsLeft) {
          setAnchor({
            placement: 'left',
            left: rect.left - gap - width,
            top: clamp(rect.top + rect.height / 2 - height / 2, edge, window.innerHeight - height - edge),
          });
          return;
        }
        if (fitsRight) {
          setAnchor({
            placement: 'right',
            left: rect.right + gap,
            top: clamp(rect.top + rect.height / 2 - height / 2, edge, window.innerHeight - height - edge),
          });
          return;
        }
        if (fitsBelow) {
          setAnchor({
            placement: 'bottom',
            left: clamp(rect.left + rect.width / 2 - width / 2, edge, window.innerWidth - width - edge),
            top: rect.bottom + gap,
          });
          return;
        }
        setAnchor({
          placement: 'top',
          left: clamp(rect.left + rect.width / 2 - width / 2, edge, window.innerWidth - width - edge),
          top: Math.max(edge, rect.top - gap - height),
        });
      });
    };

    const attach = () => {
      const target = document.querySelector<HTMLElement>(current.selector);
      if (!target) {
        setTargetMissing(true);
        return;
      }
      setTargetMissing(false);
      if (highlighted !== target) {
        highlighted?.classList.remove('demo-tour-highlight');
        highlighted = target;
        highlighted.classList.add('demo-tour-highlight');
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      window.setTimeout(update, 260);
      update();
    };

    const prepare = window.setTimeout(attach, 100);
    const observer = new MutationObserver(() => attach());
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    return () => {
      window.clearTimeout(prepare);
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      highlighted?.classList.remove('demo-tour-highlight');
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [current?.selector, open]);

  if (steps.length === 0) return null;

  function showCurrent() {
    if (!current?.selector) return;
    const target = document.querySelector<HTMLElement>(current.selector);
    if (!target) {
      setTargetMissing(true);
      return;
    }
    setTargetMissing(false);
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    target.classList.add('demo-tour-highlight');
    window.setTimeout(() => target.classList.remove('demo-tour-highlight'), 2400);
  }

  function next() {
    if (index >= steps.length - 1) {
      setOpen(false);
      return;
    }
    setIndex((value) => value + 1);
  }

  if (!open) {
    return (
      <button
        type="button"
        className="demo-guide-launcher"
        onClick={() => {
          setIndex(0);
          setOpen(true);
        }}
        aria-label="Open guided demo"
      >
        <span>?</span>
        Guided demo
      </button>
    );
  }

  const guideStyle: CSSProperties | undefined = anchor
    ? { top: `${anchor.top}px`, left: `${anchor.left}px`, right: 'auto', bottom: 'auto' }
    : undefined;

  return (
    <>
      {spotlight ? (
        <div className="demo-guide-spotlight" aria-hidden="true">
          <i className="is-top" style={{ height: spotlight.top }} />
          <i className="is-left" style={{ top: spotlight.top, width: spotlight.left, height: Math.max(0, spotlight.bottom - spotlight.top) }} />
          <i className="is-right" style={{ top: spotlight.top, left: spotlight.right, right: 0, height: Math.max(0, spotlight.bottom - spotlight.top) }} />
          <i className="is-bottom" style={{ top: spotlight.bottom, bottom: 0 }} />
          <b
            className="demo-guide-spotlight-ring"
            data-label={current.actionLabel}
            style={{
              top: spotlight.top,
              left: spotlight.left,
              width: Math.max(0, spotlight.right - spotlight.left),
              height: Math.max(0, spotlight.bottom - spotlight.top),
            }}
          />
        </div>
      ) : null}

      <aside
        ref={guideRef}
        className={['demo-guide', anchor ? 'is-anchored' : 'is-floating', anchor ? `is-${anchor.placement}` : ''].join(' ')}
        style={guideStyle}
        aria-label="Guided product walkthrough"
      >
        <div className="demo-guide-head">
          <div>
            <span>GUIDED PRODUCT DEMO</span>
            <strong>Step {index + 1} of {steps.length}</strong>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close guided demo">×</button>
        </div>

        <div className="demo-guide-progress" aria-hidden="true">
          {steps.map((step, stepIndex) => (
            <i
              key={step.title}
              className={stepIndex < index ? 'is-done' : stepIndex === index ? 'is-current' : ''}
            />
          ))}
        </div>

        <div className="demo-guide-copy">
          <strong>{current.title}</strong>
          <p>{targetMissing ? 'Complete the previous action first. This step will attach automatically as soon as the control appears.' : current.detail}</p>
        </div>

        <div className="demo-guide-actions">
          <button type="button" className="is-show" onClick={showCurrent}>{current.actionLabel}</button>
          <button type="button" className="is-next" onClick={next}>{index === steps.length - 1 ? 'Done' : 'Next →'}</button>
        </div>
      </aside>
    </>
  );
}
