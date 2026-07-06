import { describe, expect, it } from "vitest";
import deMessages from "@/messages/de.json";
import itMessages from "@/messages/it.json";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale } from "@/lib/i18n-locales";

function collectKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    collectKeys(child, prefix ? `${prefix}.${key}` : key)
  );
}

describe("i18n locales", () => {
  it("defines de as default and de/it as supported", () => {
    expect(DEFAULT_LOCALE).toBe("de");
    expect(SUPPORTED_LOCALES).toEqual(["de", "it"]);
    expect(isSupportedLocale("de")).toBe(true);
    expect(isSupportedLocale("it")).toBe(true);
    expect(isSupportedLocale("en")).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });
});

describe("message catalogs", () => {
  it("de.json and it.json have identical key sets", () => {
    const deKeys = collectKeys(deMessages).sort();
    const itKeys = collectKeys(itMessages).sort();
    expect(itKeys).toEqual(deKeys);
  });

  it("no empty translations in either catalog", () => {
    function emptyKeys(catalog: Record<string, unknown>) {
      return collectKeys(catalog).filter((key) => key.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], catalog) === "");
    }
    expect(emptyKeys(deMessages)).toEqual([]);
    expect(emptyKeys(itMessages)).toEqual([]);
  });
});
