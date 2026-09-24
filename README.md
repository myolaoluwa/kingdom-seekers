# The Seekers’ Hub — V1

A mobile-first Kingdom Seekers app built around **Discover → Grow → Pray → Serve → Impact**. The refined Kingdom Seekers logo is used throughout the app.

## What V1 includes

- Email registration with password confirmation and code verification, sign-in, code-based password recovery, progressive onboarding, and private profile editing.
- Kingdom Compass reflection with a suggested service pathway and related missions.
- Seven-day Revival Journey with progress and a private journal.
- Prayer Exchange with anonymous, first-name, and private requests; moderation; one “I prayed” response per person; and prayer counts.
- Missions with acceptance, completion, and optional reflection.
- Encouragement and testimony posts with pre-publication review and content reporting.
- Event listing, capacity-aware individual/group registration, and confirmation.
- Personalized home dashboard with the next step, progress, an event, and announcements.
- Role-aware staff studio for prayer and community moderation, reports, missions, events, announcements, and admin role assignment.

## Run locally

1. The V1 migrations have been applied to project `ulbmhpohfzafosjzycor`. For a fresh Supabase project, run [`supabase/migrations/202609230001_v1.sql`](supabase/migrations/202609230001_v1.sql) followed by [`supabase/migrations/202609240001_backfill_profiles.sql`](supabase/migrations/202609240001_backfill_profiles.sql) in its SQL editor. The second migration creates profiles for accounts registered before the profile trigger existed.
2. The ignored `.env.local` is configured for project `ulbmhpohfzafosjzycor`. Copy [`.env.example`](.env.example) and use your own project values if you need a different Supabase project. The browser uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; server routes use `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_JWKS_URL`. Never place a secret or service-role key in a `NEXT_PUBLIC_` variable.
3. Run `npm install`, then `npm run dev`. Open <http://localhost:3000>.
4. Register an account, enter the confirmation code from the email, and continue. The forgot-password flow also uses an emailed code before allowing a new password.
   In Supabase Authentication → URL Configuration, set the production Site URL to `https://kingdom-seekers-delight12.vercel.app` and allow both that URL and `http://localhost:3000` as redirect URLs.
5. Project `ulbmhpohfzafosjzycor` already has its first admin. For a fresh project, appoint the first admin after confirming the account belongs to the intended owner. If it is the only confirmed account, run `npm run auth:bootstrap-admin` with a management token that can write to the database. Otherwise, find the intended account’s UUID in Supabase Authentication → Users, then run this in the Supabase SQL editor (replace the placeholder):

   ```sql
   insert into public.staff_roles (user_id, role)
   values ('ACCOUNT_UUID_HERE', 'admin');
   ```

   Later role changes can be made in **Staff studio → Members** by an admin. Do not enable public inserts into `staff_roles`.

No events are published by default. Staff should create confirmed gatherings in Staff studio before inviting members. The database project and hosting account are external services; this repository does not contain their credentials.

## Supabase Auth email through Brevo

Supabase Auth owns signup, email confirmation, sign-in, and password recovery. Brevo only delivers the transactional emails through Supabase's custom SMTP settings. Brevo credentials are not used by the Next.js app and must not be added to Vercel or a `NEXT_PUBLIC_` variable.

1. Copy [`.env.auth.example`](.env.auth.example) to `.env.auth.local`. The project reference, site URL, redirect list, Brevo SMTP host (`smtp-relay.brevo.com`), port (`587`), and sender name are prefilled. `.env.auth.local` is ignored by Git.
2. Fill `SUPABASE_ACCESS_TOKEN` with a Supabase Management API token that can edit this project's Auth configuration. In Brevo **Settings → SMTP & API**, fill `BREVO_SMTP_LOGIN` with the SMTP login and `BREVO_SMTP_KEY` with the **full SMTP key**, not an API key or account password. Brevo shows the full key only when created; key formats can vary. Fill `BREVO_FROM_EMAIL` with a sender address verified in Brevo. Keep the token and SMTP key private.
3. Run `npm run auth:check` to validate the local fields, then `npm run auth:configure` to apply them to this Supabase project. The script enables email/password Auth with email confirmation, secure email changes, the production Site URL and allowed local redirect, and Brevo custom SMTP. It does not print credential values.
4. In Brevo, authenticate the sending domain with its recommended DNS records, and check transactional email logs. Test signup confirmation and password recovery using an address you control. Supabase's default mail service is restricted and is not intended for production.

The Auth and SMTP settings have been applied to project `ulbmhpohfzafosjzycor`. A real confirmation and recovery email should be tested with an address you control before inviting members. You can also enter the same values manually in Supabase **Authentication → SMTP Settings** and **Authentication → URL Configuration** instead of using the script. The application already points to the supplied Supabase project; no Brevo API package is needed. [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), and [Brevo SMTP settings](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP) describe the provider-side settings.

### Branded Auth emails

The eight HTML files in [`supabase/email-templates`](supabase/email-templates) cover signup confirmation, password recovery, invitation, magic link, email change, reauthentication, password-change notice, and email-change notice. Signup and recovery now contain one-time codes entered in the app; invitation and email-change flows retain links because the V1 app does not offer code-entry screens for those actions. They use the app's colors and text-based branding, so they do not depend on a remotely hosted logo image. Edit the copy in [`scripts/email-templates.mjs`](scripts/email-templates.mjs), then run `npm run auth:templates:build` to regenerate the HTML. Run `npm run auth:templates:apply` to update the hosted Supabase Auth subjects and content, or `npm run auth:templates:verify` to compare the hosted settings with the local files. The apply command also enables password-change and email-change security notices. It does not send messages.

Before inviting members, resolve Brevo's `525` unauthorized-IP SMTP response and test signup and recovery with an address you control. Disable click tracking for these transactional messages because link rewriting can interfere with Auth confirmation links. The Vercel production deployment currently has access protection, so an email link may reach a protected page until that setting is changed.

## Vercel deployment

This repository is linked to the Vercel project `delight12/kingdom-seekers`, with GitHub connected to `main`. The production alias is <https://kingdom-seekers-delight12.vercel.app>. The Vercel team's deployment protection currently requires a Vercel login to view it.

The five Supabase variables above are configured in Vercel for Production, Preview, and Development. Pushing to `main` triggers a production deployment. The supplied `SUPABASE_SECRET_KEY` was masked, so it was not configured; this V1 app uses row-level-security-scoped member access and does not require that key. The authenticated `GET /api/me` route uses `@supabase/server` to verify a bearer JWT and return the caller's profile under row-level security.

## Checks

Run `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:db`. GitHub Actions runs these checks on pushes and pull requests. The database test uses an embedded PostgreSQL engine to check the migration, privacy rules, moderation visibility, journey order, prayer counts, mission participation, and event capacity. The live project has the V1 schema, but member sign-up and email delivery still need a controlled end-to-end check.

## Privacy model

Supabase Row Level Security controls all member data. Journal and Compass results belong to their owner. Private prayer requests are visible only to the requester and authorized prayer moderators/admins. Public prayer and community content is held for moderation before release. User roles live in a separate table; ordinary members cannot grant themselves staff permissions. Event capacity is enforced in the database.
