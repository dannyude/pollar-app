"use client";

import { useState } from "react";
import { usePollar } from "@pollar/react";
import { FiSend } from "react-icons/fi";

import { api, ApiError, Order, usdc } from "@/api/client";
import { toast } from "@/hooks/useToast";

/**
 * Cash-out, customer side: sign the USDC payment to the escrow with Pollar, then
 * hand the hash to the API, which verifies it on Stellar before locking the order.
 * The memo is what ties the payment to this order, so it must go with it.
 */
export function SendUsdcButton({ order, onSent }: { order: Order; onSent: () => void }) {
  const { runTx } = usePollar();
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!order.escrow) return;
    setSending(true);
    try {
      const result = await runTx(
        "payment",
        {
          destination: order.escrow.address,
          amount: order.usdcAmount,
          asset: { type: "credit_alphanum4", code: order.escrow.asset.code, issuer: order.escrow.asset.issuer },
        },
        { memo: { type: "text", value: order.escrow.memo } },
      );
      if (result.status === "error") {
        // Pollar can refuse before anything reaches Stellar (policy, limits, a
        // build error). Show what it said — a generic message sends you hunting
        // on the wrong network.
        const why = [result.code, result.resultCode, result.message, result.details]
          .filter(Boolean)
          .join(" · ");
        console.error("[puente] runTx payment failed —", result);
        toast.error("Payment failed", why || "Pollar rejected the payment. Nothing was sent.");
        return;
      }
      await api.markUsdcSent(order.id, result.hash);
      toast.success("USDC locked in escrow", "The agent can now pay you.");
      onSent();
    } catch (e) {
      toast.error("Couldn't attach the payment", e instanceof ApiError ? e.message : "Try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  return (
    <button
      onClick={send}
      disabled={sending}
      className="w-full flex items-center justify-center gap-2 py-4 bg-pollar-blue hover:bg-pollar-blue-hover disabled:opacity-60 active:scale-[0.98] text-white text-sm font-bold rounded-2xl shadow-blue transition-all cursor-pointer"
    >
      <FiSend size={15} />
      {sending ? "Signing…" : `Send ${usdc(order.usdcAmount)} USDC to escrow`}
    </button>
  );
}
