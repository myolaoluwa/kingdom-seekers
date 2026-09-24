'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { ArrowRight, Bell, BookOpen, CalendarDays, Check, CheckCircle2, ChevronRight, Compass, Flag, HandHeart, Heart, Home, LogOut, Menu, Plus, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { compassPaths, compassQuestions, journeyDays } from '@/lib/content';
import socialLinks from '@/lib/social-links.json';
import { PushSettings } from '@/components/push-settings';
import { StaffAccess, StaffRequests } from '@/components/staff-access';
import { CommunityChat } from '@/components/community-chat';
import { MemberAvatar } from '@/components/member-avatar';
import { AvatarEditor } from '@/components/avatar-editor';
import { EventPublisher } from '@/components/event-publisher';
import { EventCalendar, EventMedia, eventDayKey } from '@/components/event-extras';

type Page = 'home' | 'journey' | 'prayer' | 'missions' | 'compass' | 'community' | 'events' | 'profile' | 'admin';
type Profile = { id: string; full_name: string; first_name: string; location: string; bio: string; interests: string[]; public_profile: boolean; onboarding_complete: boolean; avatar_path: string | null };
type Prayer = { id: string; user_id: string; body: string; category: string; visibility: 'anonymous' | 'first_name' | 'private'; display_name: string; status: string; prayer_count: number; created_at: string };
type Mission = { id: string; title: string; description: string; category: string; location: string; date_text: string; interest_tag: string; published: boolean };
type Event = { id: string; title: string; description: string; starts_at: string; ends_at: string | null; venue: string; location: string; capacity: number | null; published: boolean; image_paths: string[]; attachment_path: string | null; attachment_name: string | null };
type Post = { id: string; user_id: string; kind: string; body: string; status: string; created_at: string };
type Report = { id: string; target_type: string; target_id: string; reason: string; status: string; created_at: string };
type Notice = { id: string; title: string; body: string; created_at: string };
type Participation = { mission_id: string; status: string; reflection: string };
type Registration = { event_id: string; group_size: number };
type CompassResult = { path: string; answers: number[] };
type Journal = { id: string; body: string; day: number | null; created_at: string };
type Data = { profile: Profile | null; roles: string[]; compass: CompassResult | null; progress: number[]; journal: Journal[]; days: typeof journeyDays; prayers: Prayer[]; prayed: string[]; missions: Mission[]; participation: Participation[]; events: Event[]; registrations: Registration[]; posts: Post[]; reports: Report[]; notices: Notice[] };
const empty: Data = { profile: null, roles: [], compass: null, progress: [], journal: [], days: journeyDays, prayers: [], prayed: [], missions: [], participation: [], events: [], registrations: [], posts: [], reports: [], notices: [] };
const nav: { id: Page; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home }, { id: 'journey', label: 'Journey', icon: BookOpen },
  { id: 'prayer', label: 'Pray', icon: Heart }, { id: 'missions', label: 'Missions', icon: HandHeart }, { id: 'compass', label: 'Compass', icon: Compass },
];
const more: { id: Page; label: string; icon: typeof Home }[] = [
  { id: 'community', label: 'Community', icon: Users }, { id: 'events', label: 'Events', icon: CalendarDays },
  { id: 'profile', label: 'My profile', icon: Sparkles }, { id: 'admin', label: 'Staff studio', icon: ShieldCheck },
];
const EMAIL_OTP_LENGTH = 8;
const date = (value: string) => new Date(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

export default function App() {
  const db = useMemo(() => supabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(db));
  const [now] = useState(() => Date.now());
  const [data, setData] = useState<Data>(empty);
  const [page, setPage] = useState<Page>('home');
  const [menu, setMenu] = useState(false);
  const [message, setMessage] = useState('');
  const [dataError, setDataError] = useState('');
  const [busy, setBusy] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const load = useCallback(async (client: SupabaseClient, userId: string) => {
    setLoading(true);
    setDataError('');
    const [profile, roles, compass, progress, journal, days, prayers, prayed, missions, participation, events, registrations, posts, reports, notices] = await Promise.all([
      client.from('profiles').select('*').eq('id', userId).maybeSingle(),
      client.from('staff_roles').select('role').eq('user_id', userId),
      client.from('compass_results').select('path,answers').eq('user_id', userId).maybeSingle(),
      client.from('journey_progress').select('day').eq('user_id', userId),
      client.from('journal_entries').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      client.from('journey_days').select('*').order('day'),
      client.from('prayer_requests').select('*').order('created_at', { ascending: false }),
      client.from('prayer_responses').select('request_id').eq('user_id', userId),
      client.from('missions').select('*').order('created_at', { ascending: false }),
      client.from('mission_participation').select('mission_id,status,reflection').eq('user_id', userId),
      client.from('events').select('*').order('starts_at', { ascending: true }),
      client.from('event_registrations').select('event_id,group_size').eq('user_id', userId),
      client.from('community_posts').select('*').order('created_at', { ascending: false }).limit(100),
      client.from('reports').select('*').order('created_at', { ascending: false }),
      client.from('notifications').select('*').order('created_at', { ascending: false }).limit(8),
    ]);
    const failures = [profile, roles, compass, progress, journal, days, prayers, prayed, missions, participation, events, registrations, posts, reports, notices].filter(r => r.error);
    if (failures.length) {
      setDataError(failures[0].error?.message || 'The database could not load.');
      setLoading(false);
      return;
    }
    setData({
      profile: profile.data as Profile | null, roles: (roles.data ?? []).map(r => r.role), compass: compass.data as CompassResult | null,
      progress: (progress.data ?? []).map(r => r.day), journal: (journal.data ?? []) as Journal[], days: days.data?.length ? days.data as typeof journeyDays : journeyDays, prayers: (prayers.data ?? []) as Prayer[],
      prayed: (prayed.data ?? []).map(r => r.request_id), missions: (missions.data ?? []) as Mission[], participation: (participation.data ?? []) as Participation[],
      events: (events.data ?? []) as Event[], registrations: (registrations.data ?? []) as Registration[], posts: (posts.data ?? []) as Post[],
      reports: (reports.data ?? []) as Report[], notices: (notices.data ?? []) as Notice[],
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!db) return;
    db.auth.getSession().then(async ({ data: result }) => {
      setSession(result.session);
      if (result.session) return void load(db, result.session.user.id);
      const { error } = await db.from('journey_days').select('day').limit(1);
      if (error) setDataError(error.message);
      setLoading(false);
    }).catch(error => { setDataError(error instanceof Error ? error.message : 'Could not restore your session.'); setLoading(false); });
    const { data: subscription } = db.auth.onAuthStateChange((event, next) => {
      if (event === 'INITIAL_SESSION') return;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setSession(next);
      if (next) { setLoading(true); setTimeout(() => void load(db, next.user.id), 0); }
      else { setData(empty); setDataError(''); setLoading(false); }
    });
    return () => subscription.subscription.unsubscribe();
  }, [db, load]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('view') === 'events') {
      const timer = window.setTimeout(() => setPage('events'), 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  async function run(work: () => PromiseLike<{ error?: { message: string } | null }>, success: string) {
    if (!db || !session || busy) return;
    setBusy(true); setMessage('');
    try {
      const result = await work();
      if (result.error) setMessage(result.error.message);
      else { setMessage(success); await load(db, session.user.id); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }

  function open(next: Page) { setPage(next); setMenu(false); setMessage(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  if (!db) return <div className="setup-screen"><Image src="/logo.png" alt="Kingdom Seekers" width={180} height={180} /><h1>Set up The Seekers’ Hub</h1><p>Add your Supabase project URL and publishable key to <code>.env.local</code>, then apply the V1 migration. See the README for steps.</p></div>;
  if (passwordRecovery) return <PasswordRecovery client={db} done={() => setPasswordRecovery(false)} />;
  if (loading) return <div className="loading-screen"><span className="loader" /><p>Preparing your journey…</p></div>;
  if (dataError) return <div className="setup-screen" role="alert"><Image src="/logo.png" alt="Kingdom Seekers" width={180} height={180} /><h1>We couldn’t load your journey</h1><p>{dataError}</p><p>Please try again shortly. If the problem continues, contact the Kingdom Seekers team.</p><button className="button" onClick={() => { if (session) void load(db, session.user.id); else window.location.reload(); }}>Try again</button><button className="text-button" onClick={() => void db.auth.signOut()}>Sign out</button></div>;
  if (!session) return <Auth client={db} mode={authMode} setMode={setAuthMode} />;
  if (!data.profile?.onboarding_complete) return <Onboarding client={db} userId={session.user.id} profile={data.profile} refresh={() => load(db, session.user.id)} />;

  const firstName = data.profile.first_name || session.user.email?.split('@')[0] || 'Seeker';
  const nextDay = data.days.find(item => !data.progress.includes(item.day));
  const publicPrayers = data.prayers.filter(p => p.status === 'approved' && p.visibility !== 'private');
  const suggestedMission = data.missions.find(m => m.interest_tag === data.compass?.path && !data.participation.some(p => p.mission_id === m.id)) || data.missions[0];
  const nextEvent = data.events.find(e => e.published && new Date(e.starts_at).getTime() > now);
  const staff = data.roles.length > 0;

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => open('home')} aria-label="Go home"><Image src="/logo.png" alt="Kingdom Seekers" width={46} height={46} /><span>THE SEEKERS’ HUB<small>Your journey, together.</small></span></button>
      <div className="nav-heading">YOUR SPACE</div>
      <nav>{nav.map(item => <NavButton key={item.id} {...item} active={page === item.id} onClick={() => open(item.id)} />)}</nav>
      <div className="nav-heading more-heading">EXPLORE</div>
      <nav>{more.filter(item => item.id !== 'admin' || staff).map(item => <NavButton key={item.id} {...item} active={page === item.id} onClick={() => open(item.id)} />)}</nav>
      <div className="sidebar-bottom"><MemberAvatar client={db} name={firstName} path={data.profile.avatar_path} /><span><strong>{firstName}</strong><small>Kingdom Seeker</small></span><button className="icon-button" title="Sign out" onClick={() => db.auth.signOut()}><LogOut size={18} /></button></div>
    </aside>
    <div className="main-wrap">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMenu(true)} aria-label="Open menu"><Menu /></button><span className="breadcrumb">THE SEEKERS’ HUB <ChevronRight size={14} /> {page.toUpperCase()}</span><div className="top-actions"><span className="today-date">{new Date().toLocaleDateString('en-NG', { weekday: 'long', month: 'long', day: 'numeric' })}</span><button className="icon-button" aria-label="Notifications" onClick={() => { open('home'); document.getElementById('notices')?.scrollIntoView(); }}><Bell size={19} /></button><button className="top-avatar" onClick={() => open('profile')} aria-label="Open profile"><MemberAvatar client={db} name={firstName} path={data.profile.avatar_path} /></button></div></header>
      {menu && <div className="drawer-backdrop" onClick={() => setMenu(false)}><div className="drawer" onClick={event => event.stopPropagation()}><button className="icon-button drawer-close" onClick={() => setMenu(false)}><X /></button><Image className="drawer-logo" src="/logo.png" alt="Kingdom Seekers" width={110} height={80} />{[...nav, ...more.filter(item => item.id !== 'admin' || staff)].map(item => <NavButton key={item.id} {...item} active={page === item.id} onClick={() => open(item.id)} />)}<button className="text-button" onClick={() => db.auth.signOut()}>Sign out</button></div></div>}
      <main className="content">
        {message && <div role="status" className="toast"><span>{message}</span><button onClick={() => setMessage('')} aria-label="Dismiss"><X size={16} /></button></div>}
        {page === 'home' && <>
          <div className="eyebrow">YOUR SPACE TO GROW</div><h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {firstName}<span className="period">.</span></h1><p className="page-lead">One meaningful step at a time. Here’s where your journey can go today.</p>
          <div className="hero"><div><span className="hero-kicker"><Sparkles size={15} /> YOUR NEXT STEP</span><h2>{!data.compass ? 'Discover where you can serve.' : nextDay ? nextDay.title : 'Keep your journey moving.'}</h2><p>{!data.compass ? 'Take a short reflection to explore your interests and possible service pathways.' : nextDay ? `Day ${nextDay.day} · ${nextDay.scripture} · ${nextDay.action}` : 'You completed the seven-day journey. Find someone to pray for or explore a mission.'}</p><button className="button light" onClick={() => open(!data.compass ? 'compass' : nextDay ? 'journey' : 'prayer')}>{!data.compass ? 'Explore your Compass' : nextDay ? 'Continue the journey' : 'Visit Prayer Exchange'} <ArrowRight size={17} /></button></div><div className="hero-art"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><Compass size={118} strokeWidth={0.8} /></div></div>
          <div className="section-title"><div><span className="eyebrow">THE JOURNEY</span><h2>What matters today</h2></div><span className="subtle">Discover → Grow → Pray → Serve</span></div>
          <div className="quick-grid"><Quick icon={BookOpen} tone="rose" label="GROW" title={nextDay ? `Day ${nextDay.day}: ${nextDay.title}` : 'Journey complete'} body={nextDay?.scripture || 'Keep building on what you learned.'} cta="Open journey" onClick={() => open('journey')} /><Quick icon={Heart} tone="cream" label="PRAY" title="Pray for someone" body={`${publicPrayers.length} prayer ${publicPrayers.length === 1 ? 'request' : 'requests'} in the exchange`} cta="Find a request" onClick={() => open('prayer')} /><Quick icon={HandHeart} tone="peach" label="SERVE" title={suggestedMission?.title || 'Find a mission'} body={suggestedMission?.location || 'Put faith into action.'} cta="Explore missions" onClick={() => open('missions')} /></div>
          <div className="home-lower"><div className="panel"><div className="panel-heading"><div><span className="eyebrow">YOUR PROGRESS</span><h3>A journey worth continuing</h3></div><BookOpen className="muted-icon" size={23} /></div><p className="muted">Small steps count. Your progress is personal to you.</p><div className="progress-line"><span style={{ width: `${data.progress.length / 7 * 100}%` }} /></div><div className="progress-caption"><strong>{data.progress.length} of 7 days</strong><span>{Math.round(data.progress.length / 7 * 100)}% complete</span></div><div className="milestones"><span><Heart size={16} /> {data.prayed.length} prayers offered</span><span><HandHeart size={16} /> {data.participation.filter(p => p.status === 'completed').length} missions completed</span></div></div><div className="panel event-panel"><div className="panel-heading"><div><span className="eyebrow">COMING TOGETHER</span><h3>Upcoming gathering</h3></div><CalendarDays className="muted-icon" size={23} /></div>{nextEvent ? <><div className="event-date">{date(nextEvent.starts_at)}</div><h4>{nextEvent.title}</h4><p>{nextEvent.location}</p><button className="link-button" onClick={() => open('events')}>View event <ArrowRight size={16} /></button></> : <p className="muted">New gatherings will appear here soon.</p>}</div></div>
          <div className="panel notices" id="notices"><div className="panel-heading"><div><span className="eyebrow">STAY CONNECTED</span><h3>Announcements</h3></div><Bell size={20} /></div>{data.notices.length ? data.notices.map(n => <div className="notice" key={n.id}><strong>{n.title}</strong><p>{n.body}</p></div>) : <p className="muted">No announcements yet.</p>}</div>
          <PushSettings client={db} userId={session.user.id} />
        </>}
        {page === 'journey' && <Journey data={data} nextDay={nextDay} busy={busy} run={run} db={db} userId={session.user.id} />}
        {page === 'compass' && <CompassPage data={data} busy={busy} run={run} db={db} userId={session.user.id} open={open} />}
        {page === 'prayer' && <PrayerPage data={data} busy={busy} run={run} db={db} userId={session.user.id} />}
        {page === 'missions' && <MissionsPage data={data} busy={busy} run={run} db={db} userId={session.user.id} />}
        {page === 'community' && <CommunityPage data={data} busy={busy} run={run} db={db} userId={session.user.id} />}
        {page === 'events' && <EventsPage data={data} busy={busy} run={run} db={db} userId={session.user.id} />}
        {page === 'profile' && <ProfilePage data={data} busy={busy} run={run} db={db} userId={session.user.id} email={session.user.email || ''} refresh={() => load(db, session.user.id)} />}
        {page === 'admin' && staff && <AdminPage data={data} busy={busy} run={run} db={db} userId={session.user.id} onPublished={async notice => { await load(db, session.user.id); setPage('events'); setMessage(notice); }} />}
      </main>
      <SocialLinks placement="dashboard" />
    </div>
    <nav className="bottom-nav">{nav.map(item => <button key={item.id} onClick={() => open(item.id)} className={page === item.id ? 'active' : ''}><item.icon size={20} /><span>{item.label}</span></button>)}<button onClick={() => setMenu(true)}><Menu size={20} /><span>More</span></button></nav>
  </div>;
}

function NavButton({ label, icon: Icon, active, onClick }: { id: Page; label: string; icon: typeof Home; active: boolean; onClick: () => void }) { return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}><Icon size={19} strokeWidth={active ? 2.2 : 1.8} />{label}{active && <span className="nav-dot" />}</button>; }
function Quick({ icon: Icon, tone, label, title, body, cta, onClick }: { icon: typeof Home; tone: string; label: string; title: string; body: string; cta: string; onClick: () => void }) { return <div className={`quick-card ${tone}`}><div className="quick-icon"><Icon size={22} /></div><span className="eyebrow">{label}</span><h3>{title}</h3><p>{body}</p><button className="link-button" onClick={onClick}>{cta} <ArrowRight size={16} /></button></div>; }
function Heading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) { return <div className="page-heading"><span className="eyebrow">{eyebrow}</span><h1>{title}<span className="period">.</span></h1><p className="page-lead">{lead}</p></div>; }
function Submit({ children, busy, className = '' }: { children: React.ReactNode; busy: boolean; className?: string }) { return <button disabled={busy} type="submit" className={`button ${className}`}>{children}<ArrowRight size={17} /></button>; }

function SocialLinks({ placement }: { placement: 'auth' | 'dashboard' | 'card' }) {
  return <footer className={`social-footer social-footer--${placement}`}>
    <span className="social-footer-label">FOLLOW THE JOURNEY</span>
    <nav aria-label="Kingdom Seekers social media">
      {socialLinks.map(link => <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`Kingdom Seekers on ${link.name}`}><Image src={`/social/${link.icon}`} width={18} height={18} alt="" />{link.name}</a>)}
    </nav>
  </footer>;
}

function Auth({ client, mode, setMode }: { client: SupabaseClient; mode: 'login' | 'signup'; setMode: (mode: 'login' | 'signup') => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'form' | 'signup-code' | 'recovery-email' | 'recovery-code'>('form');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function requestReset(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const { error: resetError } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setBusy(false);
    if (resetError) setError(resetError.message);
    else { setStage('recovery-code'); setNotice('If this address has an account, a verification code is on its way.'); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    if (mode === 'signup' && password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const result = mode === 'signup'
      ? await client.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() } } })
      : await client.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else if (mode === 'signup' && !result.data.session) {
      setPassword(''); setConfirmPassword(''); setCode(''); setStage('signup-code');
      setNotice('We sent a confirmation code to your email address.');
    }
  }
  async function verifyCode(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    const result = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: stage === 'signup-code' ? 'signup' : 'recovery' });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else if (!result.data.session) setError('The code could not be verified. Request a new one.');
  }
  async function resendCode() {
    setBusy(true); setError(''); setNotice('');
    const result = stage === 'signup-code'
      ? await client.auth.resend({ type: 'signup', email: email.trim() })
      : await client.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (result.error) setError(result.error.message);
    else setNotice('A new code has been requested. Check your email.');
  }
  if (stage !== 'form') {
    const isSignup = stage === 'signup-code';
    return <div className="onboard-screen"><div className="onboard-card"><Image src="/logo.png" alt="Kingdom Seekers" width={100} height={80} /><span className="eyebrow">{isSignup ? 'CONFIRM YOUR ACCOUNT' : 'ACCOUNT RECOVERY'}</span><h1>{stage === 'recovery-email' ? 'Reset your password' : 'Enter your email code'}</h1><p>{stage === 'recovery-email' ? 'We’ll email a code if this address has an account.' : email.trim() ? `Enter the code sent to ${email.trim()}.` : 'Enter your email address and the code we sent you.'}</p>
      {stage === 'recovery-email' ? <form onSubmit={requestReset}><label>Email address<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>{error && <div className="form-message" role="alert">{error}</div>}<Submit busy={busy}>Send reset code</Submit></form>
        : <form onSubmit={verifyCode}><label>Email address<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label><label>Verification code<input required inputMode="numeric" pattern={`[0-9]{${EMAIL_OTP_LENGTH}}`} maxLength={EMAIL_OTP_LENGTH} autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, EMAIL_OTP_LENGTH))} placeholder={`${EMAIL_OTP_LENGTH}-digit code`} /></label>{notice && <div className="form-message" role="status">{notice}</div>}{error && <div className="form-message" role="alert">{error}</div>}<Submit busy={busy}>Verify code</Submit></form>}
      {stage !== 'recovery-email' && <button className="text-button" disabled={busy || !email.trim()} onClick={() => void resendCode()}>Send a new code</button>}
      <button className="text-button" onClick={() => { setStage('form'); setCode(''); setError(''); setNotice(''); setMode('login'); }}>Back to sign in</button><SocialLinks placement="card" /></div></div>;
  }
  return <div className="auth-screen"><div className="auth-story"><Image src="/logo.png" alt="Kingdom Seekers" width={160} height={100} /><div><span className="eyebrow">THE SEEKERS’ HUB</span><h1>Every journey begins with a step.</h1><p>Discover your path. Grow in faith. Pray for others. Serve with purpose.</p><div className="auth-cycle">DISCOVER <span>→</span> GROW <span>→</span> PRAY <span>→</span> SERVE</div></div></div><div className="auth-form-wrap"><div className="auth-form"><span className="eyebrow">WELCOME {mode === 'signup' ? 'TO THE JOURNEY' : 'BACK'}</span><h2>{mode === 'signup' ? 'Find your place here.' : 'Continue your journey.'}</h2><p>{mode === 'signup' ? 'Create an account to take your first step.' : 'Sign in to pick up where you left off.'}</p><form onSubmit={submit}>{mode === 'signup' && <label>Your name<input required minLength={2} value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" /></label>}<label>Email address<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label><label>Password<input required minLength={8} type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>{mode === 'signup' && <label>Confirm password<input required minLength={8} type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Enter your password again" /></label>}{error && <div className="form-message" role="alert">{error}</div>}<Submit busy={busy}>{mode === 'signup' ? 'Create account' : 'Sign in'}</Submit></form>{mode === 'login' && <><button className="text-button" onClick={() => { setStage('recovery-email'); setError(''); }}>Forgot password?</button><button className="text-button" onClick={() => { setStage('signup-code'); setError(''); setCode(''); }}>Enter a confirmation code</button></>}<p className="auth-switch">{mode === 'signup' ? 'Already have an account?' : 'New to The Seekers’ Hub?'} <button onClick={() => { setError(''); setMode(mode === 'signup' ? 'login' : 'signup'); }}>{mode === 'signup' ? 'Sign in' : 'Create an account'}</button></p></div><SocialLinks placement="auth" /></div></div>;
}

