/** Circle's USDC, the asset Pollar wallets hold. NEXT_PUBLIC_USDC_ISSUER overrides it for tests. */
const CIRCLE_USDC: Record<"testnet" | "mainnet", string> = {
  testnet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  mainnet: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
};

export const usdcIssuer = (network: "testnet" | "mainnet") =>
  process.env.NEXT_PUBLIC_USDC_ISSUER || CIRCLE_USDC[network];
