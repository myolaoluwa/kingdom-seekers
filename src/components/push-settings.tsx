'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type PushState = 'checking' | 'unsupported' | 'denied' | 'off' | 'on';

function applicationKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function PushSettings({ client, userId }: { client: SupabaseClient; userId: string }) {
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)
      || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) { setState('unsupported'); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) { setState('off'); return; }
      const { data } = await client.from('push_subscriptions').select('id')
        .eq('user_id', userId).eq('endpoint', subscription.endpoint).maybeSingle();
      setState(data ? 'on' : 'off');
    } catch { setState('unsupported'); }
  }, [client, userId]);
  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, [refresh]);

  async function enable() {
    setBusy(true); setError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState('denied'); return; }
      const registration = await navigator.serviceWorker.ready;
      const old = await registration.pushManager.getSubscription();
      if (old) await old.unsubscribe();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      const keys = subscription.toJSON().keys;
      if (!keys?.p256dh || !keys.auth) throw new Error('Your browser did not provide push keys.');
      const { error: saveError } = await client.from('push_subscriptions').insert({
        user_id: userId, endpoint: subscription.endpoint, p256dh: keys.p256dh, auth: keys.auth,
      });
      if (saveError) { await subscription.unsubscribe(); throw saveError; }
      setState('on');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not enable notifications.'); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setError('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const { error: removeError } = await client.from('push_subscriptions').delete()
          .eq('user_id', userId).eq('endpoint', subscription.endpoint);
        if (removeError) throw removeError;
        await subscription.unsubscribe();
      }
      setState('off');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not disable notifications.'); }
    finally { setBusy(false); }
  }

  return <section className="panel push-panel">
    <span className="eyebrow">PHONE NOTIFICATIONS</span><h3>Stay close to the community</h3>
    <p className="muted">Get a phone notification when Kingdom Seekers publishes a community announcement. You can turn this off anytime.</p>
    {state === 'checking' && <p className="muted">Checking this device…</p>}
    {state === 'unsupported' && <p className="muted">Push is unavailable in this browser. On iPhone, add the site to your Home Screen in Safari, open the installed app, then enable notifications here.</p>}
    {state === 'denied' && <p className="muted">Notifications are blocked for this site. Allow them in your browser or phone settings, then reload the app.</p>}
    {state === 'off' && <button className="button" disabled={busy} onClick={() => void enable()}>Enable phone notifications</button>}
    {state === 'on' && <><p className="complete-note">Phone notifications are enabled on this device.</p><button className="text-button" disabled={busy} onClick={() => void disable()}>Turn off on this device</button></>}
    {error && <div className="form-message" role="alert">{error}</div>}
  </section>;
}