function PasswordRecovery({ client, done }: { client: SupabaseClient; done: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const result = await client.auth.updateUser({ password });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else done();
  }
  return <div className="onboard-screen"><div className="onboard-card"><Image src="/logo.png" alt="Kingdom Seekers" width={100} height={80} /><span className="eyebrow">ACCOUNT RECOVERY</span><h1>Choose a new password</h1><form onSubmit={submit}><label>New password<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label><label>Confirm new password<input required minLength={8} type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>{error && <div className="form-message" role="alert">{error}</div>}<Submit busy={busy}>Save password</Submit></form><SocialLinks placement="card" /></div></div>;
}

function Onboarding({ client, userId, profile, refresh }: { client: SupabaseClient; userId: string; profile: Profile | null; refresh: () => Promise<void> }) {
  const [step, setStep] = useState(0); const [name, setName] = useState(profile?.full_name || ''); const [location, setLocation] = useState(profile?.location || ''); const [interests, setInterests] = useState<string[]>(profile?.interests || []); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function finish() { setBusy(true); setError(''); const { error } = await client.from('profiles').update({ full_name: name.trim(), first_name: name.trim().split(/\s+/)[0], location: location.trim(), interests, onboarding_complete: true }).eq('id', userId); setBusy(false); if (error) setError(error.message); else await refresh(); }
  return <div className="onboard-screen"><div className="onboard-card"><Image src="/logo.png" alt="Kingdom Seekers" width={100} height={80} /><div className="steps"><span className={step === 0 ? 'active' : ''} /><span className={step === 1 ? 'active' : ''} /><span className={step === 2 ? 'active' : ''} /></div>{step === 0 && <><span className="eyebrow">STEP 01 · WELCOME</span><h1>Welcome to your journey.</h1><p>Discover. Grow. Pray. Serve. Impact. We’ll help you take one meaningful step at a time.</p><button className="button" onClick={() => setStep(1)}>Get started <ArrowRight size={17} /></button></>}{step === 1 && <><span className="eyebrow">STEP 02 · ABOUT YOU</span><h1>Let’s get acquainted.</h1><p>What should we call you? Your location helps us highlight nearby opportunities.</p><label>Your name<input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" /></label><label>Location <span className="optional">optional</span><input value={location} onChange={e => setLocation(e.target.value)} placeholder="City, state" /></label><button className="button" disabled={!name.trim()} onClick={() => setStep(2)}>Continue <ArrowRight size={17} /></button></>}{step === 2 && <><span className="eyebrow">STEP 03 · YOUR FOCUS</span><h1>What matters to you?</h1><p>Choose any areas you’d like to explore. You can change these later.</p><div className="choice-grid">{['Spiritual Growth','Prayer','Purpose','Service','Community','Events'].map(item => <button key={item} className={interests.includes(item) ? 'selected' : ''} onClick={() => setInterests(old => old.includes(item) ? old.filter(x => x !== item) : [...old, item])}>{item}{interests.includes(item) && <Check size={16} />}</button>)}</div>{error && <div className="form-message">{error}</div>}<button className="button" disabled={busy} onClick={finish}>Begin your journey <ArrowRight size={17} /></button></>}</div></div>;
}

type SectionProps = { data: Data; busy: boolean; run: (work: () => PromiseLike<{ error?: { message: string } | null }>, success: string) => Promise<void>; db: SupabaseClient; userId: string };

function Journey({ data, nextDay, busy, run, db, userId }: SectionProps & { nextDay?: typeof journeyDays[number] }) {
  const [reflection, setReflection] = useState('');
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const selected = data.days.find(d => d.day === (activeDay || nextDay?.day || 7))!;
  return <><Heading eyebrow="REVIVAL JOURNEY" title="Grow, one day at a time" lead="Seven thoughtful days of Scripture, prayer, reflection and action. Your progress is just for you." />
    <div className="journey-overview panel"><div><span className="eyebrow">YOUR SEVEN-DAY JOURNEY</span><h2>{nextDay ? `Day ${nextDay.day} of 7` : 'Journey completed'}</h2><p>{nextDay ? 'Every step helps build a life of purpose.' : 'Well done. Revisit any day and keep practicing what you learned.'}</p></div><div className="progress-ring" style={{ background: `conic-gradient(#a94a32 ${data.progress.length / 7 * 100}%, #efded6 0)` }}><span>{Math.round(data.progress.length / 7 * 100)}%</span></div></div>
    <div className="day-strip">{data.days.map(item => <button key={item.day} onClick={() => setActiveDay(item.day)} className={`${data.progress.includes(item.day) ? 'done' : ''} ${selected.day === item.day ? 'current' : ''}`}><span>{data.progress.includes(item.day) ? <Check size={16} /> : item.day}</span><small>Day {item.day}</small></button>)}</div>
    <div className="panel focus-panel"><span className="eyebrow">DAY {selected.day} · TODAY’S FOCUS</span><h2>{selected.title}</h2><div className="scripture"><BookOpen size={18} /><span>Read {selected.scripture} in your Bible or Bible app.</span></div><div className="focus-split"><div><span className="eyebrow">REFLECT</span><p>{selected.prompt}</p></div><div><span className="eyebrow">TAKE ACTION</span><p>{selected.action}</p></div></div>{!data.progress.includes(selected.day) && nextDay?.day === selected.day && <button className="button" disabled={busy} onClick={() => run(() => db.from('journey_progress').insert({ user_id: userId, day: selected.day }), 'Day marked complete. Keep going!')}>Mark day complete <Check size={17} /></button>}{!data.progress.includes(selected.day) && nextDay?.day !== selected.day && <span className="muted">Complete the earlier days to unlock this step.</span>}{data.progress.includes(selected.day) && <span className="complete-note"><CheckCircle2 size={18} /> Completed</span>}</div>
    <div className="panel journal-panel"><span className="eyebrow">PRIVATE REFLECTION</span><h3>Your journal</h3><p className="muted">Only you can read these entries.</p><form onSubmit={event => { event.preventDefault(); if (reflection.trim()) void run(async () => { const result = await db.from('journal_entries').insert({ user_id: userId, day: selected.day, body: reflection.trim() }); if (!result.error) setReflection(''); return result; }, 'Reflection saved privately.'); }}><textarea required minLength={1} maxLength={5000} value={reflection} onChange={e => setReflection(e.target.value)} placeholder="What stood out to you today?" /><Submit busy={busy}>Save reflection</Submit></form>{data.journal.length > 0 && <div className="journal-list">{data.journal.map(entry => <div key={entry.id}><small>{date(entry.created_at)} {entry.day ? `· Day ${entry.day}` : ''}</small><p>{entry.body}</p></div>)}</div>}</div>
  </>;
}

function CompassPage({ data, busy, run, db, userId, open }: SectionProps & { open: (page: Page) => void }) {
  const [answers, setAnswers] = useState<number[]>([]);
  const [question, setQuestion] = useState(0);
  const [retake, setRetake] = useState(false);
  const result = compassPaths.find(p => p.tag === data.compass?.path);
  const recommended = data.missions.filter(m => m.interest_tag === data.compass?.path).slice(0, 2);
  function choose(index: number) { const next = [...answers]; next[question] = index; setAnswers(next); }
  async function finish() { const scores = [0, 0, 0, 0]; answers.forEach(index => { scores[index] += 1; }); const winner = scores.indexOf(Math.max(...scores)); await run(() => db.from('compass_results').upsert({ user_id: userId, answers, path: compassPaths[winner].tag }), 'Your Compass is ready. These are possibilities to explore, not labels that define you.'); setRetake(false); }
  return <><Heading eyebrow="KINGDOM COMPASS" title="Discover your direction" lead="Reflect on what brings you joy and where you might enjoy serving. Your result is guidance, not a fixed calling." />{result && !retake ? <><div className="compass-result panel"><div className="result-icon"><Compass size={42} /></div><span className="eyebrow">YOUR COMPASS PATHWAY</span><h2>{result.name}</h2><p>{result.description}</p><span className="result-disclaimer">A place to begin exploring, never a verdict on your gifts.</span><button className="text-button" onClick={() => { setAnswers([]); setQuestion(0); setRetake(true); }}>Retake the reflection</button></div><div className="section-title"><div><span className="eyebrow">PUT IT INTO PRACTICE</span><h2>Suggested next steps</h2></div></div><div className="quick-grid">{recommended.map(m => <Quick key={m.id} icon={HandHeart} tone="peach" label="MISSION" title={m.title} body={m.description} cta="View mission" onClick={() => open('missions')} />)}<Quick icon={Heart} tone="cream" label="PRAYER" title="Pray with the community" body="There may be someone waiting for your encouragement today." cta="Visit Prayer Exchange" onClick={() => open('prayer')} /></div></> : <div className="question-card panel"><div className="question-progress"><span>QUESTION {question + 1} OF {compassQuestions.length}</span><div className="progress-line"><span style={{ width: `${(question + 1) / compassQuestions.length * 100}%` }} /></div></div><h2>{compassQuestions[question].prompt}</h2><div className="answer-list">{compassQuestions[question].options.map((option, index) => <button key={option} className={answers[question] === index ? 'selected' : ''} onClick={() => choose(index)}><span className="answer-letter">{String.fromCharCode(65 + index)}</span>{option}{answers[question] === index && <Check size={18} />}</button>)}</div><div className="question-actions">{question > 0 && <button className="text-button" onClick={() => setQuestion(question - 1)}>Back</button>}<button className="button" disabled={busy || answers[question] === undefined} onClick={() => { if (question < compassQuestions.length - 1) setQuestion(question + 1); else void finish(); }}>{question < compassQuestions.length - 1 ? 'Continue' : 'See my Compass'} <ArrowRight size={17} /></button></div></div>}</>;
}

function PrayerPage({ data, busy, run, db, userId }: SectionProps) {
  const [tab, setTab] = useState<'exchange' | 'mine'>('exchange'); const [body, setBody] = useState(''); const [category, setCategory] = useState('General'); const [visibility, setVisibility] = useState<'anonymous' | 'first_name' | 'private'>('anonymous'); const [showForm, setShowForm] = useState(false); const [reportId, setReportId] = useState<string | null>(null); const [reason, setReason] = useState('');
  const list = tab === 'mine' ? data.prayers.filter(p => p.user_id === userId) : data.prayers.filter(p => p.status === 'approved' && p.visibility !== 'private' && p.user_id !== userId);
  return <><Heading eyebrow="PRAYER EXCHANGE" title="Be there for someone" lead="A quiet place to ask for prayer and to lift others up. Each request is reviewed before it appears publicly." /><div className="action-bar"><div className="tabs"><button className={tab === 'exchange' ? 'active' : ''} onClick={() => setTab('exchange')}>Prayer exchange</button><button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>My requests</button></div><button className="button" onClick={() => setShowForm(!showForm)}><Plus size={17} /> Request prayer</button></div>
    {showForm && <div className="panel form-panel"><div className="panel-heading"><h3>Share a prayer request</h3><button className="icon-button" onClick={() => setShowForm(false)}><X size={18} /></button></div><p className="muted">Please avoid names or details that identify someone else. Private requests are visible only to authorized prayer staff.</p><form onSubmit={event => { event.preventDefault(); void run(async () => { const result = await db.from('prayer_requests').insert({ user_id: userId, body: body.trim(), category, visibility }); if (!result.error) { setBody(''); setShowForm(false); setTab('mine'); } return result; }, 'Request submitted for review.'); }}><label>What would you like prayer for?<textarea required minLength={10} maxLength={2000} value={body} onChange={e => setBody(e.target.value)} placeholder="Share only what you feel comfortable sharing…" /></label><div className="two-fields"><label>Category<select value={category} onChange={e => setCategory(e.target.value)}>{['General','Family','Health','Work','Faith','Gratitude','Other'].map(c => <option key={c}>{c}</option>)}</select></label><label>Visibility<select value={visibility} onChange={e => setVisibility(e.target.value as typeof visibility)}><option value="anonymous">Anonymous</option><option value="first_name">First name only</option><option value="private">Private prayer team</option></select></label></div><Submit busy={busy}>Submit request</Submit></form></div>}
    <div className="prayer-grid">{list.length ? list.map(prayer => <div className="panel prayer-card" key={prayer.id}><div className="card-meta"><span className="tag">{prayer.category}</span><span>{date(prayer.created_at)}</span></div><h3>{prayer.visibility === 'first_name' ? prayer.display_name || 'A seeker' : 'A Kingdom Seeker'} asks for prayer</h3><p>{prayer.body}</p><div className="prayer-foot"><span><Heart size={17} /> {prayer.prayer_count} prayed</span>{tab === 'mine' ? <span className={`status ${prayer.status}`}>{prayer.status}</span> : <button className="small-button" disabled={busy || data.prayed.includes(prayer.id)} onClick={() => run(() => db.from('prayer_responses').insert({ request_id: prayer.id, user_id: userId }), 'Thank you for praying.')}>{data.prayed.includes(prayer.id) ? 'You prayed ✓' : 'I prayed'}</button>}</div>{tab === 'mine' && prayer.status === 'approved' && <button className="report-link" disabled={busy} onClick={() => run(() => db.from('prayer_requests').update({ status: 'answered' }).eq('id', prayer.id), 'Prayer marked answered. Thank you for sharing the update.')}>Mark this prayer answered</button>}{tab === 'exchange' && <><button className="report-link" onClick={() => setReportId(reportId === prayer.id ? null : prayer.id)}><Flag size={13} /> Report</button>{reportId === prayer.id && <form className="report-form" onSubmit={event => { event.preventDefault(); void run(async () => { const result = await db.from('reports').insert({ reporter_id: userId, target_type: 'prayer', target_id: prayer.id, reason: reason.trim() }); if (!result.error) { setReportId(null); setReason(''); } return result; }, 'Report sent to moderators.'); }}><input required minLength={5} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} placeholder="Briefly explain your concern" /><button disabled={busy}>Send report</button></form>}</>}</div>) : <div className="empty-state"><Heart size={28} /><h3>{tab === 'mine' ? 'No requests yet' : 'No public requests yet'}</h3><p>{tab === 'mine' ? 'Your requests and their review status will appear here.' : 'Check back soon, or share a request of your own.'}</p></div>}</div></>;
}

