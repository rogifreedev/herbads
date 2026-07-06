"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (value.startsWith("/auth") || value.startsWith("/login")) return "/dashboard";
  return value;
}

function clearSupabaseAuthCookies() {
  const names = document.cookie
    .split(";")
    .map((cookie) => cookie.split("=")[0]?.trim())
    .filter((name): name is string => Boolean(name?.startsWith("sb-")));

  for (const name of names) {
    for (const path of ["/", "/auth", "/auth/callback", "/login"]) {
      document.cookie = `${name}=; Max-Age=0; path=${path}; SameSite=Lax`;
    }
  }
}

export function GoogleLoginButton() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const next = safeNext(searchParams.get("next"));

  async function login() {
    setLoading(true);
    clearSupabaseAuthCookies();
    window.location.assign(`/auth/google?next=${encodeURIComponent(next)}`);
  }

  return (
    <Button type="button" variant="gradient" className="w-full" disabled={loading} onClick={login}>
      {loading ? t("redirecting") : t("loginButton")}
    </Button>
  );
}
