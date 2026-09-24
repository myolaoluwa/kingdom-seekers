-- Store an explicit end time so calendar invitations do not guess duration.
alter table public.events add column ends_at timestamptz;
alter table public.events add constraint event_end_after_start
  check (ends_at is null or ends_at > starts_at);

create function public.create_upcoming_event(
  event_id uuid, event_title text, event_description text, event_starts_at timestamptz,
  event_ends_at timestamptz, event_venue text, event_location text, event_capacity integer,
  event_image_paths text[], event_attachment_path text, event_attachment_name text
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if event_ends_at is null or event_starts_at is null or event_ends_at <= event_starts_at
    or event_ends_at > event_starts_at + interval '7 days' then
    raise exception 'Choose an end time after the start, within seven days';
  end if;
  perform public.create_upcoming_event(event_id, event_title, event_description, event_starts_at,
    event_venue, event_location, event_capacity, event_image_paths, event_attachment_path,
    event_attachment_name);
  update public.events set ends_at = event_ends_at where id = event_id;
  return event_id;
end;
$$;
revoke all on function public.create_upcoming_event(uuid,text,text,timestamptz,timestamptz,text,text,integer,text[],text,text) from public;
grant execute on function public.create_upcoming_event(uuid,text,text,timestamptz,timestamptz,text,text,integer,text[],text,text) to authenticated;
