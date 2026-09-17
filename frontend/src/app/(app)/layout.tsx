"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { FiLogOut } from "react-icons/fi";
import { Sidebar, NAV } from "@/components/layout/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-pollar-blue/20 border-t-pollar-blue rounded-full animate-spin" />
          <p className="text-sm text-muted font-medium">Loading your wallet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden relative">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-20 pt-16 md:pb-0 md:pt-0">
        {/* Mobile Header */}
        <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white/90 backdrop-blur-md border-b border-surface-border px-5 flex items-center justify-between z-40">
          <Link href="/" className="font-extrabold text-lg tracking-tight text-foreground">
            Puente
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-pollar-blue font-bold text-sm">
              {user.name.charAt(0)}
            </div>
            <button onClick={logout} className="text-danger p-2 rounded-xl hover:bg-red-50 cursor-pointer">
              <FiLogOut size={18} />
            </button>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 md:py-10">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-surface-border flex items-center justify-around px-2 z-40 pb-safe">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href.split("/").slice(0, 2).join("/")));
          return (
            <Link key={href} href={href} className={`flex flex-col items-center justify-center w-full h-full gap-1 text-[10px] font-medium transition-colors cursor-pointer ${active ? "text-pollar-blue" : "text-muted hover:text-foreground"}`}>
              <Icon size={20} className={active ? "text-pollar-blue" : "text-muted"} />
              <span className="truncate w-full text-center px-1">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
