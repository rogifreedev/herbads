import "server-only";

import { getOptionalEnv } from "@/lib/env";

export type MetaAdAccountOption = {
  id: string;
  accountId: string;
  name: string;
  currency: string | null;
  timezoneName: string | null;
};

type MetaAdAccountResponse = {
  data?: Array<{
    id: string;
    account_id?: string;
    name?: string;
    currency?: string;
    timezone_name?: string;
  }>;
  paging?: {
    next?: string;
  };
  error?: {
    message?: string;
  };
};

const META_FIELDS = "id,account_id,name,currency,timezone_name";

export async function listMetaAdAccounts() {
  const accessToken = getOptionalEnv("META_SYSTEM_USER_ACCESS_TOKEN");
  const apiVersion = getOptionalEnv("META_API_VERSION", "v20.0");

  if (!accessToken) {
    return {
      accounts: [] as MetaAdAccountOption[],
      error: "META_SYSTEM_USER_ACCESS_TOKEN fehlt. Werbekonten koennen noch nicht geladen werden."
    };
  }

  const accounts: MetaAdAccountOption[] = [];
  let nextUrl: string | null = `https://graph.facebook.com/${apiVersion}/me/adaccounts?fields=${META_FIELDS}&limit=100&access_token=${accessToken}`;

  while (nextUrl) {
    const response = await fetch(nextUrl, { cache: "no-store" });
    const payload = (await response.json()) as MetaAdAccountResponse;

    if (!response.ok || payload.error) {
      return {
        accounts,
        error: payload.error?.message ?? "Meta Werbekonten konnten nicht geladen werden."
      };
    }

    for (const account of payload.data ?? []) {
      accounts.push({
        id: account.id,
        accountId: account.id.startsWith("act_") ? account.id : `act_${account.account_id ?? account.id}`,
        name: account.name ?? account.id,
        currency: account.currency ?? null,
        timezoneName: account.timezone_name ?? null
      });
    }

    nextUrl = payload.paging?.next ?? null;
  }

  return { accounts, error: null };
}
