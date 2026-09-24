'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

const roles = [
  { value: 'leader', label: 'Leader' },
  { value: 'prayer_moderator', label: 'Prayer moderator' },
  { value: 'community_moderator', label: 'Community moderator' },
  { value: 'events_admin', label: 'Events coordinator' },
  { value: 'missions_admin', label: 'Missions coordinator' },
];

type StaffRequest = {
  id: string;
  user_id: string;
  requested_role: string;
  reason: string;
  status: string;
  created_at: string;
};

export function StaffAccess({ client, userId, isStaff }: { client: SupabaseClient; userId: string; isStaff: boolean }) {
  const [latest, setLatest] = useState<StaffRequest | null>(null);
  const [role, setRole] = useState(roles[0].value);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const { data } = await client.from('staff_access_requests').select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    setLatest(data as StaffRequest | null);
  }, [client, userId]);
  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, [refresh]);

  if (isStaff) return null;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    const { error: requestError } = await client.from('staff_access_requests').insert({
      user_id: userId, requested_role: role, reason: reason.trim(),
    });
    setBusy(false);
    if (requestError) setError(requestError.message);
    else { setReason(''); await refresh(); }
  }
  return <section className="panel form-panel staff-access-panel">
    <span className="eyebrow">SERVE THE COMMUNITY</span><h3>Request staff access</h3>
    <p className="muted">Choose an area where you can help. A Kingdom Seekers admin reviews each request.</p>
    {latest?.status === 'pending' ? <p className="complete-note">Your {roles.find(item => item.value === latest.requested_role)?.label.toLowerCase()} request is awaiting review.</p> : <>
      {latest && <p className="muted">Your last request was {latest.status}. You can submit a new request.</p>}
      <form onSubmit={submit}><label>Area of service<select value={role} onChange={event => setRole(event.target.value)}>{roles.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>Why would you like to help?<textarea required minLength={10} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
        {error && <div className="form-message" role="alert">{error}</div>}
        <button className="button" disabled={busy} type="submit">Send request</button>
      </form>
    </>}
  </section>;
}

export function StaffRequests({ client }: { client: SupabaseClient }) {
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const { data, error: loadError } = await client.from('staff_access_requests').select('*')
      .eq('status', 'pending').order('created_at', { ascending: true });
    if (loadError) { setError(loadError.message); return; }
    const pending = (data ?? []) as StaffRequest[];
    setRequests(pending);
    if (pending.length) {
      const { data: profiles } = await client.from('profiles').select('id,full_name')
        .in('id', pending.map(item => item.user_id));
      setNames(Object.fromEntries((profiles ?? []).map(profile => [profile.id, profile.full_name])));
    }
  }, [client]);
  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, [refresh]);

  async function review(id: string, approve: boolean) {
    setBusyId(id); setError('');
    const { error: reviewError } = await client.rpc('review_staff_access_request', { request_id: id, approve });
    setBusyId(null);
    if (reviewError) setError(reviewError.message);
    else await refresh();
  }
  return <section className="panel staff-requests-panel">
    <span className="eyebrow">ACCESS REQUESTS</span><h3>Staff approvals</h3>
    {error && <div className="form-message" role="alert">{error}</div>}
    {requests.length ? requests.map(request => <div className="review-row" key={request.id}>
      <div><strong>{names[request.user_id] || 'Member'}</strong><small> · {roles.find(item => item.value === request.requested_role)?.label}</small><p>{request.reason}</p></div>
      <div><button disabled={busyId !== null} onClick={() => void review(request.id, true)}>Approve</button><button disabled={busyId !== null} onClick={() => void review(request.id, false)}>Decline</button></div>
    </div>) : <p className="muted">No staff requests are awaiting review.</p>}
  </section>;
}
