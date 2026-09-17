// Marketing layout — public pages (no sidebar, no auth required)
// The landing page now has its own inline navbar, so no shared Navbar needed here
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
