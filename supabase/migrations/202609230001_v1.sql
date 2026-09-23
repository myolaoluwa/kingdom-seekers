-- Seekers' Hub V1. Run in the Supabase SQL editor on a new project.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  first_name text not null default '',
  location text default '',
  bio text default '',
  interests text[] not null default '{}',
  public_profile boolean not null default false,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.staff_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','leader','prayer_moderator','community_moderator','events_admin','missions_admin')),
  primary key (user_id, role)
);
create function public.has_role(allowed text[]) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.staff_roles where user_id = (select auth.uid()) and role = any(allowed));
$$;
create function public.is_staff() returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role(array['admin']);
$$;
create function public.new_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name, first_name)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''), split_part(coalesce(new.raw_user_meta_data->>'full_name',''), ' ', 1));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.new_profile();

create table public.compass_results (
  user_id uuid primary key references auth.users(id) on delete cascade,
  answers integer[] not null,
  path text not null check (path in ('care','outreach','teaching','leadership')),
  completed_at timestamptz not null default now()
);
create table public.journey_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  day integer not null check (day between 1 and 7),
  completed_at timestamptz not null default now(),
  primary key (user_id, day)
);
create function public.enforce_journey_order() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.day > 1 and exists(select 1 from generate_series(1,new.day - 1) as d where not exists(select 1 from public.journey_progress p where p.user_id = new.user_id and p.day = d)) then
    raise exception 'Complete earlier days first';
  end if;
  return new;
end;
$$;
create trigger journey_order before insert on public.journey_progress for each row execute function public.enforce_journey_order();
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day integer check (day between 1 and 7),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create table public.journey_days (
  day integer primary key check (day between 1 and 7),
  title text not null,
  scripture text not null,
  prompt text not null,
  action text not null
);

