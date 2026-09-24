import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`create schema auth;
    create schema storage;
    create role authenticated;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(name text, bucket_id text, owner_id text);
    create function storage.foldername(path text) returns text[] language sql immutable as $$
      select string_to_array(path, '/')
    $$;
    create publication supabase_realtime;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb not null default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    insert into auth.users(id,raw_user_meta_data) values
      ('00000000-0000-0000-0000-000000000004','{"full_name":"Existing Member"}');`);
  const migration = readFileSync(new URL('../supabase/migrations/202609230001_v1.sql', import.meta.url), 'utf8').replace('create extension if not exists pgcrypto;', '');
  await db.exec(migration);
  const backfill = readFileSync(new URL('../supabase/migrations/202609240001_backfill_profiles.sql', import.meta.url), 'utf8');
  await db.exec(backfill);
  const staffPush = readFileSync(new URL('../supabase/migrations/202609240002_staff_push.sql', import.meta.url), 'utf8');
  await db.exec(staffPush);
  const communityChat = readFileSync(new URL('../supabase/migrations/202609240003_community_chat.sql', import.meta.url), 'utf8');
  await db.exec(communityChat);
  const eventMedia = readFileSync(new URL('../supabase/migrations/202609240004_event_media_push.sql', import.meta.url), 'utf8');
  await db.exec(eventMedia);
  await db.exec(`grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    insert into auth.users(id,raw_user_meta_data) values
      ('00000000-0000-0000-0000-000000000001','{"full_name":"First Member"}'),
      ('00000000-0000-0000-0000-000000000002','{"full_name":"Second Member"}'),
      ('00000000-0000-0000-0000-000000000003','{"full_name":"Third Member"}');`);
  const profiles = await db.query('select count(*)::int as count from public.profiles');
  if (profiles.rows[0].count !== 4) throw new Error('Profile trigger or backfill failed');
  const existingProfile = await db.query("select full_name from public.profiles where id='00000000-0000-0000-0000-000000000004'");
  if (existingProfile.rows[0]?.full_name !== 'Existing Member') throw new Error('Existing account was not backfilled');

  await db.exec(`set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; set role authenticated;`);
  await db.exec(`insert into public.journey_progress(user_id,day) values ('00000000-0000-0000-0000-000000000001',1);`);
  let sequenceBlocked = false;
  try { await db.exec(`insert into public.journey_progress(user_id,day) values ('00000000-0000-0000-0000-000000000001',3);`); }
  catch { sequenceBlocked = true; }
  if (!sequenceBlocked) throw new Error('Journey order was not enforced');
  const ownProfiles = await db.query('select count(*)::int as count from public.profiles');
  if (ownProfiles.rows[0].count !== 1) throw new Error('Private profiles leaked');
  await db.exec(`update public.profiles set public_profile=true where id='00000000-0000-0000-0000-000000000001';`);
  let roleBlocked = false;
  try { await db.exec(`insert into public.staff_roles(user_id,role) values ('00000000-0000-0000-0000-000000000001','admin');`); }
  catch { roleBlocked = true; }
  if (!roleBlocked) throw new Error('Member could self-assign admin');
  await db.exec(`insert into public.prayer_requests(user_id,body,visibility) values ('00000000-0000-0000-0000-000000000001','Please pray for our family this week.','private');`);
  await db.exec(`insert into public.prayer_requests(user_id,body,visibility) values ('00000000-0000-0000-0000-000000000001','Please pray for a new opportunity.','anonymous');`);
  await db.exec(`reset role; insert into public.staff_roles(user_id,role) values ('00000000-0000-0000-0000-000000000001','admin'); update public.prayer_requests set status='approved' where visibility='anonymous';`);
  await db.exec(`reset role; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; set role authenticated;`);
  const visibleProfiles = await db.query('select count(*)::int as count from public.profiles');
  if (visibleProfiles.rows[0].count !== 1) throw new Error('Profile details leaked to another member');
  const otherPrayers = await db.query('select count(*)::int as count from public.prayer_requests');
  if (otherPrayers.rows[0].count !== 1) throw new Error('Prayer visibility policy failed');
  const publicPrayerId = (await db.query('select id from public.prayer_requests')).rows[0].id;
  await db.query('insert into public.prayer_responses(request_id,user_id) values ($1,$2)', [publicPrayerId, '00000000-0000-0000-0000-000000000002']);
  const prayedCount = (await db.query('select prayer_count from public.prayer_requests where id=$1', [publicPrayerId])).rows[0].prayer_count;
  if (prayedCount !== 1) throw new Error('Prayer count trigger failed');
  await db.exec(`insert into public.community_posts(user_id,kind,body) values ('00000000-0000-0000-0000-000000000002','encouragement','A little encouragement for our community today.');`);
  await db.exec(`reset role; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; set role authenticated;`);
  const otherPosts = await db.query('select count(*)::int as count from public.community_posts');
  if (otherPosts.rows[0].count !== 1) throw new Error('Community message history was not visible');
  const card = await db.query("select display_name from public.community_member_cards where id='00000000-0000-0000-0000-000000000002'");
  if (card.rows[0]?.display_name !== 'Second Member') throw new Error('Public chat card was not visible');
  const messageId = (await db.query('select id from public.community_posts')).rows[0].id;
  await db.query('insert into public.community_reactions(message_id,user_id,emoji) values ($1,$2,$3)',
    [messageId, '00000000-0000-0000-0000-000000000003', '🙏']);
  let spoofBlocked = false;
  try { await db.query('insert into public.community_posts(user_id,kind,body) values ($1,$2,$3)',
    ['00000000-0000-0000-0000-000000000002', 'message', 'Spoofed message']); }
  catch { spoofBlocked = true; }
  if (!spoofBlocked) throw new Error('Member could impersonate another chat author');
  let foreignAvatarBlocked = false;
  try { await db.exec("update public.profiles set avatar_path='00000000-0000-0000-0000-000000000002/photo.jpg' where id='00000000-0000-0000-0000-000000000003'"); }
  catch { foreignAvatarBlocked = true; }
  if (!foreignAvatarBlocked) throw new Error('Member could claim another avatar path');
  await db.query('insert into public.community_posts(user_id,kind,body,reply_to,bible_reference) values ($1,$2,$3,$4,$5)',
    ['00000000-0000-0000-0000-000000000003', 'prayer', 'Please pray with me.', messageId, 'Philippians 4:6']);
  const replies = await db.query('select count(*)::int as count from public.community_posts where reply_to=$1', [messageId]);
  if (replies.rows[0].count !== 1) throw new Error('Members could not reply to a visible message');
  await db.exec(`insert into public.mission_participation(mission_id,user_id)
    select id, '00000000-0000-0000-0000-000000000003' from public.missions limit 1;`);
  const myMission = await db.query('select mission_id from public.mission_participation');
  if (myMission.rows.length !== 1) throw new Error('Member could not join a mission');
  await db.query(`update public.mission_participation set status='completed', completed_at=now()
    where mission_id=$1`, [myMission.rows[0].mission_id]);
  const completed = await db.query('select status from public.mission_participation');
  if (completed.rows[0].status !== 'completed') throw new Error('Mission completion failed');

  await db.exec(`reset role; insert into public.events(title,description,starts_at,venue,location,capacity)
    values ('Capacity test','A small gathering',now() + interval '1 day','Hall','Lagos',1);`);
  const eventId = (await db.query("select id from public.events where title='Capacity test'")).rows[0].id;
  await db.exec(`set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; set role authenticated;`);
  await db.query('insert into public.event_registrations(event_id,user_id) values ($1,$2)', [eventId, '00000000-0000-0000-0000-000000000002']);
  await db.exec(`reset role; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; set role authenticated;`);
  let capacityBlocked = false;
  try { await db.query('insert into public.event_registrations(event_id,user_id) values ($1,$2)', [eventId, '00000000-0000-0000-0000-000000000003']); }
  catch { capacityBlocked = true; }
  if (!capacityBlocked) throw new Error('Event capacity was not enforced');

  let eventPublishBlocked = false;
  try { await db.exec(`select public.create_upcoming_event('00000000-0000-0000-0000-000000000091',
    'Unauthorized event','Details',now() + interval '1 day','Hall','Lagos',50,'{}',null,null);`); }
  catch { eventPublishBlocked = true; }
  if (!eventPublishBlocked) throw new Error('Ordinary member could publish an event');
  await db.exec(`reset role; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; set role authenticated;
    select public.create_upcoming_event('00000000-0000-0000-0000-000000000092',
      'Community gathering','Gather with us',now() + interval '2 days','Main Hall','Lagos',50,'{}',null,null);`);
  const eventNotice = await db.query("select count(*)::int as count from public.notifications where title='New event: Community gathering'");
  if (eventNotice.rows[0].count !== 1) throw new Error('Publishing an event did not create a community notice');
  await db.exec("select * from public.event_push_subscriptions('00000000-0000-0000-0000-000000000092');");
  let foreignEventMediaBlocked = false;
  try { await db.exec(`select public.create_upcoming_event('00000000-0000-0000-0000-000000000093',
    'Media spoof','Details',now() + interval '2 days','Hall','Lagos',50,
    array['00000000-0000-0000-0000-000000000003/00000000-0000-0000-0000-000000000093/photo.jpg'],null,null);`); }
  catch { foreignEventMediaBlocked = true; }
  if (!foreignEventMediaBlocked) throw new Error('Event could claim another member media');

  await db.exec(`reset role;
    insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000005','support.kingdomseekers@gmail.com');`);
  const unconfirmedAdmin = await db.query("select count(*)::int as count from public.staff_roles where user_id='00000000-0000-0000-0000-000000000005'");
  if (unconfirmedAdmin.rows[0].count !== 0) throw new Error('Unverified support account gained admin');
  await db.exec("update auth.users set email_confirmed_at=now() where id='00000000-0000-0000-0000-000000000005';");
  const confirmedAdmin = await db.query("select count(*)::int as count from public.staff_roles where user_id='00000000-0000-0000-0000-000000000005' and role='admin'");
  if (confirmedAdmin.rows[0].count !== 1) throw new Error('Verified support account was not granted admin');

  await db.exec(`set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; set role authenticated;
    insert into public.staff_access_requests(user_id,requested_role,reason)
    values ('00000000-0000-0000-0000-000000000002','prayer_moderator','I can help review prayer requests.');
    insert into public.push_subscriptions(user_id,endpoint,p256dh,auth)
    values ('00000000-0000-0000-0000-000000000002','https://push.example.test/subscription/second','public-key','auth-secret');`);
  const requestId = (await db.query('select id from public.staff_access_requests')).rows[0].id;
  let selfApprovalBlocked = false;
  try { await db.query('select public.review_staff_access_request($1,true)', [requestId]); }
  catch { selfApprovalBlocked = true; }
  if (!selfApprovalBlocked) throw new Error('Member approved their own staff request');
  let subscriptionListBlocked = false;
  try { await db.query('select * from public.admin_push_subscriptions()'); }
  catch { subscriptionListBlocked = true; }
  if (!subscriptionListBlocked) throw new Error('Member could enumerate push subscriptions');
  await db.exec(`reset role; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; set role authenticated;`);
  await db.query('select public.review_staff_access_request($1,true)', [requestId]);
  const approved = await db.query("select role from public.staff_roles where user_id='00000000-0000-0000-0000-000000000002' and role='prayer_moderator'");
  if (approved.rows.length !== 1) throw new Error('Admin approval did not grant the requested role');
  const subscriptions = await db.query('select * from public.admin_push_subscriptions()');
  if (subscriptions.rows.length !== 1) throw new Error('Admin could not enumerate push subscriptions');
  console.log('Migration and core privacy checks passed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
