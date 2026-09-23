# The Seekers’ Hub — V1

A mobile-first Kingdom Seekers app built around **Discover → Grow → Pray → Serve → Impact**. The refined Kingdom Seekers logo is used throughout the app.

## What V1 includes

- Email registration and sign-in, progressive onboarding, profile editing, and profile visibility controls.
- Kingdom Compass reflection with a suggested service pathway and related missions.
- Seven-day Revival Journey with progress and a private journal.
- Prayer Exchange with anonymous, first-name, and private requests; moderation; one “I prayed” response per person; and prayer counts.
- Missions with acceptance, completion, and optional reflection.
- Encouragement and testimony posts with pre-publication review and content reporting.
- Event listing, capacity-aware individual/group registration, and confirmation.
- Personalized home dashboard with the next step, progress, an event, and announcements.
- Role-aware staff studio for prayer and community moderation, reports, missions, events, announcements, and admin role assignment.

## Run locally

1. Create a Supabase project. In its SQL editor, run [`supabase/migrations/202609230001_v1.sql`](supabase/migrations/202609230001_v1.sql) once. It creates the V1 tables, access policies, triggers, starter missions, events, and welcome announcement.
2. Replace the two placeholder values already in `.env.local`: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Find both in the Supabase project **Connect** dialog. These are the only Supabase environment variables this V1 app reads. Never place a secret or service-role key in a `NEXT_PUBLIC_` variable.
3. Run `npm install`, then `npm run dev`. Open <http://localhost:3000>.
4. Register an account. If email confirmation is enabled in Supabase Auth, confirm the email before signing in.
5. To appoint the first admin, find that account’s UUID in Supabase Authentication → Users, then run this in the Supabase SQL editor (replace the placeholder):

   ```sql
   insert into public.staff_roles (user_id, role)
   values ('ACCOUNT_UUID_HERE', 'admin');
   ```

   Later role changes can be made in **Staff studio → Members** by an admin. Do not enable public inserts into `staff_roles`.

The seeded events are examples and should be updated in Staff studio before inviting members. The database project and hosting account are external services; this repository does not contain their credentials.

## Vercel deployment

This repository is linked to the Vercel project `delight12/kingdom-seekers`, with GitHub connected to `main`. The production alias is <https://kingdom-seekers-delight12.vercel.app>. The Vercel team's deployment protection currently requires a Vercel login to view it.

The project does not yet have Supabase environment values on Vercel. After you have real project values, add both for production with the Vercel CLI:

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
```

Enter each value at the CLI prompt. Add the same names for `preview` if you want pull request previews to use Supabase. Then trigger a new production deployment with `vercel --prod` or push a commit to `main`. Do not add placeholders or secret/service-role keys to Vercel's public variables.

## Checks

Run `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:db`. The database test uses an embedded PostgreSQL engine to check the migration, privacy rules, moderation visibility, journey order, and prayer counts. The SQL migration must still be applied to a Supabase project for live account and data flows; local checks do not verify those live flows.

## Privacy model

Supabase Row Level Security controls all member data. Journal and Compass results belong to their owner. Private prayer requests are visible only to the requester and authorized prayer moderators/admins. Public prayer and community content is held for moderation before release. User roles live in a separate table; ordinary members cannot grant themselves staff permissions. Event capacity is enforced in the database.
