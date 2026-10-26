export const ALLOWED_EMAIL_DOMAINS = ["herb-media.com", "herb-group.com"] as const;

export function isAllowedEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;

  const separator = normalized.lastIndexOf("@");
  return separator > 0 && ALLOWED_EMAIL_DOMAINS.includes(
    normalized.slice(separator + 1) as (typeof ALLOWED_EMAIL_DOMAINS)[number]
  );
}
