"use client";

import { useEffect } from "react";
import { FiRefreshCw, FiArrowLeft, FiAlertTriangle } from "react-icons/fi";
import Link from "next/link";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("App Error:", error); }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 animate-fade-slide-up">
      <div className="w-24 h-24 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-8">
        <FiAlertTriangle size={40} className="text-danger" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">Something went wrong</h1>
      <p className="text-muted max-w-sm mx-auto mb-2">
        {error.message || "An unexpected error occurred. Our team has been notified."}
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-slate-400 mb-8">Error ID: {error.digest}</p>
      )}
      <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
        <button
          onClick={reset}
          className="flex items-center gap-2 px-6 py-3 bg-pollar-blue hover:bg-pollar-blue-hover active:scale-95 text-white font-semibold rounded-xl shadow-blue transition-all cursor-pointer"
        >
          <FiRefreshCw size={16} /> Try Again
        </button>
        <Link href="/" className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-surface-hover text-foreground font-semibold rounded-xl border border-surface-border transition-all cursor-pointer">
          <FiArrowLeft size={16} /> Go Home
        </Link>
      </div>
    </div>
  );
}
