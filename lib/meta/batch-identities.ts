import "server-only";
import { createHash } from "node:crypto";
import { getRequiredEnv } from "@/lib/env";
import { metaLaunchList } from "@/lib/meta/batch-launch";
import type { BatchIdentity, BatchLaunchIdentities } from "@/lib/batch-launch-types";

const cache = new Map<string, { expires: number; promise: Promise<BatchLaunchIdentities> }>();

export function getLiveBatchIdentities(metaAccountId: string, fresh = false): Promise<BatchLaunchIdentities> {
  if (!/^act_\d+$/.test(metaAccountId)) throw new Error("Ungueltiges Meta-Werbekonto.");
  const tokenHash = createHash("sha256").update(getRequiredEnv("META_SYSTEM_USER_ACCESS_TOKEN")).digest("hex");
  const key = `${process.env.META_API_VERSION || "v25.0"}:${metaAccountId}:${tokenHash}`;
  const cached = cache.get(key);
  if (!fresh && cached && cached.expires > Date.now()) return cached.promise;
  const entry = { expires: Date.now() + 60_000, promise: loadIdentities(metaAccountId) };
  if (cache.size >= 20) cache.delete(cache.keys().next().value!);
  cache.set(key, entry);
  void entry.promise.then(
    () => {
      entry.expires = Date.now() + 60_000;
    },
    () => {
      if (cache.get(key) === entry) cache.delete(key);
    }
  );
  return entry.promise;
}

async function loadIdentities(metaAccountId: string): Promise<BatchLaunchIdentities> {
  // Account edges, never business-wide or /me lists, keep the identity picker account-scoped.
  const [pages, instagramAccounts] = await Promise.all([
    metaLaunchList<{ id: string; name?: string }>(`${metaAccountId}/promote_pages?fields=id,name&limit=100`),
    metaLaunchList<{ id: string; username?: string; legacy_instagram_user_id?: string }>(
      `${metaAccountId}/instagram_accounts?fields=id,username,legacy_instagram_user_id&limit=100`
    )
  ]);
  const unique = (items: BatchIdentity[]) =>
    [...new Map(items.filter((item) => /^\d+$/.test(item.id)).map((item) => [item.id, item])).values()].sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
    );
  return {
    pages: unique(pages.map((page) => ({ id: String(page.id), name: page.name || String(page.id) }))),
    instagramAccounts: unique(
      instagramAccounts.map((account) => ({
        id: String(account.id),
        name: account.username ? `@${account.username}` : String(account.id),
        ...(account.legacy_instagram_user_id ? { legacyId: String(account.legacy_instagram_user_id) } : {})
      }))
    )
  };
}
