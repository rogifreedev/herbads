import { describe, expect, it } from "vitest";
import deMessages from "@/messages/de.json";
import itMessages from "@/messages/it.json";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale } from "@/lib/i18n-locales";
import { kpiTooltipKeys } from "@/lib/kpi-tooltips";
import { navItems } from "@/lib/navigation";
import { getPageTitle } from "@/lib/routes";

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

function resolveKey(catalog: Record<string, unknown>, keyPath: string) {
  return keyPath.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], catalog);
}

describe("message key existence", () => {
  it("every nav item title (including children) resolves in the de catalog", () => {
    const titles = navItems.flatMap((item) => [item.title, ...(item.children?.map((child) => child.title) ?? [])]);
    const missing = titles.filter((title) => typeof resolveKey(deMessages, `nav.${title}`) !== "string");
    expect(missing).toEqual([]);
  });

  it("every kpi tooltip key resolves in the de catalog", () => {
    const missing = Object.values(kpiTooltipKeys).filter((key) => typeof resolveKey(deMessages, `kpi.${key}`) !== "string");
    expect(missing).toEqual([]);
  });

  it("getPageTitle returns a resolvable message key for representative pathnames", () => {
    const pathnames = [
      "/dashboard",
      "/clients",
      "/clients/x",
      "/clients/x/creatives",
      "/clients/x/creatives/landingpages",
      "/clients/x/creatives/batches",
      "/clients/x/learning",
      "/clients/x/competitors/iterations",
      "/clients/x/iterations",
      "/clients/x/prediction-tool/history",
      "/clients/x/prediction-tool",
      "/clients/x/batches/settings",
      "/clients/x/batches",
      "/clients/x/adsets/y",
      "/clients/x/angles",
      "/clients/x/ideas",
      "/clients/x/competitors",
      "/clients/x/meta/settings",
      "/clients/x/knowledge",
      "/clients/x/settings",
      "/analysis",
      "/reports",
      "/settings",
      "/unknown"
    ];
    const missing = pathnames.filter((pathname) => typeof resolveKey(deMessages, getPageTitle(pathname)) !== "string");
    expect(missing).toEqual([]);
  });
});
