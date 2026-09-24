'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarDays, FileText, ImagePlus, Send } from 'lucide-react';

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const documentTypes = new Set([
  'application/pdf', 'text/plain', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const maxFileSize = 10 * 1024 * 1024;

export function EventPublisher({ client, userId, onPublished }: {
  client: SupabaseClient; userId: string; onPublished: (notice: string) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [venue, setVenue] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState(100);
  const [images, setImages] = useState<File[]>([]);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function selectImages(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files);
    if (selected.length > 5 || selected.some(file => !imageTypes.has(file.type) || file.size > maxFileSize)) {
      setError('Choose up to five JPG, PNG, or WebP images, each under 10 MB.'); return;
    }
    setImages(selected); setError('');
  }

  function selectAttachment(file?: File) {
    if (!file) { setAttachment(null); return; }
    if (!documentTypes.has(file.type) || file.size > maxFileSize) {
      setError('Choose a PDF, text, or Word document under 10 MB.'); return;
    }
    setAttachment(file); setError('');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const date = new Date(startsAt);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
      setError('Choose a future event date and time.'); return;
    }
    setBusy(true); setError('');
    const id = crypto.randomUUID();
    const uploaded: string[] = [];
    let sentToServer = false;
    try {
      async function upload(file: File) {
        const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
        const path = `${userId}/${id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await client.storage.from('event-media').upload(path, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        uploaded.push(path);
        return path;
      }
      const imagePaths: string[] = [];
      for (const image of images) imagePaths.push(await upload(image));
      const attachmentPath = attachment ? await upload(attachment) : null;
      const { data: auth } = await client.auth.getSession();
      if (!auth.session) throw new Error('Please sign in again.');
      sentToServer = true;
      const response = await fetch('/api/events', {
        method: 'POST', headers: { Authorization: `Bearer ${auth.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title: title.trim(), description: description.trim(), startsAt: date.toISOString(),
          venue: venue.trim(), location: location.trim(), capacity, imagePaths, attachmentPath,
          attachmentName: attachment?.name.slice(0, 160) || null }),
      });
      const result = await response.json();
      if (!response.ok && !result.published) {
        sentToServer = false;
        throw new Error(result.error || 'Could not publish the event.');
      }
      setTitle(''); setDescription(''); setStartsAt(''); setVenue(''); setLocation('');
      setCapacity(100); setImages([]); setAttachment(null);
      const notice = result.warning || (result.subscribers === 0
        ? 'Event published. No members have enabled phone notifications yet.'
        : `Event published. Push was accepted for ${result.delivered} of ${result.subscribers} subscribed devices.`);
      await onPublished(notice);
    } catch (cause) {
      if (!sentToServer && uploaded.length) await client.storage.from('event-media').remove(uploaded);
      setError(sentToServer ? 'Could not confirm the result. Check Events before submitting again.'
        : cause instanceof Error ? cause.message : 'Could not publish the event.');
    } finally { setBusy(false); }
  }

  return <section className="panel form-panel event-publisher">
    <span className="eyebrow">GATHERINGS</span><h3>Create an upcoming event</h3>
    <p className="muted">Publishing adds the event to the calendar, announces it in the app, and immediately sends phone push to members who enabled it.</p>
    <form onSubmit={event => void submit(event)}>
      <label>Event title<input required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Kingdom Seekers prayer night" /></label>
      <label>Details<textarea required maxLength={5000} value={description} onChange={event => setDescription(event.target.value)} placeholder="What should members know before they come?" /></label>
      <div className="two-fields"><label><CalendarDays size={15} /> Date and time (your device time)<input required type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} /></label>
        <label>Capacity<input required type="number" min={1} max={100000} value={capacity} onChange={event => setCapacity(Number(event.target.value))} /></label></div>
      <div className="two-fields"><label>Venue<input required maxLength={200} value={venue} onChange={event => setVenue(event.target.value)} /></label>
        <label>City or location<input required maxLength={200} value={location} onChange={event => setLocation(event.target.value)} /></label></div>
      <div className="event-upload-grid"><label className="event-upload"><ImagePlus size={18} /><strong>Event images</strong><span>Up to 5 images, 10 MB each</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => selectImages(event.target.files)} /></label>
        <label className="event-upload"><FileText size={18} /><strong>Attachment</strong><span>PDF, text, or Word document</span><input type="file" accept=".pdf,.txt,.doc,.docx" onChange={event => selectAttachment(event.target.files?.[0])} /></label></div>
      {images.length > 0 && <p className="event-file-summary">{images.length} image{images.length === 1 ? '' : 's'} selected: {images.map(image => image.name).join(', ')}</p>}
      {attachment && <p className="event-file-summary">Attachment: {attachment.name}</p>}
      {error && <div className="form-message" role="alert">{error}</div>}
      <button className="button" disabled={busy} type="submit"><Send size={16} /> {busy ? 'Publishing event…' : 'Publish event and notify members'}</button>
    </form>
  </section>;
}
