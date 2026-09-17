"use client";

import { useEffect, useState } from "react";
import { useToasts, Toast } from "@/hooks/useToast";
import { FiCheckCircle, FiXCircle, FiAlertTriangle, FiInfo, FiX } from "react-icons/fi";

const ICONS: Record<Toast["type"], React.ReactNode> = {
  success: <FiCheckCircle size={18} />,
  error: <FiXCircle size={18} />,
  warning: <FiAlertTriangle size={18} />,
  info: <FiInfo size={18} />,
};

const COLORS: Record<Toast["type"], string> = {
  success: "#10b981",
  error: "#ef4444",
  warning: "#f59e0b",
  info: "hsl(216, 98%, 52%)",
};

function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  return (
    <div
      className="flex items-start gap-3 bg-white rounded-2xl p-4 shadow-toast border border-surface-border transition-all duration-300"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(100%)",
        borderLeft: `4px solid ${COLORS[t.type]}`,
      }}
    >
      <span style={{ color: COLORS[t.type] }}>{ICONS[t.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{t.title}</p>
        {t.message && <p className="text-xs text-muted mt-0.5">{t.message}</p>}
      </div>
      <button
        onClick={() => onDismiss(t.id)}
        className="text-muted hover:text-foreground hover:bg-surface-hover rounded-lg p-1 transition cursor-pointer flex-shrink-0"
      >
        <FiX size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}
