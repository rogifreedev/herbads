import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { APP_SESSION_COOKIE_NAME, APP_SESSION_MAX_AGE, createAppSessionCookie, verifyAppSessionCookie } from "@/lib/auth-session";

const ALLOWED_EMAIL_DOMAIN = "herb-media.com";

function isPublicPath(pathname: string) {
  return pathname.startsWith("/auth/");
}

function isCronPath(pathname: string) {
  return pathname.startsWith("/api/cron/");
}

function isAllowedEmail(email: string | undefined) {
  return Boolean(email?.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`));
}

function unauthorizedResponse(request: NextRequest, status = 401) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

function getSupabasePublicKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
}

function authorizedResponse(request: NextRequest) {
  if (request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next({ request: { headers: request.headers } });
}

export async function updateSession(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname) || isCronPath(request.nextUrl.pathname)) {
    return NextResponse.next({
      request: {
        headers: request.headers
      }
    });
  }

  const cookiesToSet: { name: string; value: string; options: CookieOptions }[] = [];

  function finalizeResponse(response: NextResponse) {
    // Redirects must carry refreshes and deletions too, or the browser keeps the stale session.
    cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, path: "/" }));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  const appSession = await verifyAppSessionCookie(request.cookies.get(APP_SESSION_COOKIE_NAME)?.value);
  if (isAllowedEmail(appSession?.email)) {
    return finalizeResponse(authorizedResponse(request));
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublicKey(),
    {
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(newCookies) {
          // Server Components must see the same refreshed session as the browser.
          newCookies.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.push(...newCookies);
        }
      }
    }
  );
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  if (!user || !isAllowedEmail(user.email)) {
    const response = request.nextUrl.pathname === "/login"
      ? NextResponse.next({ request: { headers: request.headers } })
      : unauthorizedResponse(request, user ? 403 : 401);
    return finalizeResponse(response);
  }

  const supabaseResponse = authorizedResponse(request);
  supabaseResponse.cookies.set(APP_SESSION_COOKIE_NAME, await createAppSessionCookie(user.email!), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: APP_SESSION_MAX_AGE
  });

  return finalizeResponse(supabaseResponse);
}
