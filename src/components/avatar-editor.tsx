'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Camera } from 'lucide-react';
import { MemberAvatar } from './member-avatar';

export function AvatarEditor({ client, userId, name, path, onSaved }: {
  client: SupabaseClient; userId: string; name: string; path?: string | null; onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function choose(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Choose a JPG, PNG, or WebP image under 2 MB.'); return;
    }
    setBusy(true); setError('');
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const nextPath = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage.from('community-avatars').upload(nextPath, file, { contentType: file.type });
    if (uploadError) { setError(uploadError.message); setBusy(false); return; }
    const { error: saveError } = await client.from('profiles').update({ avatar_path: nextPath }).eq('id', userId);
    if (saveError) {
      await client.storage.from('community-avatars').remove([nextPath]);
      setError(saveError.message);
    } else {
      await onSaved();
      if (path) await client.storage.from('community-avatars').remove([path]);
    }
    setBusy(false);
  }
  return <div className="avatar-editor">
    <MemberAvatar client={client} name={name} path={path} className="member-avatar--large" />
    <label className="avatar-upload"><Camera size={15} /> {busy ? 'Uploading…' : 'Change photo'}
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { void choose(event.target.files?.[0]); event.target.value = ''; }} />
    </label>
    {error && <span className="form-message" role="alert">{error}</span>}
  </div>;
}
