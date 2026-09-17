"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePollar } from "@pollar/react";

import { usePollarReady } from "@/lib/pollar";

import { AgentSelf, api, clearAuthHeader, setDevAuthHeader, setSessionTokenSource } from "@/api/client";

export interface AuthUser {
  id: string;
  email: string | null;
  name: string;
  /** The user's Stellar address, created by Pollar at sign-in. */
  wallet: string;
  isAgent: boolean;
  agent: AgentSelf | null;
}

type Mode = "pollar" | "dev" | "unconfigured";

interface AuthContextValue {
  user: AuthUser | null;
  /** USDC in the Pollar wallet, or null while unknown. */
  balance: string | null;
  isLoading: boolean;
  mode: Mode;
  login: () => void;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AUTH_COOKIE = "puente_session"; // middleware.ts guards routes on this

// Local testing without a browser sign-in: set NEXT_PUBLIC_DEV_WALLET to a funded
// testnet G-address and run the backend with DEV_AUTH=1.
const DEV_WALLET = process.env.NEXT_PUBLIC_DEV_WALLET;
const DEV_USER = process.env.NEXT_PUBLIC_DEV_USER || "dev-user";
const MODE: Mode = DEV_WALLET ? "dev" : process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY ? "pollar" : "unconfigured";

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

function setCookie(name: string, value: string, days = 1) {
  document.cookie = `${name}=${value}; expires=${new Date(Date.now() + days * 864e5).toUTCString()}; path=/; SameSite=Lax`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

/** Loads the profile from the backend once a session exists, and keeps the cookie in sync. */
function useProfile(signedIn: boolean) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!signedIn) {
      setUser(null);
      clearCookie(AUTH_COOKIE);
      setIsLoading(false);
      return;
    }
    try {
      const me = await api.getMe();
      setUser({
        id: me.user.id,
        email: me.user.email,
        name: me.user.email?.split("@")[0] ?? "You",
        wallet: me.user.wallet,
        isAgent: Boolean(me.agent),
        agent: me.agent,
      });
      setCookie(AUTH_COOKIE, "1");
    } catch {
      setUser(null);
      clearCookie(AUTH_COOKIE);
    } finally {
      setIsLoading(false);
    }
  }, [signedIn]);

  useEffect(() => {
    setIsLoading(true);
    void refresh();
  }, [refresh]);

  return { user, isLoading, refresh };
}

/** Real sign-in: Pollar owns the session, the wallet and the balance. */
function PollarAuthProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, openLoginModal, logout, getClient, walletBalance, refreshWalletBalance } = usePollar();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      clearAuthHeader();
      setSignedIn(false);
      return;
    }
    // Read the token per request: the SDK rotates it while the app is open.
    setSessionTokenSource(() => {
      const state = getClient().getAuthState();
      return state.step === "authenticated" ? state.session.token.accessToken : null;
    });
    setSignedIn(true);
    void refreshWalletBalance().catch(() => {});
  }, [isAuthenticated, getClient, refreshWalletBalance]);

  const { user, isLoading, refresh } = useProfile(signedIn);

  const value: AuthContextValue = {
    user,
    balance: usdcBalance(walletBalance),
    isLoading: isLoading || (isAuthenticated && !signedIn),
    mode: "pollar",
    login: openLoginModal,
    logout: () => {
      logout();
      clearAuthHeader();
      clearCookie(AUTH_COOKIE);
      window.location.href = "/login";
    },
    refresh,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Local testing: the backend trusts a Dev header instead of a Pollar session. */
function DevAuthProvider({ children }: { children: React.ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("puente_dev_signed_in") === "1") {
      setDevAuthHeader(DEV_USER, DEV_WALLET!);
      setSignedIn(true);
    }
  }, []);

  const { user, isLoading, refresh } = useProfile(signedIn);

  const value: AuthContextValue = {
    user,
    balance: null,
    isLoading,
    mode: "dev",
    login: () => {
      setDevAuthHeader(DEV_USER, DEV_WALLET!);
      localStorage.setItem("puente_dev_signed_in", "1");
      setSignedIn(true);
    },
    logout: () => {
      localStorage.removeItem("puente_dev_signed_in");
      clearAuthHeader();
      clearCookie(AUTH_COOKIE);
      window.location.href = "/login";
    },
    refresh,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** No Pollar key and no dev wallet: the app renders, but nobody can sign in. */
function UnconfiguredAuthProvider({ children }: { children: React.ReactNode }) {
  const value: AuthContextValue = {
    user: null,
    balance: null,
    isLoading: false,
    mode: "unconfigured",
    login: () => alert("Set NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY in .env.local, then restart the dev server."),
    logout: () => {},
    refresh: async () => {},
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Server render and the first client render: Pollar isn't mounted yet, so nobody can ask it anything. */
function StartingAuthProvider({ children }: { children: React.ReactNode }) {
  const value: AuthContextValue = {
    user: null,
    balance: null,
    isLoading: true,
    mode: "pollar",
    login: () => {},
    logout: () => {},
    refresh: async () => {},
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // usePollar() throws outside <PollarProvider>, which only exists in the browser.
  const pollarReady = usePollarReady();
  if (MODE === "dev") return <DevAuthProvider>{children}</DevAuthProvider>;
  if (MODE === "pollar") {
    return pollarReady ? <PollarAuthProvider>{children}</PollarAuthProvider> : <StartingAuthProvider>{children}</StartingAuthProvider>;
  }
  return <UnconfiguredAuthProvider>{children}</UnconfiguredAuthProvider>;
}

type BalanceState = { step: string; data?: { balances?: Array<{ code?: string; balance?: string | null }> } };

function usdcBalance(state: unknown): string | null {
  const balances = (state as BalanceState)?.data?.balances;
  if (!balances) return null;
  return balances.find((b) => b.code === "USDC")?.balance ?? "0";
}