function MissionsPage({ data, busy, run, db, userId }: SectionProps) {
  const [filter, setFilter] = useState('All'); const [reflections, setReflections] = useState<Record<string, string>>({});
  const categories = ['All', ...Array.from(new Set(data.missions.map(m => m.category)))]; const list = data.missions.filter(m => filter === 'All' || m.category === filter);
  return <><Heading eyebrow="KINGDOM MISSIONS" title="Put faith into action" lead="Start with one practical act of care. Accept a mission, take action, then mark what you did." /><div className="filter-row">{categories.map(c => <button key={c} className={filter === c ? 'active' : ''} onClick={() => setFilter(c)}>{c}</button>)}</div><div className="mission-grid">{list.map(m => { const joined = data.participation.find(p => p.mission_id === m.id); const recommended = m.interest_tag === data.compass?.path; return <div className="panel mission-card" key={m.id}><div className="card-meta"><span className="tag">{m.category}</span>{recommended && <span className="recommend"><Sparkles size={13} /> For you</span>}</div><div className="mission-icon"><HandHeart size={26} /></div><h3>{m.title}</h3><p>{m.description}</p><div className="mission-details"><span>{m.location}</span><span>{m.date_text}</span></div>{!joined ? <button className="button" disabled={busy} onClick={() => run(() => db.from('mission_participation').insert({ mission_id: m.id, user_id: userId }), 'Mission accepted. You can return to reflect and complete it.')}>Accept mission <ArrowRight size={16} /></button> : joined.status === 'accepted' ? <div className="mission-complete"><textarea maxLength={2000} value={reflections[m.id] ?? ''} onChange={e => setReflections(old => ({ ...old, [m.id]: e.target.value }))} placeholder="Optional: What did you do or learn?" /><button className="button" disabled={busy} onClick={() => run(() => db.from('mission_participation').update({ status: 'completed', reflection: (reflections[m.id] || '').trim(), completed_at: new Date().toISOString() }).eq('mission_id', m.id).eq('user_id', userId), 'Mission completed. Thank you for serving.')}>Mark complete <Check size={17} /></button></div> : <div className="complete-note"><CheckCircle2 size={18} /> Completed{joined.reflection ? ` · ${joined.reflection}` : ''}</div>}</div>; })}</div></>;
}

