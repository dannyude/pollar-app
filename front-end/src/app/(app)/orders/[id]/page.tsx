"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  FiAlertTriangle, FiArrowLeft, FiCheck, FiCheckCircle, FiClock, FiCopy, FiExternalLink, FiRotateCcw,
} from "react-icons/fi";

import { api, ApiError, fiat, Order, OrderAction, usdc } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { useOrderTracking } from "@/hooks/useOrderTracking";
import { toast } from "@/hooks/useToast";
import { SendUsdcButton } from "@/components/orders/SendUsdcButton";

const STEPS: Record<Order["type"], Array<{ status: string; label: string }>> = {
  cash_in: [
    { status: "awaiting_fiat", label: "Send the transfer" },
    { status: "fiat_sent", label: "Agent confirms" },
    { status: "releasing", label: "Escrow releases USDC" },
    { status: "completed", label: "USDC in your wallet" },
  ],
  cash_out: [
    { status: "awaiting_usdc", label: "Send USDC to escrow" },
    { status: "usdc_locked", label: "Agent pays you" },
    { status: "fiat_sent", label: "Confirm it arrived" },
    { status: "completed", label: "Done" },
  ],
};

function Row({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-surface-border last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-bold text-foreground font-mono truncate max-w-[16rem]">{value}</span>
        {copyable && (
          <button
            onClick={() => { navigator.clipboard?.writeText(value); toast.success("Copied", label); }}
            className="text-muted hover:text-pollar-blue transition cursor-pointer flex-shrink-0"
            aria-label={`Copy ${label}`}
          >
            <FiCopy size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { mode } = useAuth();
  const { order, loading, error, refresh } = useOrderTracking(id);
  const [busy, setBusy] = useState<OrderAction | null>(null);
  const [reference, setReference] = useState("");
  const [txHash, setTxHash] = useState("");

  const run = async (action: OrderAction, call: () => Promise<Order>) => {
    setBusy(action);
    try {
      await call();
      await refresh();
    } catch (e) {
      toast.error("That didn't work", e instanceof ApiError ? e.message : "The API didn't respond.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="h-64 bg-white rounded-2xl border border-surface-border animate-pulse" />;
  if (error || !order) {
    return (
      <div className="bg-white rounded-2xl border border-surface-border p-10 text-center">
        <p className="font-bold text-foreground mb-2">Order not found</p>
        <p className="text-sm text-muted mb-6">{error ?? "It may belong to someone else."}</p>
        <button onClick={() => router.push("/dashboard")} className="text-sm font-bold text-pollar-blue cursor-pointer">Back to dashboard</button>
      </div>
    );
  }

  const can = (action: OrderAction) => order.actions.includes(action);
  const steps = STEPS[order.type];
  const reached = steps.findIndex((s) => s.status === order.status);
  const done = order.status === "completed" || order.status === "refunded";
  const isAgentView = order.viewerRole === "agent";

  return (
    <div className="max-w-2xl">
      <button onClick={() => router.push("/dashboard")} className="flex items-center gap-2 text-sm text-muted hover:text-foreground mb-6 cursor-pointer">
        <FiArrowLeft size={15} /> Back
      </button>

      {/* ── Summary ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-xs text-muted font-mono mb-1">{order.ref}</p>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
              {order.type === "cash_in" ? "Adding money" : "Cashing out"}
            </h1>
            <p className="text-sm text-muted mt-1">
              {isAgentView ? "Customer order at your desk" : `with ${order.agent.name}`}
            </p>
          </div>
          <span className="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide bg-slate-100 text-muted">
            {order.status.replace(/_/g, " ")}
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <p className="text-3xl font-extrabold text-foreground">{fiat(order.fiatAmount, order.currency)}</p>
          <p className="text-lg text-muted">→ {usdc(order.usdcAmount)} USDC</p>
        </div>
        <p className="text-xs text-muted mt-1">at {fiat(order.rate, order.currency)} per USDC</p>
      </div>

      {/* ── Progress ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-6 mb-6">
        {steps.map((step, i) => {
          const passed = done || (reached >= 0 && i < reached);
          const current = i === reached;
          return (
            <div key={step.status} className="flex items-center gap-3 py-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                passed ? "bg-success text-white" : current ? "bg-pollar-blue text-white" : "bg-slate-100 text-muted"}`}>
                {passed ? <FiCheck size={14} /> : current ? <FiClock size={13} /> : <span className="text-xs font-bold">{i + 1}</span>}
              </div>
              <span className={`text-sm ${current ? "font-bold text-foreground" : passed ? "text-muted" : "text-muted"}`}>{step.label}</span>
            </div>
          );
        })}
        {order.pending && <p className="text-xs text-muted mt-3">The Stellar payment is still settling — this updates itself.</p>}
      </div>

      {/* ── cash_in: where to send the transfer ─────────────── */}
      {order.pay && (
        <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-6 mb-6">
          <h2 className="font-extrabold text-foreground mb-1">Send exactly {fiat(order.fiatAmount, order.currency)}</h2>
          <p className="text-sm text-muted mb-4">Quote the reference, or the agent can&apos;t match your transfer.</p>
          {order.pay.bank && <Row label="Bank" value={order.pay.bank} />}
          {order.pay.accountNumber && <Row label="Account number" value={order.pay.accountNumber} copyable />}
          {order.pay.provider && <Row label="Provider" value={order.pay.provider} />}
          {order.pay.phoneNumber && <Row label="Phone" value={order.pay.phoneNumber} copyable />}
          {order.pay.location && <Row label="Where" value={order.pay.location} />}
          {order.pay.accountName && <Row label="Account name" value={order.pay.accountName} />}
          <Row label="Reference" value={order.pay.reference} copyable />
        </div>
      )}

      {/* ── cash_out: where to send the USDC, until it's there ── */}
      {order.escrow && can("usdc-sent") && (
        <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-6 mb-6">
          <h2 className="font-extrabold text-foreground mb-1">Send {usdc(order.usdcAmount)} USDC to escrow</h2>
          <p className="text-sm text-muted mb-4">The memo ties the payment to this order. It&apos;s checked on Stellar.</p>
          <Row label="Address" value={order.escrow.address} copyable />
          <Row label="Memo" value={order.escrow.memo} copyable />
          <Row label="Asset" value={`${order.escrow.asset.code} · ${order.escrow.asset.issuer.slice(0, 8)}…`} />
        </div>
      )}

      {order.type === "cash_out" && order.payout && !can("usdc-sent") && (
        <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-6 mb-6">
          <h2 className="font-extrabold text-foreground mb-1">Where {order.agent.name} pays you</h2>
          <p className="text-sm text-muted mb-4">
            {order.agentReference ? `Their payout reference: ${order.agentReference}` : "They pay this account once your USDC is locked."}
          </p>
          {Object.entries(order.payout).map(([key, value]) => (
            <Row key={key} label={key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())} value={value} />
          ))}
        </div>
      )}

      {/* ── What this viewer can do now, straight from order.actions ── */}
      <div className="space-y-3">
        {can("fiat-sent") && order.type === "cash_in" && (
          <button
            onClick={() => run("fiat-sent", () => api.markFiatSent(order.id))}
            disabled={busy !== null}
            className="w-full py-4 bg-pollar-blue hover:bg-pollar-blue-hover disabled:opacity-60 text-white text-sm font-bold rounded-2xl shadow-blue transition-all cursor-pointer"
          >
            {busy === "fiat-sent" ? "Saving…" : "I've sent the transfer"}
          </button>
        )}

        {can("fiat-sent") && order.type === "cash_out" && (
          <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-6">
            <label className="block text-sm font-semibold text-foreground mb-2">Payout reference</label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="NIP-000123"
              className="w-full px-4 py-3 bg-surface-hover border border-surface-border rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-pollar-blue"
            />
            <button
              onClick={() => run("fiat-sent", () => api.markFiatSent(order.id, reference))}
              disabled={busy !== null || reference.trim().length < 3}
              className="w-full py-3 bg-pollar-blue hover:bg-pollar-blue-hover disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-all cursor-pointer"
            >
              {busy === "fiat-sent" ? "Saving…" : `I've paid ${fiat(order.fiatAmount, order.currency)}`}
            </button>
          </div>
        )}

        {can("usdc-sent") && order.escrow && mode === "pollar" && (
          <SendUsdcButton order={order} onSent={refresh} />
        )}

        {can("usdc-sent") && order.escrow && mode !== "pollar" && (
          <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-6">
            <label className="block text-sm font-semibold text-foreground mb-2">Stellar transaction hash</label>
            <input
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              placeholder="64 hex characters"
              className="w-full px-4 py-3 bg-surface-hover border border-surface-border rounded-xl mb-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-pollar-blue"
            />
            <button
              onClick={() => run("usdc-sent", () => api.markUsdcSent(order.id, txHash.trim()))}
              disabled={busy !== null || txHash.trim().length !== 64}
              className="w-full py-3 bg-pollar-blue hover:bg-pollar-blue-hover disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-all cursor-pointer"
            >
              {busy === "usdc-sent" ? "Checking on Stellar…" : "Attach payment"}
            </button>
          </div>
        )}

        {can("confirm") && (
          <button
            onClick={() => run("confirm", () => api.confirm(order.id))}
            disabled={busy !== null}
            className="w-full flex items-center justify-center gap-2 py-4 bg-success hover:brightness-95 disabled:opacity-60 text-white text-sm font-bold rounded-2xl transition-all cursor-pointer"
          >
            <FiCheckCircle size={16} />
            {busy === "confirm"
              ? "Confirming…"
              : order.type === "cash_in"
                ? `I received ${fiat(order.fiatAmount, order.currency)}`
                : `I received ${fiat(order.fiatAmount, order.currency)}`}
          </button>
        )}

        {can("refund") && (
          <button
            onClick={() => run("refund", () => api.refund(order.id))}
            disabled={busy !== null}
            className="w-full flex items-center justify-center gap-2 py-3 border border-surface-border hover:bg-slate-50 disabled:opacity-60 text-sm font-bold text-foreground rounded-2xl transition cursor-pointer"
          >
            <FiRotateCcw size={15} /> {busy === "refund" ? "Refunding…" : "Refund my USDC"}
          </button>
        )}

        {can("dispute") && (
          <button
            onClick={() => {
              const reason = window.prompt("What went wrong? The other side and an admin will see this.");
              if (reason && reason.trim().length >= 5) void run("dispute", () => api.dispute(order.id, reason.trim()));
            }}
            disabled={busy !== null}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-danger hover:bg-red-50 rounded-2xl transition cursor-pointer"
          >
            <FiAlertTriangle size={15} /> The money never arrived
          </button>
        )}

        {order.actions.length === 0 && !done && (
          <p className="text-sm text-muted text-center py-4">Waiting on the other side. This page updates itself.</p>
        )}
      </div>

      {/* ── On-chain proof ──────────────────────────────────── */}
      {(order.hashes.funding || order.hashes.release || order.hashes.refund) && (
        <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-6 mt-6">
          <h2 className="font-extrabold text-foreground mb-3">On Stellar</h2>
          {([["Your payment in", order.hashes.funding], ["USDC released", order.hashes.release], ["Refund", order.hashes.refund]] as const)
            .filter(([, link]) => link)
            .map(([label, link]) => (
              <a
                key={label}
                href={link!.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between py-3 border-b border-surface-border last:border-0 hover:text-pollar-blue transition"
              >
                <span className="text-sm text-muted">{label}</span>
                <span className="flex items-center gap-1.5 text-sm font-mono text-pollar-blue">
                  {link!.hash.slice(0, 8)}…{link!.hash.slice(-6)} <FiExternalLink size={12} />
                </span>
              </a>
            ))}
        </div>
      )}

      {/* ── Timeline ────────────────────────────────────────── */}
      {order.events && order.events.length > 0 && (
        <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-6 mt-6">
          <h2 className="font-extrabold text-foreground mb-3">History</h2>
          {order.events.map((event, i) => (
            <div key={i} className="flex items-start justify-between gap-4 py-2 border-b border-surface-border last:border-0">
              <div>
                <p className="text-sm font-semibold text-foreground">{event.to.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted">
                  {event.actor} · {typeof event.meta?.note === "string" ? event.meta.note : ""}
                </p>
              </div>
              <span className="text-xs text-muted whitespace-nowrap">{new Date(event.at).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
