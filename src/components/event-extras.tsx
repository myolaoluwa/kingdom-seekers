'use client';
/* eslint-disable @next/next/no-img-element -- Event photos use private, expiring signed URLs. */

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';

export type EventMediaDetails = {
  id: string; starts_at: string; image_paths: string[]; attachment_path: string | null; attachment_name: string | null;
};

export function EventMedia({ client, event }: { client: SupabaseClient; event: EventMediaDetails }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const paths = useMemo(() => [...(event.image_paths || []), ...(event.attachment_path ? [event.attachment_path] : [])],
    [event.image_paths, event.attachment_path]);
  useEffect(() => {
    if (!paths.length) return;
    let active = true;
    void client.storage.from('event-media').createSignedUrls(paths, 3600).then(({ data }) => {
      if (active && data) setUrls(Object.fromEntries(data.map((item, index) => [paths[index], item.signedUrl])
        .filter((entry): entry is [string, string] => !!entry[1])));
    });
    return () => { active = false; };
  }, [client, paths]);
  if (!paths.length) return null;
  return <div className="event-media">
    {!!event.image_paths?.length && <div className="event-photo-grid">{event.image_paths.map((path, index) => urls[path]
      ? <a key={path} href={urls[path]} target="_blank" rel="noreferrer" aria-label={`Open event photo ${index + 1}`}><img src={urls[path]} alt={`Event photo ${index + 1}`} loading="lazy" /></a>
      : <span key={path} className="event-photo-loading">Loading photo…</span>)}</div>}
    {event.attachment_path && urls[event.attachment_path] && <a className="event-document" href={urls[event.attachment_path]} target="_blank" rel="noreferrer"><FileText size={17} /> {event.attachment_name || 'Open attachment'}</a>}
  </div>;
}

function dayKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function EventCalendar({ dates, selected, onSelect }: {
  dates: string[]; selected: string | null; onSelect: (date: string | null) => void;
}) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const eventDays = new Set(dates.map(value => dayKey(new Date(value))));
  const firstWeekday = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: firstWeekday + daysInMonth }, (_, index) => index < firstWeekday ? null : index - firstWeekday + 1);
  return <aside className="panel event-calendar" aria-label="Events calendar">
    <div className="event-calendar-heading"><div><span className="eyebrow">PLAN AHEAD</span><h3>Calendar</h3></div><div><button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={17} /></button><button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={17} /></button></div></div>
    <strong className="event-calendar-month">{month.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })}</strong>
    <div className="event-calendar-grid">{['M','T','W','T','F','S','S'].map((name, index) => <span className="event-weekday" key={index}>{name}</span>)}
      {cells.map((day, index) => day === null ? <span key={`blank-${index}`} /> : (() => {
        const key = dayKey(new Date(month.getFullYear(), month.getMonth(), day));
        const hasEvent = eventDays.has(key);
        return <button type="button" key={key} className={`${hasEvent ? 'has-event' : ''} ${selected === key ? 'selected' : ''}`} onClick={() => onSelect(selected === key ? null : key)} aria-label={`${day} ${month.toLocaleDateString('en-NG', { month: 'long' })}${hasEvent ? ', event scheduled' : ''}`}>{day}</button>;
      })())}</div>
    <p className="muted">Dates with a dot have an upcoming event. Tap a date to filter the list.</p>
    {selected && <button className="text-button" onClick={() => onSelect(null)}>Show all upcoming events</button>}
  </aside>;
}

export function eventDayKey(startsAt: string) { return dayKey(new Date(startsAt)); }
