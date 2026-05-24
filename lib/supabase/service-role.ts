import { createClient } from "@supabase/supabase-js";
import { getRequiredEnv } from "@/lib/env";

export function createSupabaseServiceRoleClient() {
  if (typeof window !== "undefined") {
    throw new Error("Service-role Supabase client must never run in the browser.");
  }

  return createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}
