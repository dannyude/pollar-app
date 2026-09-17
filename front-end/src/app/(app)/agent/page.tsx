"use client";

import { useState } from "react";
import { api, ApiError } from "@/api/client";
import { toast } from "@/hooks/useToast";
import { FiCheckCircle, FiClock, FiShield, FiAlertTriangle } from "react-icons/fi";

type Status = "pending" | "confirming" | "completed";

export default function AgentDesk() {
  const [status, setStatus] = useState<Status>("pending");
  const [isConfirming, setIsConfirming] = useState(false);

  const confirm = async () => {
    setIsConfirming(true);
    try {
      await api.confirm("mock-order-id");
    } catch { /* demo */ }
    toast.success("Confirmed!", "Releasing USDC from Stellar escrow.");
    setStatus("confirming");
    setIsConfirming(false);
    setTimeout(() => {
      setStatus("completed");
      toast.success("Order Complete", "USDC released to Ada's wallet. Escrow settled.");
    }, 2000);
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-10 animate-fade-slide-up">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight mb-1">Agent Desk</h1>
          <p className="text-muted text-sm">Manage your inbound orders and USDC float.</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-1">Float Available</p>
          <p className="text-2xl font-extrabold text-success">500.00 USDC</p>
        </div>
      </div>

      {/* Float card */}
      <div className="grid grid-cols-3 gap-4 mb-10 animate-fade-slide-up" style={{ animationDelay: "0.05s" }}>
        {[
          { label: "Total Float", value: "500 USDC", color: "text-success" },
          { label: "Locked (orders)", value: "3.22 USDC", color: "text-warning" },
          { label: "Orders Today", value: "3", color: "text-pollar-blue" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-surface-border p-5 shadow-sm">
            <p className="text-xs text-muted mb-1">{s.label}</p>
            <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-extrabold text-foreground mb-5 animate-fade-slide-up" style={{ animationDelay: "0.1s" }}>Incoming Orders</h2>

      {/* Order card */}
      <div className="bg-white rounded-2xl border-l-4 border-l-warning border border-surface-border shadow-card p-6 animate-fade-slide-up" style={{ animationDelay: "0.12s" }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">PU-7KQ2</span>
              <span className={`text-xs font-bold uppercase tracking-wide flex items-center gap-1 ${status === "completed" ? "text-success" : "text-warning"}`}>
                {status === "pending" ? <><FiClock size={11} /> Awaiting Payment</> : status === "confirming" ? "Releasing..." : <><FiCheckCircle size={11} /> Complete</>}
              </span>
            </div>
            <h3 className="text-xl font-extrabold text-foreground">Ada M.</h3>
            <p className="text-sm text-muted">Cash-In • ₦5,000 → 3.22 USDC</p>
          </div>
          <div className="text-right bg-slate-50 rounded-2xl px-5 py-3 border border-surface-border">
            <p className="text-xs text-muted mb-1">Expect in bank</p>
            <p className="text-2xl font-extrabold text-foreground">₦5,000</p>
          </div>
        </div>

        {status === "pending" && (
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4 mb-5">
            <FiShield className="text-pollar-blue mt-0.5 flex-shrink-0" size={18} />
            <div>
              <p className="text-sm font-semibold text-slate-800 mb-0.5">Check your GTBank account</p>
              <p className="text-xs text-muted">Look for ₦5,000 from Ada M. with ref <strong>PU-7KQ2</strong></p>
            </div>
          </div>
        )}

        {status === "pending" ? (
          <div className="flex gap-3">
            <button
              onClick={confirm}
              disabled={isConfirming}
              className="flex-1 flex items-center justify-center gap-2 py-4 bg-pollar-blue hover:bg-pollar-blue-hover disabled:opacity-60 active:scale-95 text-white font-bold rounded-xl shadow-blue transition-all cursor-pointer"
            >
              {isConfirming ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Releasing...</> : <><FiCheckCircle size={15} /> Confirm Receipt</>}
            </button>
            <button className="flex items-center gap-2 px-4 py-4 bg-red-50 text-danger hover:bg-red-100 rounded-xl font-semibold text-sm transition cursor-pointer border border-red-100">
              <FiAlertTriangle size={15} /> Dispute
            </button>
          </div>
        ) : (
          <div className={`flex items-center justify-center gap-2 font-bold p-4 rounded-xl text-sm ${status === "completed" ? "bg-green-50 text-success" : "bg-blue-50 text-pollar-blue"}`}>
            <FiCheckCircle size={18} />
            {status === "completed" ? "Complete — USDC released to Ada's wallet" : "Releasing USDC via Stellar Escrow..."}
          </div>
        )}
      </div>
    </div>
  );
}
