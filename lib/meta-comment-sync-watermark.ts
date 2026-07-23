const EMPTY_STORY_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export type MetaCommentSyncWatermark = {
  last_synced_at: string | null;
  last_comment_created_at: string | null;
};

function timestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function commentFetchSince(state: MetaCommentSyncWatermark | undefined) {
  if (!state) return null;
  if (timestamp(state.last_comment_created_at) !== null) return state.last_comment_created_at;

  const lastSyncedAt = timestamp(state.last_synced_at);
  return lastSyncedAt === null ? null : new Date(Math.max(0, lastSyncedAt - EMPTY_STORY_LOOKBACK_MS)).toISOString();
}

export function latestCommentWatermark(previous: string | null | undefined, comments: Array<string | null>) {
  const values = [previous, ...comments]
    .map((value) => ({ value, timestamp: timestamp(value) }))
    .filter((item): item is { value: string; timestamp: number } => item.value !== null && item.value !== undefined && item.timestamp !== null)
    .sort((left, right) => right.timestamp - left.timestamp);

  return values[0]?.value ?? null;
}
