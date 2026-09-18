"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePollar } from "@pollar/react";
import { FiAlertCircle, FiCheckCircle } from "react-icons/fi";

import { api } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { usePollarReady } from "@/lib/pollar";
import { usdcIssuer } from "@/lib/usdc";
import { toast } from "@/hooks/useToast";

/**
 * A Stellar wallet can only hold an asset it trusts, and a wallet Pollar has just
 * created trusts nothing — so the API would refuse to open an order that pays into
 * it. Establishing that trustline is onboarding, not a decision: it happens by
 * itself the first time we see a wallet without one, and the card below only
 * appears if that fails.
 *
 * This is per wallet. Whether the application may transact in USDC at all is a
 * separate, one-time setting in the Pollar dashboard (Tokens & Trustlines).
 */
export function ActivateUsdc() {
  const { canHoldUsdc, mode } = useAuth();
  // usePollar() throws outside <PollarProvider>, and that provider only exists
  // when the app is configured with a Pollar key — so the hook has to live in a
  // child that is never rendered without it.
  const ready = usePollarReady();
  if (mode !== "pollar" || !ready || canHoldUsdc !== false) return null;
  return <EstablishTrustline />;
}

function EstablishTrustline() {
  const { canHoldUsdc, refreshBalance, mode } = useAuth();
  const { setTrustline, network, openEnabledAssetsModal } = usePollar();
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const attempted = useRef(false);

  const activate = useCallback(async () => {
    setWorking(true);
    try {
      // A wallet Pollar failed to provision has no account on Stellar, and you
      // can't add a trustline to an account that doesn't exist. On testnet the
      // API repairs that first; on mainnet it's a no-op we ignore.
      if (network === "testnet") {
        await api.activateWallet().catch((e) => console.warn("[puente] wallet activate skipped —", e));
      }
      const result = await setTrustline({ code: "USDC", issuer: usdcIssuer(network) });
      if (result.status === "error") {
        // TrustlineOutcome only promises `details`; the server sends more.
        const extra = result as { code?: string; message?: string };
        const why = [extra.code, extra.message, result.details].filter(Boolean).join(" · ");
        console.error("[puente] setTrustline failed —", result);
        setFailure(why || "Stellar rejected the trustline.");
        return;
      }
      setFailure(null);
      await refreshBalance();
    } catch (e) {
      console.error("[puente] setTrustline threw —", e);
      setFailure("Pollar couldn't establish the trustline.");
    } finally {
      setWorking(false);
    }
  }, [network, refreshBalance, setTrustline]);

  // Once per session, and only for a wallet we know has no USDC trustline.
  useEffect(() => {
    if (mode !== "pollar" || canHoldUsdc !== false || attempted.current) return;
    attempted.current = true;
    void activate();
  }, [mode, canHoldUsdc, activate]);

  if (mode !== "pollar" || canHoldUsdc !== false) return null;

  if (!failure) {
    return (
      <div className="flex items-center gap-3 bg-white rounded-2xl border border-surface-border shadow-sm px-6 py-4 mb-8">
        <span className="w-4 h-4 border-2 border-pollar-blue/20 border-t-pollar-blue rounded-full animate-spin" />
        <p className="text-sm text-muted">Setting your wallet up to hold USDC…</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-warning/30 shadow-sm p-6 mb-8 flex items-start gap-4">
      <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center text-warning flex-shrink-0">
        <FiAlertCircle size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-extrabold text-foreground mb-1">Your wallet can&apos;t hold USDC yet</h3>
        <p className="text-sm text-muted mb-1">
          Stellar wallets hold an asset only after they trust it, and setting that up didn&apos;t work.
        </p>
        <p className="text-xs text-muted font-mono mb-4 break-words">{failure}</p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={activate}
            disabled={working}
            className="flex items-center gap-2 px-5 py-2.5 bg-pollar-blue hover:bg-pollar-blue-hover disabled:opacity-60 text-white text-sm font-bold rounded-xl transition cursor-pointer"
          >
            <FiCheckCircle size={15} />
            {working ? "Trying again…" : "Try again"}
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
