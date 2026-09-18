"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePollar } from "@pollar/react";
import { useAuth } from "@/context/AuthContext";
import { usePollarReady } from "@/lib/pollar";
import { usdc } from "@/api/client";
import { usdcIssuer } from "@/lib/usdc";
import { toast } from "@/hooks/useToast";
import { FiCheckCircle, FiArrowRight, FiGlobe } from "react-icons/fi";

export default function SendPage() {
  // Every control here needs Pollar to sign; without the provider there is
  // nothing to render but an explanation.
  const ready = usePollarReady();
  if (!ready) return <PollarRequired />;
  return <Send />;
}

function PollarRequired() {
  return (
    <div className="max-w-xl mx-auto bg-white rounded-2xl border border-surface-border shadow-sm p-10 text-center">
      <FiGlobe size={24} className="mx-auto text-muted mb-3" />
      <h1 className="text-xl font-extrabold text-foreground mb-2">Sending needs a Pollar wallet</h1>
      <p className="text-sm text-muted">
        This app is running without a Pollar key, so there&apos;s no wallet to sign the payment. Add
        NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY and sign in to send USDC.
      </p>
    </div>
  );
}

function Send() {
  const { balance, mode } = useAuth();
  const { runTx, getClient, network } = usePollar();
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("3.22");
  const [isQuoting, setIsQuoting] = useState(false);
  const [quote, setQuote] = useState<{ bob: number; rate: number } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  // Which corridors Pollar's ramp actually covers for this app. Better to know
  // here than to find out mid-demo that BOB isn't one of them.
  const [corridors, setCorridors] = useState<{ code: string; currency: string | null }[] | null>(null);
  const [corridorError, setCorridorError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "pollar") return;
    getClient()
      .getRampCountries()
      .then((res) => setCorridors(res.countries ?? []))
      .catch((e: unknown) => {
        const why = e instanceof Error ? e.message : "Pollar didn't answer.";
        console.warn("[puente] getRampCountries failed —", e);
        setCorridorError(why);
      });
  }, [mode, getClient]);

  const getQuote = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setIsQuoting(true);
    setQuote(null);
    try {
      // Pollar prices the Bolivian leg: USDC out, bolivianos into a bank there.
      // Pollar's ramp quotes are per country + currency; Bolivia pays out in BOB.
      const quotes = await getClient().getRampsQuote({
        direction: "offramp",
        country: "BO",
        currency: "BOB",
        amount: parseFloat(amount),
      });
      const list = quotes as unknown as Array<{ fiatAmount?: string | number; rate?: string | number }>;
      const best = Array.isArray(list) ? list[0] : (quotes as unknown as { fiatAmount?: string | number; rate?: string | number });
      const bob = parseFloat(String(best?.fiatAmount ?? "0"));
      const rate = parseFloat(String(best?.rate ?? "0"));
      if (!bob) throw new Error("no quote");
      setQuote({ bob, rate });
    } catch {
      toast.warning("No live quote", "Pollar's BOB ramp isn't enabled for this app yet. You can still send the USDC.");
    } finally {
      setIsQuoting(false);
    }
  };

  const handleSend = async () => {
    if (!/^G[A-Z2-7]{55}$/.test(address.trim())) {
      toast.error("Check the address", "A Pollar wallet address starts with G and is 56 characters.");
      return;
    }
    setIsSending(true);
    try {
      const result = await runTx("payment", {
        destination: address.trim(),
        amount,
        asset: { type: "credit_alphanum4", code: "USDC", issuer: usdcIssuer(network) },
      });
      if (result.status === "error") {
        const why = [result.code, result.resultCode, result.message, result.details]
          .filter(Boolean)
          .join(" · ");
        console.error("[puente] runTx payment failed —", result);
        toast.error("Payment failed", why || "Pollar rejected it. Nothing was sent.");
        return;
      }
      setTxHash(result.hash);
      toast.success("Sent", `${amount} USDC is on its way.`);
    } catch {
      toast.error("Payment failed", "Your wallet couldn't sign this payment.");
    } finally {
      setIsSending(false);
    }
  };

  if (txHash) {
    return (
      <div className="max-w-md mx-auto text-center animate-slide-up pt-10">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
          <FiCheckCircle size={40} className="text-success" />
        </div>
        <h2 className="text-2xl font-extrabold text-foreground mb-2">Sent Successfully</h2>
        <p className="text-muted mb-6">
          {amount} USDC sent{quote ? `. The recipient can cash out about Bs. ${quote.bob.toFixed(2)} through Pollar's ramp.` : "."}
        </p>
        <div className="bg-white rounded-2xl border border-surface-border p-5 mb-6 text-left">
          <p className="text-xs text-muted mb-1">Transaction Hash</p>
          <a href={`https://stellar.expert/explorer/testnet/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
            className="font-mono text-sm text-pollar-blue break-all hover:underline">{txHash}</a>
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

      {/* What Pollar's ramp can actually pay out, for this app */}
      <div className="p-4 bg-white rounded-2xl border border-surface-border shadow-sm mb-6 animate-fade-slide-up" style={{ animationDelay: "0.03s" }}>
        <p className="text-xs font-bold text-muted uppercase tracking-wide mb-1.5">Pollar cash-out corridors</p>
        {corridorError ? (
          <p className="text-sm text-muted">Couldn&apos;t read them: <span className="font-mono text-xs">{corridorError}</span></p>
        ) : corridors === null ? (
          <p className="text-sm text-muted">Checking…</p>
        ) : corridors.length === 0 ? (
          <p className="text-sm text-muted">
            None are enabled for this app yet, so the recipient can hold the USDC but can&apos;t convert it through Pollar.
          </p>
        ) : (
          <p className="text-sm text-foreground">
            {corridors.map((c) => `${c.code}${c.currency ? ` (${c.currency})` : ""}`).join(" · ")}
          </p>
        )}
      </div>

      {/* Balance */}
      <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-surface-border shadow-sm mb-6 animate-fade-slide-up" style={{ animationDelay: "0.05s" }}>
        <p className="text-sm font-medium text-muted">Your Balance</p>
        <p className="text-lg font-extrabold text-foreground">{balance ? usdc(balance) : "—"} <span className="text-pollar-blue">USDC</span></p>
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

        <button onClick={handleSend} disabled={isSending || mode !== "pollar" || !address || !amount}
          className="w-full flex items-center justify-center gap-2 py-4 bg-pollar-blue hover:bg-pollar-blue-hover disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 text-white font-bold rounded-2xl shadow-blue transition-all cursor-pointer">
          {isSending ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Signing on Stellar...</> : <>Send {amount} USDC to Bolivia <FiArrowRight /></>}
        </button>
      </div>
    </div>
  );
}
