"use server";

import { cookies } from "next/headers";
import { isSupportedLocale } from "@/lib/i18n-locales";

const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function setLocale(locale: string) {
  if (!isSupportedLocale(locale)) return;

  const cookieStore = await cookies();
  cookieStore.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax"
  });
}
