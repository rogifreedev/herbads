"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, HelpCircle, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MetaCommentListItem } from "@/lib/meta-comments";

export function MetaCommentsTable({ clientId, comments }: { clientId: string; comments: MetaCommentListItem[] }) {
  const t = useTranslations("comments");
  const [mode, setMode] = useState<"candidates" | "all">("candidates");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return comments.filter((comment) => (mode === "all" || comment.isWordingCandidate) && (!normalized || [comment.message, comment.suggestedWording, comment.adName, comment.creativeName, ...comment.themes].some((value) => value?.toLowerCase().includes(normalized))));
  }, [comments, mode, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={mode === "candidates" ? "default" : "outline"} onClick={() => setMode("candidates")}>{t("candidates")}</Button>
          <Button type="button" size="sm" variant={mode === "all" ? "default" : "outline"} onClick={() => setMode("all")}>{t("allComments")}</Button>
        </div>
        <label className="relative w-full md:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} className="pl-9" />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-herb-border">
        <Table className="min-w-[1480px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">{t("score")}</TableHead>
              <TableHead className="w-[90px] text-center">{t("comment")}</TableHead>
              <TableHead className="w-[310px]">{t("creativeWording")}</TableHead>
              <TableHead className="w-[270px]">{t("reason")}</TableHead>
              <TableHead className="w-[220px]">{t("themes")}</TableHead>
              <TableHead className="w-[230px]">{t("source")}</TableHead>
              <TableHead className="w-[150px]">{t("engagement")}</TableHead>
              <TableHead className="w-[130px]">{t("date")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? rows.map((comment) => (
              <TableRow key={comment.id} className="align-top">
                <TableCell>
                  {comment.wordingScore === null ? <Badge variant="secondary">{t("pending")}</Badge> : <Badge variant={comment.isWordingCandidate ? "success" : "secondary"}>{comment.wordingScore}</Badge>}
                </TableCell>
                <TableCell className="text-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/45 transition hover:border-primary/50 hover:text-primary"
                        aria-label={t("showComment")}
                      >
                        <HelpCircle className="h-4 w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)]">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-white">{comment.message}</p>
                      {comment.commenterName ? <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/45">{comment.commenterName}</p> : null}
                    </PopoverContent>
                  </Popover>
                </TableCell>
                <TableCell>
                  {comment.suggestedWording ? <p className="font-medium leading-6 text-white">{comment.suggestedWording}</p> : <span className="text-white/35">-</span>}
                </TableCell>
                <TableCell className="text-sm leading-6 text-white/60">{comment.wordingReason ?? <span className="text-white/35">-</span>}</TableCell>
                <TableCell>
                  {comment.themes.length ? <div className="flex flex-wrap gap-1">{comment.themes.map((theme) => <Badge key={theme} variant="outline">{theme}</Badge>)}</div> : <span className="text-white/35">-</span>}
                </TableCell>
                <TableCell>
                  {comment.creativeId ? <Link href={`/clients/${clientId}/creatives/${comment.creativeId}`} className="group inline-flex max-w-[240px] items-center gap-2 text-primary hover:text-white"><span className="truncate">{comment.adName ?? comment.creativeName ?? t("openCreative")}</span><ExternalLink className="h-3.5 w-3.5 shrink-0" /></Link> : <span className="text-white/35">-</span>}
                </TableCell>
                <TableCell className="text-white/60">{t("engagementValue", { likes: comment.likeCount, replies: comment.replyCount })}</TableCell>
                <TableCell className="text-white/60">{comment.commentCreatedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(comment.commentCreatedAt)) : "-"}</TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={8} className="py-12 text-center text-white/50">{mode === "candidates" ? t("noCandidates") : t("noComments")}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
