import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_EMAIL_DOMAIN = "herb-media.com";

function isAllowedEmail(email: string | undefined) {
  return Boolean(email?.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`));
}

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (value.startsWith("/auth") || value.startsWith("/login")) return "/dashboard";
  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNext(requestUrl.searchParams.get("next"));
  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const url = requestUrl.origin + "/login?error=oauth";
      return NextResponse.redirect(url);
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!isAllowedEmail(user?.email)) {
    await supabase.auth.signOut();
    const url = requestUrl.origin + "/login?error=domain";
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(requestUrl.origin + next);
}
