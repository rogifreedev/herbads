import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n-locales";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const candidate = cookieStore.get("NEXT_LOCALE")?.value;
  const locale = isSupportedLocale(candidate) ? candidate : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
