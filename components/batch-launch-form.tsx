"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  ExternalLink,
  Film,
  ImageIcon,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Star,
  Trash2,
  Unlink,
  UploadCloud
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BatchTemplateSelect } from "@/components/batch-template-select";
import { MAX_COPY_VARIANTS, normalizeBatchCopy } from "@/lib/batch-launch-copy";
import { batchLaunchBlockerTargets, getBatchLaunchBlockers } from "@/lib/batch-launch-readiness";
import { resolveBatchIdentity } from "@/lib/batch-launch-identities";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  COUNTRY_CODES,
  adsetGeography,
  adsetLocales,
  batchAdsetName,
  groupBatchMedia,
  sameCountrySelection,
  settingsFromAdset
} from "@/lib/batch-launch-plan";
import type {
  BatchAdGroup,
  BatchLaunchAccountContext,
  BatchLaunchMedia,
  BatchLaunchOptions,
  BatchLaunchIdentities,
  BatchLaunchCopy,
  BatchLaunchJob,
  BatchLaunchPreset,
  BatchTemplateCopySource,
  BatchMediaFile
} from "@/lib/batch-launch-types";

const selectClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";
const emptyCopy: BatchLaunchCopy = {
  primaryText: "",
  headline: "",
  description: "",
  landingUrl: "",
  callToAction: "SHOP_NOW",
  pageId: "",
  instagramId: "",
  urlTags: ""
};

function copyFields(value: BatchLaunchCopy): BatchLaunchCopy {
  value = normalizeBatchCopy(value);
  return {
    primaryText: value.primaryText,
    headline: value.headline,
    description: value.description,
    primaryTexts: value.primaryTexts,
    headlines: value.headlines,
    descriptions: value.descriptions,
    landingUrl: value.landingUrl,
    callToAction: value.callToAction,
    pageId: value.pageId,
    instagramId: value.instagramId,
    urlTags: value.urlTags
  };
}

function separateFiles(files: BatchMediaFile[]): BatchAdGroup[] {
  return files.flatMap((file) => groupBatchMedia([file]).map((group) => ({ ...group, id: crypto.randomUUID() })));
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
  return result;
}

