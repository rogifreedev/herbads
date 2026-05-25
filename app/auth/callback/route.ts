import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

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
    cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    return response;
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const url = requestUrl.origin + "/login?error=oauth";
      return redirect(url);
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!isAllowedEmail(user?.email)) {
    await supabase.auth.signOut();
    const url = requestUrl.origin + "/login?error=domain";
    return redirect(url);
  }

  return redirect(requestUrl.origin + next);
}
