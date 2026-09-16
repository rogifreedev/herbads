import "server-only";
import { createHash } from "node:crypto";
import { getRequiredEnv } from "@/lib/env";
import { metaLaunchList } from "@/lib/meta/batch-launch";

type Locale = { id: number; name: string };
const catalogs = new Map<string, { expires: number; promise: Promise<Locale[]> }>();

function mapLocales(rows: { key: number | string; name: string }[]): Locale[] {
  return rows
    .map((row) => ({ id: Number(row.key), name: row.name }))
    .filter((row) => Number.isSafeInteger(row.id) && row.id > 0 && typeof row.name === "string" && row.name.length > 0);
}

export async function getBatchLocales(query: string, language: string, ids?: number[]) {
  const locale = language === "it" ? "it_IT" : "de_DE";
  if (!ids) {
    return mapLocales(
      await metaLaunchList<{ key: number | string; name: string }>(
        `search?type=adlocale&q=${encodeURIComponent(query)}&locale=${locale}&limit=100`
      )
    );
  }
  if (!ids.length) return [];
  const tokenHash = createHash("sha256").update(getRequiredEnv("META_SYSTEM_USER_ACCESS_TOKEN")).digest("hex");
  const key = `${process.env.META_API_VERSION || "v25.0"}:${locale}:${tokenHash}`;
  let entry = catalogs.get(key);
  if (!entry || entry.expires <= Date.now()) {
    // Resolve IDs from Meta's catalog instead of guessing a language from the target country.
    entry = {
      expires: Date.now() + 60 * 60_000,
      promise: metaLaunchList<{ key: number | string; name: string }>(
        `search?type=adlocale&locale=${locale}&limit=1000`
      ).then(mapLocales)
    };
    if (catalogs.size >= 8) catalogs.delete(catalogs.keys().next().value!);
    catalogs.set(key, entry);
    const current = entry;
    void current.promise.catch(() => {
      if (catalogs.get(key) === current) catalogs.delete(key);
    });
  }
  const catalog = await entry.promise;
  return catalog.filter((item) => ids.includes(item.id));
}
