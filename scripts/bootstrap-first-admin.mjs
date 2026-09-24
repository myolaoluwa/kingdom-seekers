import { fileURLToPath } from 'node:url';

process.loadEnvFile(fileURLToPath(new URL('../.env.auth.local', import.meta.url)));
const { SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN } = process.env;
if (!SUPABASE_PROJECT_REF || !SUPABASE_ACCESS_TOKEN) throw new Error('Fill Supabase access settings in .env.auth.local first.');

const query = `
  insert into public.staff_roles (user_id, role)
  select id, 'admin' from auth.users
  where email_confirmed_at is not null
    and (select count(*) from auth.users where email_confirmed_at is not null) = 1
    and not exists (select 1 from public.staff_roles where role = 'admin')
  on conflict do nothing
  returning role;
`;
const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(SUPABASE_PROJECT_REF)}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
if (!response.ok) throw new Error(`Admin bootstrap failed (HTTP ${response.status}).`);
const rows = await response.json();
if (rows.length !== 1) throw new Error('No role assigned. Check that there is exactly one confirmed account and no existing admin.');
console.log('The sole confirmed account is now the first admin.');
