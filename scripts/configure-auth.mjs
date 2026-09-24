import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../.env.auth.local', import.meta.url));
if (!existsSync(envPath)) {
  console.error('Copy .env.auth.example to .env.auth.local and fill the blank values.');
  process.exit(1);
}
process.loadEnvFile(envPath);

const names = [
  'SUPABASE_PROJECT_REF', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_AUTH_SITE_URL',
  'SUPABASE_AUTH_REDIRECT_URLS', 'BREVO_SMTP_HOST', 'BREVO_SMTP_PORT',
  'BREVO_SMTP_LOGIN', 'BREVO_SMTP_KEY', 'BREVO_FROM_EMAIL', 'BREVO_FROM_NAME',
];
const missing = names.filter(name => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Fill these values in .env.auth.local: ${missing.join(', ')}`);
  process.exit(1);
}

const config = Object.fromEntries(names.map(name => [name, process.env[name].trim()]));
const siteUrl = new URL(config.SUPABASE_AUTH_SITE_URL);
if (siteUrl.protocol !== 'https:') throw new Error('SUPABASE_AUTH_SITE_URL must use HTTPS.');
if (!Number.isInteger(Number(config.BREVO_SMTP_PORT)) || Number(config.BREVO_SMTP_PORT) < 1) {
  throw new Error('BREVO_SMTP_PORT must be a valid port number.');
}
if (!config.BREVO_FROM_EMAIL.includes('@')) throw new Error('BREVO_FROM_EMAIL must be an email address.');
if (config.BREVO_SMTP_KEY.length < 12 || config.BREVO_SMTP_KEY.startsWith('xkeysib-') || /[•*]/.test(config.BREVO_SMTP_KEY)) {
  console.error('BREVO_SMTP_KEY must be the full Brevo SMTP key, not an API key or masked value.');
  process.exit(1);
}

const payload = {
  site_url: config.SUPABASE_AUTH_SITE_URL,
  uri_allow_list: config.SUPABASE_AUTH_REDIRECT_URLS,
  disable_signup: false,
  external_email_enabled: true,
  mailer_secure_email_change_enabled: true,
  mailer_autoconfirm: false,
  smtp_admin_email: config.BREVO_FROM_EMAIL,
  smtp_host: config.BREVO_SMTP_HOST,
  smtp_port: config.BREVO_SMTP_PORT,
  smtp_user: config.BREVO_SMTP_LOGIN,
  smtp_pass: config.BREVO_SMTP_KEY,
  smtp_sender_name: config.BREVO_FROM_NAME,
};

if (process.argv.includes('--check')) {
  console.log('Auth and SMTP configuration values are complete. No remote changes made.');
  process.exit(0);
}

const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(config.SUPABASE_PROJECT_REF)}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${config.SUPABASE_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});
if (!response.ok) {
  console.error(`Supabase Auth configuration failed (HTTP ${response.status}). Check your access token, project access, and settings.`);
  process.exit(1);
}
console.log('Supabase Auth is configured to deliver email through Brevo SMTP.');
