import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // Admin only routes
    if (pathname.startsWith("/admin") && token?.role !== "admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
  },
  {
    pages: {
      signIn: "/login",
    },
    callbacks: {
      authorized: async ({ token, req }) => {
        // Allow if token exists
        if (token) return true;
        
        // Redirect to login if no token
        return false;
      },
    },
  }
);

export const config = {
  matcher: ["/((?!login|api|_next|favicon.ico|public|icon.svg|favicon.ico).*)"],
};