export const DEFAULT_META_DAILY_LOOKBACK_DAYS = 8;

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getMetaDailySyncRange(now: Date, configuredDays: number) {
  const days = Math.max(
    1,
    Math.floor(Number.isFinite(configuredDays) ? configuredDays : DEFAULT_META_DAILY_LOOKBACK_DAYS)
  );
  const untilDate = new Date(now);
  untilDate.setUTCDate(untilDate.getUTCDate() - 1);

  const sinceDate = new Date(untilDate);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - days + 1);

  return { since: formatDateInput(sinceDate), until: formatDateInput(untilDate) };
}

export function normalizeMetaAccountStatus(status: number | null | undefined) {
  if (status === null || status === undefined || status === 1) return "active";

  const labels: Record<number, string> = {
    2: "disabled",
    3: "unsettled",
    7: "pending_risk_review",
    8: "pending_settlement",
    9: "in_grace_period",
    100: "pending_closure",
    101: "closed"
  };

  return labels[status] ?? `meta_status_${status}`;
}
