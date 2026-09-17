"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, Order } from "@/api/client";

const TERMINAL = new Set(["completed", "expired", "refunded", "disputed"]);

/** Loads one order and keeps polling while it's still moving. */
export function useOrderTracking(orderId: string | null, intervalMs = 4000) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);

  const refresh = useCallback(async () => {
    if (!orderId) return null;
    try {
      const data = await api.getOrder(orderId);
      if (!live.current) return data;
      setOrder(data);
      setError(null);
      return data;
    } catch (err) {
      if (live.current) setError(err instanceof ApiError ? err.message : "Couldn't load this order.");
      return null;
    } finally {
      if (live.current) setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    live.current = true;
    if (!orderId) {
      setLoading(false);
      return;
    }
    void refresh();
    const timer = setInterval(async () => {
      const data = await refresh();
      // Stop once nothing more can happen on its own.
      if (data && TERMINAL.has(data.status) && !data.pending) clearInterval(timer);
    }, intervalMs);
    return () => {
      live.current = false;
      clearInterval(timer);
    };
  }, [orderId, refresh, intervalMs]);

  return { order, loading, error, refresh, setOrder };
}
