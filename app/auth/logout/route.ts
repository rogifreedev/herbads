import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { APP_SESSION_COOKIE_NAME } from "@/lib/auth-session";

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/dashboard", request.url));
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set(APP_SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return response;
}
