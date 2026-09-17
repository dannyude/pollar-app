"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, Agent, ApiError } from "@/api/client";
import { toast } from "@/hooks/useToast";
import {
  FiArrowRight, FiShield, FiTrendingUp, FiClock, FiSend, FiPlus, FiStar
} from "react-icons/fi";
import { Modal } from "@/components/ui/Modal";

// ─── Mock data clearly labelled ──────────────────────────────────────────────
const MOCK_AGENTS: Agent[] = [
  { id: "agt-123", name: "Tunde O.", bank_name: "GTBank", account_number: "0123456789", account_name: "Tunde Bello", rate_ngn_usd: 1550, available_usdc: 500 },
  { id: "agt-456", name: "Chioma E.", bank_name: "Zenith Bank", account_number: "9876543210", account_name: "Chioma Eze", rate_ngn_usd: 1545, available_usdc: 1200 },
];
const MOCK_RECENT = [
  { id: "ord-1", type: "cash_in", status: "completed", fiat_amount: 5000, usdc_amount: 3.22, created_at: "5 mins ago" },
  { id: "ord-2", type: "cash_out", status: "awaiting_fiat", fiat_amount: 15000, usdc_amount: 9.67, created_at: "1 hr ago" },
];

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-green-100 text-success",
    awaiting_fiat: "bg-yellow-100 text-warning",
    fiat_sent: "bg-blue-100 text-pollar-blue",
    releasing: "bg-purple-100 text-purple-600",
    disputed: "bg-red-100 text-danger",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${map[status] || "bg-slate-100 text-muted"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [amount, setAmount] = useState("5000");
  const [cashInModal, setCashInModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);

  // ⚡ REAL: Hits GET /api/agents — falls back to mock if backend is offline
  useEffect(() => {
    api.getAgents()
      .then((data) => { setAgents(data); setLoadingAgents(false); })
      .catch(() => {
        setAgents(MOCK_AGENTS); // clearly labelled mock fallback
        setLoadingAgents(false);
        toast.warning("Demo Mode", "Backend offline — showing demo agent data.");
      });
  }, []);

  const usdcEstimate = selectedAgent && amount
    ? (parseFloat(amount) / selectedAgent.rate_ngn_usd).toFixed(2)
    : "—";

  const openCashIn = (agent: Agent) => {
    setSelectedAgent(agent);
    setCashInModal(true);
  };

  // ⚡ REAL: Calls POST /api/orders — falls back to mock order id
  const handleCreateOrder = async () => {
    if (!selectedAgent) return;
    setCreating(true);
    try {
      const order = await api.createOrder({
        type: "cash_in",
        agentId: selectedAgent.id,
        fiatAmount: parseFloat(amount),
      });
        toast.success("Order Created!", `Reference: ${order.payment_reference}`);
      router.push(`/orders/${order.id}`);
    } catch (e) {
      if (e instanceof ApiError) toast.error("Error", e.message);
      else {
        toast.info("Demo Mode", "Routing to mock order tracker.");
        router.push("/orders/mock-order-id");
      }
    } finally {
      setCreating(false);
      setCashInModal(false);
    }
  };

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-10 gap-4 animate-fade-slide-up">
        <div>
          <p className="text-sm font-medium text-muted mb-1">Welcome back</p>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">{user?.name}</h1>
        </div>
        <button
          onClick={() => router.push("/send")}
          className="flex items-center gap-2 px-5 py-3 bg-pollar-blue hover:bg-pollar-blue-hover active:scale-95 text-white font-semibold rounded-2xl shadow-blue transition-all cursor-pointer"
        >
          <FiSend size={16} /> Send Global
        </button>
      </div>

      {/* ── Wallet Balance Card ─────────────────────────────── */}
      <div className="bg-gradient-to-br from-pollar-blue to-indigo-600 rounded-3xl p-8 mb-8 text-white shadow-blue-lg animate-fade-slide-up" style={{ animationDelay: "0.05s" }}>
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-blue-100 text-sm font-medium mb-2">Pollar Wallet Balance</p>
            <p className="text-5xl font-extrabold tracking-tight">
              {user?.usdc_balance?.toFixed(2) ?? "0.00"}
              <span className="text-2xl text-blue-200 font-semibold ml-2">USDC</span>
            </p>
          </div>
          <div className="bg-white/10 rounded-2xl p-3">
            <FiTrendingUp size={24} />
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2 w-fit">
          <span className="text-xs font-mono text-blue-100">{user?.stellar_address}</span>
        </div>
      </div>

      {/* ── Quick Actions ───────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10 animate-fade-slide-up" style={{ animationDelay: "0.1s" }}>
        {[
          { label: "Buy USDC", icon: FiPlus, action: () => setCashInModal(true), primary: true },
          { label: "Send Global", icon: FiSend, action: () => router.push("/send") },
          { label: "Orders", icon: FiClock, action: () => router.push("/orders/mock-order-id") },
          { label: "Agent Desk", icon: FiShield, action: () => router.push("/agent") },
        ].map((item) => (
          <button
            key={item.label}
            onClick={item.action}
            className={`flex flex-col items-center gap-2 py-5 px-4 rounded-2xl font-semibold text-sm transition-all duration-150 cursor-pointer active:scale-95 border
              ${item.primary
                ? "bg-pollar-blue text-white border-pollar-blue shadow-blue hover:bg-pollar-blue-hover"
                : "bg-white text-foreground border-surface-border hover:bg-surface-hover shadow-sm"
              }`}
          >
            <item.icon size={20} />
            {item.label}
          </button>
        ))}
      </div>

      {/* ── Agents ─────────────────────────────────────────── */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-extrabold text-foreground">Available Agents</h2>
          <span className="text-xs bg-green-50 text-success font-bold px-3 py-1.5 rounded-full border border-green-100">
            {agents.length} Online
          </span>
        </div>

        {loadingAgents ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => <div key={i} className="h-40 bg-white rounded-2xl border border-surface-border animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map((agent, i) => (
              <div
                key={agent.id}
                className="group bg-white rounded-2xl border border-surface-border hover:border-pollar-blue/30 shadow-sm hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 p-6 animate-fade-slide-up cursor-pointer"
                style={{ animationDelay: `${0.15 + i * 0.06}s` }}
                onClick={() => openCashIn(agent)}
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center font-bold text-pollar-blue text-lg border border-indigo-100">
                      {agent.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-base font-bold text-foreground">{agent.name}</h3>
                        <FiShield size={13} className="text-pollar-blue" title="Verified" />
                      </div>
                      <p className="text-xs text-muted">{agent.bank_name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-extrabold text-foreground">₦{agent.rate_ngn_usd.toLocaleString()}</p>
                    <p className="text-xs text-muted">per USDC</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-success font-semibold bg-green-50 px-2.5 py-1 rounded-full border border-green-100">
                    <FiStar size={11} />
                    ${agent.available_usdc} float
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-pollar-blue group-hover:gap-2.5 transition-all">
                    Select <FiArrowRight size={13} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recent Orders ───────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-extrabold text-foreground mb-5">Recent Activity</h2>
        <div className="bg-white rounded-2xl border border-surface-border shadow-sm overflow-hidden">
          {MOCK_RECENT.map((order, i) => (
            <div
              key={order.id}
              className={`flex items-center justify-between px-6 py-4 hover:bg-slate-50 cursor-pointer transition ${i < MOCK_RECENT.length - 1 ? "border-b border-surface-border" : ""}`}
              onClick={() => router.push(`/orders/${order.id}`)}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                  ${order.type === "cash_in" ? "bg-blue-50 text-pollar-blue" : "bg-purple-50 text-purple-500"}`}>
                  {order.type === "cash_in" ? <FiPlus size={18} /> : <FiSend size={18} />}
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground capitalize">{order.type.replace("_", " ")}</p>
                  <p className="text-xs text-muted">{order.created_at}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">{order.usdc_amount} USDC</p>
                  <p className="text-xs text-muted">₦{order.fiat_amount.toLocaleString()}</p>
                </div>
                <StatusBadge status={order.status} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted text-center mt-3">Recent activity shown from demo data — connect backend to see live orders.</p>
      </div>

      {/* ── Cash-In Modal ───────────────────────────────────── */}
      <Modal isOpen={cashInModal} onClose={() => setCashInModal(false)} title="Buy USDC via Agent">
        {selectedAgent && (
          <div>
            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-surface-border mb-6">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center font-bold text-pollar-blue">
                {selectedAgent.name.charAt(0)}
              </div>
              <div>
                <p className="font-bold text-foreground">{selectedAgent.name}</p>
                <p className="text-xs text-muted">{selectedAgent.bank_name} · ₦{selectedAgent.rate_ngn_usd.toLocaleString()}/USDC</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-foreground mb-2">Amount to send (NGN)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-bold">₦</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 bg-surface-hover border border-surface-border rounded-xl font-bold text-lg focus:outline-none focus:ring-2 focus:ring-pollar-blue transition"
                />
              </div>
            </div>

            <div className="flex justify-between items-center p-4 bg-blue-50 rounded-xl mb-6 border border-blue-100">
              <span className="text-sm text-slate-600">You receive:</span>
              <span className="text-xl font-extrabold text-pollar-blue">{usdcEstimate} USDC</span>
            </div>

            <button
              onClick={handleCreateOrder}
              disabled={creating || !amount || parseFloat(amount) <= 0}
              className="w-full flex items-center justify-center gap-2 py-4 bg-pollar-blue hover:bg-pollar-blue-hover disabled:opacity-50 active:scale-95 text-white font-bold rounded-2xl shadow-blue transition-all cursor-pointer"
            >
              {creating ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating Order...</>
              ) : (
                <>Create Order <FiArrowRight /></>
              )}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
