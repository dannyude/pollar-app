"use client";

import { useState } from "react";
import { usePollar } from "@pollar/react";
import { FiAlertCircle, FiCheckCircle } from "react-icons/fi";

import { useAuth } from "@/context/AuthContext";
import { usdcIssuer } from "@/lib/usdc";
import { toast } from "@/hooks/useToast";

/**
 * A brand-new Pollar wallet can't receive USDC until it trusts the asset on
 * Stellar, and the API refuses to open an order that would pay into one that
 * can't. Rather than leave the user with that error, offer the trustline.
 */
export function ActivateUsdc() {
  const { canHoldUsdc, refreshBalance, mode } = useAuth();
  const { setTrustline, network, openEnabledAssetsModal } = usePollar();
  const [working, setWorking] = useState(false);

  if (mode !== "pollar" || canHoldUsdc !== false) return null;

  const activate = async () => {
    setWorking(true);
    try {
      const result = await setTrustline({ code: "USDC", issuer: usdcIssuer(network) });
      if (result.status === "error") {
        toast.error("Couldn't activate the wallet", result.details ?? "Stellar rejected the trustline.");
        return;
      }
      toast.success("Wallet activated", "It can hold USDC now.");
      await refreshBalance();
    } catch {
      toast.error("Couldn't activate the wallet", "Try again, or open Pollar's assets screen.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-warning/30 shadow-sm p-6 mb-8 flex items-start gap-4">
      <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center text-warning flex-shrink-0">
        <FiAlertCircle size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-extrabold text-foreground mb-1">Activate your wallet for USDC</h3>
        <p className="text-sm text-muted mb-4">
          Stellar wallets hold an asset only after they trust it. This is a one-time step, and until
          it&apos;s done an agent can&apos;t send you USDC.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={activate}
            disabled={working}
            className="flex items-center gap-2 px-5 py-2.5 bg-pollar-blue hover:bg-pollar-blue-hover disabled:opacity-60 text-white text-sm font-bold rounded-xl transition cursor-pointer"
          >
            <FiCheckCircle size={15} />
            {working ? "Activating…" : "Activate for USDC"}
          </button>
          <button
            onClick={openEnabledAssetsModal}
            className="px-5 py-2.5 border border-surface-border hover:bg-slate-50 text-sm font-semibold rounded-xl transition cursor-pointer"
          >
            Open Pollar assets
          </button>
        </div>
      </div>
    </div>
  );
}
