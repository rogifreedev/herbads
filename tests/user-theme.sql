begin;
set local role service_role;
insert into public.user_preferences (user_email, theme) values
  ('theme-fixture-a@herb-media.com', 'dark'), ('theme-fixture-b@herb-media.com', 'light');
insert into public.user_preferences (user_email, theme) values ('theme-fixture-a@herb-media.com', 'light')
  on conflict (user_email) do update set theme = excluded.theme;
do $$
begin
  if (select count(*) from public.user_preferences where user_email in ('theme-fixture-a@herb-media.com', 'theme-fixture-b@herb-media.com') and theme = 'light') <> 2 then
    raise exception 'Preference upsert did not retain independent users';
  end if;
  begin
    update public.user_preferences set theme = 'invalid' where user_email = 'theme-fixture-a@herb-media.com';
    raise exception 'Invalid theme was accepted';
  exception when check_violation then null;
  end;
  if has_table_privilege('anon', 'public.user_preferences', 'SELECT')
     or has_table_privilege('authenticated', 'public.user_preferences', 'SELECT')
     or has_table_privilege('authenticated', 'public.user_preferences', 'UPDATE')
     or has_table_privilege('anon', 'public.user_preferences', 'INSERT') then
    raise exception 'User preferences are exposed to the public API';
  end if;
end;
$$;
rollback;