create table public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 10 and 2000),
  display_name text not null default '',
  category text not null default 'General',
  visibility text not null check (visibility in ('anonymous','first_name','private')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','answered')),
  prayer_count integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.prayer_responses (
  request_id uuid not null references public.prayer_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);
create function public.prayer_tally() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.prayer_requests set prayer_count = (select count(*) from public.prayer_responses where request_id = coalesce(new.request_id, old.request_id))
  where id = coalesce(new.request_id, old.request_id);
  return coalesce(new, old);
end;
$$;
create trigger prayer_count_insert after insert on public.prayer_responses for each row execute function public.prayer_tally();
create trigger prayer_count_delete after delete on public.prayer_responses for each row execute function public.prayer_tally();
create function public.protect_prayer_fields() returns trigger language plpgsql as $$
begin
  if not public.has_role(array['admin','prayer_moderator']) then
    if not (new.status = 'answered' and old.status = 'approved' and old.user_id = (select auth.uid())) then
      new.status := old.status;
    end if;
    if new.body is distinct from old.body or new.category is distinct from old.category or new.visibility is distinct from old.visibility then
      new.status := 'pending';
    end if;
  end if;
  if pg_trigger_depth() = 1 then new.prayer_count := old.prayer_count; end if;
  new.display_name := old.display_name;
  new.user_id := old.user_id;
  return new;
end;
$$;
create trigger prayer_protection before update on public.prayer_requests for each row execute function public.protect_prayer_fields();
create function public.set_prayer_name() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select first_name into new.display_name from public.profiles where id = new.user_id;
  return new;
end;
$$;
create trigger prayer_name before insert on public.prayer_requests for each row execute function public.set_prayer_name();

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text not null default 'Service',
  location text not null default 'Anywhere',
  date_text text not null default 'Flexible',
  interest_tag text not null default 'care',
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.mission_participation (
  mission_id uuid not null references public.missions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'accepted' check (status in ('accepted','completed')),
  reflection text not null default '',
  accepted_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (mission_id, user_id)
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  starts_at timestamptz not null,
  venue text not null,
  location text not null,
  capacity integer check (capacity is null or capacity > 0),
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.event_registrations (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  group_size integer not null default 1 check (group_size between 1 and 20),
  registered_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('encouragement','testimony')),
  body text not null check (char_length(body) between 10 and 3000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create function public.protect_post_fields() returns trigger language plpgsql as $$
begin
  if not public.has_role(array['admin','community_moderator']) then
    new.status := old.status;
    if new.body is distinct from old.body or new.kind is distinct from old.kind then new.status := 'pending'; end if;
  end if;
  new.user_id := old.user_id;
  return new;
end;
$$;
create trigger post_protection before update on public.community_posts for each row execute function public.protect_post_fields();
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('prayer','post')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 5 and 1000),
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now()
);
create function public.protect_report_fields() returns trigger language plpgsql as $$
begin
  new.reporter_id := old.reporter_id;
  new.target_type := old.target_type;
  new.target_id := old.target_id;
  new.reason := old.reason;
  return new;
end;
$$;
create trigger report_protection before update on public.reports for each row execute function public.protect_report_fields();
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  target_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.staff_roles enable row level security;
alter table public.compass_results enable row level security;
alter table public.journey_progress enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journey_days enable row level security;
alter table public.prayer_requests enable row level security;
alter table public.prayer_responses enable row level security;
alter table public.missions enable row level security;
alter table public.mission_participation enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.community_posts enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;

create policy profile_read on public.profiles for select to authenticated using (id = (select auth.uid()) or public.is_staff() or public_profile);
create policy profile_edit on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy staff_read on public.staff_roles for select to authenticated using (user_id = (select auth.uid()) or public.has_role(array['admin']));
create policy compass_all on public.compass_results for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy progress_all on public.journey_progress for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy journal_all on public.journal_entries for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy journey_days_read on public.journey_days for select to authenticated using (true);
create policy journey_days_write on public.journey_days for all to authenticated using (public.has_role(array['admin'])) with check (public.has_role(array['admin']));
create policy prayer_read on public.prayer_requests for select to authenticated using (
  user_id = (select auth.uid()) or public.has_role(array['admin','prayer_moderator']) or (status in ('approved','answered') and visibility <> 'private')
);
create policy prayer_create on public.prayer_requests for insert to authenticated with check (user_id = (select auth.uid()) and status = 'pending' and prayer_count = 0);
create policy prayer_edit on public.prayer_requests for update to authenticated using (user_id = (select auth.uid()) or public.has_role(array['admin','prayer_moderator'])) with check (user_id = (select auth.uid()) or public.has_role(array['admin','prayer_moderator']));
create policy response_read on public.prayer_responses for select to authenticated using (user_id = (select auth.uid()) or public.has_role(array['admin','prayer_moderator']));
create policy response_create on public.prayer_responses for insert to authenticated with check (
  user_id = (select auth.uid()) and exists(select 1 from public.prayer_requests p where p.id = request_id and p.status in ('approved','answered') and (p.visibility <> 'private' or public.has_role(array['admin','prayer_moderator'])) and p.user_id <> (select auth.uid()))
);
create policy missions_read on public.missions for select to authenticated using (published or public.has_role(array['admin','missions_admin','leader']));
create policy missions_write on public.missions for all to authenticated using (public.has_role(array['admin','missions_admin','leader'])) with check (public.has_role(array['admin','missions_admin','leader']));
create policy participation_read on public.mission_participation for select to authenticated using (user_id = (select auth.uid()) or public.has_role(array['admin','missions_admin','leader']));
create policy participation_create on public.mission_participation for insert to authenticated with check (user_id = (select auth.uid()) and status = 'accepted' and exists(select 1 from public.missions where id = mission_id and published));
create policy participation_edit on public.mission_participation for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy events_read on public.events for select to authenticated using (published or public.has_role(array['admin','events_admin','leader']));
create policy events_write on public.events for all to authenticated using (public.has_role(array['admin','events_admin','leader'])) with check (public.has_role(array['admin','events_admin','leader']));
create policy registrations_read on public.event_registrations for select to authenticated using (user_id = (select auth.uid()) or public.has_role(array['admin','events_admin','leader']));
create policy registrations_create on public.event_registrations for insert to authenticated with check (user_id = (select auth.uid()) and exists(select 1 from public.events where id = event_id and published));
create policy posts_read on public.community_posts for select to authenticated using (status = 'approved' or user_id = (select auth.uid()) or public.has_role(array['admin','community_moderator']));
create policy posts_create on public.community_posts for insert to authenticated with check (user_id = (select auth.uid()) and status = 'pending');
create policy posts_edit on public.community_posts for update to authenticated using (user_id = (select auth.uid()) or public.has_role(array['admin','community_moderator'])) with check (user_id = (select auth.uid()) or public.has_role(array['admin','community_moderator']));
create policy reports_read on public.reports for select to authenticated using (reporter_id = (select auth.uid()) or public.has_role(array['admin']) or (target_type = 'prayer' and public.has_role(array['prayer_moderator'])) or (target_type = 'post' and public.has_role(array['community_moderator'])));
create policy reports_create on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()) and status = 'open');
create policy reports_edit on public.reports for update to authenticated using (public.has_role(array['admin']) or (target_type = 'prayer' and public.has_role(array['prayer_moderator'])) or (target_type = 'post' and public.has_role(array['community_moderator']))) with check (public.has_role(array['admin']) or (target_type = 'prayer' and public.has_role(array['prayer_moderator'])) or (target_type = 'post' and public.has_role(array['community_moderator'])));
create policy notifications_read on public.notifications for select to authenticated using (target_user_id is null or target_user_id = (select auth.uid()) or public.has_role(array['admin']));
create policy notifications_write on public.notifications for all to authenticated using (public.has_role(array['admin'])) with check (public.has_role(array['admin']));

