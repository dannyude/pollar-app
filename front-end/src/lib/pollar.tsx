"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { PollarClient } from "@pollar/core";
import { PollarProvider } from "@pollar/react";
import "@pollar/react/styles.css";

const publishableKey = process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY;

export const pollarConfigured = Boolean(publishableKey);

/**
 * Exactly one PollarClient per key, kept on globalThis so React StrictMode and dev
 * hot reloads don't create a second one. Two live clients share one stored session
 * and refresh independently, which trips the server's token-reuse detection and
 * logs the user out.
 */
const globalPollar = globalThis as { __pollarClient?: PollarClient };

function pollarClient(key: string): PollarClient {
  globalPollar.__pollarClient ??= new PollarClient({
    apiKey: key,
    // Publishable keys are network-scoped, so the key decides the network.
    stellarNetwork: key.startsWith("pub_mainnet_") ? "mainnet" : "testnet",
  });
  return globalPollar.__pollarClient;
}

/** True only where <PollarProvider> is actually mounted, so usePollar() is safe. */
const PollarReady = createContext(false);

export const usePollarReady = () => useContext(PollarReady);

/**
 * Mounted once in the root layout. Without a key the app still runs (dev auth).
 *
 * The client reads localStorage and window.crypto, so it can only be built in the
 * browser: the server renders the plain children, and the provider comes in on the
 * first client render.
 */
export function PollarAppProvider({ children }: { children: React.ReactNode }) {
  const [inBrowser, setInBrowser] = useState(false);
  useEffect(() => setInBrowser(true), []);

  if (!publishableKey || !inBrowser) return <PollarReady.Provider value={false}>{children}</PollarReady.Provider>;
  return (
    <PollarReady.Provider value={true}>
      <PollarProvider client={pollarClient(publishableKey)}>{children}</PollarProvider>
    </PollarReady.Provider>
  );
}
