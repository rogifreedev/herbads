export function formatCurrency(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value);
}

export function formatDecimal(value: number | null, digits = 2) {
  if (value === null) return "–";
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatPercent(value: number | null) {
  if (value === null) return "–";
  return `${formatDecimal(value, 2)}%`;
}

export function formatDate(value: string | null) {
  if (!value) return "–";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}
