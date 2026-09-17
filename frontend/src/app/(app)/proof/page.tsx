"use client";

import { useState, useEffect } from "react";
import { api, ProofData } from "@/api/client";
import { toast } from "@/hooks/useToast";
import { FiExternalLink, FiSearch, FiShield, FiCheckCircle } from "react-icons/fi";

const MOCK: ProofData = {
  total_users: 142, total_orders: 387, total_volume_usdc: 45200.50,
  escrow_balance: 12400, is_solvent: true,
  recent_settled: [
    { id: "1", amount: 3.22,   hash: "a1b2c3d4...9f8e", settled_at: new Date().toISOString() },
    { id: "2", amount: 3.22,   hash: "c8f49e3a...a1b2", settled_at: new Date(Date.now()-60000).toISOString() },
    { id: "3", amount: 150.00, hash: "f7d3e2c1...2e4c", settled_at: new Date(Date.now()-300000).toISOString() },
    { id: "4", amount: 25.50,  hash: "9e2ab4f1...d1f4", settled_at: new Date(Date.now()-720000).toISOString() },
  ],
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 10) return "Just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}

export default function ProofPage() {
  const [data, setData] = useState<ProofData>(MOCK);
  const [search, setSearch] = useState("");

  useEffect(() => {
    // ⚡ REAL: GET /api/proof
    api.getProof()
      .then(setData)
      .catch(() => toast.warning("Demo Data", "Backend offline — showing sample reserves data."));
  }, []);

  const filtered = data.recent_settled.filter((t) => !search || t.hash.includes(search));

  return (
    <div>
      <div className="mb-10 animate-fade-slide-up">
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight mb-2">Proof of Reserves</h1>
        <p className="text-muted">Every transaction is publicly verifiable on Stellar. All USDC is 1:1 backed.</p>
      </div>

      {/* Solvency banner */}
      <div className={`flex items-center gap-4 rounded-2xl p-5 mb-10 animate-fade-slide-up border ${data.is_solvent ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`} style={{ animationDelay: "0.05s" }}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${data.is_solvent ? "bg-success text-white" : "bg-danger text-white"}`}>
          {data.is_solvent ? <FiCheckCircle size={24} /> : <FiShield size={24} />}
        </div>
        <div>
          <p className={`font-extrabold text-lg ${data.is_solvent ? "text-success" : "text-danger"}`}>
            {data.is_solvent ? "Fully Solvent" : "Under-Collateralised"}
          </p>
          <p className="text-sm text-muted">Escrow holds <strong>{data.escrow_balance.toLocaleString()} USDC</strong> covering all agent floats.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-5 mb-10 animate-fade-slide-up" style={{ animationDelay: "0.1s" }}>
        {[
          { label: "Total Users", value: data.total_users.toLocaleString(), color: "text-foreground" },
          { label: "Volume Processed", value: `$${data.total_volume_usdc.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "text-pollar-blue" },
          { label: "Orders Settled", value: data.total_orders.toLocaleString(), color: "text-success" },
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
              <tr key={tx.id} className="border-b border-surface-border last:border-0 hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-mono text-sm text-pollar-blue">{tx.hash}</td>
                <td className="px-6 py-4 font-extrabold text-foreground">{tx.amount.toFixed(2)} <span className="font-normal text-muted text-xs">USDC</span></td>
                <td className="px-6 py-4 text-sm text-muted">{timeAgo(tx.settled_at)}</td>
                <td className="px-6 py-4">
                  <a href={`https://stellar.expert/explorer/testnet/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer"
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
