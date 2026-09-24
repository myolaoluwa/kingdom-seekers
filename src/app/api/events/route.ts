import { withSupabase } from '@supabase/server';
import { deliverPush, pushIsConfigured, type PushRow } from '@/lib/web-push';

export const runtime = 'nodejs';
export const maxDuration = 60;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withSupabase({ auth: 'user' }, async (request, context) => {
  const payload = await request.json().catch(() => null);
  const id = typeof payload?.id === 'string' ? payload.id : '';
  const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
  const description = typeof payload?.description === 'string' ? payload.description.trim() : '';
  const venue = typeof payload?.venue === 'string' ? payload.venue.trim() : '';
  const location = typeof payload?.location === 'string' ? payload.location.trim() : '';
  const startsAt = typeof payload?.startsAt === 'string' ? payload.startsAt : '';
  const endsAt = typeof payload?.endsAt === 'string' ? payload.endsAt : '';
  const capacity = payload?.capacity;
  const imagePaths = payload?.imagePaths;
  const attachmentPath = payload?.attachmentPath ?? null;
  const attachmentName = payload?.attachmentName ?? null;
  if (!uuid.test(id) || !title || title.length > 160 || !description || description.length > 5000
    || !venue || venue.length > 200 || !location || location.length > 200
    || !startsAt || !Number.isFinite(Date.parse(startsAt)) || Date.parse(startsAt) <= Date.now()
    || !endsAt || !Number.isFinite(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt)
    || Date.parse(endsAt) > Date.parse(startsAt) + 7 * 24 * 60 * 60 * 1000
    || !Number.isInteger(capacity) || capacity < 1 || capacity > 100000
    || !Array.isArray(imagePaths) || imagePaths.length > 5 || imagePaths.some(path => typeof path !== 'string')
    || (attachmentPath !== null && typeof attachmentPath !== 'string')
    || (attachmentName !== null && (typeof attachmentName !== 'string' || attachmentName.length > 160))) {
    return Response.json({ error: 'Check the event details, date, capacity, and attachments.' }, { status: 400 });
  }
  if (!pushIsConfigured()) return Response.json({ error: 'Phone push is not configured.' }, { status: 503 });

  const { data: role, error: roleError } = await context.supabase.from('staff_roles')
    .select('role').eq('user_id', context.userClaims!.id).in('role', ['admin', 'events_admin', 'leader']).limit(1).maybeSingle();
  if (roleError) return Response.json({ error: 'Could not verify your role.' }, { status: 500 });
  if (!role) return Response.json({ error: 'Event publishing access required.' }, { status: 403 });

  const { data: eventId, error: publishError } = await context.supabase.rpc('create_upcoming_event', {
    event_id: id, event_title: title, event_description: description, event_starts_at: startsAt,
    event_ends_at: endsAt,
    event_venue: venue, event_location: location, event_capacity: capacity,
    event_image_paths: imagePaths, event_attachment_path: attachmentPath, event_attachment_name: attachmentName,
  });
  if (publishError) return Response.json({ error: publishError.message }, { status: 400 });

  const { data: rows, error: subscriptionError } = await context.supabase.rpc('event_push_subscriptions', { event_id: id });
  if (subscriptionError) return Response.json({ id: eventId, published: true, subscribers: 0, delivered: 0,
    warning: 'Event published, but phone subscriptions could not be loaded.' }, { status: 201 });

  const body = `${new Date(startsAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })} · ${venue}, ${location}`;
  const subscriptions = rows as PushRow[];
  const delivered = await deliverPush(subscriptions, { title: `New event: ${title}`, body, url: `/?view=events&event=${id}` },
    async subscription_id => {
      await context.supabase.rpc('remove_stale_event_push_subscription', { event_id: id, subscription_id });
    });
  return Response.json({ id: eventId, published: true, subscribers: subscriptions.length, delivered }, { status: 201 });
});
