"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FiLogIn } from "react-icons/fi";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      setIsScrolled(y > 20);
      setIsHidden(y > lastScrollY && y > 80);
      setLastScrollY(y);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out
        ${isHidden ? "-translate-y-full" : "translate-y-0"}
        ${isScrolled
          ? "py-3 bg-white/80 backdrop-blur-md border-b border-slate-200/70 shadow-sm"
          : "py-6 bg-transparent border-transparent"
        }`}
    >
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 cursor-pointer">
          <span className="text-xl font-bold tracking-tight text-foreground">Puente</span>
        </Link>

        {/* Nav Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted">
          <Link href="/#how-it-works" className="hover:text-pollar-blue transition-colors duration-150 cursor-pointer">
            How it Works
          </Link>
          <Link href="/proof" className="hover:text-pollar-blue transition-colors duration-150 cursor-pointer">
            Proof of Reserves
          </Link>
          <Link href="/dashboard" className="hover:text-pollar-blue transition-colors duration-150 cursor-pointer">
            Dashboard
          </Link>
        </nav>

        {/* CTA */}
        <button className="flex items-center gap-2 px-5 py-2.5 bg-pollar-blue hover:bg-pollar-blue-hover active:scale-95 text-white text-sm font-semibold rounded-xl shadow-blue hover:shadow-blue-lg transition-all duration-200 cursor-pointer">
          <FiLogIn size={16} />
          Sign In
        </button>
      </div>
    </header>
  );
}
