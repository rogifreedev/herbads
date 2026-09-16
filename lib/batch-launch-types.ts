export type BatchMediaFile = {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  kind: "image" | "video";
  placement: "feed" | "story" | "unknown";
  thumbnailUrl: string | null;
  modifiedTime: string;
};

export type BatchAdGroup = {
  id: string;
  name: string;
  primaryText?: string;
  matchMethod?: "visual";
  feedFileId: string | null;
  storyFileId: string | null;
};

export type BatchLaunchPreset = {
  id: string;
  name: string;
  dailyBudget: string;
  countries: string[];
  locales: { id: number; name: string }[];
};

export type BatchLaunchCopy = {
  primaryText: string;
  headline: string;
  description: string;
  landingUrl: string;
  callToAction: string;
  pageId: string;
  instagramId: string;
  urlTags: string;
};

export type BatchCopySuggestion = BatchLaunchCopy & {
  id: string;
  spend: number;
  purchases: number;
  revenue: number;
  adCount: number;
};

export type BatchCampaign = {
  id: string;
  name: string;
  objective: string;
  status: string;
  dailyBudget: number;
  lifetimeBudget: number;
};

export type BatchTemplate = {
  id: string;
  name: string;
  campaignId: string;
  raw: Record<string, unknown>;
};

export type BatchLaunchAccountContext = {
  folder: { id: string; name: string };
  accounts: { id: string; metaAccountId: string; name: string; currency: string }[];
  accountId: string;
  campaigns: BatchCampaign[];
  templates: BatchTemplate[];
  favoriteTemplateIds: string[];
  presets: BatchLaunchPreset[];
  suggestions: BatchCopySuggestion[];
  recentJobs: BatchLaunchJob[];
  metaConfigured: boolean;
};

export type BatchLaunchMedia = {
  files: BatchMediaFile[];
  groups: BatchAdGroup[];
  matchingUnavailable?: boolean;
  ignoredFiles: string[];
};

export type BatchLaunchOptions = Pick<BatchLaunchAccountContext, "campaigns" | "templates">;
export type BatchLaunchContext = BatchLaunchAccountContext & BatchLaunchMedia;

export type BatchLaunchInput = {
  activate?: boolean;
  activationBudget?: Pick<BatchCampaign, "dailyBudget" | "lifetimeBudget">;
  accountId: string;
  folderId: string;
  campaignId: string;
  templateId: string;
  name: string;
  settings: Omit<BatchLaunchPreset, "id" | "name">;
  copy: BatchLaunchCopy;
  groups: BatchAdGroup[];
};

export type BatchUploadedMedia = {
  imageHash?: string;
  videoId?: string;
  uploadSessionId?: string;
  startOffset?: number;
  endOffset?: number;
  finished?: boolean;
  finishedAt?: string;
  ready?: boolean;
  thumbnailUrl?: string;
};

export type BatchLaunchState = {
  adsetId?: string;
  media: Record<string, BatchUploadedMedia>;
  ads: Record<string, { creativeId?: string; adId?: string; activated?: boolean }>;
  activationStarted?: boolean;
  activated?: boolean;
  inFlight?: string;
  step: string;
};

export type BatchLaunchJob = {
  activate: boolean;
  id: string;
  accountId: string;
  metaAccountId: string;
  folderId: string;
  campaignId: string;
  name: string;
  status: "pending" | "running" | "failed" | "review" | "completed";
  state: BatchLaunchState;
  error: string | null;
  adCount: number;
  fileCount: number;
  updatedAt: string;
};
