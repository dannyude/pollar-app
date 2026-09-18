import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // A sleeping free-tier host can take ~50s to wake. Wait for that, but never
  // hang forever: without a cap a stalled request leaves the UI spinning.
  timeout: 60000,
});

/**
 * Where the Pollar session token comes from. Read fresh on every request, because
 * the SDK rotates the access token while the app is open.
 */
let readToken: (() => string | null) | null = null;

export const setSessionTokenSource = (provider: () => string | null) => {
  readToken = provider;
};

/** Local testing only; needs DEV_AUTH=1 on the backend. */
export const setDevAuthHeader = (userId: string, stellarAddress: string) => {
  readToken = null;
  apiClient.defaults.headers.common['Authorization'] = `Dev ${userId} ${stellarAddress}`;
};

export const clearAuthHeader = () => {
  readToken = null;
  delete apiClient.defaults.headers.common['Authorization'];
};

apiClient.interceptors.request.use((config) => {
  const token = readToken?.();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Types: these mirror backend/app/web/schemas.py exactly ──────────────────
// JSON is camelCase and every amount is a decimal string ("5.0000000", "8100.00").

export type OrderType = 'cash_in' | 'cash_out';

export type OrderStatus =
  | 'awaiting_fiat'
  | 'fiat_sent'
  | 'releasing'
  | 'completed'
  | 'expired'
  | 'disputed'
  | 'awaiting_usdc'
  | 'usdc_locked'
  | 'refunding'
  | 'refunded';

/** Endpoints the current viewer may call right now, straight from the API. */
export type OrderAction = 'fiat-sent' | 'usdc-sent' | 'confirm' | 'refund' | 'dispute';

export type Rail = 'bank_transfer' | 'mobile_money' | 'cash';

export interface Agent {
  id: string;
  name: string;
  country: string;
  currency: string;
  rail: Rail;
  /** Bank or mobile-money provider. Account numbers appear on an order, never here. */
  institution: string | null;
  /** Fiat per USDC the agent pays when you cash out. */
  rateBuy: string;
  /** Fiat per USDC you pay when you add money. */
  rateSell: string;
  minFiat: string;
  maxFiat: string;
  availableUsdc: string;
  maxCashInFiat: string;
}

export interface AgentSelf extends Agent {
  floatUsdc: string;
  reservedUsdc: string;
  openOrders: number;
}

export interface TxLink {
  hash: string;
  url: string;
}

export interface OrderEvent {
  from: OrderStatus | null;
  to: OrderStatus;
  actor: 'user' | 'agent' | 'system';
  at: string;
  meta: Record<string, unknown>;
}

/** cash_in: where to send fiat, and the reference to quote. */
export interface PayInstructions {
  rail: Rail;
  reference: string;
  bank?: string;
  accountNumber?: string;
  accountName?: string;
  provider?: string;
  phoneNumber?: string;
  location?: string;
  contactPhone?: string;
}

/** cash_out: where to send USDC. The memo is required. */
export interface EscrowTarget {
  address: string;
  asset: { code: string; issuer: string };
  memo: string;
}

export interface Order {
  id: string;
  ref: string;
  type: OrderType;
  status: OrderStatus;
  viewerRole: 'user' | 'agent';
  actions: OrderAction[];
  currency: string;
  fiatAmount: string;
  usdcAmount: string;
  rate: string;
  agent: { id: string; name: string; rail: Rail };
  userWallet: string;
  pay: PayInstructions | null;
  escrow: EscrowTarget | null;
  payout: Record<string, string> | null;
  agentReference: string | null;
  disputeReason: string | null;
  hashes: { funding: TxLink | null; release: TxLink | null; refund: TxLink | null };
  expiresAt: string | null;
  lockedAt: string | null;
  refundAvailableAt: string | null;
  fiatSentAt: string | null;
  completedAt: string | null;
  createdAt: string;
  /** True (HTTP 202) while an escrow payment is still landing; keep polling. */
  pending: boolean;
  /** The timeline: present on a single order, null in lists. */
  events: OrderEvent[] | null;
}

export interface Me {
  user: { id: string; wallet: string; email: string | null };
  agent: AgentSelf | null;
}

export interface Proof {
  network: 'testnet' | 'mainnet';
  escrow: {
    address: string;
    url: string;
    usdcBalance: string | null;
    obligationsUsdc: string;
    solvent: boolean | null;
  };
  totals: {
    users: number;
    agents: number;
    completedOrders: number;
    completedCashIn: number;
    completedCashOut: number;
    refunded: number;
    volumeUsdc: string;
  };
  recent: Array<{
    ref: string;
    type: OrderType;
    status: 'completed' | 'refunded';
    currency: string;
    fiatAmount: string;
    usdcAmount: string;
    completedAt: string;
    hashes: { funding: TxLink | null; release: TxLink | null; refund: TxLink | null };
  }>;
}

/** Bank details for a cash-out payout. Shape depends on the agent's rail. */
export type PayoutDetails =
  | { bank: string; accountNumber: string; accountName: string }
  | { provider: string; phoneNumber: string; accountName: string }
  | { location: string; contactPhone: string; accountName: string };

// ─── Amounts ─────────────────────────────────────────────────────────────────
// The API sends decimal strings so nothing is lost in rounding. Convert only for
// display and arithmetic, never for sending money amounts back.

export const num = (amount: string | null | undefined) => (amount ? parseFloat(amount) : 0);

export const fiat = (amount: string, currency = 'NGN') => {
  const symbol = currency === 'NGN' ? '₦' : '';
  return symbol + num(amount).toLocaleString(undefined, { maximumFractionDigits: 2 });
};

export const usdc = (amount: string) => num(amount).toFixed(2);

// ─── Errors ──────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  code: string;
  /** HTTP status, or 0 when the request never reached the API. */
  status: number;
  details?: unknown;
  constructor(code: string, message: string, status = 0, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status ?? 0;
    const data = err.response?.data;
    if (data?.error) {
      return Promise.reject(new ApiError(data.error.code, data.error.message, status, data.error.details));
    }
    // No error envelope: the API never answered, or answered with something else
    // (a proxy's 502 page while the host wakes up). Callers still get an ApiError.
    return Promise.reject(
      status
        ? new ApiError(`HTTP_${status}`, `The API answered ${status}.`, status)
        : new ApiError('NETWORK_ERROR', "Couldn't reach the API.", 0),
    );
  }
);

/**
 * Opening an order is the one call that isn't naturally repeatable: a second one
 * would reserve more of the agent's float. Passing a key makes a retry — or a
 * double-tap — return the order that already exists.
 */
const idempotent = (key?: string) => (key ? { headers: { 'Idempotency-Key': key } } : undefined);

/** A key for one user intent; reuse it across retries of that same intent. */
export const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ─── Calls ───────────────────────────────────────────────────────────────────

export const api = {
  getMe: async () => (await apiClient.get<Me>('/me')).data,

  /**
   * Testnet only: create this wallet on Stellar if Pollar's provisioning left it
   * without an account. Safe to call repeatedly.
   */
  activateWallet: async () =>
    (await apiClient.post<{ address: string; funded: boolean; canHoldUsdc: boolean }>('/wallet/activate')).data,

  getAgents: async (country = 'NG') => (await apiClient.get<Agent[]>('/agents', { params: { country } })).data,

  /** Add money: you pay the agent fiat, the escrow releases USDC to your wallet. */
  createCashIn: async (agentId: string, fiatAmount: number, idempotencyKey?: string) =>
    (await apiClient.post<Order>('/orders', { type: 'cash_in', agentId, fiatAmount }, idempotent(idempotencyKey))).data,

  /** Cash out: you send USDC to the escrow, the agent pays fiat to this account. */
  createCashOut: async (agentId: string, usdcAmount: number, payout: PayoutDetails, idempotencyKey?: string) =>
    (await apiClient.post<Order>('/orders', { type: 'cash_out', agentId, usdcAmount, payout }, idempotent(idempotencyKey))).data,

  getOrders: async (as: 'user' | 'agent' = 'user', scope?: 'open') =>
    (await apiClient.get<Order[]>('/orders', { params: { as, ...(scope ? { scope } : {}) } })).data,

  getOrder: async (id: string) => (await apiClient.get<Order>(`/orders/${id}`)).data,

  /** cash_in: the customer paid. cash_out: the agent paid out, quoting a reference. */
  markFiatSent: async (id: string, reference?: string) =>
    (await apiClient.post<Order>(`/orders/${id}/fiat-sent`, reference ? { reference } : {})).data,

  /** cash_out: attach the hash of the USDC payment to escrow; verified on Stellar. */
  markUsdcSent: async (id: string, txHash: string) =>
    (await apiClient.post<Order>(`/orders/${id}/usdc-sent`, { txHash })).data,

  /** cash_in: the agent confirms the fiat arrived. cash_out: the customer does. */
  confirm: async (id: string) => (await apiClient.post<Order>(`/orders/${id}/confirm`)).data,

  refund: async (id: string) => (await apiClient.post<Order>(`/orders/${id}/refund`)).data,

  dispute: async (id: string, reason: string) =>
    (await apiClient.post<Order>(`/orders/${id}/dispute`, { reason })).data,

  getProof: async () => (await apiClient.get<Proof>('/proof')).data,
};
