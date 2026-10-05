import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-vercel-skip-toolbar", "1");

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("x-vercel-skip-toolbar", "1");
  return response;
}

export const config = {
  matcher: "/:path*",
};
