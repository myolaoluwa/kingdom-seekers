'use client';
/* eslint-disable @next/next/no-img-element -- Private media uses expiring signed URLs and must bypass image optimization. */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BookOpen, FileText, Flag, ImagePlus, Mic, Paperclip, Reply, Send, Square, X } from 'lucide-react';
import { MemberAvatar } from './member-avatar';

type Message = {
  id: string; user_id: string; kind: string; body: string; status: string; created_at: string;
  reply_to: string | null; bible_reference: string | null; attachment_path: string | null;
  attachment_name: string | null; attachment_type: 'image' | 'file' | 'audio' | null;
};
type Card = { id: string; display_name: string; avatar_path: string | null };
type Reaction = { message_id: string; user_id: string; emoji: string };
const allowedTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav',
]);
const emojiChoices = ['❤️', '🙏', '🙌', '👍'];

export function CommunityChat({ client, userId }: { client: SupabaseClient; userId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [cards, setCards] = useState<Record<string, Card>>({});
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [kind, setKind] = useState('message');
  const [bibleReference, setBibleReference] = useState('');
  const [showBible, setShowBible] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const merge = useCallback((incoming: Message[], replace = false) => {
    setMessages(current => {
      const rows = replace ? incoming : [...current, ...incoming];
      const unique = [...new Map(rows.map(row => [row.id, row])).values()]
        .filter(row => row.status === 'approved')
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      messagesRef.current = unique;
      return unique;
    });
  }, []);

  const loadCards = useCallback(async (rows: Message[]) => {
    const ids = [...new Set(rows.map(row => row.user_id))];
    if (!ids.length) return;
    const { data } = await client.from('community_member_cards').select('id,display_name,avatar_path').in('id', ids);
    if (data) setCards(current => ({ ...current, ...Object.fromEntries((data as Card[]).map(card => [card.id, card])) }));
  }, [client]);

  const loadReactions = useCallback(async (rows: Message[]) => {
    if (!rows.length) return;
    const { data } = await client.from('community_reactions').select('message_id,user_id,emoji')
      .in('message_id', rows.map(row => row.id));
    if (data) setReactions(current => [
      ...current.filter(item => !rows.some(row => row.id === item.message_id)),
      ...(data as Reaction[]),
    ]);
  }, [client]);

  const loadLatest = useCallback(async (replace = false) => {
    const { data, error: loadError } = await client.from('community_posts').select('*')
      .eq('status', 'approved').order('created_at', { ascending: false }).limit(40);
    if (loadError) { setError(loadError.message); setLoading(false); return; }
    const rows = (data ?? []) as Message[];
    merge(rows, replace);
    if (replace) setHasOlder(rows.length === 40);
    await Promise.all([loadCards(rows), loadReactions(rows)]);
    setLoading(false);
    if (replace) requestAnimationFrame(() => listRef.current?.scrollTo(0, listRef.current.scrollHeight));
  }, [client, merge, loadCards, loadReactions]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadLatest(true); }, 0);
    const reconcile = window.setInterval(() => {
      void (async () => {
        const current = messagesRef.current;
        if (current.length) {
          const checked = new Set(current.map(item => item.id));
          const visible = new Set<string>();
          for (let index = 0; index < current.length; index += 100) {
            const { data, error: readError } = await client.from('community_posts').select('id')
              .eq('status', 'approved').in('id', current.slice(index, index + 100).map(item => item.id));
            if (readError) return;
            data?.forEach(item => visible.add(item.id));
          }
          setMessages(rows => {
            const filtered = rows.filter(row => !checked.has(row.id) || visible.has(row.id));
            messagesRef.current = filtered;
            return filtered;
          });
        }
        await loadLatest();
      })();
    }, 30_000);
    const channel = client.channel('community-room')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_posts' }, payload => {
        const row = payload.new as Message | undefined;
        if (row?.status === 'rejected') {
          setMessages(current => current.filter(item => item.id !== row.id));
        } else if (row?.id) {
          merge([row]);
          void loadCards([row]);
          window.setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 80);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_reactions' }, () => {
        void loadReactions(messagesRef.current);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_member_cards' }, () => {
        void loadCards(messagesRef.current);
      }).subscribe();
    return () => { window.clearTimeout(timer); window.clearInterval(reconcile); void client.removeChannel(channel); recorder.current?.stream.getTracks().forEach(track => track.stop()); };
  }, [client, loadLatest, loadCards, loadReactions, merge]);

  useEffect(() => {
    const paths = [...new Set(messages.map(message => message.attachment_path).filter((path): path is string => !!path))]
      .filter(path => !mediaUrls[path]);
    if (!paths.length) return;
    let active = true;
    void client.storage.from('community-media').createSignedUrls(paths, 3600).then(({ data }) => {
      if (active && data) setMediaUrls(current => ({ ...current,
        ...Object.fromEntries(data.map((item, index) => [paths[index], item.signedUrl] as const)
          .filter((entry): entry is readonly [string, string] => !!entry[1])),
      }));
    });
    return () => { active = false; };
  }, [client, messages, mediaUrls]);

  useEffect(() => {
    const timer = window.setInterval(() => setMediaUrls({}), 45 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function older() {
    const earliest = messages[0];
    if (!earliest) return;
    const { data, error: loadError } = await client.from('community_posts').select('*')
      .eq('status', 'approved').lt('created_at', earliest.created_at)
      .order('created_at', { ascending: false }).limit(40);
    if (loadError) { setError(loadError.message); return; }
    const rows = (data ?? []) as Message[];
    setHasOlder(rows.length === 40);
    merge(rows);
    await Promise.all([loadCards(rows), loadReactions(rows)]);
  }

  function pick(next?: File) {
    if (!next) return;
    if (!allowedTypes.has(next.type) || next.size > 10 * 1024 * 1024) {
      setError('Choose an image, PDF, text, Word, or audio file under 10 MB.'); return;
    }
    setFile(next); setError('');
  }

  async function record() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('Voice recording is unavailable in this browser.'); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(type => MediaRecorder.isTypeSupported(type));
      const media = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [];
      media.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      media.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const type = media.mimeType.split(';')[0] || 'audio/webm';
        const extension = type === 'audio/mp4' ? 'm4a' : type === 'audio/ogg' ? 'ogg' : 'webm';
        pick(new File(chunks, `Voice note.${extension}`, { type }));
        setRecording(false);
      };
      recorder.current = media;
      media.start(); setRecording(true); setError('');
    } catch { setError('Microphone access was not granted.'); }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if ((!body.trim() && !file) || busy) return;
    setBusy(true); setError('');
    let uploadedPath: string | null = null;
    try {
      if (file) {
        const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
        uploadedPath = `${userId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await client.storage.from('community-media')
          .upload(uploadedPath, file, { contentType: file.type });
        if (uploadError) throw uploadError;
      }
      const attachmentType = file?.type.startsWith('image/') ? 'image' : file?.type.startsWith('audio/') ? 'audio' : file ? 'file' : null;
      const { data, error: sendError } = await client.from('community_posts').insert({
        user_id: userId, kind, body: body.trim(), reply_to: replyTo?.id || null,
        bible_reference: bibleReference.trim() || null, attachment_path: uploadedPath,
        attachment_name: file?.name.slice(0, 160) || null, attachment_type: attachmentType,
      }).select('*').single();
      if (sendError) throw sendError;
      merge([data as Message]);
      setBody(''); setFile(null); setReplyTo(null); setBibleReference(''); setShowBible(false);
      await loadCards([data as Message]);
      window.setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 80);
    } catch (cause) {
      if (uploadedPath) await client.storage.from('community-media').remove([uploadedPath]);
      setError(cause instanceof Error ? cause.message : 'Could not send your message.');
    } finally { setBusy(false); }
  }

  async function react(messageId: string, emoji: string) {
    const own = reactions.find(item => item.message_id === messageId && item.user_id === userId);
    const result = own?.emoji === emoji
      ? await client.from('community_reactions').delete().eq('message_id', messageId).eq('user_id', userId)
      : await client.from('community_reactions').upsert({ message_id: messageId, user_id: userId, emoji });
    if (result.error) setError(result.error.message);
    else await loadReactions(messagesRef.current);
  }

  async function report(event: React.FormEvent, id: string) {
    event.preventDefault();
    const { error: reportError } = await client.from('reports').insert({
      reporter_id: userId, target_type: 'post', target_id: id, reason: reportReason.trim(),
    });
    if (reportError) setError(reportError.message);
    else { setReportId(null); setReportReason(''); }
  }

  return <section className="chat-room" aria-label="Community conversation">
    <header className="chat-header"><div className="chat-room-icon">KS</div><div><span className="eyebrow">KINGDOM SEEKERS</span><h2>Community conversation</h2><p>Talk, pray, and grow together. Everyone can join the conversation.</p></div><span className="chat-live">Live</span></header>
    <div className="chat-timeline" ref={listRef}>
      {hasOlder && <button className="chat-older" onClick={() => void older()}>Load earlier messages</button>}
      {loading && <p className="chat-system">Loading the conversation…</p>}
      {!loading && !messages.length && <div className="chat-empty"><BookOpen size={35} /><h3>Start the conversation</h3><p>Share a thought, prayer, or encouraging word with the community.</p></div>}
      {messages.map(message => {
        const card = cards[message.user_id];
        const mine = message.user_id === userId;
        const parent = message.reply_to ? messages.find(item => item.id === message.reply_to) : null;
        const grouped = reactions.filter(item => item.message_id === message.id);
        return <article key={message.id} className={`chat-message ${mine ? 'chat-message--mine' : ''}`}>
          {!mine && <MemberAvatar client={client} name={card?.display_name || 'Kingdom Seeker'} path={card?.avatar_path} />}
          <div className="chat-message-content">
            <div className="chat-bubble">
              <div className="chat-bubble-top"><strong>{mine ? 'You' : card?.display_name || 'Kingdom Seeker'}</strong><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</time></div>
              {parent && <div className="chat-quote"><Reply size={13} /><span>{parent.body.slice(0, 110) || parent.attachment_name || 'Attachment'}</span></div>}
              {message.kind !== 'message' && <span className={`chat-kind chat-kind--${message.kind}`}>{message.kind}</span>}
              {message.body && <p className="chat-text">{message.body}</p>}
              {message.bible_reference && <a className="chat-scripture" href={`https://www.biblegateway.com/passage/?search=${encodeURIComponent(message.bible_reference)}`} target="_blank" rel="noreferrer"><BookOpen size={14} /> {message.bible_reference}</a>}
              {message.attachment_path && <div className="chat-attachment">
                {!mediaUrls[message.attachment_path] ? <span className="muted">Loading attachment…</span>
                  : message.attachment_type === 'image' ? <a href={mediaUrls[message.attachment_path]} target="_blank" rel="noreferrer"><img src={mediaUrls[message.attachment_path]} alt={message.attachment_name || 'Shared image'} loading="lazy" /></a>
                    : message.attachment_type === 'audio' ? <audio controls preload="none" src={mediaUrls[message.attachment_path]} aria-label={message.attachment_name || 'Voice note'} />
                      : <a href={mediaUrls[message.attachment_path]} target="_blank" rel="noreferrer"><FileText size={18} /> {message.attachment_name || 'Open file'}</a>}
              </div>}
            </div>
            <div className="chat-actions"><button onClick={() => setReplyTo(message)} title="Reply"><Reply size={14} /> Reply</button>
              {emojiChoices.map(emoji => { const count = grouped.filter(item => item.emoji === emoji).length; return <button key={emoji} className={grouped.some(item => item.emoji === emoji && item.user_id === userId) ? 'selected' : ''} onClick={() => void react(message.id, emoji)} title={`React ${emoji}`}>{emoji}{count > 0 && <span>{count}</span>}</button>; })}
              {!mine && <button onClick={() => setReportId(reportId === message.id ? null : message.id)} title="Report message"><Flag size={14} /></button>}
            </div>
            {reportId === message.id && <form className="chat-report" onSubmit={event => void report(event, message.id)}><input required minLength={5} maxLength={1000} placeholder="Why are you reporting this?" value={reportReason} onChange={event => setReportReason(event.target.value)} /><button type="submit">Send report</button></form>}
          </div>
        </article>;
      })}
    </div>
    <form className="chat-composer" onSubmit={event => void send(event)}>
      {replyTo && <div className="chat-composer-extra"><Reply size={15} /> Replying to {cards[replyTo.user_id]?.display_name || 'a member'}: {replyTo.body.slice(0, 65)}<button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={15} /></button></div>}
      {file && <div className="chat-composer-extra"><Paperclip size={15} /> {file.name} ({Math.ceil(file.size / 1024)} KB)<button type="button" onClick={() => setFile(null)} aria-label="Remove attachment"><X size={15} /></button></div>}
      {showBible && <div className="chat-composer-extra"><BookOpen size={15} /><input aria-label="Bible reference" maxLength={80} placeholder="e.g. John 3:16" value={bibleReference} onChange={event => setBibleReference(event.target.value)} /><button type="button" onClick={() => { setShowBible(false); setBibleReference(''); }} aria-label="Remove Bible reference"><X size={15} /></button></div>}
      <div className="chat-composer-main"><select value={kind} onChange={event => setKind(event.target.value)} aria-label="Message type"><option value="message">Chat</option><option value="prayer">Prayer</option><option value="encouragement">Encouragement</option><option value="testimony">Testimony</option></select>
        <textarea value={body} maxLength={20000} rows={2} onChange={event => setBody(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (body.trim() || file) event.currentTarget.form?.requestSubmit(); } }} placeholder="Write to the community… Shift + Enter for a new line" aria-label="Your message" />
        <button className="chat-send" disabled={busy || (!body.trim() && !file)} type="submit" aria-label="Send message"><Send size={18} /></button></div>
      <div className="chat-tools"><button type="button" onClick={() => fileInput.current?.click()}><ImagePlus size={16} /> Photo or file</button><input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,.doc,.docx,audio/*" onChange={event => { pick(event.target.files?.[0]); event.target.value = ''; }} />
        <button type="button" onClick={() => { if (recording) recorder.current?.stop(); else void record(); }}>{recording ? <><Square size={15} /> Stop recording</> : <><Mic size={16} /> Voice note</>}</button>
        <button type="button" onClick={() => setShowBible(true)}><BookOpen size={16} /> Bible verse</button><span>{body.length.toLocaleString()} / 20,000</span></div>
      {error && <p className="chat-error" role="alert">{error}</p>}
    </form>
  </section>;
}
