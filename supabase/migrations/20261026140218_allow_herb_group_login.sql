alter table public.user_preferences
  drop constraint if exists user_preferences_user_email_check;

alter table public.user_preferences
  add constraint user_preferences_user_email_check check (
    user_email = lower(user_email)
    and split_part(user_email, '@', 2) in ('herb-media.com', 'herb-group.com')
  );
