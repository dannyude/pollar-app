"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { FiArrowRight, FiChevronRight, FiShield, FiZap, FiGlobe } from "react-icons/fi";
import { SiStellar } from "react-icons/si";

// Animated live transaction ticker
const DEMO_TXS = [
  { from: "Lagos", to: "La Paz", amount: "₦5,000", receives: "Bs. 22.27", time: "2s ago" },
  { from: "Abuja", to: "Santa Cruz", amount: "₦25,000", receives: "Bs. 111.36", time: "41s ago" },
  { from: "Ibadan", to: "Cochabamba", amount: "₦12,000", receives: "Bs. 53.45", time: "2m ago" },
];

function LiveTransferCard() {
  const [idx, setIdx] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIdx((i) => (i + 1) % DEMO_TXS.length);
        setFading(false);
      }, 300);
    }, 2800);
    return () => clearInterval(t);
  }, []);

  const tx = DEMO_TXS[idx];

  return (
    <div className="bg-white rounded-2xl shadow-modal border border-surface-border p-5 w-full max-w-sm mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
          </span>
          <span className="text-xs font-bold text-success">Live Transfer</span>
        </div>
        <span
          className="text-xs text-muted transition-opacity duration-300"
          style={{ opacity: fading ? 0 : 1 }}
        >
          {tx.time}
        </span>
      </div>

      {/* Transfer flow */}
      <div
        className="transition-opacity duration-300"
        style={{ opacity: fading ? 0 : 1 }}
      >
        <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
          {/* From */}
          <div className="flex-1 w-full bg-slate-50 border border-surface-border rounded-xl p-3">
            <p className="text-xs text-muted mb-1">From · {tx.from}</p>
            <p className="text-lg font-extrabold text-foreground">{tx.amount}</p>
            <p className="text-xs text-muted mt-0.5">Nigerian Naira</p>
          </div>

          {/* Arrow */}
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-pollar-blue flex items-center justify-center shadow-blue rotate-90 sm:rotate-0 my-1 sm:my-0">
            <FiArrowRight size={14} className="text-white" />
          </div>

          {/* To */}
          <div className="flex-1 w-full bg-blue-50 border border-blue-100 rounded-xl p-3">
            <p className="text-xs text-muted mb-1">To · {tx.to}</p>
            <p className="text-lg font-extrabold text-pollar-blue">{tx.receives}</p>
            <p className="text-xs text-muted mt-0.5">Bolivianos</p>
          </div>
        </div>

        {/* Escrow badge */}
        <div className="flex items-center gap-2 text-xs text-muted bg-slate-50 border border-surface-border rounded-xl px-3 py-2.5">
          <SiStellar size={14} className="text-pollar-blue flex-shrink-0" />
          <span>Settled via Stellar escrow · <span className="text-success font-bold">0.00 USDC fee</span></span>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [isHidden, setIsHidden] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setIsScrolled(currentScrollY > 20);
      setIsHidden(currentScrollY > lastScrollY && currentScrollY > 80);
      setLastScrollY(currentScrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  return (
    <div className="min-h-screen bg-slate-50 text-foreground overflow-x-hidden">
      {/* ── Dark Hero Wrapper ──────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 text-white">
        {/* Background glow blobs (matching login page) */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-pollar-blue/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* ── Navbar ──────────────────────────────────────────── */}
        <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out ${isHidden ? "-translate-y-full" : "translate-y-0"} ${isScrolled ? "bg-slate-950/80 backdrop-blur-md border-b border-white/10 py-3 shadow-lg" : "bg-transparent py-5 border-transparent"}`}>
          <div className="flex items-center justify-between max-w-6xl mx-auto px-6">
            <Link href="/" className="flex items-center gap-2.5 cursor-pointer">
              <span className="text-lg font-extrabold tracking-tight text-white">Puente</span>
            </Link>
            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-white/70">
              <a href="#how-it-works" className="hover:text-white transition-colors cursor-pointer">How it Works</a>
              <Link href="/proof" className="hover:text-white transition-colors cursor-pointer">Proof of Reserves</Link>
            </nav>
            <Link
              href="/login"
              className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-2.5 rounded-xl transition-all cursor-pointer backdrop-blur-md"
            >
              Sign In <FiChevronRight size={14} />
            </Link>
            {/* Mobile sign in only icon */}
            <Link
              href="/login"
              className="flex sm:hidden items-center justify-center w-10 h-10 text-white bg-white/10 border border-white/20 backdrop-blur-md rounded-xl"
            >
              <FiChevronRight size={18} />
            </Link>
          </div>
        </header>

        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="relative max-w-6xl mx-auto px-6 pt-24 md:pt-32 pb-20 md:pb-32 flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          {/* Left — Copy */}
          <div className="flex-1 relative z-10 animate-fade-slide-up text-center lg:text-left">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6 text-white">
              Move money from<br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-blue-400 to-indigo-400">
                {" "}Lagos to La Paz{" "}
              </span>
              <br className="hidden sm:block" />
              in under 10 seconds.
            </h1>

            <p className="text-white/70 text-base md:text-lg leading-relaxed mb-8 md:mb-10 max-w-lg mx-auto lg:mx-0">
              Pay your local NGN agent in cash. Your Pollar wallet receives USDC instantly via Stellar escrow.
              María in Bolivia gets Bolivianos to her bank account — zero wire fees.
            </p>

            {/* Stats row */}
            <div className="flex flex-wrap justify-center lg:justify-start items-center gap-6 md:gap-8 mb-8 md:mb-10">
              {[
                { value: "< 10s", label: "settlement" },
                { value: "0.00%", label: "network fee" },
                { value: "1:1", label: "USDC backed" },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-xl md:text-2xl font-extrabold text-white">{s.value}</p>
                  <p className="text-[10px] md:text-xs text-white/50 uppercase tracking-wider">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row justify-center lg:justify-start gap-3">
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 px-7 py-4 bg-pollar-blue hover:bg-pollar-blue-hover active:scale-[0.98] text-white font-bold rounded-2xl shadow-blue hover:shadow-blue-lg transition-all cursor-pointer"
              >
                Start the Demo <FiArrowRight />
              </Link>
              <Link
                href="/proof"
                className="flex items-center justify-center gap-2 px-7 py-4 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-2xl border border-white/20 shadow-sm transition-all cursor-pointer backdrop-blur-md"
              >
                <FiShield size={16} /> Proof of Reserves
              </Link>
            </div>
          </div>

          {/* Right — Live card */}
          <div className="w-full max-w-md lg:flex-shrink-0 relative z-10 animate-fade-slide-up mx-auto lg:mx-0 mt-8 lg:mt-0" style={{ animationDelay: "0.15s" }}>
            <LiveTransferCard />

            {/* Floating trust chip */}
            <div className="hidden sm:flex absolute -bottom-5 -left-5 bg-slate-900 border border-white/20 rounded-2xl px-4 py-3 items-center gap-2.5 shadow-xl backdrop-blur-md">
              <SiStellar size={18} className="text-pollar-blue" />
              <div>
                <p className="text-xs font-bold text-white leading-none">Stellar Escrow</p>
                <p className="text-xs text-white/40">Trustless · Atomic</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── How it works ─────────────────────────────────────── */}
      <section id="how-it-works" className="bg-white border-t border-surface-border">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-28">
          <div className="text-center mb-12 md:mb-16">
            <p className="text-xs font-bold tracking-widest text-pollar-blue uppercase mb-3">The Flow</p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">Three steps. One corridor.</h2>
            <p className="text-muted max-w-md mx-auto text-sm md:text-base">Puente connects the NGN-USDC-BOB corridor without banks, without SWIFT, without waiting days.</p>
          </div>

          <div className="relative">
            {/* Connector line */}
            <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-surface-border to-transparent -translate-y-1/2 z-0" />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 relative z-10">
              {[
                { icon: FiShield, step: "01", tag: "Ada · Lagos, Nigeria", title: "Pay NGN in cash", desc: "Ada visits her local Puente agent (Tunde). Pays ₦5,000 cash. Agent confirms receipt in their bank app.", color: "bg-slate-50" },
                { icon: FiZap, step: "02", tag: "Stellar Blockchain", title: "Escrow releases USDC", desc: "The moment Tunde confirms, a Stellar smart contract releases 3.22 USDC to Ada's Pollar wallet. Immutable. Instant.", color: "bg-pollar-blue", highlight: true },
                { icon: FiGlobe, step: "03", tag: "María · La Paz, Bolivia", title: "Receives Bolivianos", desc: "Ada sends USDC to María via Pollar. Pollar's ramp converts to BOB. María receives Bs. 22.27 to her bank account.", color: "bg-slate-50" },
              ].map((item) => (
                <div
                  key={item.step}
                  className={`rounded-3xl p-6 md:p-8 border transition-all duration-200 ${
                    item.highlight
                      ? "bg-pollar-blue text-white border-pollar-blue shadow-blue-lg"
                      : "bg-white border-surface-border shadow-sm hover:shadow-card-hover hover:-translate-y-1"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 ${item.highlight ? "bg-white/20" : "bg-pollar-blue/8 border border-pollar-blue/15"}`}>
                    <item.icon size={22} className={item.highlight ? "text-white" : "text-pollar-blue"} />
                  </div>
                  <p className={`text-[10px] md:text-xs font-bold tracking-widest uppercase mb-1 ${item.highlight ? "text-blue-200" : "text-muted"}`}>
                    Step {item.step} · {item.tag}
                  </p>
                  <h3 className={`text-lg md:text-xl font-extrabold mb-2 md:mb-3 ${item.highlight ? "text-white" : "text-foreground"}`}>{item.title}</h3>
                  <p className={`text-sm leading-relaxed ${item.highlight ? "text-blue-100" : "text-muted"}`}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center mt-10 md:mt-14">
            <Link
              href="/login"
              className="flex items-center gap-2 px-8 py-4 bg-pollar-blue hover:bg-pollar-blue-hover active:scale-[0.98] text-white font-bold rounded-2xl shadow-blue hover:shadow-blue-lg transition-all cursor-pointer w-full sm:w-auto justify-center"
            >
              Try it now <FiArrowRight />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="bg-slate-50 text-muted text-xs text-center py-8 border-t border-surface-border">
        <p>Puente · Built on Stellar · Powered by Pollar SDK · Hackathon Demo 2026</p>
      </footer>
    </div>
  );
}
