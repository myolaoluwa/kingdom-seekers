'use client';
/* eslint-disable @next/next/no-img-element -- User photos are small, public Supabase assets. */

import type { SupabaseClient } from '@supabase/supabase-js';

export function MemberAvatar({ client, name, path, className = '' }: {
  client: SupabaseClient; name: string; path?: string | null; className?: string;
}) {
  const url = path ? client.storage.from('community-avatars').getPublicUrl(path).data.publicUrl : null;
  return <span className={`member-avatar ${className}`} aria-label={`${name}'s avatar`}>
    {url ? <img src={url} alt="" loading="lazy" /> : <span>{(name || 'K').charAt(0).toUpperCase()}</span>}
  </span>;
}
