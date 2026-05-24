import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { mockClients } from "@/lib/mock-data";

export type ClientSummary = {
  id: string;
  name: string;
  status: string;
  adAccountId: string | null;
  source: "supabase" | "mock";
};

export type CreateClientInput = {
  name: string;
  metaAccountId: string;
  brandName?: string;
  targetAudience?: string;
};

export type ClientProfile = {
  clientId: string;
  brandName: string;
  positioning: string;
  toneOfVoice: string;
  targetAudience: string;
  painPoints: string;
  buyingTriggers: string;
  usps: string;
  offers: string;
  forbiddenClaims: string;
  brandNoGos: string;
  competitors: string;
  ctaPreferences: string;
};

export type ClientProfileInput = Omit<ClientProfile, "clientId">;

const emptyProfile: ClientProfileInput = {
  brandName: "",
  positioning: "",
  toneOfVoice: "",
  targetAudience: "",
  painPoints: "",
  buyingTriggers: "",
  usps: "",
  offers: "",
  forbiddenClaims: "",
  brandNoGos: "",
  competitors: "",
  ctaPreferences: ""
};

function mapProfileRow(row: Record<string, string | null | undefined>, clientId: string): ClientProfile {
  return {
    clientId,
    brandName: row.brand_name ?? "",
    positioning: row.positioning ?? "",
    toneOfVoice: row.tone_of_voice ?? "",
    targetAudience: row.target_audience ?? "",
    painPoints: row.pain_points ?? "",
    buyingTriggers: row.buying_triggers ?? "",
    usps: row.usps ?? "",
    offers: row.offers ?? "",
    forbiddenClaims: row.forbidden_claims ?? "",
    brandNoGos: row.brand_no_gos ?? "",
    competitors: row.competitors ?? "",
    ctaPreferences: row.cta_preferences ?? ""
  };
}

function profileInputToRow(clientId: string, input: ClientProfileInput) {
  return {
    client_id: clientId,
    brand_name: input.brandName.trim() || null,
    positioning: input.positioning.trim() || null,
    tone_of_voice: input.toneOfVoice.trim() || null,
    target_audience: input.targetAudience.trim() || null,
    pain_points: input.painPoints.trim() || null,
    buying_triggers: input.buyingTriggers.trim() || null,
    usps: input.usps.trim() || null,
    offers: input.offers.trim() || null,
    forbidden_claims: input.forbiddenClaims.trim() || null,
    brand_no_gos: input.brandNoGos.trim() || null,
    competitors: input.competitors.trim() || null,
    cta_preferences: input.ctaPreferences.trim() || null
  };
}

function normalizeMetaAccountId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

async function getSupabaseForServerData() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createSupabaseServiceRoleClient();
  }

  return createSupabaseServerClient();
}

function getMockClients(): ClientSummary[] {
  return mockClients.map((client) => ({
    id: client.id,
    name: client.name,
    status: client.status,
    adAccountId: client.adAccountId,
    source: "mock" as const
  }));
}

export async function listClients(): Promise<{ clients: ClientSummary[]; error: string | null }> {
  try {
    const supabase = await getSupabaseForServerData();

    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("id,name,status")
      .order("created_at", { ascending: false });

    if (clientsError) {
      return { clients: getMockClients(), error: clientsError.message };
    }

    const clientIds = clients.map((client) => client.id);
    const { data: accounts, error: accountsError } = await supabase
      .from("meta_ad_accounts")
      .select("client_id,meta_account_id")
      .in("client_id", clientIds.length ? clientIds : ["00000000-0000-0000-0000-000000000000"]);

    if (accountsError) {
      return { clients: getMockClients(), error: accountsError.message };
    }

    const accountByClientId = new Map(accounts.map((account) => [account.client_id, account.meta_account_id]));

    return {
      clients: clients.map((client) => ({
        id: client.id,
        name: client.name,
        status: client.status,
        adAccountId: accountByClientId.get(client.id) ?? null,
        source: "supabase" as const
      })),
      error: null
    };
  } catch (error) {
    return {
      clients: getMockClients(),
      error: error instanceof Error ? error.message : "Supabase konnte nicht geladen werden."
    };
  }
}

export async function getClientById(clientId: string): Promise<{ client: ClientSummary; error: string | null }> {
  const { clients, error } = await listClients();
  return {
    client: clients.find((client) => client.id === clientId) ?? clients[0],
    error
  };
}

export async function getClientProfile(clientId: string): Promise<{ profile: ClientProfile; error: string | null }> {
  try {
    const supabase = await getSupabaseForServerData();
    const { data, error } = await supabase.from("client_profiles").select("*").eq("client_id", clientId).maybeSingle();

    if (error) {
      return { profile: { clientId, ...emptyProfile }, error: error.message };
    }

    return {
      profile: data ? mapProfileRow(data, clientId) : { clientId, ...emptyProfile },
      error: null
    };
  } catch (error) {
    return {
      profile: { clientId, ...emptyProfile },
      error: error instanceof Error ? error.message : "Kundenprofil konnte nicht geladen werden."
    };
  }
}

export async function upsertClientProfile(clientId: string, input: ClientProfileInput) {
  const supabase = await getSupabaseForServerData();
  const { data, error } = await supabase
    .from("client_profiles")
    .upsert(profileInputToRow(clientId, input), { onConflict: "client_id" })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapProfileRow(data, clientId);
}

export async function createClient(input: CreateClientInput) {
  const name = input.name.trim();
  const metaAccountId = normalizeMetaAccountId(input.metaAccountId);

  if (!name) {
    throw new Error("Kundenname ist erforderlich.");
  }

  if (!metaAccountId) {
    throw new Error("Meta Ad Account ID ist erforderlich.");
  }

  const supabase = await getSupabaseForServerData();
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .insert({ name })
    .select("id,name,status")
    .single();

  if (clientError) {
    throw new Error(clientError.message);
  }

  const { error: accountError } = await supabase.from("meta_ad_accounts").insert({
    client_id: client.id,
    meta_account_id: metaAccountId
  });

  if (accountError) {
    throw new Error(accountError.message);
  }

  if (input.brandName?.trim() || input.targetAudience?.trim()) {
    const { error: profileError } = await supabase.from("client_profiles").insert({
      client_id: client.id,
      brand_name: input.brandName?.trim() || null,
      target_audience: input.targetAudience?.trim() || null
    });

    if (profileError) {
      throw new Error(profileError.message);
    }
  }

  return {
    id: client.id,
    name: client.name,
    status: client.status,
    adAccountId: metaAccountId,
    source: "supabase" as const
  };
}
