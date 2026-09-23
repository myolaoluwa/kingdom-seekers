import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`create schema auth;
    create role authenticated;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;`);
  const migration = readFileSync(new URL('../supabase/migrations/202609230001_v1.sql', import.meta.url), 'utf8').replace('create extension if not exists pgcrypto;', '');
  await db.exec(migration);
  await db.exec(`grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    insert into auth.users(id,raw_user_meta_data) values
      ('00000000-0000-0000-0000-000000000001','{"full_name":"First Member"}'),
      ('00000000-0000-0000-0000-000000000002','{"full_name":"Second Member"}'),
      ('00000000-0000-0000-0000-000000000003','{"full_name":"Third Member"}');`);
  const profiles = await db.query('select count(*)::int as count from public.profiles');
  if (profiles.rows[0].count !== 3) throw new Error('Profile trigger failed');

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
  if (otherPosts.rows[0].count !== 0) throw new Error('Unapproved post leaked');
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
  console.log('Migration and core privacy checks passed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
