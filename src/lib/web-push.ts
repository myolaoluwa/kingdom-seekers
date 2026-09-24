import webPush from 'web-push';

export type PushRow = { id: string; endpoint: string; p256dh: string; auth: string };

export function pushIsConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

export async function deliverPush(
  subscriptions: PushRow[], message: { title: string; body: string; url: string },
  removeStale: (id: string) => Promise<void>,
) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!,
  );
  let accepted = 0;
  for (let index = 0; index < subscriptions.length; index += 20) {
    const batch = await Promise.all(subscriptions.slice(index, index + 20).map(async subscription => {
      try {
        await webPush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify(message), { TTL: 86400, timeout: 10000 },
        );
        return true;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await removeStale(subscription.id);
        return false;
      }
    }));
    accepted += batch.filter(Boolean).length;
  }
  return accepted;
}
