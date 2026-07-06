export const SUPPORTED_LOCALES = ["de", "it"] as const;
export const DEFAULT_LOCALE = "de";
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
