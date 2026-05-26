import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (value.startsWith("/auth") || value.startsWith("/login")) return "/dashboard";
  return value;
}

function getSupabasePublicKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNext(requestUrl.searchParams.get("next"));
  const cookiesToSet: { name: string; value: string; options: CookieOptions }[] = [];

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

  function redirect(url: string) {
    const response = NextResponse.redirect(url);
    cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, path: "/" }));
    return response;
  }

  function finishRedirect() {
    const url = new URL(requestUrl.toString());
    url.pathname = "/auth/finish";
    url.search = `?next=${encodeURIComponent(next)}`;
    return redirect(url.toString());
  }

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const url = requestUrl.origin + "/login?error=oauth";
      return redirect(url);
    }

    if (data.session) {
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token
      });
    }
  }

  return finishRedirect();
}
