-- Event media and atomic event/announcement publication.
alter table public.events add column created_by uuid references auth.users(id);
alter table public.events add column image_paths text[] not null default '{}';
alter table public.events add column attachment_path text;
alter table public.events add column attachment_name text;
alter table public.events add constraint event_media_limits
  check (cardinality(image_paths) <= 5 and char_length(coalesce(attachment_name, '')) <= 160
    and ((attachment_path is null and attachment_name is null)
      or (attachment_path is not null and attachment_name is not null)));

drop policy events_write on public.events;
create policy events_update on public.events for update to authenticated
using (public.has_role(array['admin','events_admin','leader']))
with check (public.has_role(array['admin','events_admin','leader']));

create function public.create_upcoming_event(
  event_id uuid, event_title text, event_description text, event_starts_at timestamptz,
  event_venue text, event_location text, event_capacity integer,
  event_image_paths text[], event_attachment_path text, event_attachment_name text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare author uuid := (select auth.uid());
declare media_path text;
begin
  if author is null or not public.has_role(array['admin','events_admin','leader']) then
    raise exception 'Not authorized to publish events';
  end if;
  if event_id is null or char_length(trim(event_title)) not between 1 and 160
    or char_length(trim(event_description)) not between 1 and 5000
    or char_length(trim(event_venue)) not between 1 and 200
    or char_length(trim(event_location)) not between 1 and 200
    or event_starts_at is null or event_starts_at <= now()
    or event_capacity is null or event_capacity not between 1 and 100000
    or cardinality(coalesce(event_image_paths, '{}'::text[])) > 5
    or char_length(coalesce(event_attachment_name, '')) > 160
    or ((event_attachment_path is null) <> (event_attachment_name is null)) then
    raise exception 'Invalid upcoming event';
  end if;
  foreach media_path in array coalesce(event_image_paths, '{}'::text[]) loop
    if media_path is null or media_path not like author::text || '/' || event_id::text || '/%' then
      raise exception 'Invalid event image path';
    end if;
  end loop;
  if event_attachment_path is not null
    and event_attachment_path not like author::text || '/' || event_id::text || '/%' then
    raise exception 'Invalid event attachment path';
  end if;
  insert into public.events(id, title, description, starts_at, venue, location, capacity,
    published, created_by, image_paths, attachment_path, attachment_name)
  values (event_id, trim(event_title), trim(event_description), event_starts_at,
    trim(event_venue), trim(event_location), event_capacity, true, author,
    coalesce(event_image_paths, '{}'::text[]), event_attachment_path, event_attachment_name);
  insert into public.notifications(title, body)
  values ('New event: ' || trim(event_title),
    'Join us on ' || to_char(event_starts_at at time zone 'Africa/Lagos', 'DD Mon YYYY, HH12:MI AM')
      || ' (Lagos time) at ' || trim(event_venue) || ', ' || trim(event_location) || '.');
  return event_id;
end;
$$;
revoke all on function public.create_upcoming_event(uuid,text,text,timestamptz,text,text,integer,text[],text,text) from public;
grant execute on function public.create_upcoming_event(uuid,text,text,timestamptz,text,text,integer,text[],text,text) to authenticated;

create function public.event_push_subscriptions(event_id uuid)
returns table(id uuid, endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.events e where e.id = event_id and e.created_by = (select auth.uid())
    and e.published and public.has_role(array['admin','events_admin','leader'])) then
    raise exception 'Not authorized to notify for this event';
  end if;
  return query select p.id, p.endpoint, p.p256dh, p.auth
    from public.push_subscriptions p order by p.created_at desc limit 5000;
end;
$$;
revoke all on function public.event_push_subscriptions(uuid) from public;
grant execute on function public.event_push_subscriptions(uuid) to authenticated;

create function public.remove_stale_event_push_subscription(event_id uuid, subscription_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.events e where e.id = event_id and e.created_by = (select auth.uid())
    and public.has_role(array['admin','events_admin','leader'])) then
    raise exception 'Not authorized to maintain subscriptions';
  end if;
  delete from public.push_subscriptions where id = subscription_id;
end;
$$;
revoke all on function public.remove_stale_event_push_subscription(uuid,uuid) from public;
grant execute on function public.remove_stale_event_push_subscription(uuid,uuid) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('event-media', 'event-media', false, 10485760,
  array['image/jpeg','image/png','image/webp','application/pdf','text/plain',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
create policy event_media_upload on storage.objects for insert to authenticated
with check (bucket_id = 'event-media' and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.has_role(array['admin','events_admin','leader']));
create policy event_media_read on storage.objects for select to authenticated
using (bucket_id = 'event-media');
create policy event_media_delete on storage.objects for delete to authenticated
using (bucket_id = 'event-media' and owner_id = (select auth.uid()::text));
