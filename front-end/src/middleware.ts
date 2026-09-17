import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Protected routes require authentication
const PROTECTED_PATHS = ["/dashboard", "/orders", "/agent", "/send", "/proof"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  
  if (isProtected) {
    // Check for session cookie (set on login)
    const session = request.cookies.get("puente_session");
    if (!session) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Redirect logged-in users away from login page
  if (pathname === "/login") {
    const session = request.cookies.get("puente_session");
    if (session) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
