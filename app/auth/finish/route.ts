import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { APP_SESSION_COOKIE_NAME, APP_SESSION_MAX_AGE, createAppSessionCookie, verifyAppSessionCookie } from "@/lib/auth-session";

const ALLOWED_EMAIL_DOMAIN = "herb-media.com";

function isAllowedEmail(email: string | undefined) {
  return Boolean(email?.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`));
}

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (value.startsWith("/auth") || value.startsWith("/login")) return "/dashboard";
  return value;
}

function getSupabasePublicKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
}

export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const cookiesToSet: { name: string; value: string; options: CookieOptions }[] = [];
  const appSession = await verifyAppSessionCookie(request.cookies.get(APP_SESSION_COOKIE_NAME)?.value);
  const url = request.nextUrl.clone();

  if (isAllowedEmail(appSession?.email)) {
    const targetUrl = new URL(next, request.nextUrl.origin);
    url.pathname = targetUrl.pathname;
    url.search = targetUrl.search;
    return NextResponse.redirect(url);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublicKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(newCookies) {
          newCookies.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.push(...newCookies);
        }
      }
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email;

  if (!isAllowedEmail(email)) {
    await supabase.auth.signOut();
    url.pathname = "/login";
    url.search = email ? "?error=domain" : "?error=oauth";
  } else {
    const targetUrl = new URL(next, request.nextUrl.origin);
    url.pathname = targetUrl.pathname;
    url.search = targetUrl.search;
    cookiesToSet.push({
      name: APP_SESSION_COOKIE_NAME,
      value: await createAppSessionCookie(email!),
      options: { path: "/", httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: APP_SESSION_MAX_AGE }
    });
  }

  const response = NextResponse.redirect(url);
  cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, path: "/" }));
  return response;
}
