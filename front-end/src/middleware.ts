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

  // Deliberately no redirect away from /login when the cookie is present. The
  // cookie is only a hint — the real session lives in Pollar, in the browser —
  // and bouncing /login back into the app traps anyone whose session has gone
  // on a loading screen they can't leave. The login page itself redirects once
  // it actually has a user.

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
