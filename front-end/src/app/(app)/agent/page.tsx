"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FiCheckCircle, FiClock, FiDollarSign, FiInbox, FiRefreshCw } from "react-icons/fi";

import { api, ApiError, fiat, Order, usdc } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/useToast";

export default function AgentDesk() {
  const { user, refresh } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [notAnAgent, setNotAnAgent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [references, setReferences] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      // The float moves with every release, so the desk's own numbers reload with the queue.
      const [queue] = await Promise.all([api.getOrders("agent", "open"), refresh()]);
      setOrders(queue);
      setNotAnAgent(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "NOT_AN_AGENT") setNotAnAgent(true);
      else if (e instanceof ApiError) toast.error("Couldn't load your queue", e.message);
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 10000); // new orders arrive while you watch
    return () => clearInterval(timer);
  }, [load]);

  const act = async (order: Order, what: "confirm" | "paid") => {
    setBusy(order.id);
    try {
      if (what === "confirm") {
        await api.confirm(order.id);
        toast.success("Confirmed", "The escrow is releasing the customer's USDC.");
      } else {
        await api.markFiatSent(order.id, references[order.id] ?? "");
        toast.success("Marked as paid", "The customer will confirm it arrived.");
      }
      await load();
    } catch (e) {
      toast.error("That didn't work", e instanceof ApiError ? e.message : "The API didn't respond.");
    } finally {
      setBusy(null);
    }
  };

  const desk = user?.agent;

  if (notAnAgent) {
    return (
      <div className="max-w-xl bg-white rounded-2xl border border-surface-border shadow-sm p-10 text-center">
        <FiInbox size={28} className="mx-auto text-muted mb-4" />
        <h1 className="text-xl font-extrabold text-foreground mb-2">You don&apos;t run an agent desk yet</h1>
        <p className="text-sm text-muted">
          Agents are registered by the Puente team, with their rates, payout account and USDC float.
          Ask to be added, then reload this page.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight mb-1">Agent desk</h1>
          <p className="text-muted">Confirm money in, pay money out. Every release is on Stellar.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2.5 border border-surface-border hover:bg-slate-50 rounded-xl text-sm font-semibold cursor-pointer transition">
          <FiRefreshCw size={14} /> Refresh
        </button>
      </div>

      {desk && (
        <div className="grid grid-cols-3 gap-5 mb-10">
          {[
            { label: "Float", value: `${usdc(desk.floatUsdc)} USDC`, color: "text-foreground" },
            { label: "Reserved for open orders", value: `${usdc(desk.reservedUsdc)} USDC`, color: "text-warning" },
            { label: "Available to sell", value: `${usdc(desk.availableUsdc)} USDC`, color: "text-success" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl border border-surface-border shadow-sm p-6">
              <p className="text-xs text-muted mb-2 font-medium">{stat.label}</p>
              <p className={`text-2xl font-extrabold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-xl font-extrabold text-foreground mb-4">Open orders</h2>

      {loading ? (
        <div className="h-32 bg-white rounded-2xl border border-surface-border animate-pulse" />
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-10 text-center">
          <FiClock size={24} className="mx-auto text-muted mb-3" />
          <p className="text-sm text-muted">Nothing waiting on you right now.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const waitingOnYou = order.actions.length > 0;
            return (
              <div key={order.id} className="bg-white rounded-2xl border border-surface-border shadow-sm p-6">
                <div className="flex items-start justify-between mb-4 gap-4">
                  <div>
                    <p className="text-xs text-muted font-mono mb-1">{order.ref}</p>
                    <p className="font-extrabold text-foreground">
                      {order.type === "cash_in" ? "Customer is adding money" : "Customer is cashing out"}
                    </p>
                    <p className="text-sm text-muted">
                      {fiat(order.fiatAmount, order.currency)} · {usdc(order.usdcAmount)} USDC
                    </p>
                  </div>
                  <span className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                    waitingOnYou ? "bg-blue-50 text-pollar-blue" : "bg-slate-100 text-muted"}`}>
                    {order.status.replace(/_/g, " ")}
                  </span>
                </div>

                {order.type === "cash_out" && order.payout && (
                  <div className="bg-slate-50 rounded-xl p-4 mb-4 border border-surface-border">
                    <p className="text-xs text-muted mb-1">Pay the customer</p>
                    <p className="text-sm font-bold text-foreground font-mono">{Object.values(order.payout).join(" · ")}</p>
                  </div>
                )}

                {order.actions.includes("confirm") && (
                  <button
                    onClick={() => act(order, "confirm")}
                    disabled={busy === order.id}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-success hover:brightness-95 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition cursor-pointer"
                  >
                    <FiCheckCircle size={15} />
                    {busy === order.id ? "Releasing…" : `I received ${fiat(order.fiatAmount, order.currency)}`}
                  </button>
                )}

                {order.actions.includes("fiat-sent") && (
                  <div className="flex gap-2">
                    <input
                      value={references[order.id] ?? ""}
                      onChange={(e) => setReferences((r) => ({ ...r, [order.id]: e.target.value }))}
                      placeholder="Payout reference"
                      className="flex-1 px-4 py-3 bg-surface-hover border border-surface-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pollar-blue"
                    />
                    <button
                      onClick={() => act(order, "paid")}
                      disabled={busy === order.id || (references[order.id] ?? "").trim().length < 3}
                      className="flex items-center gap-2 px-5 py-3 bg-pollar-blue hover:bg-pollar-blue-hover disabled:opacity-60 text-white text-sm font-bold rounded-xl transition cursor-pointer whitespace-nowrap"
                    >
                      <FiDollarSign size={14} /> Paid out
                    </button>
                  </div>
                )}

                <Link href={`/orders/${order.id}`} className="block text-center text-xs font-semibold text-pollar-blue mt-3 hover:underline">
                  Open order
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
