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
    (result) => {
      // A partial response must be retried instead of becoming a cached empty picker.
      if (result.warnings?.length && cache.get(key) === entry) cache.delete(key);
      entry.expires = Date.now() + 60_000;
    },
    () => {
      if (cache.get(key) === entry) cache.delete(key);
    }
  );
  return entry.promise;
}

type InstagramAccount = { id: string; username?: string; legacy_instagram_user_id?: string };
type PromotablePage = {
  id: string;
  name?: string;
  instagram_business_account?: InstagramAccount;
  connected_instagram_account?: InstagramAccount;
};
const instagramFields = "id,username,legacy_instagram_user_id";

async function loadPages(metaAccountId: string) {
  try {
    const pages = await metaLaunchList<PromotablePage>(
      `${metaAccountId}/promote_pages?fields=id,name,instagram_business_account{${instagramFields}},connected_instagram_account{${instagramFields}}&limit=100`
    );
    return { pages, instagramAvailable: true };
  } catch {
    // Page linkage may require extra permissions. Keep the base page picker usable.
    const pages = await metaLaunchList<PromotablePage>(`${metaAccountId}/promote_pages?fields=id,name&limit=100`);
    return { pages, instagramAvailable: false };
  }
}

function mergeInstagramAccounts(accounts: InstagramAccount[]) {
  const merged = new Map<string, BatchIdentity>();
  for (const account of accounts) {
    const id = String(account.id ?? "");
    if (!/^\d+$/.test(id)) continue;
    const previous = merged.get(id);
    const username = account.username?.trim().replace(/^@/, "");
    const legacyId = /^\d+$/.test(account.legacy_instagram_user_id ?? "")
      ? account.legacy_instagram_user_id
      : previous?.legacyId;
    merged.set(id, {
      id,
      name: username ? `@${username}` : (previous?.name ?? id),
      ...(legacyId ? { legacyId } : {})
    });
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

async function loadIdentities(metaAccountId: string): Promise<BatchLaunchIdentities> {
  // Account edges, never business-wide or /me lists, keep the identity picker account-scoped.
  const [{ pages, instagramAvailable }, [direct, connected]] = await Promise.all([
    loadPages(metaAccountId),
    Promise.allSettled([
      metaLaunchList<InstagramAccount>(`${metaAccountId}/instagram_accounts?fields=${instagramFields}&limit=100`),
      metaLaunchList<InstagramAccount>(
        `${metaAccountId}/connected_instagram_accounts?fields=${instagramFields}&limit=100`
      )
    ])
  ]);
  const warnings: NonNullable<BatchLaunchIdentities["warnings"]> = [];
  if (!instagramAvailable) warnings.push("pageInstagramUnavailable");
  if (direct.status === "rejected") warnings.push("directInstagramUnavailable");
  if (connected.status === "rejected") warnings.push("connectedInstagramUnavailable");
  const instagramAccounts = mergeInstagramAccounts([
    ...(direct.status === "fulfilled" ? direct.value : []),
    ...(connected.status === "fulfilled" ? connected.value : []),
    ...pages.flatMap((page) =>
      [page.instagram_business_account, page.connected_instagram_account].filter(
        (account): account is InstagramAccount => Boolean(account)
      )
    )
  ]);
  if (!instagramAccounts.length && direct.status === "rejected" && connected.status === "rejected") throw direct.reason;
  return {
    pages: [
      ...new Map(
        pages
          .filter((page) => /^\d+$/.test(String(page.id)))
          .map((page) => [String(page.id), { id: String(page.id), name: page.name || String(page.id) }])
      ).values()
    ].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    instagramAccounts,
    ...(warnings.length ? { warnings } : {})
  };
}
