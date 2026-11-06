import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed the `middleware` file convention to `proxy`; behaviour is identical.
// Signed-out visitors are sent to /login. This only checks that the session cookie exists:
// the API is the real authority, and a stale cookie is handled by the client's 401 handler.
export function proxy(request: NextRequest) {
  if (request.cookies.has("careerlab_session")) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except auth pages, the API rewrite, and Next.js internals/static files.
  matcher: ["/((?!login(?:/|$)|register(?:/|$)|api/|_next/|favicon.ico|.*\\..*).*)"],
};
