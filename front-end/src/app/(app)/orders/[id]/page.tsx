"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/api/client";
import { toast } from "@/hooks/useToast";
import { FiCheckCircle, FiClock, FiLock, FiSend, FiAlertTriangle, FiExternalLink } from "react-icons/fi";

type Step = "created" | "fiat_sent" | "releasing" | "completed";

const STEPS = [
  { key: "created",   title: "Pay the Agent",       desc: "Transfer the exact NGN amount using the bank details below. Include the reference code." },
  { key: "fiat_sent", title: "Agent Verifying",      desc: "Tunde O. is confirming receipt in their GTBank account." },
  { key: "releasing", title: "Releasing Escrow",     desc: "Stellar smart contract is releasing USDC to your Pollar wallet." },
] as const;

export default function OrderTracker() {
  const [status, setStatus] = useState<Step>("created");
  const [isLoading, setIsLoading] = useState(false);
  const HASH = "a1b2c3d4e5f6...9f8e";

  const stepIndex = STEPS.findIndex((s) => s.key === status);
  const isDone = (key: string) => STEPS.findIndex((s) => s.key === key) < stepIndex || status === "completed";

  const handleMarkPaid = async () => {
    setIsLoading(true);
    try {
      await api.markFiatSent("mock-order-id", "PU-7KQ2");
    } catch (e) { /* demo */ }
    toast.info("Payment marked", "Waiting for agent to confirm in their bank app.");
    setStatus("fiat_sent");
    setIsLoading(false);
    setTimeout(() => {
      setStatus("releasing");
      setTimeout(() => {
        setStatus("completed");
        toast.success("USDC Released", "3.22 USDC added to your Pollar wallet.");
      }, 2000);
    }, 3000);
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="mb-8 animate-fade-slide-up">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-extrabold text-foreground">Order Tracker</h1>
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider
            ${status === "completed" ? "bg-green-100 text-success" : "bg-yellow-100 text-warning"}`}>
            {status.replace(/_/g, " ")}
          </span>
        </div>
        <p className="text-muted text-sm">Reference: <span className="font-mono font-bold text-foreground">PU-7KQ2</span></p>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-3 gap-3 mb-8 animate-fade-slide-up" style={{ animationDelay: "0.06s" }}>
        {[
          { label: "You Send", value: "₦5,000" },
          { label: "You Receive", value: "3.22 USDC" },
          { label: "Agent", value: "Tunde O." },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-2xl border border-surface-border p-4 text-center shadow-sm">
            <p className="text-xs text-muted mb-1">{item.label}</p>
            <p className="font-extrabold text-foreground text-sm">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-6 mb-6 animate-fade-slide-up" style={{ animationDelay: "0.1s" }}>
        {STEPS.map((step, i) => {
          const done = isDone(step.key);
          const active = step.key === status;
          return (
            <div key={step.key} className="flex gap-4">
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500
                  ${done ? "bg-success text-white" : active ? "bg-pollar-blue text-white animate-pulse2" : "bg-slate-100 text-muted"}`}>
                  {done ? <FiCheckCircle size={16} /> : active ? <FiClock size={14} /> : <FiLock size={13} />}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-0.5 transition-colors duration-700 my-1 ${done ? "bg-success" : "bg-slate-200"}`} style={{ height: "40px" }} />
                )}
              </div>

              <div className={`flex-1 ${i < STEPS.length - 1 ? "pb-6" : ""}`}>
                <h3 className={`font-bold mb-1 text-sm ${done || active ? "text-foreground" : "text-muted"}`}>{step.title}</h3>
                <p className="text-xs text-muted leading-relaxed mb-3">{step.desc}</p>

                {/* Bank details on step 1 */}
                {step.key === "created" && status === "created" && (
                  <>
                    <div className="bg-slate-50 border border-surface-border rounded-xl p-4 font-mono text-xs space-y-2 mb-4">
                      {[["Bank", "Guaranty Trust Bank"], ["Account", "0123456789"], ["Name", "Tunde Bello"], ["Amount", "₦5,000"], ["Reference", "PU-7KQ2"]].map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-muted">{k}</span>
                          <span className={`font-bold ${k === "Reference" ? "text-pollar-blue" : "text-foreground"}`}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleMarkPaid}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-pollar-blue hover:bg-pollar-blue-hover disabled:opacity-60 active:scale-95 text-white font-bold rounded-xl shadow-blue transition-all cursor-pointer text-sm"
                    >
                      {isLoading ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing...</> : <><FiCheckCircle size={14} /> Payment Sent</>}
                    </button>
                  </>
                )}

                {/* Completion block */}
                {step.key === "releasing" && status === "completed" && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 animate-fade-slide-up">
                    <p className="text-sm font-bold text-success mb-2">3.22 USDC added to wallet</p>
                    <a href={`https://stellar.expert/explorer/testnet/tx/${HASH}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-pollar-blue hover:underline font-mono cursor-pointer">
                      {HASH} <FiExternalLink size={11} />
                    </a>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dispute */}
      {(status === "fiat_sent" || status === "releasing") && (
        <div className="flex justify-center mb-6">
          <button className="flex items-center gap-1.5 text-xs text-danger hover:underline cursor-pointer font-medium transition">
            <FiAlertTriangle size={13} /> Raise a Dispute
          </button>
        </div>
      )}

      {/* CTA */}
      {status === "completed" && (
        <Link href="/send" className="flex items-center justify-center gap-2 w-full py-4 bg-pollar-blue hover:bg-pollar-blue-hover active:scale-95 text-white font-bold rounded-2xl shadow-blue transition-all cursor-pointer animate-slide-up">
          <FiSend size={16} /> Send USDC to Bolivia
        </Link>
      )}
    </div>
  );
}
