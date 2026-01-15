import { withAuth } from "next-auth/middleware";
import type { NextRequest } from "next/server";

export default withAuth(
  function proxy(req: NextRequest) {
    // yahan kuch return karne ki zarurat nahi
  },
  {
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: ["/((?!login|api|_next|favicon.ico|icon.svg).*)"],
};
