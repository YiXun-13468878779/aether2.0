import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";

const isModelRoute = createRouteMatcher(["/api/aether(.*)"]);
const handleClerk = clerkMiddleware(async (auth, request) => {
  if (process.env.AETHER_REQUIRE_LOGIN === "true" && isModelRoute(request)) await auth.protect();
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
  if (configured) return handleClerk(request, event);
  if (process.env.AETHER_REQUIRE_LOGIN === "true" && isModelRoute(request)) {
    return NextResponse.json({ message: "登录服务暂时不可用。" }, { status: 503 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
