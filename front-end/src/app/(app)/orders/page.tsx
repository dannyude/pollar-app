"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FiClock, FiPlus, FiSend } from "react-icons/fi";

import { api, ApiError, Order, fiat, usdc } from "@/api/client";
import { toast } from "@/hooks/useToast";

const SCOPES = [
  { key: "open", label: "In progress" },
  { key: "all", label: "Everything" },
] as const;

const BADGE: Record<string, string> = {
  completed: "bg-green-100 text-success",
  refunded: "bg-slate-100 text-muted",
  expired: "bg-slate-100 text-muted",
  disputed: "bg-red-100 text-danger",
  awaiting_fiat: "bg-yellow-100 text-warning",
  awaiting_usdc: "bg-yellow-100 text-warning",
  fiat_sent: "bg-blue-100 text-pollar-blue",
  usdc_locked: "bg-blue-100 text-pollar-blue",
  releasing: "bg-purple-100 text-purple-600",
  settling: "bg-purple-100 text-purple-600",
};

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function OrdersPage() {
  const [scope, setScope] = useState<(typeof SCOPES)[number]["key"]>("all");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrders(await api.getOrders("user", scope === "open" ? "open" : undefined));
    } catch (e) {
      toast.error("Couldn't load your orders", e instanceof ApiError ? e.message : "The API didn't respond.");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight mb-1">Your orders</h1>
          <p className="text-muted">Every cash-in and cash-out, with its proof on Stellar.</p>
        </div>
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition cursor-pointer ${
                scope === s.key ? "bg-white text-foreground shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-32 bg-white rounded-2xl border border-surface-border animate-pulse" />
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-12 text-center">
          <FiClock size={24} className="mx-auto text-muted mb-3" />
          <p className="text-sm text-muted mb-4">
            {scope === "open" ? "Nothing in progress right now." : "You haven't made an order yet."}
          </p>
          <Link href="/dashboard" className="text-sm font-bold text-pollar-blue hover:underline">
            Add money with an agent →
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-surface-border shadow-sm overflow-hidden">
          {orders.map((order, i) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className={`flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition ${
                i < orders.length - 1 ? "border-b border-surface-border" : ""
              }`}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    order.type === "cash_in" ? "bg-blue-50 text-pollar-blue" : "bg-purple-50 text-purple-500"
                  }`}
                >
                  {order.type === "cash_in" ? <FiPlus size={18} /> : <FiSend size={18} />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">
                    {order.type === "cash_in" ? "Adding money" : "Cashing out"}
                  </p>
                  <p className="text-xs text-muted truncate">
                    <span className="font-mono">{order.ref}</span> · {order.agent.name} · {when(order.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-4 flex-shrink-0">
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">{usdc(order.usdcAmount)} USDC</p>
                  <p className="text-xs text-muted">{fiat(order.fiatAmount, order.currency)}</p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                    BADGE[order.status] ?? "bg-slate-100 text-muted"
                  }`}
                >
                  {order.status.replace(/_/g, " ")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
