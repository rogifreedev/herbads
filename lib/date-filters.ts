export type DateFilterSearchParams = Record<string, string | string[] | undefined>;

export type InsightDateRange = {
  since: string | null;
  until: string | null;
  dateError?: string | null;
  range?: "all" | null;
};

export function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isDateParam(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateParam(value: string | string[] | undefined) {
  const normalized = firstSearchParam(value)?.trim();
  return normalized && isDateParam(normalized) ? normalized : null;
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateDaysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days + 1);
  return formatDateInput(date);
}

export function resolveInsightDateFilters(searchParams: DateFilterSearchParams, defaultDays = 30): InsightDateRange {
  const isAllRange = firstSearchParam(searchParams.range) === "all";
  const hasExplicitDateRange = Boolean(firstSearchParam(searchParams.since) || firstSearchParam(searchParams.until));
  const since = isAllRange ? null : dateParam(searchParams.since) ?? (hasExplicitDateRange ? null : dateDaysAgo(defaultDays));
  const until = isAllRange ? null : dateParam(searchParams.until) ?? (hasExplicitDateRange ? null : formatDateInput(new Date()));
  const dateError = since && until && since > until ? "Startdatum darf nicht nach dem Enddatum liegen." : null;
  return { since, until, dateError, range: isAllRange ? "all" : null };
}
