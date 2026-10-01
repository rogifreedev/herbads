import { describe, expect, it } from "vitest";
import { filterBatchCheckRows, indexBatchCheckRows } from "@/lib/batch-check-list";
import type { BatchOverviewItem } from "@/lib/batches";

function batch(name: string, values: Partial<BatchOverviewItem> = {}): BatchOverviewItem {
  return {
    id: name,
    name,
    path: name,
    sourceFolderId: "root-a",
    sourceFolderLabel: "Root 1",
    depth: 1,
    webViewLink: null,
    modifiedTime: null,
    checkedAt: null,
    status: "missing",
    match: null,
    ...values
  };
}

describe("Batch Check numbering and live search", () => {
  it("sorts numerically within root/path groups and numbers all rows without mutating the snapshot", () => {
    const rows = [batch("100 Batch"), batch("10 Batch"), batch("9 Batch"), batch("02 Batch")];
    const before = structuredClone(rows);
    const entries = indexBatchCheckRows(rows);
    expect(entries.map(({ row }) => row.name)).toEqual(["02 Batch", "9 Batch", "10 Batch", "100 Batch"]);
    expect(entries.map(({ number }) => number)).toEqual([1, 2, 3, 4]);
    expect(rows).toEqual(before);
  });
  it("preserves root grouping, handles nested paths and resolves equal names deterministically", () => {
    const rows = [
      batch("1 Batch", { sourceFolderLabel: "Root 10" }),
      batch("10 Batch", { path: "2026/10 Batch" }),
      batch("2 Batch", { path: "2026/2 Batch", id: "b" }),
      batch("2 Batch", { path: "2026/2 Batch", id: "a" })
    ];
    expect(indexBatchCheckRows(rows).map(({ row }) => row.id)).toEqual(["a", "b", "10 Batch", "1 Batch"]);
    expect(indexBatchCheckRows([...rows].reverse()).map(({ row }) => row.id)).toEqual([
      "a",
      "b",
      "10 Batch",
      "1 Batch"
    ]);
  });
  it("keeps original numbers and objects when filtering", () => {
    const entries = indexBatchCheckRows([batch("1 Video"), batch("2 Static"), batch("3 Video")]);
    const filtered = filterBatchCheckRows(entries, "video");
    expect(filtered.map(({ number }) => number)).toEqual([1, 3]);
    expect(filtered[1]).toBe(entries[2]);
  });
  it("matches case-insensitive words across batch names, paths, roots, IDs and Meta matches", () => {
    const entries = indexBatchCheckRows([
      batch("09 Gr\u00fcnde f\u00fcr Stra\u00dfe", {
        id: "drive-abc",
        path: "Herbst/09 Gr\u00fcnde",
        sourceFolderLabel: "Blytz Always On",
        match: {
          id: "meta",
          type: "adset",
          name: "Winner Ads",
          status: "PAUSED",
          effectiveStatus: null,
          href: "/adsets/meta"
        }
      }),
      batch("10 Andere")
    ]);
    for (const query of ["GRUNDE", "  grunde   blytz  ", "herbst winner", "DRIVE-ABC", "strasse"])
      expect(filterBatchCheckRows(entries, query).map(({ row }) => row.id)).toEqual(["drive-abc"]);
  });
  it("treats punctuation as literal input and returns no unrelated batches", () => {
    const entries = indexBatchCheckRows([batch("01 [A+B]"), batch("02 Andere")]);
    expect(filterBatchCheckRows(entries, "[a+b]")).toHaveLength(1);
    expect(filterBatchCheckRows(entries, ".*")).toHaveLength(0);
    expect(filterBatchCheckRows(entries, "01 absent")).toHaveLength(0);
  });
  it("restores all rows for an empty query and handles an empty snapshot or absent optional fields", () => {
    const entries = indexBatchCheckRows([batch("1", { sourceFolderId: null, sourceFolderLabel: null })]);
    expect(filterBatchCheckRows(entries, "")).toBe(entries);
    expect(filterBatchCheckRows(entries, "  \t\n ")).toBe(entries);
    expect(filterBatchCheckRows(indexBatchCheckRows([]), "anything")).toEqual([]);
  });
});
