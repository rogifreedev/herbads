import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (value.startsWith("/auth") || value.startsWith("/login")) return "/dashboard";
  return value;
}

function getSupabasePublicKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
}

function appOrigin(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const cookiesToSet: { name: string; value: string; options: CookieOptions }[] = [];
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const origin = appOrigin(request);

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

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: {
        hd: "herb-media.com",
        prompt: "select_account"
      }
    }
  });

  const response = NextResponse.redirect(data.url ?? `${origin}/login?error=oauth`);
  cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, path: "/" }));

  if (error || !data.url) {
    response.cookies.set("herbads-auth-error", error?.message ?? "oauth", { path: "/", maxAge: 60, sameSite: "lax" });
  }

  return response;
}
