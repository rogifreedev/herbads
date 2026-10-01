import type { BatchOverviewItem } from "@/lib/batches";

export type BatchCheckEntry = { row: BatchOverviewItem; number: number; searchText: string };

function normalizeSearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\u00df/g, "ss")
    .trim();
}

export function indexBatchCheckRows(rows: BatchOverviewItem[]): BatchCheckEntry[] {
  const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" });
  return [...rows]
    .sort(
      (a, b) =>
        collator.compare(a.sourceFolderLabel ?? "", b.sourceFolderLabel ?? "") ||
        collator.compare(a.path, b.path) ||
        collator.compare(a.name, b.name) ||
        collator.compare(a.sourceFolderId ?? "", b.sourceFolderId ?? "") ||
        a.id.localeCompare(b.id)
    )
    .map((row, index) => ({
      row,
      number: index + 1,
      searchText: normalizeSearch(
        [row.name, row.path, row.sourceFolderLabel, row.id, row.match?.name].filter(Boolean).join(" ")
      )
    }));
}

export function filterBatchCheckRows(entries: BatchCheckEntry[], query: string) {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return entries;
  // Keep snapshot numbers stable when filtering; search never renames a Drive folder or Meta adset.
  return entries.filter((entry) => terms.every((term) => entry.searchText.includes(term)));
}
