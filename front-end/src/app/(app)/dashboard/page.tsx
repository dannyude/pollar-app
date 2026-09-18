"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, Agent, ApiError, Order, PayoutDetails, fiat, newIdempotencyKey, num, usdc } from "@/api/client";
import { toast } from "@/hooks/useToast";
import {
  FiArrowRight, FiShield, FiTrendingUp, FiSend, FiPlus, FiStar, FiDownload, FiClock
} from "react-icons/fi";
import { Modal } from "@/components/ui/Modal";
import { ActivateUsdc } from "@/components/wallet/ActivateUsdc";

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return new Date(iso).toLocaleDateString();
}

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

/** The account details the agent needs to pay you, per rail. Keys are the API's. */
const PAYOUT_FIELDS: Record<string, { key: string; label: string; placeholder: string }[]> = {
  bank_transfer: [
    { key: "bank", label: "Bank", placeholder: "GTBank" },
    { key: "accountNumber", label: "Account number", placeholder: "0123456789" },
    { key: "accountName", label: "Account name", placeholder: "Ada Obi" },
  ],
  mobile_money: [
    { key: "provider", label: "Provider", placeholder: "Opay" },
    { key: "phoneNumber", label: "Phone number", placeholder: "+234 803 000 1111" },
    { key: "accountName", label: "Account name", placeholder: "Ada Obi" },
  ],
  cash: [
    { key: "location", label: "Pickup point", placeholder: "Yaba market, stall 12" },
    { key: "contactPhone", label: "Your phone", placeholder: "+234 803 000 1111" },
    { key: "accountName", label: "Your name", placeholder: "Ada Obi" },
  ],
};

