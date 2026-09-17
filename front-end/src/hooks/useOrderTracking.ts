"use client";

import { useState, useEffect } from "react";
import { api, Order } from "@/api/client";

const TERMINAL = new Set(["completed", "disputed", "expired", "refunded"]);

export function useOrderTracking(orderId: string | null) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    // Use let so we can assign after declaration
    const pollInterval = setInterval(fetchOrder, 4000);

    async function fetchOrder() {
      try {
        const data = await api.getOrder(orderId!);
        if (!isMounted) return;
        setOrder(data);
        setError(null);
        setLoading(false);
        // Stop polling once we hit a terminal state
        if (TERMINAL.has(data.status)) {
          clearInterval(pollInterval);
        }
      } catch (err) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Failed to load order";
        setError(msg);
        setLoading(false);
      }
    }

    // Initial fetch immediately
    fetchOrder();

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [orderId]);

  return { order, loading, error };
}
