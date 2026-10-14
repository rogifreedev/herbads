export type OutputMediaType = "video" | "static" | "mixed" | "unknown";
export type AdsetOutputBatch = {
  job_id: string;
  client_id: string;
  client_name: string;
  account_id: string;
  account_name: string;
  meta_account_id: string;
  meta_adset_id: string;
  batch_name: string;
  folder_id: string;
  first_delivery_date: string;
  media_type: OutputMediaType;
};
export type OutputCounts = Record<OutputMediaType | "total", number>;
export type AdsetOutputAccount = {
  accountId: string;
  accountName: string;
  clientName: string;
  counts: OutputCounts;
  batches: AdsetOutputBatch[];
};
export type AdsetOutputReport = {
  totals: OutputCounts;
  accounts: AdsetOutputAccount[];
};

const emptyCounts = (): OutputCounts => ({ total: 0, video: 0, static: 0, mixed: 0, unknown: 0 });

export function summarizeAdsetOutput(batches: AdsetOutputBatch[]): AdsetOutputReport {
  const totals = emptyCounts();
  const accounts = new Map<string, AdsetOutputAccount>();
  const seen = new Set<string>();
  for (const batch of batches) {
    const key = `${batch.account_id}:${batch.meta_adset_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let account = accounts.get(batch.account_id);
    if (!account) {
      account = {
        accountId: batch.account_id, accountName: batch.account_name, clientName: batch.client_name,
        counts: emptyCounts(), batches: []
      };
      accounts.set(batch.account_id, account);
    }
    account.batches.push(batch);
    account.counts[batch.media_type]++;
    account.counts.total++;
    totals[batch.media_type]++;
    totals.total++;
  }
  return {
    totals,
    accounts: [...accounts.values()].sort((a, b) =>
      b.counts.total - a.counts.total || a.clientName.localeCompare(b.clientName) || a.accountName.localeCompare(b.accountName)
    )
  };
}
