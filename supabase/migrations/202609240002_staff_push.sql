-- Verified support mailbox, staff requests, and browser push subscriptions.
create or replace function public.sync_support_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) = 'support.kingdomseekers@gmail.com' and new.email_confirmed_at is not null then
    insert into public.staff_roles(user_id, role) values (new.id, 'admin') on conflict do nothing;
  elsif tg_op = 'UPDATE' and lower(old.email) = 'support.kingdomseekers@gmail.com'
      and lower(new.email) is distinct from lower(old.email) then
    delete from public.staff_roles where user_id = new.id and role = 'admin';
  end if;
  return new;
end;
$$;
create trigger support_admin_verified after insert or update of email, email_confirmed_at on auth.users
for each row execute function public.sync_support_admin();
insert into public.staff_roles(user_id, role)
select id, 'admin' from auth.users
where lower(email) = 'support.kingdomseekers@gmail.com' and email_confirmed_at is not null
on conflict do nothing;

create table public.staff_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_role text not null check (requested_role in ('leader','prayer_moderator','community_moderator','events_admin','missions_admin')),
  reason text not null check (char_length(reason) between 10 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index staff_one_pending_request on public.staff_access_requests(user_id) where status = 'pending';
create index staff_requests_status_created on public.staff_access_requests(status, created_at desc);
alter table public.staff_access_requests enable row level security;
create policy staff_requests_read on public.staff_access_requests for select to authenticated
using (user_id = (select auth.uid()) or public.has_role(array['admin']));
create policy staff_requests_create on public.staff_access_requests for insert to authenticated
with check (user_id = (select auth.uid()) and status = 'pending' and reviewed_by is null and reviewed_at is null);

create function public.review_staff_access_request(request_id uuid, approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare request_row public.staff_access_requests%rowtype;
begin
  if not public.has_role(array['admin']) then raise exception 'Not authorized'; end if;
  select * into request_row from public.staff_access_requests where id = request_id for update;
  if not found or request_row.status <> 'pending' then raise exception 'Request is no longer pending'; end if;
  update public.staff_access_requests set status = case when approve then 'approved' else 'rejected' end,
    reviewed_by = (select auth.uid()), reviewed_at = now() where id = request_id;
  if approve then
    insert into public.staff_roles(user_id, role) values(request_row.user_id, request_row.requested_role) on conflict do nothing;
  end if;
  insert into public.notifications(title, body, target_user_id) values (
    'Staff access request ' || case when approve then 'approved' else 'declined' end,
    case when approve then 'Your staff access request was approved. Sign in again if your new tools are not visible.'
      else 'Your staff access request was declined. Contact the Kingdom Seekers team if you have questions.' end,
    request_row.user_id
  );
end;
$$;
revoke all on function public.review_staff_access_request(uuid,boolean) from public;
grant execute on function public.review_staff_access_request(uuid,boolean) to authenticated;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 20 and 2048),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
create policy push_own_read on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy push_own_insert on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_own_delete on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

create function public.admin_push_subscriptions()
returns table(id uuid, endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role(array['admin']) then raise exception 'Not authorized'; end if;
  return query select p.id, p.endpoint, p.p256dh, p.auth from public.push_subscriptions p order by p.created_at desc limit 5000;
end;
$$;
revoke all on function public.admin_push_subscriptions() from public;
grant execute on function public.admin_push_subscriptions() to authenticated;

create function public.remove_stale_push_subscription(subscription_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role(array['admin']) then raise exception 'Not authorized'; end if;
  delete from public.push_subscriptions where id = subscription_id;
end;
$$;
revoke all on function public.remove_stale_push_subscription(uuid) from public;
grant execute on function public.remove_stale_push_subscription(uuid) to authenticated;
