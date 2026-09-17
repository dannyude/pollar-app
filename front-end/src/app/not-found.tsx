import Link from "next/link";
import { FiAlertCircle, FiArrowLeft } from "react-icons/fi";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 animate-fade-slide-up">
      <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-8">
        <FiAlertCircle size={48} className="text-slate-300" />
      </div>
      <h1 className="text-7xl font-extrabold text-pollar-blue mb-4">404</h1>
      <h2 className="text-2xl font-bold text-foreground mb-3">Page Not Found</h2>
      <p className="text-muted max-w-sm mx-auto mb-10">
        This page doesn't exist or has been moved. Let's get you back.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Link href="/" className="flex items-center gap-2 px-6 py-3 bg-pollar-blue hover:bg-pollar-blue-hover active:scale-95 text-white font-semibold rounded-xl shadow-blue transition-all cursor-pointer">
          <FiArrowLeft /> Back to Home
        </Link>
        <Link href="/dashboard" className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-surface-hover text-foreground font-semibold rounded-xl border border-surface-border shadow-sm transition-all cursor-pointer">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
