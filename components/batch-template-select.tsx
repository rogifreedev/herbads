"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { BatchCampaign, BatchTemplate } from "@/lib/batch-launch-types";

export function BatchTemplateSelect({
  id,
  templates,
  campaigns,
  favoriteIds,
  value,
  disabled,
  onChange
}: {
  id: string;
  templates: BatchTemplate[];
  campaigns: BatchCampaign[];
  favoriteIds: string[];
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const t = useTranslations("batchLaunch");
  const common = useTranslations("common");
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const activeOption = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState("");
  const campaignNames = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
  const favorites = new Set(favoriteIds);
  const selected = templates.find((template) => template.id === value);
  const campaignName = (template: BatchTemplate) => campaignNames.get(template.campaignId) ?? template.campaignId;
  const matching = templates.filter((template) =>
    `${template.name} ${template.id} ${campaignName(template)}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  const groups = [true, false].map((favorite) => ({
    label: t(favorite ? "favoriteAdsets" : "otherAdsets"),
    items: matching.filter((template) => favorites.has(template.id) === favorite)
  }));
  const options = groups.flatMap((group) => group.items);
  const active = options.find((template) => template.id === activeId) ?? options[0];

  useEffect(() => {
    if (open) activeOption.current?.scrollIntoView({ block: "nearest" });
  }, [open, active?.id]);

  function choose(templateId: string) {
    if (disabled) return;
    onChange(templateId);
    setOpen(false);
  }

  return (
    <Popover
      open={open && !disabled}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setSearch("");
          setActiveId(value);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-10 min-w-0 flex-1 justify-between font-normal"
        >
          <span className="truncate text-left">
            {selected ? `${selected.name} · ${campaignName(selected)}` : t("choose")}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0"
        aria-label={t("templateAdset")}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
        }}
      >
        <div className="relative shrink-0 border-b border-border p-2">
          <Search
            className="pointer-events-none absolute left-5 top-5 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={input}
            role="combobox"
            aria-label={t("searchTemplate")}
            aria-autocomplete="list"
            aria-expanded={open && !disabled}
            aria-controls={listId}
            aria-activedescendant={active ? `${listId}-${active.id}` : undefined}
            placeholder={t("searchTemplate")}
            className="pl-9"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setActiveId("");
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (!options.length) return;
                const index = options.findIndex((template) => template.id === active?.id);
                const offset = event.key === "ArrowDown" ? 1 : -1;
                setActiveId(options[(index + offset + options.length) % options.length].id);
              } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (active) choose(active.id);
              }
            }}
          />
        </div>
        <div
          id={listId}
          role="listbox"
          aria-label={t("templateAdset")}
          className="max-h-72 min-h-0 overflow-y-auto overscroll-contain p-1"
        >
          {groups.map((group, index) =>
            group.items.length ? (
              <div key={group.label} role="group" aria-labelledby={`${listId}-group-${index}`}>
                <div id={`${listId}-group-${index}`} className="px-2 py-2 text-xs font-medium text-muted-foreground">
                  {group.label}
                </div>
                {group.items.map((template) => (
                  <button
                    key={template.id}
                    id={`${listId}-${template.id}`}
                    ref={active?.id === template.id ? activeOption : undefined}
                    type="button"
                    role="option"
                    aria-selected={template.id === value}
                    tabIndex={-1}
                    className={`flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm ${active?.id === template.id ? "bg-accent text-accent-foreground" : ""}`}
                    onPointerMove={() => setActiveId(template.id)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(template.id)}
                  >
                    <Check
                      className={`h-4 w-4 shrink-0 ${template.id === value ? "" : "invisible"}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                      <span className="block">{template.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {campaignName(template)} · {template.id}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null
          )}
        </div>
        {!options.length ? (
          <p role="status" className="p-4 text-sm text-muted-foreground">
            {common("noResults")}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