export function BatchLaunchForm({
  clientId,
  folderId,
  initialJob
}: {
  clientId: string;
  folderId: string;
  initialJob?: BatchLaunchJob;
}) {
  const t = useTranslations("batchLaunch");
  const locale = useLocale();
  const endpoint = `/api/clients/${clientId}/batches`;
  const [accountContext, setContext] = useState<BatchLaunchAccountContext | null>(null);
  const [mediaState, setMediaState] = useState<{ folderId: string; data?: BatchLaunchMedia; error?: string } | null>(
    null
  );
  const [mediaRevision, setMediaRevision] = useState(0);
  const [optionsState, setOptionsState] = useState<{ accountId: string; error?: string } | null>(null);
  const [optionsRevision, setOptionsRevision] = useState(0);
  const media = mediaState?.folderId === folderId ? mediaState.data : undefined;
  const mediaError = mediaState?.folderId === folderId ? mediaState.error : undefined;
  const context =
    accountContext?.folder.id === folderId
      ? {
          ...accountContext,
          ...(media ?? { files: [], groups: [], ignoredFiles: [] })
        }
      : null;
  const optionsAccountId = accountContext?.metaConfigured ? accountContext.accountId : "";
  const optionsLoading = Boolean(optionsAccountId && optionsState?.accountId !== optionsAccountId);
  const optionsError = optionsState?.accountId === optionsAccountId ? optionsState?.error : undefined;
  const [accountId, setAccountId] = useState(initialJob?.accountId ?? "");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [activate, setActivate] = useState(false);
  const [confirmActivation, setConfirmActivation] = useState(false);
  const [identityState, setIdentityState] = useState<{
    accountId: string;
    data?: BatchLaunchIdentities;
    error?: string;
  } | null>(null);
  const [identityRevision, setIdentityRevision] = useState(0);
  const [identitySelection, setIdentitySelection] = useState<{
    accountId: string;
    pageId?: string;
    instagramId?: string;
  } | null>(null);
  const identities = identityState?.accountId === optionsAccountId ? identityState?.data : undefined;
  const identitiesError = identityState?.accountId === optionsAccountId ? identityState?.error : undefined;
  const identitiesLoading = Boolean(optionsAccountId && !identities && !identitiesError);
  const [copyDraft, setCopy] = useState<BatchLaunchCopy>(emptyCopy);
  const copy = resolveBatchIdentity(
    copyDraft,
    identities,
    identitySelection?.accountId === optionsAccountId ? identitySelection : undefined
  );
  const copyEdits = useRef(0);
  const [copyRequest, setCopyRequest] = useState<{
    accountId: string;
    templateId: string;
    editVersion: number;
  } | null>(null);
  const [templateCopy, setTemplateCopy] = useState<{
    request: typeof copyRequest;
    sources: BatchTemplateCopySource[];
    error?: string;
  } | null>(null);
  const [copySourceId, setCopySourceId] = useState("");
  const copyLoading = Boolean(copyRequest && templateCopy?.request !== copyRequest);
  const copyError = templateCopy?.request === copyRequest ? templateCopy?.error : undefined;
  const copySources = templateCopy?.request === copyRequest ? (templateCopy?.sources ?? []) : [];
  const copySource = copySources.find((item) => item.id === copySourceId);
  const [suggestionId, setSuggestionId] = useState("");
  const [groups, setGroups] = useState<BatchAdGroup[]>([]);
  const [reviewedMatching, setReviewedMatching] = useState("");
  const [presetId, setPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [dailyBudget, setDailyBudget] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [countrySearch, setCountrySearch] = useState("");
  const [customLocales, setCustomLocales] = useState<{ id: number; name: string }[]>([]);
  const [localeTemplateId, setLocaleTemplateId] = useState("");
  const [localeNames, setLocaleNames] = useState<Record<string, Record<number, string>>>({});
  const [localeNameError, setLocaleNameError] = useState(false);
  const [localeNameRevision, setLocaleNameRevision] = useState(0);
  const template = context?.templates.find((item) => item.id === templateId);
  const locales =
    localeTemplateId && template?.id === localeTemplateId ? adsetLocales(template.raw.targeting) : customLocales;
  const localeIds = locales
    .map((item) => item.id)
    .sort((a, b) => a - b)
    .join(",");
  const namedLocales = locales.map((item) => ({
    ...item,
    name: localeNames[locale]?.[item.id] ?? (item.name === String(item.id) ? t("localeId", { id: item.id }) : item.name)
  }));
  const [languageSearch, setLanguageSearch] = useState("");
  const [languageOptions, setLanguageOptions] = useState<typeof locales>([]);
  const [languageError, setLanguageError] = useState("");
  const [job, setJob] = useState<BatchLaunchJob | null>(null);
  const [retrySource, setRetrySource] = useState<BatchLaunchJob | null>(null);
  const [jobPollError, setJobPollError] = useState(false);
  const jobId = job?.id;

  function setLocales(value: typeof customLocales) {
    setLocaleTemplateId("");
    setCustomLocales(value);
  }

  useEffect(() => {
    const controller = new AbortController();
    jsonRequest<BatchLaunchAccountContext>(
      `${endpoint}/launch?folderId=${encodeURIComponent(folderId)}${accountId ? `&accountId=${accountId}` : ""}`,
      { signal: controller.signal }
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        setContext(data);
        setRetrySource(null);
        setName(batchAdsetName(data.folder.name));
        setCampaignId("");
        setTemplateId("");
        setCopyRequest(null);
        setTemplateCopy(null);
        setCopySourceId("");
        setIdentitySelection(null);
        copyEdits.current = 0;
        setActivate(false);
        setConfirmActivation(false);
        setPresetId("");
        setPresetName("");
        setDailyBudget("");
        setCountries([]);
        setCustomLocales([]);
        setLocaleTemplateId("");
        setLocaleNameError(false);
        setLanguageSearch("");
        setLanguageOptions([]);
        setLanguageError("");
        setCopy(copyFields(data.suggestions[0] ?? emptyCopy));
        setSuggestionId(data.suggestions[0]?.id ?? "");
        setJob(
          initialJob?.accountId === data.accountId
            ? initialJob
            : (data.recentJobs.find((item) => !["completed", "cancelled"].includes(item.status)) ??
                data.recentJobs[0] ??
                null)
        );
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : t("loadError"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, folderId, accountId, revision, initialJob, t]);

  useEffect(() => {
    if (!copyRequest || copyRequest.accountId !== accountContext?.accountId) return;
    const controller = new AbortController();
    jsonRequest<{ sources: BatchTemplateCopySource[] }>(
      `${endpoint}/launch/copy?accountId=${encodeURIComponent(copyRequest.accountId)}&templateId=${encodeURIComponent(copyRequest.templateId)}`,
      { signal: controller.signal }
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        setTemplateCopy({ request: copyRequest, sources: data.sources });
        // A delayed template response must not replace edits made while it was loading.
        if (copyEdits.current === copyRequest.editVersion) {
          setCopy(copyFields(data.sources[0]?.copy ?? emptyCopy));
          setCopySourceId(data.sources[0]?.id ?? "");
          setSuggestionId("");
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setTemplateCopy({
            request: copyRequest,
            sources: [],
            error: failure instanceof Error ? failure.message : t("loadError")
          });
      });
    return () => controller.abort();
  }, [endpoint, copyRequest, accountContext?.accountId, t]);

  useEffect(() => {
    const controller = new AbortController();
    jsonRequest<BatchLaunchMedia>(`${endpoint}/launch/media?folderId=${encodeURIComponent(folderId)}`, {
      signal: controller.signal
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        setMediaState({ folderId, data });
        setGroups(data.groups);
        setReviewedMatching("");
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setMediaState({ folderId, error: failure instanceof Error ? failure.message : t("loadError") });
      });
    return () => controller.abort();
  }, [endpoint, folderId, mediaRevision, t]);

  useEffect(() => {
    if (!optionsAccountId) return;
    const controller = new AbortController();
    jsonRequest<BatchLaunchOptions>(`${endpoint}/launch/options?accountId=${encodeURIComponent(optionsAccountId)}`, {
      signal: controller.signal
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        // Refresh picker data only, never overwrite the user's copy, settings or media assignments.
        setContext((current) => (current?.accountId === optionsAccountId ? { ...current, ...data } : current));
        setOptionsState({ accountId: optionsAccountId });
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setOptionsState({
            accountId: optionsAccountId,
            error: failure instanceof Error ? failure.message : t("loadError")
          });
      });
    return () => controller.abort();
  }, [endpoint, optionsAccountId, optionsRevision, t]);

  useEffect(() => {
    if (!optionsAccountId) return;
    const controller = new AbortController();
    jsonRequest<BatchLaunchIdentities>(
      `${endpoint}/launch/identities?accountId=${encodeURIComponent(optionsAccountId)}${identityRevision ? "&refresh=1" : ""}`,
      {
        signal: controller.signal
      }
    )
      .then((data) => {
        if (!controller.signal.aborted) setIdentityState({ accountId: optionsAccountId, data });
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setIdentityState({
            accountId: optionsAccountId,
            error: failure instanceof Error ? failure.message : t("identitiesError")
          });
      });
    return () => controller.abort();
  }, [endpoint, optionsAccountId, identityRevision, t]);

  useEffect(() => {
    if (!context?.metaConfigured || !localeIds) return;
    const controller = new AbortController();
    jsonRequest<{ locales: typeof customLocales }>(
      `${endpoint}/locales?accountId=${context.accountId}&ids=${encodeURIComponent(localeIds)}&language=${locale}`,
      { signal: controller.signal }
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        setLocaleNames((current) => ({
          ...current,
          [locale]: { ...current[locale], ...Object.fromEntries(data.locales.map((item) => [item.id, item.name])) }
        }));
        setLocaleNameError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLocaleNameError(true);
      });
    return () => controller.abort();
  }, [endpoint, context?.accountId, context?.metaConfigured, localeIds, locale, localeNameRevision]);

  useEffect(() => {
    if (!context?.metaConfigured || languageSearch.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLanguageError("");
      jsonRequest<{ locales: typeof locales }>(
        `${endpoint}/locales?accountId=${context.accountId}&q=${encodeURIComponent(languageSearch)}&language=${locale}`,
        { signal: controller.signal }
      )
        .then((data) => {
          if (!controller.signal.aborted) setLanguageOptions(data.locales);
        })
        .catch((failure) => {
          if (!controller.signal.aborted) setLanguageError(failure.message);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [endpoint, context?.accountId, context?.metaConfigured, languageSearch, locale]);

  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    async function process() {
      while (!controller.signal.aborted) {
        try {
          const result = await jsonRequest<{ job: BatchLaunchJob }>(`${endpoint}/launch/${jobId}`, {
            signal: controller.signal
          });
          if (controller.signal.aborted) return;
          setJob(result.job);
          setJobPollError(false);
          if (["completed", "cancelled"].includes(result.job.status)) return;
        } catch {
          if (!controller.signal.aborted) setJobPollError(true);
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    void process();
    return () => controller.abort();
  }, [jobId, endpoint]);

  const account = context?.accounts.find((item) => item.id === context.accountId);
  const campaign = context?.campaigns.find((item) => item.id === campaignId && item.status === "ACTIVE");
  const templateGeo = adsetGeography(template?.raw.targeting);
  const inheritedLocations = sameCountrySelection(templateGeo.countries, countries) ? templateGeo.locations : [];
  const campaignBudget = Boolean(campaign?.dailyBudget || campaign?.lifetimeBudget);
  const currencyDigits =
    new Intl.NumberFormat(locale, { style: "currency", currency: account?.currency ?? "EUR" }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  const money = (value: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: account?.currency ?? "EUR" }).format(value);
  const suggestion = context?.suggestions.find((item) => item.id === suggestionId);
  const assigned = new Set(groups.flatMap((group) => [group.feedFileId, group.storyFileId]).filter(Boolean));
  const unused = context?.files.filter((file) => !assigned.has(file.id)) ?? [];
  const displayNames = new Intl.DisplayNames([locale], { type: "region" });
  const filteredCountries = COUNTRY_CODES.filter((code) =>
    `${code} ${displayNames.of(code)}`.toLowerCase().includes(countrySearch.toLowerCase())
  ).sort((a, b) => (displayNames.of(a) ?? a).localeCompare(displayNames.of(b) ?? b, locale));
  const locked = saving || Boolean(job);
  const jobRunning = Boolean(
    job?.queueEnabled && ["pending", "running"].includes(job.status) && job.controlStatus === "run"
  );

  async function controlUpload(action: "pause" | "resume") {
    if (!job) return;
    setSaving(true);
    setError(null);
    try {
      const result = await jsonRequest<{ job: BatchLaunchJob }>(`${endpoint}/launch/${job.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      setJob(result.job);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("createError"));
    } finally {
      setSaving(false);
    }
  }
  const favoriteIds = context?.favoriteTemplateIds ?? [];
  const visualMatches = groups.filter((group) => group.matchMethod === "visual");
  const matchingKey = JSON.stringify(visualMatches.map((group) => [group.feedFileId, group.storyFileId]));
  const unreviewedMatching = visualMatches.length > 0 && reviewedMatching !== matchingKey;
  const blockers = getBatchLaunchBlockers({
    metaConfigured: Boolean(context?.metaConfigured),
    mediaReady: Boolean(media),
    mediaError,
    optionsLoading,
    optionsError,
    copyLoading,
    copyError,
    hasActiveCampaign: Boolean(campaign),
    hasTemplate: Boolean(template),
    adCount: groups.length,
    unreviewedMatching,
    countries,
    copy,
    campaignBudget,
    dailyBudget,
    currency: account?.currency ?? "EUR",
    identities,
    identitiesLoading,
    identitiesError
  });

  function selectIdentity(key: "pageId" | "instagramId", value: string) {
    setIdentitySelection((current) => ({
      ...(current?.accountId === optionsAccountId ? current : {}),
      accountId: optionsAccountId,
      [key]: value
    }));
  }

  function loadTemplateCopy(id: string, replaceCopy = true) {
    setCopySourceId("");
    setCopyRequest(
      id && context
        ? {
            accountId: context.accountId,
            templateId: id,
            editVersion: replaceCopy ? copyEdits.current : -1
          }
        : null
    );
  }

  function chooseTemplate(id: string, replaceSettings = false) {
    setTemplateId(id);
    loadTemplateCopy(id, replaceSettings || !copyEdits.current);
    const selected = context?.templates.find((item) => item.id === id);
    if (!presetId || replaceSettings) {
      const defaults = settingsFromAdset(selected, account?.currency ?? "EUR");
      setDailyBudget(defaults.dailyBudget);
      setCountries(defaults.countries);
      setCustomLocales(defaults.locales);
      setLocaleTemplateId(selected?.id ?? "");
      if (replaceSettings) {
        setPresetId("");
        setPresetName("");
      }
    }
  }

  function editCopy(value: BatchLaunchCopy) {
    copyEdits.current++;
    setCopy(value);
    setSuggestionId("");
    setCopySourceId("");
  }

  function editVariant(key: "primaryTexts" | "headlines" | "descriptions", index: number, value: string) {
    const scalar = { primaryTexts: "primaryText", headlines: "headline", descriptions: "description" } as const;
    const values = Array.from(
      { length: MAX_COPY_VARIANTS },
      (_, i) => copy[key]?.[i] ?? (i === 0 ? copy[scalar[key]] : "")
    );
    values[index] = value;
    editCopy({ ...copy, [key]: values, [scalar[key]]: values.find((item) => item.trim()) ?? "" });
  }

  async function toggleFavorite() {
    if (!context || !templateId) return;
    setSaving(true);
    try {
      const result = await jsonRequest<{ favoriteTemplateIds: string[] }>(`${endpoint}/favorites`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: context.accountId, templateId, favorite: !favoriteIds.includes(templateId) })
      });
      setContext((current) =>
        current?.accountId === context.accountId
          ? { ...current, favoriteTemplateIds: result.favoriteTemplateIds }
          : current
      );
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : t("favoriteError"));
    } finally {
      setSaving(false);
    }
  }

  function applyPreset(id: string) {
    setPresetId(id);
    const preset = context?.presets.find((item) => item.id === id);
    setPresetName(preset?.name ?? "");
    if (preset) {
      setDailyBudget(preset.dailyBudget);
      setCountries(preset.countries);
      setLocales(preset.locales);
    }
  }

  async function savePreset(asNew = false) {
    if (!context) return;
    setSaving(true);
    try {
      const result = await jsonRequest<{ presets: BatchLaunchPreset[] }>(`${endpoint}/presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: context.accountId,
          preset: { id: asNew ? "" : presetId, name: presetName, dailyBudget, countries, locales: namedLocales }
        })
      });
      setContext((current) =>
        current?.accountId === context.accountId ? { ...current, presets: result.presets } : current
      );
      setPresetId(result.presets.find((item) => item.name === presetName.trim())?.id ?? "");
      toast.success(t("saved"));
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function deletePreset() {
    if (!context || !presetId) return;
    setSaving(true);
    try {
      const result = await jsonRequest<{ presets: BatchLaunchPreset[] }>(`${endpoint}/presets`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: context.accountId, id: presetId })
      });
      setContext((current) =>
        current?.accountId === context.accountId ? { ...current, presets: result.presets } : current
      );
      setPresetId("");
      setPresetName("");
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  function assignFile(groupId: string, slot: "feedFileId" | "storyFileId", fileId: string) {
    setGroups((current) =>
      current
        .map((group) => {
          if (group.id === groupId) return { ...group, [slot]: fileId || null, matchMethod: undefined };
          return {
            ...group,
            matchMethod: group.feedFileId === fileId || group.storyFileId === fileId ? undefined : group.matchMethod,
            feedFileId: group.feedFileId === fileId ? null : group.feedFileId,
            storyFileId: group.storyFileId === fileId ? null : group.storyFileId
          };
        })
        .filter((group) => group.feedFileId || group.storyFileId)
    );
  }

  async function create() {
    if (!context || saving || job || blockers.length || !campaign || !template) return;
    setSaving(true);
    setConfirmActivation(false);
    setError(null);
    try {
      const result = await jsonRequest<{ job: BatchLaunchJob }>(`${endpoint}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activate,
          activationBudget:
            activate && campaign
              ? { dailyBudget: campaign.dailyBudget, lifetimeBudget: campaign.lifetimeBudget }
              : undefined,
          accountId: context.accountId,
          folderId,
          campaignId,
          templateId,
          name,
          settings: { dailyBudget, countries, locales: namedLocales },
          copy,
          groups
        })
      });
      setJob(result.job);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("createError"));
    } finally {
      setSaving(false);
    }
  }

  function restartCancelledJob() {
    if (!job?.retryDraft || !context || saving) return;
    const draft = job.retryDraft;
    // A history deep link must not pin a later reload to the cancelled attempt.
    const url = new URL(window.location.href);
    url.searchParams.delete("jobId");
    window.history.replaceState(window.history.state, "", url);
    setRetrySource(job);
    setJob(null);
    setJobPollError(false);
    setError(null);
    setCampaignId(draft.campaignId);
    setTemplateId(draft.templateId);
    setDailyBudget(draft.settings.dailyBudget);
    setCountries(draft.settings.countries);
    setLocales(draft.settings.locales);
    setCopy(copyFields(draft.copy));
    copyEdits.current++;
    setCopyRequest(null);
    setTemplateCopy(null);
    setCopySourceId("");
    setSuggestionId("");
    setIdentitySelection(null);
    setActivate(false);
    setConfirmActivation(false);
    setReviewedMatching("");
  }

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <div className="min-w-0">
          <Link
            href={`/clients/${clientId}/batches`}
            className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Batch Check
          </Link>
          <h2 className="font-heading text-3xl">{t("title")}</h2>
          <p className="mt-1 break-words text-sm text-muted-foreground">{context?.folder.name ?? ""}</p>
        </div>
        <Badge variant="outline">
          {job?.activate || (!job && activate) ? <Play className="mr-1 h-3 w-3" /> : <Pause className="mr-1 h-3 w-3" />}
          {t(
            job?.state.activated ? "activated" : job?.activate || (!job && activate) ? "activationRequested" : "paused"
          )}
        </Badge>
      </header>
      {error ? (
        <Alert variant="warning">
          <AlertDescription className="break-words">{error}</AlertDescription>
        </Alert>
      ) : null}
      {loading ? (
        <div className="flex items-center gap-3 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("loading")}
        </div>
      ) : null}
      {!loading && !context ? (
        <Button
          variant="outline"
          onClick={() => {
            setLoading(true);
            setError(null);
            setRevision((value) => value + 1);
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("retry")}
        </Button>
      ) : null}
      {context ? (
        <>
          {!context.metaConfigured ? (
            <Alert variant="warning">
              <AlertDescription>{t("missingMeta")}</AlertDescription>
            </Alert>
          ) : null}
          <Field label={t("account")} id="launch-account">
            <select
              id="launch-account"
              className={`${selectClass} max-w-xl`}
              value={context.accountId}
              onChange={(event) => {
                setLoading(true);
                setContext(null);
                setOptionsState(null);
                setError(null);
                setAccountId(event.target.value);
              }}
              disabled={saving}
            >
              {context.accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.currency}
                </option>
              ))}
            </select>
          </Field>
          {job ? (
            <section className="space-y-4 border-b border-border pb-6" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-heading text-xl">{job.name}</h3>
                <Badge
                  variant={
                    job.status === "completed"
                      ? "success"
                      : job.status === "failed" || job.status === "review"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {job.status === "completed" && job.state.activated ? t("activated") : t(`status.${job.status}`)}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {job.state.step === "activate" ? t("activateStep") : t(`steps.${job.state.step as "adset"}`)} ·{" "}
                {t("progress", {
                  ads: Object.values(job.state.ads).filter((ad) => ad.adId).length,
                  total: job.adCount,
                  files: Object.values(job.state.media).filter((media) => media.imageHash || media.ready).length,
                  fileTotal: job.fileCount
                })}
              </p>
              <progress
                className="h-2 w-full accent-primary"
                value={Object.values(job.state.ads).filter((ad) => ad.adId).length}
                max={job.adCount || 1}
              />
              {job.error ? (
                <Alert variant="warning">
                  <AlertDescription className="break-words">{job.error}</AlertDescription>
                </Alert>
              ) : null}
              {jobPollError ? (
                <Alert variant="warning">
                  <AlertDescription>{t("statusRefreshError")}</AlertDescription>
                </Alert>
              ) : null}
              {job.controlStatus !== "run" && job.status === "running" ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {t(job.controlStatus === "cancel" ? "cancelling" : "pausing")}
                </p>
              ) : null}
              {job.state.activationStarted && !job.state.activated ? (
                <Alert variant="warning">
                  <AlertDescription>{t("activationUncertain")}</AlertDescription>
                </Alert>
              ) : null}
              {jobRunning && job.activate && !job.state.activated && !job.state.activationStarted ? (
                <p className="text-sm text-muted-foreground">{t("activationStopNotice")}</p>
              ) : null}
              {job.state.activated ? <p className="text-sm text-muted-foreground">{t("deliveryNotice")}</p> : null}
              {job.status === "review" ? <p className="text-sm text-muted-foreground">{t("reviewHint")}</p> : null}
              {job.status === "cancelled" ? (
                <p className="text-sm text-muted-foreground">
                  {t(job.retryDraft ? "retryCancelledNotice" : "retryCancelledBlocked")}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {job.retryDraft ? (
                  <Button
                    className="h-auto min-h-10 max-w-full whitespace-normal"
                    disabled={saving}
                    onClick={restartCancelledJob}
                  >
                    <RefreshCw className="mr-2 h-4 w-4 shrink-0" />
                    {t("retryCancelled")}
                  </Button>
                ) : null}
                {!["completed", "review", "cancelled"].includes(job.status) ? (
                  <Button
                    disabled={!context.metaConfigured || saving}
                    onClick={() => controlUpload(jobRunning ? "pause" : "resume")}
                  >
                    {jobRunning ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                    {jobRunning ? t("stopUpload") : t("resumeUpload")}
                  </Button>
                ) : null}
                <Button asChild variant="outline">
                  <Link href="/uploads">
                    <UploadCloud className="mr-2 h-4 w-4" />
                    {t("uploadOverview")}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <a
                    href={`https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${job.metaAccountId.replace(/^act_/, "")}${job.state.adsetId ? `&selected_adset_ids=${job.state.adsetId}` : ""}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {t("openMeta")}
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/clients/${clientId}/batches`}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Batch Check
                  </Link>
                </Button>
                {job.status === "completed" ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setJob(null);
                      setCampaignId("");
                      setTemplateId("");
                      setActivate(false);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t("anotherCampaign")}
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}
          {!job ? (
            <fieldset
              id="launch-options"
              tabIndex={-1}
              disabled={locked}
              className="min-w-0 space-y-6 disabled:opacity-60"
            >
              {retrySource ? (
                <Alert variant="warning">
                  <AlertDescription>
                    {t("retryCancelledNotice")}
                    {retrySource.state.adsetId ? (
                      <a
                        className="ml-2 underline"
                        href={`https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${retrySource.metaAccountId.replace(/^act_/, "")}&selected_adset_ids=${retrySource.state.adsetId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("openPreviousAdset")}
                      </a>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}
              {optionsLoading ? (
                <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("optionsLoading")}
                </p>
              ) : optionsError ? (
                <Alert variant="warning">
                  <AlertDescription>
                    {t("optionsError")} {optionsError}
                  </AlertDescription>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setOptionsState(null);
                      setOptionsRevision((value) => value + 1);
                    }}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t("retry")}
                  </Button>
                </Alert>
              ) : null}
              {!optionsLoading && !optionsError && ((campaignId && !campaign) || (templateId && !template)) ? (
                <Alert variant="warning">
                  <AlertDescription>{t("selectionUnavailable")}</AlertDescription>
                </Alert>
              ) : null}
              <section className="grid min-w-0 gap-4 border-b border-border pb-6 md:grid-cols-2">
                <Field label={t("adsetName")} id="launch-name">
                  <Input id="launch-name" value={name} readOnly />
                </Field>
                <Field label={t("campaign")} id="launch-campaign">
                  <select
                    id="launch-campaign"
                    className={selectClass}
                    value={campaignId}
                    onChange={(event) => {
                      setCampaignId(event.target.value);
                      if (context.campaigns.find((item) => item.id === event.target.value)?.status !== "ACTIVE")
                        setActivate(false);
                      if (!templateId)
                        chooseTemplate(
                          context.templates.find(
                            (item) => item.campaignId === event.target.value && favoriteIds.includes(item.id)
                          )?.id ??
                            context.templates.find((item) => item.campaignId === event.target.value)?.id ??
                            ""
                        );
                    }}
                  >
                    <option value="">{t("choose")}</option>
                    {context.campaigns
                      .filter((item) => item.status === "ACTIVE")
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <div className="min-w-0 space-y-2 md:col-span-2">
                  <Label className="block" htmlFor="launch-template">
                    {t("templateAdset")}
                  </Label>
                  <div className="flex min-w-0 items-center gap-2">
                    <BatchTemplateSelect
                      id="launch-template"
                      templates={context.templates}
                      campaigns={context.campaigns}
                      favoriteIds={favoriteIds}
                      value={templateId}
                      disabled={locked}
                      onChange={(id) => chooseTemplate(id, true)}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      disabled={!templateId || saving}
                      onClick={toggleFavorite}
                      aria-pressed={favoriteIds.includes(templateId)}
                      aria-label={t(favoriteIds.includes(templateId) ? "removeFavorite" : "addFavorite")}
                      title={t(favoriteIds.includes(templateId) ? "removeFavorite" : "addFavorite")}
                    >
                      <Star
                        className={`h-4 w-4 ${favoriteIds.includes(templateId) ? "fill-current text-amber-500" : ""}`}
                      />
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!templateId}
                    onClick={() => chooseTemplate(templateId, true)}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t("applyAdsetSettings")}
                  </Button>
                </div>
                {template ? (
                  <details className="min-w-0 text-sm md:col-span-2">
                    <summary className="cursor-pointer text-muted-foreground">{t("inherited")}</summary>
                    <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">{t("optimization")}</dt>
                        <dd>{String(template.raw.optimization_goal ?? "-")}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t("pixel")}</dt>
                        <dd>{String((template.raw.promoted_object as Record<string, unknown>)?.pixel_id ?? "-")}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t("event")}</dt>
                        <dd>
                          {String((template.raw.promoted_object as Record<string, unknown>)?.custom_event_type ?? "-")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t("age")}</dt>
                        <dd>
                          {String((template.raw.targeting as Record<string, unknown>)?.age_min ?? 18)} -{" "}
                          {String((template.raw.targeting as Record<string, unknown>)?.age_max ?? "65+")}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-xs text-muted-foreground">{t("audienceDetails")}</p>
                  </details>
                ) : null}
              </section>
              <section className="space-y-4 border-b border-border pb-6">
                <h3 className="font-heading text-xl">{t("settings")}</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={t("preset")} id="launch-preset">
                    <select
                      id="launch-preset"
                      className={selectClass}
                      value={presetId}
                      onChange={(event) => applyPreset(event.target.value)}
                    >
                      <option value="">{t("custom")}</option>
                      {context.presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={`${t("dailyBudget")} (${account?.currency ?? ""})`} id="launch-budget">
                    <Input
                      id="launch-budget"
                      type="number"
                      min="0"
                      step="0.01"
                      value={dailyBudget}
                      disabled={campaignBudget}
                      onChange={(event) => setDailyBudget(event.target.value)}
                    />
                    {campaignBudget ? <p className="text-xs text-muted-foreground">{t("campaignBudget")}</p> : null}
                  </Field>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="country-search">{t("countries")}</Label>
                    <Input
                      id="country-search"
                      value={countrySearch}
                      onChange={(event) => setCountrySearch(event.target.value)}
                      placeholder={t("searchCountry")}
                    />
                    <div className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-md border border-input p-3">
                      {filteredCountries.map((code) => (
                        <label key={code} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={countries.includes(code)}
                            onChange={(event) =>
                              setCountries(
                                event.target.checked ? [...countries, code] : countries.filter((item) => item !== code)
                              )
                            }
                          />
                          {displayNames.of(code)}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {countries.map((code) => displayNames.of(code)).join(", ") || t("noneSelected")}
                    </p>
                    {inheritedLocations.length ? (
                      <p className="break-words text-xs text-muted-foreground">
                        {t("templateLocations", { locations: inheritedLocations.join(", ") })}
                      </p>
                    ) : null}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="language-search">{t("languages")}</Label>
                    <Input
                      id="language-search"
                      value={languageSearch}
                      onChange={(event) => setLanguageSearch(event.target.value)}
                      placeholder={t("searchLanguage")}
                    />
                    <div className="flex flex-wrap gap-2">
                      {namedLocales.map((item) => (
                        <Button
                          key={item.id}
                          size="sm"
                          variant="outline"
                          onClick={() => setLocales(locales.filter((value) => value.id !== item.id))}
                        >
                          {item.name}
                          <Trash2 className="ml-2 h-3 w-3" />
                        </Button>
                      ))}
                    </div>
                    {!locales.length ? <p className="text-xs text-muted-foreground">{t("allLanguages")}</p> : null}
                    {localeNameError && locales.length ? (
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        {t("localeNamesError")}
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          title={t("retry")}
                          aria-label={t("retry")}
                          onClick={() => {
                            setLocaleNameError(false);
                            setLocaleNameRevision((value) => value + 1);
                          }}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      </p>
                    ) : null}
                    <div className="max-h-32 space-y-1 overflow-y-auto">
                      {(languageSearch.trim().length >= 2 ? languageOptions : [])
                        .filter((option) => !locales.some((selected) => selected.id === option.id))
                        .map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              setLocales([...locales, option]);
                              setLanguageSearch("");
                            }}
                            className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-muted"
                          >
                            <Plus className="h-3 w-3" />
                            {option.name}
                          </button>
                        ))}
                    </div>
                    {languageError ? <p className="text-xs text-destructive">{languageError}</p> : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[min(100%,14rem)] flex-1 space-y-2">
                    <Label htmlFor="preset-name">{t("presetName")}</Label>
                    <Input
                      id="preset-name"
                      value={presetName}
                      maxLength={100}
                      onChange={(event) => setPresetName(event.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    disabled={!presetName.trim() || !countries.length}
                    onClick={() => savePreset()}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {t("savePreset")}
                  </Button>
                  {presetId ? (
                    <>
                      <Button
                        variant="outline"
                        title={t("saveAsNew")}
                        aria-label={t("saveAsNew")}
                        size="icon"
                        onClick={() => savePreset(true)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        title={t("deletePreset")}
                        aria-label={t("deletePreset")}
                        size="icon"
                        onClick={deletePreset}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </section>
              <section id="launch-identities" tabIndex={-1} className="space-y-4 border-b border-border pb-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-heading text-xl">{t("identities")}</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title={t("refreshIdentities")}
                    aria-label={t("refreshIdentities")}
                    disabled={identitiesLoading || !context.metaConfigured}
                    onClick={() => {
                      setIdentityState(null);
                      setIdentityRevision((value) => value + 1);
                    }}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                {identitiesLoading ? (
                  <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("identitiesLoading")}
                  </p>
                ) : null}
                {identitiesError ? (
                  <Alert variant="warning">
                    <AlertDescription>
                      {t("identitiesError")} {identitiesError}
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div className="grid min-w-0 gap-4 md:grid-cols-2">
                  <Field label={t("page")} id="launch-pageId">
                    <select
                      id="launch-pageId"
                      className={selectClass}
                      value={copy.pageId}
                      disabled={!identities}
                      onChange={(event) => selectIdentity("pageId", event.target.value)}
                    >
                      <option value="">{t("choosePage")}</option>
                      {copy.pageId && !identities?.pages.some((item) => item.id === copy.pageId) ? (
                        <option value={copy.pageId} disabled>
                          {t(identities ? "identityUnavailable" : "identityPending", { id: copy.pageId })}
                        </option>
                      ) : null}
                      {identities?.pages.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.id})
                        </option>
                      ))}
                    </select>
                    {identities && !identities.pages.length ? (
                      <p className="text-sm text-destructive">{t("noPages")}</p>
                    ) : null}
                  </Field>
                  <Field label={t("instagram")} id="launch-instagramId">
                    <select
                      id="launch-instagramId"
                      className={selectClass}
                      value={copy.instagramId}
                      disabled={!identities}
                      onChange={(event) => selectIdentity("instagramId", event.target.value)}
                    >
                      <option value="">{t("noInstagram")}</option>
                      {copy.instagramId &&
                      !identities?.instagramAccounts.some((item) => item.id === copy.instagramId) ? (
                        <option value={copy.instagramId} disabled>
                          {t(identities ? "identityUnavailable" : "identityPending", { id: copy.instagramId })}
                        </option>
                      ) : null}
                      {identities?.instagramAccounts.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.id})
                        </option>
                      ))}
                    </select>
                    {identities && !identities.instagramAccounts.length ? (
                      <p className="text-sm text-muted-foreground">{t("noInstagramAccounts")}</p>
                    ) : null}
                  </Field>
                </div>
              </section>
              <section id="launch-copy" tabIndex={-1} className="space-y-4 border-b border-border pb-6">
                <h3 className="font-heading text-xl">{t("copy")}</h3>
                {copyLoading ? (
                  <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("templateCopyLoading")}
                  </p>
                ) : null}
                {copyError ? (
                  <Alert variant="warning">
                    <AlertDescription>{copyError}</AlertDescription>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => loadTemplateCopy(templateId)}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {t("retry")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCopyRequest(null);
                          setTemplateCopy(null);
                        }}
                      >
                        {t("useOwnCopy")}
                      </Button>
                    </div>
                  </Alert>
                ) : null}
                {copyRequest && !copyLoading && !copyError && !copySources.length ? (
                  <p className="text-sm text-muted-foreground">{t("templateCopyEmpty")}</p>
                ) : null}
                {copySources.length ? (
                  <Field label={t("copySource")} id="launch-copy-source">
                    <select
                      id="launch-copy-source"
                      className={selectClass}
                      value={copySourceId}
                      onChange={(event) => {
                        copyEdits.current++;
                        setCopySourceId(event.target.value);
                        setSuggestionId("");
                        const source = copySources.find((item) => item.id === event.target.value);
                        if (source) setCopy(copyFields(source.copy));
                      }}
                    >
                      <option value="">{t("ownCopy")}</option>
                      {copySources.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.id})
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                {copySource?.truncated ? (
                  <p className="text-sm text-muted-foreground">{t("templateCopyTruncated")}</p>
                ) : null}
                <Field label={t("suggestion")} id="launch-suggestion">
                  <select
                    id="launch-suggestion"
                    className={selectClass}
                    value={suggestionId}
                    onChange={(event) => {
                      copyEdits.current++;
                      setCopySourceId("");
                      setSuggestionId(event.target.value);
                      const next = context.suggestions.find((item) => item.id === event.target.value);
                      if (next) setCopy(copyFields(next));
                    }}
                  >
                    <option value="">{copySource ? t("templateCopySelected") : t("ownCopy")}</option>
                    {context.suggestions.map((item, index) => (
                      <option key={item.id} value={item.id}>
                        {index + 1}. {item.primaryText.slice(0, 110)}
                      </option>
                    ))}
                  </select>
                </Field>
                {suggestion ? (
                  <p className="text-xs text-muted-foreground">
                    {t("copyMetrics", {
                      purchases: suggestion.purchases,
                      spend: money(suggestion.spend),
                      ads: suggestion.adCount,
                      roas: suggestion.spend > 0 ? (suggestion.revenue / suggestion.spend).toFixed(2) : "-"
                    })}
                  </p>
                ) : null}
                <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="min-w-0 space-y-4">
                    {Array.from({ length: MAX_COPY_VARIANTS }, (_, index) => {
                      const id = index ? `launch-text-${index + 1}` : "launch-text";
                      return (
                        <Field key={id} label={`${t("primaryText")} ${index + 1}`} id={id}>
                          <Textarea
                            id={id}
                            rows={4}
                            maxLength={10000}
                            value={copy.primaryTexts?.[index] ?? (index === 0 ? copy.primaryText : "")}
                            onChange={(event) => editVariant("primaryTexts", index, event.target.value)}
                          />
                        </Field>
                      );
                    })}
                  </div>
                  <div className="contents">
                    {(
                      [
                        ["headlines", "headline", 255],
                        ["descriptions", "description", 1000]
                      ] as const
                    ).map(([key, label, maxLength]) => (
                      <div key={key} className="min-w-0 space-y-4">
                        {Array.from({ length: MAX_COPY_VARIANTS }, (_, index) => {
                          const id = `launch-${label}${index ? `-${index + 1}` : ""}`;
                          return (
                            <Field key={id} label={`${t(label)} ${index + 1}`} id={id}>
                              <Textarea
                                id={id}
                                rows={2}
                                maxLength={maxLength}
                                value={copy[key]?.[index] ?? (index === 0 ? copy[label] : "")}
                                onChange={(event) => editVariant(key, index, event.target.value)}
                              />
                            </Field>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {(
                    [
                      ["landingUrl", "landingUrl"],
                      ["urlTags", "urlTags"]
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key} label={t(label)} id={`launch-${key}`}>
                      <Input
                        id={`launch-${key}`}
                        value={copy[key]}
                        onChange={(event) => editCopy({ ...copy, [key]: event.target.value })}
                      />
                    </Field>
                  ))}
                  <Field label={t("cta")} id="launch-cta">
                    <select
                      id="launch-cta"
                      className={selectClass}
                      value={copy.callToAction}
                      onChange={(event) => editCopy({ ...copy, callToAction: event.target.value })}
                    >
                      {[
                        ...new Set([
                          copy.callToAction,
                          "SHOP_NOW",
                          "LEARN_MORE",
                          "SIGN_UP",
                          "BOOK_NOW",
                          "CONTACT_US",
                          "GET_QUOTE",
                          "DOWNLOAD"
                        ])
                      ].map((cta) => (
                        <option key={cta} value={cta}>
                          {cta.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </section>
              <section id="launch-media" tabIndex={-1} className="space-y-4">
                {!media ? (
                  mediaError ? (
                    <Alert variant="warning">
                      <AlertDescription>{mediaError}</AlertDescription>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          setMediaState(null);
                          setMediaRevision((value) => value + 1);
                        }}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {t("retry")}
                      </Button>
                    </Alert>
                  ) : (
                    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("mediaLoading")}
                    </p>
                  )
                ) : (
                  <>
                    {context.matchingUnavailable ? (
                      <Alert>
                        <AlertDescription>{t("matchingUnavailable")}</AlertDescription>
                      </Alert>
                    ) : null}
                    {visualMatches.length ? (
                      <Alert>
                        <AlertDescription>{t("visualMatchReview")}</AlertDescription>
                        <label className="mt-3 flex items-center gap-2 text-sm">
                          <input
                            id="launch-matching-review"
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={!unreviewedMatching}
                            onChange={(event) => setReviewedMatching(event.target.checked ? matchingKey : "")}
                          />
                          {t("matchingReviewed")}
                        </label>
                      </Alert>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-heading text-xl">{t("ads", { count: groups.length })}</h3>
                      <Button variant="outline" size="sm" onClick={() => setGroups(context.groups)}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {t("resetMatching")}
                      </Button>
                    </div>
                    {groups.map((group) => {
                      const kind = context.files.find(
                        (file) => file.id === (group.feedFileId ?? group.storyFileId)
                      )?.kind;
                      return (
                        <div
                          key={group.id}
                          className="grid min-w-0 gap-4 rounded-lg border border-border p-4 lg:grid-cols-[minmax(180px,1fr)_minmax(0,2fr)]"
                        >
                          <div className="min-w-0 space-y-3">
                            <Label htmlFor={`ad-${group.id}`}>{t("adName")}</Label>
                            <Input
                              id={`ad-${group.id}`}
                              maxLength={200}
                              value={group.name}
                              onChange={(event) =>
                                setGroups(
                                  groups.map((item) =>
                                    item.id === group.id ? { ...item, name: event.target.value } : item
                                  )
                                )
                              }
                            />
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">
                                {kind === "video" ? (
                                  <Film className="mr-1 h-3 w-3" />
                                ) : (
                                  <ImageIcon className="mr-1 h-3 w-3" />
                                )}
                                {group.feedFileId && group.storyFileId ? t("matched") : t("single")}
                              </Badge>
                              {group.matchMethod === "visual" ? (
                                <Badge variant="outline">{t("visualMatch")}</Badge>
                              ) : null}
                              <Button
                                size="icon"
                                variant="ghost"
                                title={t("exclude")}
                                aria-label={t("exclude")}
                                onClick={() => setGroups(groups.filter((item) => item.id !== group.id))}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              {group.feedFileId && group.storyFileId ? (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title={t("unpair")}
                                  aria-label={t("unpair")}
                                  onClick={() =>
                                    setGroups(
                                      groups.flatMap((item) =>
                                        item.id !== group.id
                                          ? [item]
                                          : separateFiles(
                                              context.files.filter(
                                                (file) => file.id === group.feedFileId || file.id === group.storyFileId
                                              )
                                            ).map((item) => ({ ...item, primaryText: group.primaryText }))
                                      )
                                    )
                                  }
                                >
                                  <Unlink className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                            <details>
                              <summary className="cursor-pointer text-xs text-muted-foreground">
                                {t("individualText")}
                              </summary>
                              <Textarea
                                className="mt-2"
                                aria-label={`${t("primaryText")}: ${group.name}`}
                                rows={4}
                                maxLength={10000}
                                placeholder={copy.primaryText}
                                value={group.primaryText ?? ""}
                                onChange={(event) =>
                                  setGroups(
                                    groups.map((item) =>
                                      item.id === group.id ? { ...item, primaryText: event.target.value } : item
                                    )
                                  )
                                }
                              />
                            </details>
                          </div>
                          <div className="grid min-w-0 grid-cols-2 gap-3">
                            {(["feedFileId", "storyFileId"] as const).map((slot) => (
                              <div key={slot} className="min-w-0 space-y-2">
                                <Label htmlFor={`${group.id}-${slot}`}>
                                  {slot === "feedFileId" ? t("feed") : t("story")}
                                </Label>
                                <MediaPreview
                                  file={context.files.find((file) => file.id === group[slot])}
                                  empty={t("noVariant")}
                                />
                                <select
                                  id={`${group.id}-${slot}`}
                                  className={selectClass}
                                  value={group[slot] ?? ""}
                                  onChange={(event) => assignFile(group.id, slot, event.target.value)}
                                >
                                  <option value="">{t("noVariant")}</option>
                                  {context.files
                                    .filter(
                                      (file) =>
                                        file.kind === kind &&
                                        (file.id === group[slot] ||
                                          (slot === "storyFileId"
                                            ? file.placement === "story"
                                            : file.placement !== "story"))
                                    )
                                    .map((file) => (
                                      <option key={file.id} value={file.id}>
                                        {file.path}
                                      </option>
                                    ))}
                                </select>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {unused.length ? (
                      <div className="space-y-2">
                        <h4 className="text-sm text-muted-foreground">{t("unused", { count: unused.length })}</h4>
                        <div className="flex flex-wrap gap-2">
                          {unused.map((file) => (
                            <Button
                              key={file.id}
                              variant="outline"
                              size="sm"
                              className="max-w-full"
                              onClick={() => setGroups([...groups, ...separateFiles([file])])}
                            >
                              <Plus className="mr-2 h-3 w-3 shrink-0" />
                              <span className="truncate">{file.path}</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {context.ignoredFiles.length ? (
                      <details className="text-sm text-muted-foreground">
                        <summary>{t("ignored", { count: context.ignoredFiles.length })}</summary>
                        <ul className="mt-2 space-y-1">
                          {context.ignoredFiles.map((path) => (
                            <li className="break-words" key={path}>
                              {path}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </>
                )}
              </section>
            </fieldset>
          ) : null}
          {!job ? (
            <fieldset disabled={locked} className="space-y-3 border-t border-border pt-5">
              <legend className="px-1 text-sm font-semibold">{t("launchStatus")}</legend>
              <div className="flex flex-wrap gap-5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="launch-status"
                    value="paused"
                    checked={!activate}
                    onChange={() => setActivate(false)}
                    className="h-4 w-4 accent-primary"
                  />
                  <Pause className="h-4 w-4" />
                  {t("createPaused")}
                </label>
                <label
                  className={`flex items-center gap-2 text-sm ${campaign?.status !== "ACTIVE" ? "opacity-50" : ""}`}
                >
                  <input
                    type="radio"
                    name="launch-status"
                    value="active"
                    checked={activate}
                    disabled={campaign?.status !== "ACTIVE"}
                    onChange={() => setActivate(true)}
                    className="h-4 w-4 accent-primary"
                  />
                  <Play className="h-4 w-4" />
                  {t("directActivation")}
                </label>
              </div>
              {campaign && campaign.status !== "ACTIVE" ? (
                <p className="text-xs text-muted-foreground">{t("activeCampaignRequired")}</p>
              ) : null}
              {activate ? (
                <Alert variant="warning">
                  <AlertDescription>{t("spendWarning")}</AlertDescription>
                </Alert>
              ) : null}
            </fieldset>
          ) : null}
          {!job ? (
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              {blockers.length ? (
                <div
                  id="launch-blockers"
                  aria-live="polite"
                  className="w-full space-y-2 border-l-2 border-amber-500 pl-3 text-sm"
                >
                  <p className="font-medium">{t("blockersTitle")}</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {blockers.map((reason) => (
                      <li key={reason}>
                        <a
                          className="break-words underline underline-offset-4 hover:text-primary"
                          href={`#${batchLaunchBlockerTargets[reason]}`}
                          onClick={(event) => {
                            event.preventDefault();
                            const field = document.getElementById(batchLaunchBlockerTargets[reason]);
                            field?.scrollIntoView({ block: "center" });
                            field?.focus({ preventScroll: true });
                          }}
                        >
                          {t(`blockers.${reason}`)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {t(activate ? "activeSummary" : "summary", { ads: groups.length, files: assigned.size })}
              </p>
              <Button
                size="lg"
                disabled={saving || blockers.length > 0}
                aria-describedby={blockers.length ? "launch-blockers" : undefined}
                onClick={() => (activate ? setConfirmActivation(true) : void create())}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                {t(activate ? "createActive" : "createPaused")}
              </Button>
            </footer>
          ) : null}
          <Dialog open={confirmActivation} onOpenChange={setConfirmActivation}>
            <DialogContent className="max-h-[90vh] w-[calc(100%_-_2rem)] overflow-y-auto rounded-lg sm:rounded-lg">
              <DialogHeader>
                <DialogTitle className="text-xl tracking-normal">{t("confirmActivation")}</DialogTitle>
                <DialogDescription>{t("spendWarning")}</DialogDescription>
              </DialogHeader>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t("account")}</dt>
                  <dd className="break-words">{account?.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("campaign")}</dt>
                  <dd className="break-words">{campaign?.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {campaignBudget
                      ? t(campaign?.dailyBudget ? "campaignDailyBudget" : "campaignLifetimeBudget")
                      : t("dailyBudget")}
                  </dt>
                  <dd>
                    {money(
                      campaignBudget
                        ? (campaign?.dailyBudget || campaign?.lifetimeBudget || 0) / 10 ** currencyDigits
                        : Number(dailyBudget)
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("countries")}</dt>
                  <dd>{countries.map((code) => displayNames.of(code)).join(", ")}</dd>
                </div>
              </dl>
              <p className="text-sm">{t("activeSummary", { ads: groups.length, files: assigned.size })}</p>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setConfirmActivation(false)}>
                  {t("cancelActivation")}
                </Button>
                <Button disabled={saving || blockers.length > 0 || !activate} onClick={create}>
                  <Play className="mr-2 h-4 w-4" />
                  {t("confirmCreateActive")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-2">
      <Label className="block" htmlFor={id}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function MediaPreview({ file, empty }: { file?: BatchMediaFile; empty: string }) {
  return (
    <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-md bg-muted/20">
      {file?.thumbnailUrl ? (
        <Image src={file.thumbnailUrl} alt={file.name} fill unoptimized sizes="240px" className="object-contain" />
      ) : file ? (
        file.kind === "video" ? (
          <Film className="h-8 w-8 text-muted-foreground" />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        )
      ) : (
        <span className="p-3 text-center text-xs text-muted-foreground">{empty}</span>
      )}
      {file ? (
        <span className="absolute bottom-1 right-1 rounded bg-background/90 px-1.5 py-1 text-xs">
          {file.width && file.height ? `${file.width} × ${file.height}` : file.kind}
        </span>
      ) : null}
    </div>
  );
}
