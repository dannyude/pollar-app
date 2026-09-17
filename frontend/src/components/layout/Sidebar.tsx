"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  FiHome, FiSend, FiList, FiShield, FiBriefcase, FiLogOut, FiCopy
} from "react-icons/fi";

const NAV = [
  { href: "/dashboard", icon: FiHome, label: "Dashboard" },
  { href: "/send", icon: FiSend, label: "Send Global" },
  { href: "/orders/mock-order-id", icon: FiList, label: "Orders" },
  { href: "/agent", icon: FiBriefcase, label: "Agent Desk" },
  { href: "/proof", icon: FiShield, label: "Proof" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col h-screen bg-white border-r border-surface-border sticky top-0">
      {/* Logo — clicking takes you home */}
      <Link href="/" className="flex items-center gap-3 px-6 py-6 border-b border-surface-border hover:bg-surface-hover transition-colors cursor-pointer">
        <div className="w-9 h-9 rounded-xl bg-pollar-blue flex items-center justify-center text-white font-extrabold text-lg shadow-blue">
          P
        </div>
        <span className="text-lg font-extrabold text-foreground tracking-tight">Puente</span>
      </Link>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href.split("/").slice(0, 2).join("/")));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-150 cursor-pointer
                ${active
                  ? "bg-pollar-blue text-white shadow-blue"
                  : "text-muted hover:bg-surface-hover hover:text-foreground"
                }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      {user && (
        <div className="border-t border-surface-border p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-pollar-blue font-bold text-sm flex-shrink-0">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{user.name}</p>
              <p className="text-xs text-muted truncate">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 border border-surface-border rounded-xl px-3 py-2 mb-3 cursor-pointer hover:bg-surface-hover transition" title="Copy address">
            <span className="font-mono text-xs text-muted flex-1 truncate">{user.stellar_address}</span>
            <FiCopy size={12} className="text-muted flex-shrink-0" />
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-danger hover:bg-red-50 w-full px-3 py-2 rounded-xl transition cursor-pointer font-medium"
          >
            <FiLogOut size={15} /> Sign Out
          </button>
        </div>
      )}
    </aside>
  );
}
