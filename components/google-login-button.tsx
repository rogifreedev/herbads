"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (value.startsWith("/auth") || value.startsWith("/login")) return "/dashboard";
  return value;
}

export function GoogleLoginButton() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const next = safeNext(searchParams.get("next"));

  async function login() {
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: {
          hd: "herb-media.com",
          prompt: "select_account"
        }
      }
    });

    if (error) {
      setLoading(false);
      toast.error(error.message);
    }
  }

  return (
    <Button type="button" variant="gradient" className="w-full" disabled={loading} onClick={login}>
      {loading ? "Weiterleitung..." : "Mit Google Workspace einloggen"}
    </Button>
  );
}
