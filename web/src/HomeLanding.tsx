'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Fingerprint,
  LockKeyhole,
  Radio,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { getCasePage, getCasePageCount, HOME_CASES, LIVE_ACTION_ID } from './home-cases';

export default function HomeLanding() {
  const [page, setPage] = useState(0);
  const pageCount = getCasePageCount();
  const cases = useMemo(() => getCasePage(page), [page]);

  return (
    <div className="min-h-screen bg-[#080b10] text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#080b10]/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-[min(1180px,calc(100%-32px))] items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-3 no-underline">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-violet-400/25 bg-violet-400/10 text-violet-200">
              <Fingerprint size={18} />
            </span>
            <span className="hidden sm:block">
              <strong className="block text-sm text-white">Agentic Proof Protocol</strong>
              <small className="block text-[10px] text-slate-500">Monad · AI authorization</small>
            </span>
          </a>
          <nav className="flex items-center gap-2">
            <a href="/use-cases" className="hidden rounded-lg px-3 py-2 text-xs text-slate-400 no-underline hover:bg-white/5 hover:text-white sm:inline-flex">Cases</a>
            <a href="/connect" className="hidden rounded-lg px-3 py-2 text-xs text-slate-400 no-underline hover:bg-white/5 hover:text-white sm:inline-flex">MCP</a>
            <a href="/lab" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-slate-200 no-underline hover:border-violet-400/40">
              Protocol lab <ArrowUpRight size={13} />
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto flex min-h-[64vh] w-[min(980px,calc(100%-32px))] flex-col items-center justify-center py-20 text-center md:py-28">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/[0.07] px-3 py-1.5 text-[10px] font-bold tracking-[.16em] text-violet-200">
            <Radio size={12} /> MONAD · TRUST, IDENTITY & AI INFRASTRUCTURE
          </div>
          <h1 className="m-0 max-w-[900px] text-[clamp(46px,8vw,88px)] font-black leading-[.95] tracking-[-.065em] text-white">
            AI proposes.<br />
            <span className="bg-gradient-to-r from-violet-300 via-indigo-300 to-emerald-300 bg-clip-text text-transparent">You authorize.</span>
          </h1>
          <p className="mt-6 max-w-[680px] text-[15px] leading-7 text-slate-400 md:text-[17px]">
            Scoped authority for AI agents, tamper-evident action proofs, and verification anyone can run directly from Monad.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            <a href={`/verify/${LIVE_ACTION_ID}`} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-xs font-bold text-white no-underline hover:bg-violet-400">
              Verify live proof <ArrowUpRight size={14} />
            </a>
            <a href="/connect" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-xs font-bold text-slate-200 no-underline hover:border-violet-400/40">
              Connect an AI <Bot size={14} />
            </a>
          </div>

          <div className="mt-12 grid w-full max-w-[760px] grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              ['Monad Testnet', 'Live proof'],
              ['$400 cap', 'Fail-closed policy'],
              ['4 MCP tools', 'No signing'],
            ].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-4">
                <strong className="block text-sm text-white">{value}</strong>
                <span className="mt-1 block text-[10px] text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-[min(1080px,calc(100%-32px))] border-t border-white/10 py-16" id="cases">
          <div className="mb-7 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <span className="text-[10px] font-bold tracking-[.16em] text-violet-300">TRY THE PROTOCOL</span>
              <h2 className="mt-2 text-3xl font-bold tracking-[-.04em] text-white">Four cases. Two at a time.</h2>
              <p className="mt-2 max-w-[620px] text-xs leading-6 text-slate-500">Short cases, direct test links, no long pitch deck on the homepage.</p>
            </div>
            <a href="/use-cases" className="text-xs font-semibold text-violet-300 no-underline hover:text-violet-200">All case details ↗</a>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {cases.map((item) => (
              <article key={item.id} className="flex min-h-[240px] flex-col rounded-2xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#0b0f16] p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className={`rounded-md border px-2 py-1 text-[9px] font-extrabold tracking-[.12em] ${item.live ? 'border-emerald-300/20 bg-emerald-300/[0.05] text-emerald-300' : 'border-violet-300/20 bg-violet-300/[0.05] text-violet-300'}`}>
                    {item.eyebrow}
                  </span>
                  {item.live ? <CheckCircle2 size={16} className="text-emerald-300" /> : <Sparkles size={16} className="text-violet-300" />}
                </div>
                <h3 className="mt-5 text-xl font-bold tracking-[-.03em] text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.summary}</p>
                <p className="mt-3 text-xs leading-5 text-slate-500">{item.result}</p>
                <a href={item.href} className="mt-auto inline-flex w-fit items-center gap-2 pt-6 text-xs font-bold text-violet-300 no-underline hover:text-violet-200">
                  {item.cta} <ArrowUpRight size={13} />
                </a>
              </article>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-center gap-3">
            <button type="button" aria-label="Previous case page" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.025] text-slate-300 disabled:cursor-not-allowed disabled:opacity-30">
              <ArrowLeft size={15} />
            </button>
            <div className="flex gap-1.5" aria-label="Case pagination">
              {Array.from({ length: pageCount }, (_, index) => (
                <button key={index} type="button" aria-label={`Case page ${index + 1}`} aria-current={page === index ? 'page' : undefined} onClick={() => setPage(index)} className={`h-2 rounded-full transition-all ${page === index ? 'w-7 bg-violet-400' : 'w-2 bg-slate-700 hover:bg-slate-500'}`} />
              ))}
            </div>
            <button type="button" aria-label="Next case page" disabled={page === pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.025] text-slate-300 disabled:cursor-not-allowed disabled:opacity-30">
              <ArrowRight size={15} />
            </button>
          </div>
          <p className="mt-3 text-center text-[10px] text-slate-600">Page {page + 1} / {pageCount} · {HOME_CASES.length} testable scenarios</p>
        </section>

        <section className="mx-auto grid w-[min(1080px,calc(100%-32px))] grid-cols-1 gap-3 py-16 md:grid-cols-3">
          {[
            [Bot, '1. Model proposes', 'The AI produces an action, not authority.'],
            [ShieldCheck, '2. Policy decides', 'Deterministic rules return ALLOW, BLOCK or ESCALATE.'],
            [LockKeyhole, '3. Monad proves', 'Authority and action commitments become independently verifiable.'],
          ].map(([Icon, title, copy]) => {
            const StepIcon = Icon as typeof Bot;
            return (
              <article key={String(title)} className="rounded-2xl border border-white/10 bg-white/[0.018] p-5">
                <StepIcon size={18} className="text-violet-300" />
                <strong className="mt-4 block text-sm text-white">{String(title)}</strong>
                <p className="mt-2 text-xs leading-5 text-slate-500">{String(copy)}</p>
              </article>
            );
          })}
        </section>
      </main>

      <footer className="border-t border-white/10 py-6">
        <div className="mx-auto flex w-[min(1080px,calc(100%-32px))] flex-col justify-between gap-2 text-[10px] text-slate-600 sm:flex-row">
          <span>Agentic Proof Protocol · Monad Metropolis 2026</span>
          <span>Model proposes · policy authorizes · Monad verifies</span>
        </div>
      </footer>
    </div>
  );
}
