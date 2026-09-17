"use client";

import { useState, useEffect } from "react";
import { api, Proof, usdc } from "@/api/client";
import { toast } from "@/hooks/useToast";
import { FiExternalLink, FiSearch, FiShield, FiCheckCircle } from "react-icons/fi";

// Zeros until the API answers, so nothing on this page is ever invented.
const EMPTY: Proof = {
  network: "testnet",
  escrow: { address: "", url: "", usdcBalance: null, obligationsUsdc: "0", solvent: null },
  totals: { users: 0, agents: 0, completedOrders: 0, completedCashIn: 0, completedCashOut: 0, refunded: 0, volumeUsdc: "0" },
  recent: [],
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 10) return "Just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}

export default function ProofPage() {
  const [data, setData] = useState<Proof>(EMPTY);
  const [search, setSearch] = useState("");

  useEffect(() => {
    // GET /api/proof — public, no sign-in needed
    api.getProof()
      .then(setData)
      .catch(() => toast.error("Can't reach the API", "Reserves couldn't be loaded."));
  }, []);

  const settled = data.recent.map((order) => {
    const link = order.hashes.release ?? order.hashes.refund ?? order.hashes.funding;
    return { ref: order.ref, amount: order.usdcAmount, at: order.completedAt, hash: link?.hash ?? "", url: link?.url ?? "" };
  });
  const filtered = settled.filter((t) => !search || t.hash.includes(search) || t.ref.includes(search.toUpperCase()));

  return (
    <div>
      <div className="mb-10 animate-fade-slide-up">
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight mb-2">Proof of Reserves</h1>
        <p className="text-muted">Every transaction is publicly verifiable on Stellar. All USDC is 1:1 backed.</p>
      </div>

      {/* Solvency banner */}
      <div className={`flex items-center gap-4 rounded-2xl p-5 mb-10 animate-fade-slide-up border ${data.escrow.solvent === false ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`} style={{ animationDelay: "0.05s" }}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${data.escrow.solvent === false ? "bg-danger text-white" : "bg-success text-white"}`}>
          {data.escrow.solvent === false ? <FiShield size={24} /> : <FiCheckCircle size={24} />}
        </div>
        <div>
          <p className={`font-extrabold text-lg ${data.escrow.solvent === false ? "text-danger" : "text-success"}`}>
            {data.escrow.solvent === null ? "Escrow balance unavailable" : data.escrow.solvent ? "Fully backed" : "Under-collateralised"}
          </p>
          <p className="text-sm text-muted">
            Escrow holds <strong>{usdc(data.escrow.usdcBalance ?? "0")} USDC</strong> against{" "}
            <strong>{usdc(data.escrow.obligationsUsdc)} USDC</strong> owed to agents and open cash-outs.{" "}
            {data.escrow.url && (
              <a href={data.escrow.url} target="_blank" rel="noopener noreferrer" className="text-pollar-blue hover:underline font-semibold">
                View on Stellar
              </a>
            )}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-5 mb-10 animate-fade-slide-up" style={{ animationDelay: "0.1s" }}>
        {[
          { label: "Users", value: data.totals.users.toLocaleString(), color: "text-foreground" },
          { label: "Volume settled", value: `${usdc(data.totals.volumeUsdc)} USDC`, color: "text-pollar-blue" },
          { label: "Orders settled", value: data.totals.completedOrders.toLocaleString(), color: "text-success" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-surface-border shadow-sm p-6">
            <p className="text-xs text-muted mb-2 font-medium">{s.label}</p>
            <p className={`text-3xl font-extrabold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Transactions */}
      <div className="bg-white rounded-2xl border border-surface-border shadow-sm overflow-hidden animate-fade-slide-up" style={{ animationDelay: "0.15s" }}>
        <div className="flex items-center justify-between p-5 border-b border-surface-border">
          <h2 className="font-extrabold text-foreground">Settled Transactions</h2>
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
            <input type="text" placeholder="Search hash..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-4 py-2 text-sm bg-surface-hover border border-surface-border rounded-xl focus:outline-none focus:ring-2 focus:ring-pollar-blue transition"
            />
          </div>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-surface-border text-xs font-bold text-muted uppercase tracking-widest">
              <th className="px-6 py-3">Hash</th>
              <th className="px-6 py-3">Amount</th>
              <th className="px-6 py-3">When</th>
              <th className="px-6 py-3">Verify</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((tx) => (
              <tr key={tx.ref} className="border-b border-surface-border last:border-0 hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-mono text-sm text-pollar-blue">{tx.hash ? `${tx.hash.slice(0, 8)}…${tx.hash.slice(-6)}` : tx.ref}</td>
                <td className="px-6 py-4 font-extrabold text-foreground">{usdc(tx.amount)} <span className="font-normal text-muted text-xs">USDC</span></td>
                <td className="px-6 py-4 text-sm text-muted">{timeAgo(tx.at)}</td>
                <td className="px-6 py-4">
                  <a href={tx.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-pollar-blue hover:underline cursor-pointer font-semibold">
                    Stellar <FiExternalLink size={11} />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
