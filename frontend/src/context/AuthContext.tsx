"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { setDevAuthHeader } from "@/api/client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  stellar_address: string;
  usdc_balance: number;
  is_agent: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => void;
}

const AUTH_COOKIE = "puente_session";
const USER_KEY = "puente_user";

const AuthContext = createContext<AuthContextType | null>(null);

// Mock user — swap getAuthState() from Pollar SDK in production
const MOCK_USER: AuthUser = {
  id: "usr-ada-001",
  email: "ada@example.com",
  name: "Ada M.",
  stellar_address: "GCKM...WXYZ",
  usdc_balance: 3.22,
  is_agent: false,
};

function setCookie(name: string, value: string, days = 1) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Rehydrate on mount from localStorage (survives hard refresh)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      if (stored) {
        const u = JSON.parse(stored) as AuthUser;
        setUser(u);
        setDevAuthHeader(u.id, u.stellar_address);
        // Ensure cookie is also present (might have expired)
        setCookie(AUTH_COOKIE, "1");
      } else {
        clearCookie(AUTH_COOKIE); // clear cookie if no local user state
      }
    } catch {
      // corrupted storage — treat as logged out
      clearCookie(AUTH_COOKIE);
    }
    setIsLoading(false);
  }, []);

  const login = async () => {
    setIsLoading(true);
    // TODO: Replace with real Pollar SDK:
    // const client = getClient();
    // await client.login("google");
    // const { session } = client.getAuthState();
    // setAuthHeader(session.token.accessToken);
    await new Promise((r) => setTimeout(r, 1000));

    setUser(MOCK_USER);
    setDevAuthHeader(MOCK_USER.id, MOCK_USER.stellar_address);
    // Persist user + set cookie BEFORE navigation
    localStorage.setItem(USER_KEY, JSON.stringify(MOCK_USER));
    setCookie(AUTH_COOKIE, "1");
    setIsLoading(false);
  };

  const logout = () => {
    localStorage.removeItem(USER_KEY);
    clearCookie(AUTH_COOKIE);
    setUser(null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
