import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Set Bearer token from Pollar SDK session
export const setAuthHeader = (token: string) => {
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

// Dev-only auth (requires DEV_AUTH=1 on backend)
export const setDevAuthHeader = (userId: string, stellarAddress: string) => {
  apiClient.defaults.headers.common['Authorization'] = `Dev ${userId} ${stellarAddress}`;
};

// ─── Types ───────────────────────────────────────────────────────────────────

export type OrderType = 'cash_in' | 'cash_out';
export type OrderStatus =
  | 'awaiting_fiat'
  | 'fiat_sent'
  | 'releasing'
  | 'completed'
  | 'awaiting_usdc'
  | 'usdc_locked'
  | 'expired'
  | 'refunding'
  | 'refunded'
  | 'disputed';

export interface Agent {
  id: string;
  name: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  rate_ngn_usd: number;
  available_usdc: number;
}

export interface OrderTimeline {
  status: OrderStatus;
  at: string;
  actor?: string;
  note?: string;
}

export interface Escrow {
  address: string;
  memo: string;
  asset: { type: string; code: string; issuer: string };
}

export interface Order {
  id: string;
  type: OrderType;
  status: OrderStatus;
  customer_id: string;
  agent_id: string;
  fiat_amount: number;
  fiat_currency: string;
  usdc_amount: number;
  payment_reference?: string;
  stellar_hash?: string;
  escrow?: Escrow;
  timeline?: OrderTimeline[];
  actions: string[]; // dynamic list of allowed actions for current user
}

export interface User {
  id: string;
  email: string;
  stellar_address: string;
  usdc_balance?: number;
}

export interface ProofData {
  total_users: number;
  total_orders: number;
  total_volume_usdc: number;
  escrow_balance: number;
  is_solvent: boolean;
  recent_settled: Array<{ id: string; amount: number; hash: string; settled_at: string }>;
}

// ─── API Error shape ─────────────────────────────────────────────────────────
export class ApiError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// Intercept and normalise API errors
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const data = err.response?.data;
    if (data?.error) {
      return Promise.reject(
        new ApiError(data.error.code, data.error.message, data.error.details)
      );
    }
    return Promise.reject(err);
  }
);

// ─── API Methods ─────────────────────────────────────────────────────────────
export const api = {
  // Auth
  getMe: async () => {
    const res = await apiClient.get<User>('/me');
    return res.data;
  },

  // Agents
  getAgents: async (country = 'NG') => {
    const res = await apiClient.get<Agent[]>(`/agents?country=${country}`);
    return res.data;
  },

  // Orders
  createOrder: async (payload: {
    type: OrderType;
    agentId: string;
    fiatAmount?: number;
    usdcAmount?: number;
    payout?: string;
  }) => {
    const res = await apiClient.post<Order>('/orders', payload);
    return res.data;
  },

  getOrders: async (as: 'user' | 'agent', scope?: 'open') => {
    const params = new URLSearchParams({ as });
    if (scope) params.append('scope', scope);
    const res = await apiClient.get<Order[]>(`/orders?${params}`);
    return res.data;
  },

  getOrder: async (id: string) => {
    const res = await apiClient.get<Order>(`/orders/${id}`);
    return res.data;
  },

  // Cash-In: customer marks fiat sent
  markFiatSent: async (id: string, reference: string) => {
    const res = await apiClient.post<Order>(`/orders/${id}/fiat-sent`, { reference });
    return res.data;
  },

  // Cash-Out: customer attaches runTx hash
  markUsdcSent: async (id: string, txHash: string) => {
    const res = await apiClient.post<Order>(`/orders/${id}/usdc-sent`, { txHash });
    return res.data;
  },

  // Cash-In: agent confirms fiat arrived → releases escrow
  // Cash-Out: customer confirms fiat arrived
  confirm: async (id: string) => {
    const res = await apiClient.post<Order>(`/orders/${id}/confirm`);
    return res.data;
  },

  // Cash-Out: customer refunds USDC after payout window
  refund: async (id: string) => {
    const res = await apiClient.post<Order>(`/orders/${id}/refund`);
    return res.data;
  },

  // Either side can dispute
  dispute: async (id: string, reason: string) => {
    const res = await apiClient.post<Order>(`/orders/${id}/dispute`, { reason });
    return res.data;
  },

  // Proof of Reserves
  getProof: async () => {
    const res = await apiClient.get<ProofData>('/proof');
    return res.data;
  },
};
