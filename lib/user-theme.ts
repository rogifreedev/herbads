import "server-only";
import { cookies } from "next/headers";
import { APP_SESSION_COOKIE_NAME, verifyAppSessionCookie } from "@/lib/auth-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { isTheme, type Theme } from "@/lib/theme";

export async function getThemeUserEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const session = await verifyAppSessionCookie(cookieStore.get(APP_SESSION_COOKIE_NAME)?.value);
  let email = session?.email?.toLowerCase();
  // The first request after OAuth may not yet carry the app's signed cookie.
  if (!email && cookieStore.getAll().some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"))) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser().catch(() => ({ data: { user: null }, error: true }));
    if (!error) email = data.user?.email?.toLowerCase();
  }
  return email?.endsWith("@herb-media.com") ? email : null;
}

export async function getInitialUserTheme(): Promise<{ theme: Theme; userKey: string }> {
  // Read request cookies outside the fallback so Next.js can opt out of prerendering.
  const email = await getThemeUserEmail();
  if (!email) return { theme: "light", userKey: "guest" };
  try {
    const { data, error } = await createSupabaseServiceRoleClient()
      .from("user_preferences").select("theme").eq("user_email", email)
      .abortSignal(AbortSignal.timeout(3000)).maybeSingle();
    if (error) throw new Error("Theme lookup failed");
    return { theme: isTheme(data?.theme) ? data.theme : "light", userKey: email };
  } catch {
    // A preference lookup must not prevent the rest of the app from loading.
    console.warn("User theme could not be loaded.");
    return { theme: "light", userKey: email };
  }
}

export async function saveUserTheme(email: string, theme: Theme) {
  const { error } = await createSupabaseServiceRoleClient().from("user_preferences")
    .upsert({ user_email: email, theme, updated_at: new Date().toISOString() }, { onConflict: "user_email" })
    .abortSignal(AbortSignal.timeout(8000));
  if (error) throw new Error("Theme update failed");
}