create function public.set_staff_role(target_user uuid, new_role text, enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role(array['admin']) then raise exception 'Not authorized'; end if;
  if new_role not in ('admin','leader','prayer_moderator','community_moderator','events_admin','missions_admin') then raise exception 'Invalid role'; end if;
  if target_user = (select auth.uid()) and new_role = 'admin' and not enabled then raise exception 'You cannot remove your own admin role'; end if;
  if enabled then insert into public.staff_roles(user_id, role) values(target_user, new_role) on conflict do nothing;
  else delete from public.staff_roles where user_id = target_user and role = new_role;
  end if;
end;
$$;
revoke all on function public.set_staff_role(uuid,text,boolean) from public;
grant execute on function public.set_staff_role(uuid,text,boolean) to authenticated;

create function public.check_event_capacity() returns trigger language plpgsql security definer set search_path = '' as $$
declare seats integer;
begin
  select capacity into seats from public.events where id = new.event_id and published and starts_at > now() for update;
  if not found then raise exception 'Event is unavailable'; end if;
  if seats is not null and (select coalesce(sum(group_size),0) from public.event_registrations where event_id = new.event_id) + new.group_size > seats then
    raise exception 'Event is full';
  end if;
  return new;
end;
$$;
create trigger event_capacity before insert on public.event_registrations for each row execute function public.check_event_capacity();

create index prayer_status_created on public.prayer_requests(status, created_at desc);
create index posts_status_created on public.community_posts(status, created_at desc);
create index events_starts on public.events(starts_at);
create index notifications_target_created on public.notifications(target_user_id, created_at desc);

insert into public.missions(title,description,category,location,date_text,interest_tag) values
('Encourage someone today','Reach out to someone who may need encouragement. Listen well and offer a thoughtful word.','Kindness','Anywhere','Today','care'),
('Pray with a friend','Invite someone to share a need and pray together, if they welcome it.','Prayer','Anywhere','This week','care'),
('Serve your neighbourhood','Find a practical need in your community and take one useful step to help.','Outreach','Your community','This week','outreach'),
('Share a Scripture reflection','Read a passage and share one helpful insight with a friend or small group.','Growth','Anywhere','This week','teaching'),
('Help organize a gathering','Offer your time to help plan, welcome or support a Kingdom Seekers gathering.','Service','Local gathering','Upcoming','leadership');

insert into public.journey_days(day,title,scripture,prompt,action) values
(1,'Begin with stillness','Psalm 46:10','Take five quiet minutes today. What is drawing your attention?','Spend five minutes in prayer.'),
(2,'Rooted in love','John 15:9–12','Where have you seen love expressed this week?','Encourage one person today.'),
(3,'Ask with trust','Philippians 4:6–7','What concern can you entrust to God?','Pray for someone by name.'),
(4,'A willing heart','Isaiah 6:8','Where might you be able to serve?','Notice one practical need around you.'),
(5,'Strength for today','Isaiah 40:29–31','Where do you need renewed strength?','Share an encouraging message.'),
(6,'Faith in action','James 2:14–17','How can care become a concrete action?','Do one act of kindness.'),
(7,'Reflect and continue','Psalm 77:11–12','What changed in you this week?','Reflect on your journey and choose your next step.');

insert into public.notifications(title,body) values ('Welcome to The Seekers’ Hub','Your journey begins with one meaningful step. Explore today’s Journey, pray for someone, or discover a mission.');
