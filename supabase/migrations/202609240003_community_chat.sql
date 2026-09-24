-- Open community conversation, visible member cards, and tightly scoped media storage.
alter table public.profiles add column avatar_path text;
alter table public.profiles add constraint avatar_owned_path
  check (avatar_path is null or avatar_path like id::text || '/%');

create table public.community_member_cards (
  id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null,
  avatar_path text
);
alter table public.community_member_cards enable row level security;
grant select on public.community_member_cards to authenticated;
create policy community_cards_read on public.community_member_cards
  for select to authenticated using (true);

create function public.sync_community_card() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.community_member_cards(id, display_name, avatar_path)
  values(new.id, coalesce(nullif(trim(new.full_name), ''), 'Kingdom Seeker'), new.avatar_path)
  on conflict (id) do update set display_name = excluded.display_name, avatar_path = excluded.avatar_path;
  return new;
end;
$$;
create trigger community_card_profile after insert or update of full_name, avatar_path on public.profiles
for each row execute function public.sync_community_card();
insert into public.community_member_cards(id, display_name, avatar_path)
select id, coalesce(nullif(trim(full_name), ''), 'Kingdom Seeker'), avatar_path from public.profiles
on conflict (id) do nothing;

alter table public.community_posts add column reply_to uuid references public.community_posts(id) on delete set null;
alter table public.community_posts add column bible_reference text check (char_length(bible_reference) <= 80);
alter table public.community_posts add column attachment_path text;
alter table public.community_posts add column attachment_name text check (char_length(attachment_name) <= 160);
alter table public.community_posts add column attachment_type text check (attachment_type in ('image','file','audio'));
alter table public.community_posts drop constraint community_posts_kind_check;
alter table public.community_posts add constraint community_posts_kind_check
  check (kind in ('message','prayer','encouragement','testimony'));
alter table public.community_posts drop constraint community_posts_body_check;
alter table public.community_posts add constraint community_posts_body_check
  check ((char_length(body) between 1 and 20000) or (body = '' and attachment_path is not null));
alter table public.community_posts add constraint community_attachment_complete
  check ((attachment_path is null and attachment_name is null and attachment_type is null)
    or (attachment_path is not null and attachment_name is not null and attachment_type is not null));
alter table public.community_posts alter column status set default 'approved';
update public.community_posts set status = 'approved' where status = 'pending';
create function public.community_parent_visible(parent_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.community_posts where id = parent_id and status = 'approved');
$$;
drop policy posts_create on public.community_posts;
create policy posts_create on public.community_posts for insert to authenticated
with check (
  user_id = (select auth.uid()) and status = 'approved'
  and (attachment_path is null or attachment_path like (select auth.uid()::text) || '/%')
  and (reply_to is null or public.community_parent_visible(reply_to))
);

create or replace function public.protect_post_fields() returns trigger language plpgsql as $$
begin
  new.user_id := old.user_id;
  new.reply_to := old.reply_to;
  new.attachment_path := old.attachment_path;
  new.attachment_name := old.attachment_name;
  new.attachment_type := old.attachment_type;
  if not public.has_role(array['admin','community_moderator']) then
    new.status := old.status;
  end if;
  return new;
end;
$$;

create table public.community_reactions (
  message_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('❤️','🙏','🙌','👍')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index community_reactions_message on public.community_reactions(message_id);
alter table public.community_reactions enable row level security;
grant select, insert, update, delete on public.community_reactions to authenticated;
create policy community_reactions_read on public.community_reactions for select to authenticated
using (exists(select 1 from public.community_posts p where p.id = message_id and p.status = 'approved'));
create policy community_reactions_insert on public.community_reactions for insert to authenticated
with check (user_id = (select auth.uid()) and exists(select 1 from public.community_posts p where p.id = message_id and p.status = 'approved'));
create policy community_reactions_delete on public.community_reactions for delete to authenticated
using (user_id = (select auth.uid()));
create policy community_reactions_update on public.community_reactions for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index community_posts_history on public.community_posts(created_at desc, id desc) where status = 'approved';

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('community-avatars', 'community-avatars', true, 2097152,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('community-media', 'community-media', false, 10485760,
  array['image/jpeg','image/png','image/webp','application/pdf','text/plain',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy community_avatar_upload on storage.objects for insert to authenticated
with check (bucket_id = 'community-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy community_avatar_read on storage.objects for select to authenticated
using (bucket_id = 'community-avatars');
create policy community_avatar_delete on storage.objects for delete to authenticated
using (bucket_id = 'community-avatars' and owner_id = (select auth.uid()::text));
create policy community_media_upload on storage.objects for insert to authenticated
with check (bucket_id = 'community-media' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy community_media_read on storage.objects for select to authenticated
using (bucket_id = 'community-media');
create policy community_media_delete on storage.objects for delete to authenticated
using (bucket_id = 'community-media' and owner_id = (select auth.uid()::text));

alter publication supabase_realtime add table public.community_posts, public.community_reactions, public.community_member_cards;
