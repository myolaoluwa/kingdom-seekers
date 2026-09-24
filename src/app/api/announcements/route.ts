import { withSupabase } from '@supabase/server';
import webPush from 'web-push';

export const runtime = 'nodejs';
export const maxDuration = 60;

type PushRow = { id: string; endpoint: string; p256dh: string; auth: string };

export const POST = withSupabase({ auth: 'user' }, async (request, context) => {
  const { data: role, error: roleError } = await context.supabase.from('staff_roles')
    .select('role').eq('user_id', context.userClaims!.id).eq('role', 'admin').maybeSingle();
  if (roleError) return Response.json({ error: 'Could not verify your role.' }, { status: 500 });
  if (!role) return Response.json({ error: 'Admin access required.' }, { status: 403 });

  const payload = await request.json().catch(() => null);
  const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
  const body = typeof payload?.body === 'string' ? payload.body.trim() : '';
  if (!title || title.length > 120 || !body || body.length > 600) {
    return Response.json({ error: 'Use a title under 120 characters and a message under 600 characters.' }, { status: 400 });
  }
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    return Response.json({ error: 'Push delivery is not configured.' }, { status: 503 });
  }

  const { data: subscribers, error: subscriberError } = await context.supabase.rpc('admin_push_subscriptions');
  if (subscriberError) return Response.json({ error: 'Could not load push subscriptions.' }, { status: 500 });
  const { data: notice, error: noticeError } = await context.supabase.from('notifications')
    .insert({ title, body }).select('id').single();
  if (noticeError) return Response.json({ error: 'Could not publish announcement.' }, { status: 500 });

  webPush.setVapidDetails(subject, publicKey, privateKey);
  let delivered = 0;
  const send = async (subscription: PushRow) => {
    try {
      await webPush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify({ title, body, url: '/' }),
        { TTL: 3600 },
      );
      return true;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await context.supabase.rpc('remove_stale_push_subscription', { subscription_id: subscription.id });
      }
      return false;
    }
  };
  const rows = subscribers as PushRow[];
  for (let index = 0; index < rows.length; index += 20) {
    const batch = await Promise.all(rows.slice(index, index + 20).map(send));
    delivered += batch.filter(Boolean).length;
  }
  return Response.json({ id: notice.id, subscribers: rows.length, delivered });
});
