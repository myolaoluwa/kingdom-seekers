-- Accounts created before the V1 profile trigger need a profile for onboarding.
insert into public.profiles (id, full_name, first_name)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  split_part(coalesce(u.raw_user_meta_data->>'full_name', ''), ' ', 1)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
