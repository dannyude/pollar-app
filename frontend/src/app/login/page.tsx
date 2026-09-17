"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { FiShield, FiZap, FiArrowRight } from "react-icons/fi";

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [signing, setSigning] = useState(false);

  const handleLogin = async () => {
    setSigning(true);
    await login(); // sets cookie + localStorage inside AuthContext
    const redirect = searchParams.get("redirect") || "/dashboard";
    router.push(redirect);
  };

  return (
    <div className="bg-white rounded-3xl shadow-modal p-10">
      <Link href="/" className="flex items-center gap-3 mb-8 hover:opacity-80 transition-opacity w-fit cursor-pointer">
        <div>
          <p className="text-lg font-extrabold text-foreground leading-none">Puente</p>
          <p className="text-xs text-muted">Africa ↔ Latin America</p>
        </div>
      </Link>

      <h1 className="text-2xl font-extrabold text-foreground tracking-tight mb-2">
        Sign in to your wallet
      </h1>
      <p className="text-sm text-muted mb-8 leading-relaxed">
        Your Stellar wallet is created automatically — no seed phrase, no setup.
      </p>

      {/* Google Sign In */}
      <button
        onClick={handleLogin}
        disabled={signing}
        className="w-full flex items-center justify-center gap-3 py-4 bg-pollar-blue hover:bg-pollar-blue-hover disabled:opacity-70 active:scale-[0.98] text-white text-sm font-bold rounded-2xl shadow-blue hover:shadow-blue-lg transition-all duration-200 cursor-pointer mb-6"
      >
        {signing ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Connecting with Pollar...
          </span>
        ) : (
          <>
            {/* Google G */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google <FiArrowRight size={15} />
          </>
        )}
      </button>

      {/* Trust signals */}
      <div className="border-t border-surface-border pt-5 flex items-center justify-between text-xs text-muted">
        <span className="flex items-center gap-1.5"><FiShield size={12} className="text-success" /> Stellar Escrow</span>
        <span className="flex items-center gap-1.5"><FiZap size={12} className="text-pollar-blue" /> Instant Settlement</span>
        <span className="text-muted">Powered by Pollar</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 px-6 relative overflow-hidden">
      {/* Background glow blobs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-pollar-blue/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* useSearchParams() is inside Suspense — required by Next.js for static pages */}
        <Suspense fallback={
          <div className="bg-white rounded-3xl p-10 flex items-center justify-center min-h-64">
            <span className="w-6 h-6 border-2 border-pollar-blue/20 border-t-pollar-blue rounded-full animate-spin" />
          </div>
        }>
          <LoginForm />
        </Suspense>

        <p className="text-center text-xs text-white/40 mt-6">
          By signing in you agree to Puente's terms of service.
        </p>
      </div>
    </div>
  );
}
