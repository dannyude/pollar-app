"use client";

import { useEffect, useRef, useState } from "react";

export interface Toast {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
}

// Global event emitter — no external lib needed
type ToastListener = (toasts: Toast[]) => void;
const listeners: Set<ToastListener> = new Set();
let toasts: Toast[] = [];

function notify() {
  listeners.forEach((l) => l([...toasts]));
}

export const toast = {
  show(type: Toast["type"], title: string, message?: string) {
    const id = Math.random().toString(36).slice(2);
    toasts = [...toasts, { id, type, title, message }];
    notify();
    setTimeout(() => toast.dismiss(id), 4500);
  },
  success: (title: string, message?: string) => toast.show("success", title, message),
  error:   (title: string, message?: string) => toast.show("error",   title, message),
  warning: (title: string, message?: string) => toast.show("warning", title, message),
  info:    (title: string, message?: string) => toast.show("info",    title, message),
  dismiss(id: string) {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  },
};

export function useToasts() {
  const [current, setCurrent] = useState<Toast[]>([]);
  // Stable ref so the effect cleanup can remove the same function reference
  const listenerRef = useRef<ToastListener>(null);

  useEffect(() => {
    // Create and register the listener inside the effect — never during render
    const listener: ToastListener = (t) => setCurrent(t);
    listenerRef.current = listener;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []); // empty deps — register once on mount, clean up on unmount

  return { toasts: current, dismiss: toast.dismiss };
}
