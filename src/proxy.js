import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { ROLE_ROUTES } from "@/lib/roleRoutes";

// Post-bounce home per role — shared with the login redirect (src/lib/roleRoutes.js).
const ROLE_HOME = ROLE_ROUTES;

const ROLE_ALLOWED_PREFIXES = {
  "super-admin": ["/super-admin", "/admin", "/sales", "/reception", "/collab", "/surgery", "/counsellor", "/stocks", "/hr", "/owner"],
  // The old standalone /saniya assistant now redirects to /owner/ai/sanya
  // (next.config.mjs), which sits under the /owner guard like everything else.
  owner:         ["/owner"],
  admin:         ["/admin", "/stocks"],
  sales:         ["/sales"],
  reception:     ["/reception"],
  collab:        ["/collab"],
  surgery:       ["/surgery"],
  counsellor:    ["/counsellor"],
  stock:         ["/stocks"],
  hr:            ["/hr"],
};

export default withAuth(
  function middleware(req) {
    const token    = req.nextauth.token;
    const pathname = req.nextUrl.pathname;
    const role     = token?.role;

    if (role === "super-admin") return NextResponse.next();

    const allowed = ROLE_ALLOWED_PREFIXES[role] || [];
    const canAccess = allowed.some((prefix) => pathname.startsWith(prefix));

    if (!canAccess) {
      const home = ROLE_HOME[role] || "/login";
      return NextResponse.redirect(new URL(home, req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/admin/:path*",
    "/super-admin/:path*",
    "/owner/:path*",
    "/sales/:path*",
    "/reception/:path*",
    "/collab/:path*",
    "/surgery/:path*",
    "/counsellor/:path*",
    "/stocks/:path*",
    "/hr/:path*",
  ],
};