export default function Dashboard() {
  const { user, balance } = useAuth();
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [amount, setAmount] = useState("5000");
  const [cashInModal, setCashInModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);
  const [recent, setRecent] = useState<Order[]>([]);
  const [cashOutModal, setCashOutModal] = useState(false);
  const [cashOutAgent, setCashOutAgent] = useState<Agent | null>(null);
  const [usdcAmount, setUsdcAmount] = useState("10");
  const [payout, setPayout] = useState<Record<string, string>>({});
  // One key per intent, so a double-tap or a retry can't open a second order.
  const [orderKey, setOrderKey] = useState(() => newIdempotencyKey());

  // GET /api/agents — the desks that can sell USDC right now
  useEffect(() => {
    api.getAgents()
      .then((data) => { setAgents(data); setLoadingAgents(false); })
      .catch((e) => {
        setLoadingAgents(false);
        toast.error("Can't reach the API", e instanceof ApiError ? e.message : "Is the backend running?");
      });
  }, []);

  // GET /api/orders — your own orders, newest first
  useEffect(() => {
    api.getOrders("user").then(setRecent).catch(() => setRecent([]));
  }, []);

  const usdcEstimate = selectedAgent && amount
    ? (parseFloat(amount) / num(selectedAgent.rateSell)).toFixed(2)
    : "—";

  // Cash out: the agent buys your USDC, so their buy rate prices it.
  const payoutFields = PAYOUT_FIELDS[cashOutAgent?.rail ?? "bank_transfer"] ?? [];
  const fiatEstimate = cashOutAgent && usdcAmount
    ? fiat(String(parseFloat(usdcAmount) * num(cashOutAgent.rateBuy)), cashOutAgent.currency)
    : "—";

  const openCashOut = (agent?: Agent) => {
    setOrderKey(newIdempotencyKey());
    const desk = agent ?? cashOutAgent ?? agents[0] ?? null;
    if (!desk) {
      toast.error("No agents online", "Nobody can buy your USDC right now.");
      return;
    }
    if (desk.id !== cashOutAgent?.id) setPayout({});
    setCashOutAgent(desk);
    setCashOutModal(true);
  };

  const handleCreateCashOut = async () => {
    if (!cashOutAgent) return;
    setCreating(true);
    try {
      const order = await api.createCashOut(cashOutAgent.id, parseFloat(usdcAmount), payout as unknown as PayoutDetails, orderKey);
      toast.success("Order created", "Send the USDC to the escrow to lock it in.");
      router.push(`/orders/${order.id}`);
    } catch (e) {
      toast.error("Couldn't create the order", e instanceof ApiError ? e.message : "The API didn't respond.");
    } finally {
      setCreating(false);
      setCashOutModal(false);
    }
  };

  const openCashIn = (agent: Agent) => {
    setOrderKey(newIdempotencyKey());
    setSelectedAgent(agent);
    setCashInModal(true);
  };

  // ⚡ REAL: Calls POST /api/orders — falls back to mock order id
  const handleCreateOrder = async () => {
    if (!selectedAgent) return;
    setCreating(true);
    try {
      const order = await api.createCashIn(selectedAgent.id, parseFloat(amount), orderKey);
      toast.success("Order created", `Quote the reference ${order.pay?.reference ?? order.ref} on your transfer.`);
      router.push(`/orders/${order.id}`);
    } catch (e) {
      toast.error("Couldn't create the order", e instanceof ApiError ? e.message : "The API didn't respond.");
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
        <Link
          href="/proof"
          className="flex items-center gap-2 px-5 py-3 bg-white border border-surface-border hover:bg-surface-hover text-foreground font-semibold rounded-2xl shadow-sm transition-all cursor-pointer"
        >
          <FiShield size={16} /> Proof of reserves
        </Link>
      </div>

      {/* ── Wallet Balance Card ─────────────────────────────── */}
      <div className="bg-gradient-to-br from-pollar-blue to-indigo-600 rounded-3xl p-8 mb-8 text-white shadow-blue-lg animate-fade-slide-up" style={{ animationDelay: "0.05s" }}>
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-blue-100 text-sm font-medium mb-2">Pollar Wallet Balance</p>
            <p className="text-5xl font-extrabold tracking-tight">
              {balance ? usdc(balance) : "—"}
              <span className="text-2xl text-blue-200 font-semibold ml-2">USDC</span>
            </p>
          </div>
          <div className="bg-white/10 rounded-2xl p-3">
            <FiTrendingUp size={24} />
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2 w-fit">
          <span className="text-xs font-mono text-blue-100">{user?.wallet}</span>
        </div>
      </div>

      {/* ── Quick Actions ───────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10 animate-fade-slide-up" style={{ animationDelay: "0.1s" }}>
        {[
          { label: "Add money", icon: FiPlus, action: () => setCashInModal(true), primary: true },
          { label: "Cash out", icon: FiDownload, action: () => openCashOut(), primary: true },
          { label: "Your orders", icon: FiClock, action: () => router.push("/orders") },
          { label: "Send abroad", icon: FiSend, action: () => router.push("/send") },
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

      <ActivateUsdc />

      {/* What the product actually does — the escrow is the point, and it was
          only explained on a page called Proof, last in the nav. */}
      <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-6 mb-10 animate-fade-slide-up" style={{ animationDelay: "0.12s" }}>
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <h2 className="text-lg font-extrabold text-foreground">Naira in, USDC out — without trusting anyone</h2>
          <Link href="/proof" className="text-sm font-bold text-pollar-blue hover:underline whitespace-nowrap">
            See the escrow →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            ["1. You pay an agent", "A bank transfer or mobile money, in naira, quoting the order's reference."],
            ["2. The escrow holds the USDC", "It was already there as the agent's float — not the agent's to keep."],
            ["3. Stellar settles it", "The agent confirms your naira and the escrow releases the USDC in seconds, on-chain."],
          ].map(([title, body]) => (
            <div key={title}>
              <p className="text-sm font-bold text-foreground mb-1">{title}</p>
              <p className="text-xs text-muted leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Agents ─────────────────────────────────────────── */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-extrabold text-foreground">Available Agents</h2>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
            agents.length ? "bg-green-50 text-success border-green-100" : "bg-slate-100 text-muted border-surface-border"
          }`}>
            {agents.length ? `${agents.length} Online` : "None online"}
          </span>
        </div>

        {loadingAgents ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => <div key={i} className="h-40 bg-white rounded-2xl border border-surface-border animate-pulse" />)}
          </div>
        ) : agents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-10 text-center">
            <FiClock size={24} className="mx-auto text-muted mb-3" />
            <p className="text-sm font-bold text-foreground mb-1">No agent desks are online right now</p>
            <p className="text-sm text-muted max-w-md mx-auto">
              Agents are people who hold USDC float in the escrow and move naira on their side. Until one is
              online there&apos;s nobody to buy from — you can still{" "}
              <Link href="/proof" className="text-pollar-blue font-semibold hover:underline">check the reserves</Link>{" "}
              or come back shortly.
            </p>
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
                      <p className="text-xs text-muted">{agent.institution ?? agent.rail.replace("_", " ")}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-extrabold text-foreground">{fiat(agent.rateSell, agent.currency)}</p>
                    <p className="text-xs text-muted">per USDC</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-success font-semibold bg-green-50 px-2.5 py-1 rounded-full border border-green-100">
                    <FiStar size={11} />
                    {usdc(agent.availableUsdc)} USDC float
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
          {recent.map((order, i) => (
            <div
              key={order.id}
              className={`flex items-center justify-between px-6 py-4 hover:bg-slate-50 cursor-pointer transition ${i < recent.length - 1 ? "border-b border-surface-border" : ""}`}
              onClick={() => router.push(`/orders/${order.id}`)}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                  ${order.type === "cash_in" ? "bg-blue-50 text-pollar-blue" : "bg-purple-50 text-purple-500"}`}>
                  {order.type === "cash_in" ? <FiPlus size={18} /> : <FiSend size={18} />}
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground capitalize">{order.type.replace("_", " ")}</p>
                  <p className="text-xs text-muted">{timeAgo(order.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">{usdc(order.usdcAmount)} USDC</p>
                  <p className="text-xs text-muted">{fiat(order.fiatAmount, order.currency)}</p>
                </div>
                <StatusBadge status={order.status} />
              </div>
            </div>
          ))}
        </div>
        {recent.length === 0 && (
          <p className="text-sm text-muted text-center py-8">No orders yet. Pick an agent above to add money.</p>
        )}
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
                <p className="text-xs text-muted">{selectedAgent.institution ?? "Agent"} · {fiat(selectedAgent.rateSell, selectedAgent.currency)}/USDC</p>
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

      {/* ── Cash-Out Modal ──────────────────────────────────── */}
      <Modal isOpen={cashOutModal} onClose={() => setCashOutModal(false)} title="Cash out to fiat">
        {cashOutAgent && (
          <div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-foreground mb-2">Agent paying you</label>
              <select
                value={cashOutAgent.id}
                onChange={(e) => openCashOut(agents.find((a) => a.id === e.target.value))}
                className="w-full px-4 py-3 bg-surface-hover border border-surface-border rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-pollar-blue transition"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {fiat(a.rateBuy, a.currency)}/USDC
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-foreground mb-2">Amount to sell (USDC)</label>
              <input
                type="number"
                value={usdcAmount}
                onChange={(e) => setUsdcAmount(e.target.value)}
                className="w-full px-4 py-3 bg-surface-hover border border-surface-border rounded-xl font-bold text-lg focus:outline-none focus:ring-2 focus:ring-pollar-blue transition"
              />
            </div>

            <div className="flex justify-between items-center p-4 bg-blue-50 rounded-xl mb-6 border border-blue-100">
              <span className="text-sm text-slate-600">You receive:</span>
              <span className="text-xl font-extrabold text-pollar-blue">{fiatEstimate}</span>
            </div>

            <p className="text-xs text-muted mb-3">Where {cashOutAgent.name} should send the money.</p>
            <div className="space-y-3 mb-6">
              {payoutFields.map((field) => (
                <div key={field.key}>
                  <label className="block text-xs font-semibold text-muted mb-1">{field.label}</label>
                  <input
                    value={payout[field.key] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(e) => setPayout((p) => ({ ...p, [field.key]: e.target.value }))}
                    className="w-full px-4 py-3 bg-surface-hover border border-surface-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pollar-blue transition"
                  />
                </div>
              ))}
            </div>

            <button
              onClick={handleCreateCashOut}
              disabled={
                creating ||
                !usdcAmount ||
                parseFloat(usdcAmount) <= 0 ||
                payoutFields.some((f) => (payout[f.key] ?? "").trim().length < 2)
              }
              className="w-full flex items-center justify-center gap-2 py-4 bg-pollar-blue hover:bg-pollar-blue-hover disabled:opacity-50 active:scale-95 text-white font-bold rounded-2xl shadow-blue transition-all cursor-pointer"
            >
              {creating ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating Order...</>
              ) : (
                <>Create cash-out <FiArrowRight /></>
              )}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
