"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError } from "@/api/client";
import { toast } from "@/hooks/useToast";
import { FiCheckCircle, FiArrowRight, FiGlobe } from "react-icons/fi";

export default function SendPage() {
  const { user } = useAuth();
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("3.22");
  const [isQuoting, setIsQuoting] = useState(false);
  const [quote, setQuote] = useState<{ bob: number; rate: number } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const getQuote = () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setIsQuoting(true);
    setQuote(null);
    // ⚠️ MOCK: Replace with real Pollar SDK getRampsQuote()
    setTimeout(() => {
      setQuote({ bob: parseFloat(amount) * 6.91, rate: 6.91 });
      setIsQuoting(false);
      toast.info("Live Quote", "Rate from Pollar ramp — valid for 30 seconds.");
    }, 800);
  };

  const handleSend = async () => {
    setIsSending(true);
    try {
      // ⚡ REAL flow:
      // 1. runTx via Pollar SDK → txHash
      // 2. api.markUsdcSent(orderId, txHash)
      await api.markUsdcSent("mock-order-id", "mock-tx-hash");
    } catch { /* demo */ }
    setTimeout(() => {
      setIsSending(false);
      setTxHash("c8f49e3a1b2d...f7e9");
      toast.success("Sent", `${amount} USDC is on its way to Bolivia.`);
    }, 1500);
  };

  if (txHash) {
    return (
      <div className="max-w-md mx-auto text-center animate-slide-up pt-10">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <FiCheckCircle size={40} className="text-success" />
        </div>
        <h2 className="text-2xl font-extrabold text-foreground mb-2">Sent Successfully</h2>
        <p className="text-muted mb-6">{amount} USDC sent to Bolivia. María will receive Bs. {(parseFloat(amount) * 6.91).toFixed(2)}.</p>
        <div className="bg-white rounded-2xl border border-surface-border p-5 mb-6 text-left">
          <p className="text-xs text-muted mb-1">Transaction Hash</p>
          <p className="font-mono text-sm text-pollar-blue break-all">{txHash}</p>
        </div>
        <Link href="/proof" className="flex items-center justify-center gap-2 px-6 py-3.5 bg-pollar-blue hover:bg-pollar-blue-hover active:scale-95 text-white font-bold rounded-2xl shadow-blue transition-all cursor-pointer">
          View on Explorer <FiArrowRight size={16} />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center gap-4 mb-10 animate-fade-slide-up">
        <div className="w-12 h-12 rounded-2xl bg-pollar-blue flex items-center justify-center text-white shadow-blue flex-shrink-0">
          <FiGlobe size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Send USDC Globally</h1>
          <p className="text-sm text-muted">Zero network fees. Instant settlement via Stellar.</p>
        </div>
      </div>

      {/* Balance */}
      <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-surface-border shadow-sm mb-6 animate-fade-slide-up" style={{ animationDelay: "0.05s" }}>
        <p className="text-sm font-medium text-muted">Your Balance</p>
        <p className="text-lg font-extrabold text-foreground">{user?.usdc_balance?.toFixed(2) ?? "0.00"} <span className="text-pollar-blue">USDC</span></p>
      </div>

      <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-6 animate-fade-slide-up" style={{ animationDelay: "0.1s" }}>
        <div className="mb-5">
          <label className="block text-sm font-bold text-foreground mb-2">Recipient Pollar Address</label>
          <input type="text" placeholder="GB...WXYZ (María's Stellar address)"
            value={address} onChange={(e) => setAddress(e.target.value)}
            className="w-full px-4 py-3 bg-surface-hover border border-surface-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pollar-blue transition font-mono"
          />
          <p className="text-xs text-muted mt-1.5">Pollar resolves this to a verified bank account in Bolivia.</p>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-bold text-foreground mb-2">Amount (USDC)</label>
          <div className="flex gap-3">
            <input type="number" value={amount}
              onChange={(e) => { setAmount(e.target.value); setQuote(null); }}
              className="flex-1 px-4 py-3 bg-surface-hover border border-surface-border rounded-xl text-xl font-extrabold focus:outline-none focus:ring-2 focus:ring-pollar-blue transition"
            />
            <button onClick={getQuote} disabled={isQuoting || !amount}
              className="px-5 py-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-foreground text-sm font-bold rounded-xl transition cursor-pointer border border-surface-border active:scale-95">
              {isQuoting ? "..." : "Get Quote"}
            </button>
          </div>
        </div>

        {quote && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-5 animate-fade-slide-up">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold text-slate-600">María receives in Bolivia:</span>
              <span className="text-2xl font-extrabold text-foreground">Bs. {quote.bob.toFixed(2)}</span>
            </div>
            <div className="space-y-1.5 text-xs border-t border-blue-100 pt-3">
              {[["Exchange rate", `1 USDC = ${quote.rate} BOB`], ["Network fee", "0.00 USDC"], ["Settlement", "~1 second (Stellar)"]].map(([k, v]) => (
                <div key={k} className="flex justify-between text-muted">
                  <span>{k}</span>
                  <span className={v === "0.00 USDC" ? "text-success font-bold" : "font-medium text-foreground"}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={handleSend} disabled={!quote || isSending}
          className="w-full flex items-center justify-center gap-2 py-4 bg-pollar-blue hover:bg-pollar-blue-hover disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 text-white font-bold rounded-2xl shadow-blue transition-all cursor-pointer">
          {isSending ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Signing on Stellar...</> : <>Send {amount} USDC to Bolivia <FiArrowRight /></>}
        </button>
      </div>
    </div>
  );
}
