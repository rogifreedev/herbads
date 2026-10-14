-- App authentication uses verified email identities, including its signed session cookie.
create table public.user_preferences (
  user_email text primary key check (user_email = lower(user_email) and user_email like '%@herb-media.com'),
  theme text not null default 'light' check (theme in ('light', 'dark')),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;
revoke all on table public.user_preferences from public, anon, authenticated;
grant select, insert, update on table public.user_preferences to service_role;
comment on table public.user_preferences is 'Server-only preferences. Ownership is derived from the verified app session, never from request input.';
