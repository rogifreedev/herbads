import type { BatchLaunchCopy, BatchLaunchIdentities } from "@/lib/batch-launch-types";

export function resolveBatchIdentity(
  copy: BatchLaunchCopy,
  identities: BatchLaunchIdentities | undefined,
  selected?: Partial<Pick<BatchLaunchCopy, "pageId" | "instagramId">>
): BatchLaunchCopy {
  const pageId = selected?.pageId ?? (copy.pageId || (identities?.pages.length === 1 ? identities.pages[0].id : ""));
  const instagramId =
    selected?.instagramId ??
    (copy.instagramId || (identities?.instagramAccounts.length === 1 ? identities.instagramAccounts[0].id : ""));
  const instagram = identities?.instagramAccounts.find(
    (item) => item.id === instagramId || item.legacyId === instagramId
  );
  return { ...copy, pageId, instagramId: instagram?.id ?? instagramId };
}

export function validateBatchIdentity(copy: BatchLaunchCopy, identities: BatchLaunchIdentities) {
  if (!identities.pages.some((item) => item.id === copy.pageId))
    throw new Error("Die Facebook-Seite ist fuer dieses Werbekonto nicht verfuegbar. Bitte die Auswahl aktualisieren.");
  if (copy.instagramId && !identities.instagramAccounts.some((item) => item.id === copy.instagramId))
    throw new Error(
      "Das Instagram-Konto ist fuer dieses Werbekonto nicht verfuegbar. Bitte die Auswahl aktualisieren."
    );
}