function downloadCalendarInvite(event: Event) {
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
  const stamp = (value: Date) => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kingdom Seekers//Events//EN',
    'BEGIN:VEVENT', `UID:${event.id}@kingdomseekers`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escape(event.title)}`,
    `DESCRIPTION:${escape(event.description)}`, `LOCATION:${escape(`${event.venue}, ${event.location}`)}`,
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `kingdom-seekers-${event.id}.ics`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function EventsPage({ data, busy, run, db, userId }: SectionProps) {
  const [groupSizes, setGroupSizes] = useState<Record<string, number>>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const future = data.events.filter(event => event.published && new Date(event.starts_at).getTime() > now);
  const list = selectedDay ? future.filter(event => eventDayKey(event.starts_at) === selectedDay) : future;
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('event');
    if (!id) return;
    const timer = window.setTimeout(() => document.getElementById(`event-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    return () => window.clearTimeout(timer);
  }, [data.events]);
  return <><Heading eyebrow="GATHER TOGETHER" title="Events & gatherings" lead="Find upcoming moments to pray, connect, and serve together." />
    <div className="events-layout"><div className="events-side"><EventCalendar dates={future.map(event => event.starts_at)} selected={selectedDay} onSelect={setSelectedDay} /><PushSettings client={db} userId={userId} /></div>
      <div className="event-list">{list.length ? list.map(event => {
        const registration = data.registrations.find(item => item.event_id === event.id);
        return <article className="panel event-card" id={`event-${event.id}`} key={event.id}>
          <div className="date-tile"><strong>{new Date(event.starts_at).toLocaleDateString('en-NG', { day: '2-digit' })}</strong><span>{new Date(event.starts_at).toLocaleDateString('en-NG', { month: 'short' }).toUpperCase()}</span></div>
          <div className="event-info"><span className="eyebrow">KINGDOM SEEKERS EVENT</span><h2>{event.title}</h2>
            <EventMedia client={db} event={event} /><p>{event.description}</p>
            <div className="event-meta"><span><CalendarDays size={16} /> {date(event.starts_at)} - {new Date(event.starts_at).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' })}{event.ends_at ? ` to ${new Date(event.ends_at).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' })}` : ''}</span><span>{event.venue}, {event.location}</span></div>
            <button className="text-button" onClick={() => downloadCalendarInvite(event)}><CalendarDays size={15} /> Add to my calendar</button>
          </div>
          <div className="event-action">{registration ? <span className="complete-note"><CheckCircle2 size={18} /> Registered ? {registration.group_size} {registration.group_size === 1 ? 'person' : 'people'}</span> : <><label>Group size<input type="number" min={1} max={20} value={groupSizes[event.id] || 1} onChange={change => setGroupSizes(old => ({ ...old, [event.id]: Number(change.target.value) }))} /></label><button className="button" disabled={busy} onClick={() => run(() => db.from('event_registrations').insert({ event_id: event.id, user_id: userId, group_size: groupSizes[event.id] || 1 }), 'You are registered. We look forward to seeing you!')}>Register <ArrowRight size={16} /></button></>}</div>
        </article>;
      }) : <div className="empty-state"><CalendarDays size={29} /><h3>{selectedDay ? 'No events on this date' : 'No upcoming events'}</h3><p>{selectedDay ? 'Choose another date or show all upcoming events.' : 'New gatherings will appear here when announced.'}</p></div>}</div>
    </div></>;
}

function CommunityPage({ db, userId }: SectionProps) {
  return <><Heading eyebrow="OUR COMMUNITY" title="A place to belong" lead="Share your thoughts, ask for prayer, reply to one another, and stay connected in real time. Messages appear right away." /><CommunityChat client={db} userId={userId} /></>;
}

function ProfilePage({ data, busy, run, db, userId, email, refresh }: SectionProps & { email: string; refresh: () => Promise<void> }) {
  const profile = data.profile!; const [name, setName] = useState(profile.full_name); const [location, setLocation] = useState(profile.location || ''); const [bio, setBio] = useState(profile.bio || ''); const [interests, setInterests] = useState(profile.interests || []);
  return <><Heading eyebrow="MY SPACE" title="Your profile" lead="Keep your details current. Your profile is visible only to you and authorized admins." /><div className="profile-layout"><div className="panel profile-summary"><AvatarEditor client={db} userId={userId} name={profile.full_name} path={profile.avatar_path} onSaved={refresh} /><h2>{profile.full_name}</h2><p>{email}</p><div className="profile-stats"><div><strong>{data.progress.length}</strong><span>Journey days</span></div><div><strong>{data.prayed.length}</strong><span>Prayers offered</span></div><div><strong>{data.participation.filter(p => p.status === 'completed').length}</strong><span>Missions done</span></div></div><p className="privacy-note"><ShieldCheck size={17} /> Your journal, prayer history and email stay private.</p></div><div className="panel form-panel"><span className="eyebrow">YOUR INFORMATION</span><h3>Edit profile</h3><form onSubmit={event => { event.preventDefault(); void run(() => db.from('profiles').update({ full_name: name.trim(), first_name: name.trim().split(/\s+/)[0], location: location.trim(), bio: bio.trim(), interests }).eq('id', userId), 'Profile saved.'); }}><label>Full name<input required value={name} onChange={e => setName(e.target.value)} /></label><label>Location<input value={location} onChange={e => setLocation(e.target.value)} /></label><label>Bio<textarea maxLength={500} value={bio} onChange={e => setBio(e.target.value)} placeholder="A little about you" /></label><div className="eyebrow">YOUR INTERESTS</div><div className="choice-grid">{['Spiritual Growth','Prayer','Purpose','Service','Community','Events'].map(item => <button type="button" key={item} className={interests.includes(item) ? 'selected' : ''} onClick={() => setInterests(old => old.includes(item) ? old.filter(x => x !== item) : [...old, item])}>{item}</button>)}</div><Submit busy={busy}>Save changes</Submit></form></div></div><StaffAccess client={db} userId={userId} isStaff={data.roles.length > 0} /></>;
}

function AdminPage({ data, busy, run, db, userId, onPublished }: SectionProps & { onPublished: (notice: string) => Promise<void> }) {
  const [tab, setTab] = useState<'review' | 'content' | 'members' | 'notices'>('review');
  const [members, setMembers] = useState<Profile[]>([]); const [roles, setRoles] = useState<{ user_id: string; role: string }[]>([]);
  const [mission, setMission] = useState({ title: '', description: '', category: 'Service', location: 'Anywhere', date_text: 'Flexible', interest_tag: 'care' });
  const [notice, setNotice] = useState({ title: '', body: '' });
  const [dayEdit, setDayEdit] = useState<(typeof journeyDays)[number] | null>(null);
  const isAdmin = data.roles.includes('admin');
  const canPrayer = isAdmin || data.roles.includes('prayer_moderator');
  const canCommunity = isAdmin || data.roles.includes('community_moderator');
  const canMissions = isAdmin || data.roles.includes('missions_admin') || data.roles.includes('leader');
  const canEvents = isAdmin || data.roles.includes('events_admin') || data.roles.includes('leader');
  useEffect(() => { if (tab === 'members' && isAdmin) { void db.from('profiles').select('*').order('created_at', { ascending: false }).then(r => setMembers((r.data || []) as Profile[])); void db.from('staff_roles').select('*').then(r => setRoles((r.data || []) as typeof roles)); } }, [tab, isAdmin, db]);
  const pendingPrayers = data.prayers.filter(p => p.status === 'pending'); const openReports = data.reports.filter(r => r.status === 'open');
  return <><Heading eyebrow="STAFF STUDIO" title="Care for the community" lead="Review shared content, manage opportunities and keep members informed. Access follows your assigned role." /><div className="admin-stats"><div><strong>{pendingPrayers.length}</strong><span>Prayer requests</span></div><div><strong>{openReports.filter(r => r.target_type === 'post').length}</strong><span>Community reports</span></div><div><strong>{openReports.length}</strong><span>Open reports</span></div></div><div className="tabs admin-tabs">{(['review','content','members','notices'] as const).filter(t => t !== 'members' || isAdmin).filter(t => t !== 'notices' || isAdmin).map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div>
    {tab === 'review' && <div className="admin-stack">{canPrayer && <div className="panel"><span className="eyebrow">PRAYER MODERATION</span><h3>Pending requests</h3>{pendingPrayers.length ? pendingPrayers.map(p => <div className="review-row" key={p.id}><div><small>{p.visibility} · {p.category} · {date(p.created_at)}</small><p>{p.body}</p></div><div><button disabled={busy} onClick={() => run(() => db.from('prayer_requests').update({ status: 'approved' }).eq('id', p.id), 'Prayer request approved.')}>Approve</button><button disabled={busy} onClick={() => run(() => db.from('prayer_requests').update({ status: 'rejected' }).eq('id', p.id), 'Prayer request rejected.')}>Reject</button></div></div>) : <p className="muted">All caught up.</p>}</div>}{(canPrayer || canCommunity) && <div className="panel"><span className="eyebrow">SAFETY REPORTS</span><h3>Open reports</h3>{openReports.length ? openReports.filter(r => r.target_type === 'prayer' ? canPrayer : canCommunity).map(r => <div className="review-row" key={r.id}><div><small>{r.target_type} · {date(r.created_at)}</small><p>{r.reason}</p>{r.target_type === 'post' && <p className="muted">Message: {data.posts.find(post => post.id === r.target_id)?.body.slice(0, 250) || 'Open the Community to review this attachment or older message.'}</p>}<small>Content ID: {r.target_id}</small></div><div><button disabled={busy} onClick={() => run(() => db.from(r.target_type === 'prayer' ? 'prayer_requests' : 'community_posts').update({ status: 'rejected' }).eq('id', r.target_id), 'Content removed. Resolve the report after review.')}>Remove content</button><button disabled={busy} onClick={() => run(() => db.from('reports').update({ status: 'resolved' }).eq('id', r.id), 'Report resolved.')}>Resolve</button></div></div>) : <p className="muted">No open reports.</p>}</div>}</div>}
    {tab === 'content' && <div className="admin-content-grid">{isAdmin && <div className="panel form-panel"><span className="eyebrow">REVIVAL JOURNEY</span><h3>Edit journey days</h3><div className="manage-list">{data.days.map(d => <div key={d.day}><span>Day {d.day}: {d.title}</span><button onClick={() => setDayEdit({ ...d })}>Edit</button></div>)}</div>{dayEdit && <form onSubmit={e => { e.preventDefault(); void run(async () => { const result = await db.from('journey_days').update({ title: dayEdit.title, scripture: dayEdit.scripture, prompt: dayEdit.prompt, action: dayEdit.action }).eq('day', dayEdit.day); if (!result.error) setDayEdit(null); return result; }, `Day ${dayEdit.day} updated.`); }}><strong>Day {dayEdit.day}</strong><label>Title<input required value={dayEdit.title} onChange={e => setDayEdit({ ...dayEdit, title: e.target.value })} /></label><label>Scripture reference<input required value={dayEdit.scripture} onChange={e => setDayEdit({ ...dayEdit, scripture: e.target.value })} /></label><label>Reflection prompt<textarea required value={dayEdit.prompt} onChange={e => setDayEdit({ ...dayEdit, prompt: e.target.value })} /></label><label>Action<textarea required value={dayEdit.action} onChange={e => setDayEdit({ ...dayEdit, action: e.target.value })} /></label><Submit busy={busy}>Save day</Submit></form>}</div>}{canMissions && <div className="panel form-panel"><span className="eyebrow">SERVICE</span><h3>Create a mission</h3><form onSubmit={e => { e.preventDefault(); void run(async () => { const result = await db.from('missions').insert(mission); if (!result.error) setMission({ title: '', description: '', category: 'Service', location: 'Anywhere', date_text: 'Flexible', interest_tag: 'care' }); return result; }, 'Mission published.'); }}><label>Title<input required value={mission.title} onChange={e => setMission({ ...mission, title: e.target.value })} /></label><label>Description<textarea required value={mission.description} onChange={e => setMission({ ...mission, description: e.target.value })} /></label><div className="two-fields"><label>Category<input required value={mission.category} onChange={e => setMission({ ...mission, category: e.target.value })} /></label><label>Location<input required value={mission.location} onChange={e => setMission({ ...mission, location: e.target.value })} /></label></div><div className="two-fields"><label>When<input required value={mission.date_text} onChange={e => setMission({ ...mission, date_text: e.target.value })} /></label><label>Compass path<select value={mission.interest_tag} onChange={e => setMission({ ...mission, interest_tag: e.target.value })}>{compassPaths.map(p => <option key={p.tag} value={p.tag}>{p.name}</option>)}</select></label></div><Submit busy={busy}>Publish mission</Submit></form><div className="manage-list">{data.missions.map(m => <div key={m.id}><span>{m.title}</span><button disabled={busy} onClick={() => run(() => db.from('missions').update({ published: !m.published }).eq('id', m.id), m.published ? 'Mission unpublished.' : 'Mission published.')}>{m.published ? 'Unpublish' : 'Publish'}</button></div>)}</div></div>}{canEvents && <><EventPublisher client={db} userId={userId} onPublished={onPublished} /><div className="panel form-panel"><span className="eyebrow">EVENT MANAGEMENT</span><h3>Published events</h3><div className="manage-list">{data.events.map(e => <div key={e.id}><span>{e.title} - {date(e.starts_at)}</span><button disabled={busy} onClick={() => run(() => db.from('events').update({ published: !e.published }).eq('id', e.id), e.published ? 'Event unpublished.' : 'Event published.')}>{e.published ? 'Unpublish' : 'Publish'}</button></div>)}</div></div></>}</div>}
    {tab === 'members' && isAdmin && <><StaffRequests client={db} /><div className="panel"><span className="eyebrow">ACCESS CONTROL</span><h3>Members and staff roles</h3><p className="muted">Only an admin can assign roles. Give each staff member the least access they need.</p><div className="member-list">{members.map(member => <div key={member.id}><div><strong>{member.full_name || 'Unnamed member'}</strong><small>{member.location || 'Location not set'}</small></div><select value={roles.find(r => r.user_id === member.id)?.role || ''} onChange={e => { const oldRole = roles.find(r => r.user_id === member.id)?.role; const newRole = e.target.value; void run(async () => { if (oldRole) { const removed = await db.rpc('set_staff_role', { target_user: member.id, new_role: oldRole, enabled: false }); if (removed.error) return removed; } if (newRole) { const added = await db.rpc('set_staff_role', { target_user: member.id, new_role: newRole, enabled: true }); if (added.error) return added; } const updated = await db.from('staff_roles').select('*'); setRoles((updated.data || []) as typeof roles); return updated; }, 'Role updated.'); }}><option value="">Member</option>{['admin','leader','prayer_moderator','community_moderator','events_admin','missions_admin'].map(role => <option key={role} value={role}>{role.replaceAll('_',' ')}</option>)}</select></div>)}</div></div></>}
    {tab === 'notices' && isAdmin && <div className="panel form-panel notice-editor"><span className="eyebrow">ANNOUNCEMENTS</span><h3>Send a community update</h3><p className="muted">This notice will appear on every member’s dashboard.</p><form onSubmit={e => { e.preventDefault(); void run(async () => { const { data: auth } = await db.auth.getSession();
      if (!auth.session) return { error: { message: 'Please sign in again.' } };
      const response = await fetch('/api/announcements', { method: 'POST', headers: { Authorization: `Bearer ${auth.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(notice) });
      const result = await response.json();
      if (!response.ok) return { error: { message: result.error || 'Could not publish announcement.' } };
      setNotice({ title: '', body: '' });
      return { error: null }; }, 'Announcement published. Push delivery was attempted for subscribed devices.'); }}><label>Title<input required value={notice.title} onChange={e => setNotice({ ...notice, title: e.target.value })} /></label><label>Message<textarea required value={notice.body} onChange={e => setNotice({ ...notice, body: e.target.value })} /></label><Submit busy={busy}>Publish announcement</Submit></form></div>}
  </>;
}
