import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const directory = fileURLToPath(new URL('../supabase/email-templates/', import.meta.url));
const envPath = fileURLToPath(new URL('../.env.auth.local', import.meta.url));
const confirmationURL = '{{ .ConfirmationURL }}';
const siteURL = '{{ .SiteURL }}';

const templates = [
  {
    name: 'confirmation', subjectKey: 'mailer_subjects_confirmation', contentKey: 'mailer_templates_confirmation_content',
    subject: 'Confirm your email | Kingdom Seekers', eyebrow: 'WELCOME TO THE JOURNEY',
    title: 'Your journey starts here.',
    body: 'Thank you for joining Kingdom Seekers. Confirm your email address to activate your account and begin your seven-day journey.',
    action: 'Confirm my email', href: confirmationURL,
    note: 'If you did not create an account, you can ignore this email.',
  },
  {
    name: 'recovery', subjectKey: 'mailer_subjects_recovery', contentKey: 'mailer_templates_recovery_content',
    subject: 'Reset your password | Kingdom Seekers', eyebrow: 'ACCOUNT ACCESS',
    title: 'A fresh start is one click away.',
    body: 'We received a request to reset the password for your Kingdom Seekers account. Use the secure link below to choose a new password.',
    action: 'Reset my password', href: confirmationURL,
    note: 'If you did not request a password reset, ignore this email. Your password will stay the same.',
  },
  {
    name: 'invite', subjectKey: 'mailer_subjects_invite', contentKey: 'mailer_templates_invite_content',
    subject: 'You are invited | Kingdom Seekers', eyebrow: 'A PERSONAL INVITATION',
    title: 'There is a place for you here.',
    body: 'You have been invited to Kingdom Seekers. Accept your invitation to create your account and join a community growing in passion, love, and peace.',
    action: 'Accept invitation', href: confirmationURL,
    note: 'If you were not expecting this invitation, you can ignore this email.',
  },
  {
    name: 'magic-link', subjectKey: 'mailer_subjects_magic_link', contentKey: 'mailer_templates_magic_link_content',
    subject: 'Your sign-in link | Kingdom Seekers', eyebrow: 'SECURE SIGN-IN',
    title: 'Welcome back.',
    body: 'Use the secure link below to sign in to your Kingdom Seekers account. For your security, use it promptly and do not share it.',
    action: 'Sign in securely', href: confirmationURL,
    note: 'If you did not ask for this link, you can ignore this email.',
  },
  {
    name: 'email-change', subjectKey: 'mailer_subjects_email_change', contentKey: 'mailer_templates_email_change_content',
    subject: 'Confirm your email change | Kingdom Seekers', eyebrow: 'ACCOUNT SECURITY',
    title: 'Confirm your email address.',
    body: 'A change to the email address on your Kingdom Seekers account was requested. Use the secure link below to confirm this step.',
    action: 'Confirm email change', href: confirmationURL,
    note: 'If you did not request this change, do not use the link. Sign in and review your account.',
  },
  {
    name: 'reauthentication', subjectKey: 'mailer_subjects_reauthentication', contentKey: 'mailer_templates_reauthentication_content',
    subject: 'Your verification code | Kingdom Seekers', eyebrow: 'VERIFY IT IS YOU',
    title: 'One more step to keep your account safe.',
    body: 'Enter this one-time code in Kingdom Seekers to confirm a sensitive account action.',
    code: '{{ .Token }}',
    note: 'If you did not request this code, do not share it with anyone.',
  },
  {
    name: 'password-changed', subjectKey: 'mailer_subjects_password_changed_notification', contentKey: 'mailer_templates_password_changed_notification_content',
    subject: 'Your password was changed | Kingdom Seekers', eyebrow: 'SECURITY NOTICE',
    title: 'Your password was changed.',
    body: 'The password for your Kingdom Seekers account was recently changed.',
    action: 'Visit Kingdom Seekers', href: siteURL,
    note: 'If you did not make this change, use “Forgot password” on the sign-in page and secure your account immediately.',
  },
  {
    name: 'email-changed', subjectKey: 'mailer_subjects_email_changed_notification', contentKey: 'mailer_templates_email_changed_notification_content',
    subject: 'Your email address was changed | Kingdom Seekers', eyebrow: 'SECURITY NOTICE',
    title: 'Your email address was changed.',
    body: 'The email address for your Kingdom Seekers account was recently changed.',
    action: 'Visit Kingdom Seekers', href: siteURL,
    note: 'If you did not make this change, secure your account and contact the Kingdom Seekers team immediately.',
  },
];

function render(template) {
  const button = template.action ? `
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 26px"><tr><td bgcolor="#a44932" style="border-radius:8px"><a href="${template.href}" style="display:inline-block;background:#a44932;border:1px solid #a44932;border-radius:8px;color:#ffffff;font-size:15px;font-weight:700;line-height:20px;padding:15px 25px;text-decoration:none">${template.action} &nbsp;→</a></td></tr></table>
                        ${template.href === confirmationURL ? `<p style="margin:0 0 24px;color:#847570;font-size:12px;line-height:19px">Button not working? <a href="${confirmationURL}" style="color:#843522;text-decoration:underline">Open the secure link</a>.</p>` : ''}` : '';
  const code = template.code ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 26px"><tr><td bgcolor="#f6eee9" align="center" style="border:1px solid #eee5df;border-radius:10px;padding:22px 12px;color:#843522;font-size:32px;font-weight:800;letter-spacing:8px">${template.code}</td></tr></table>` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${template.subject}</title>
</head>
<body style="margin:0;padding:0;background:#faf7f3;color:#2d2522;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
  <div style="display:none;font-size:1px;color:#faf7f3;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${template.body}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#faf7f3" style="background:#faf7f3"><tr><td align="center" style="padding:36px 16px 48px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:separate">
      <tr><td bgcolor="#2d2522" style="background:#2d2522;border-radius:14px 14px 0 0;padding:25px 32px">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
          <td width="38" height="38" align="center" valign="middle" bgcolor="#a44932" style="width:38px;height:38px;background:#a44932;border-radius:9px;color:#ffffff;font-size:19px;font-weight:800;letter-spacing:-2px">KS</td>
          <td style="padding-left:12px;color:#ffffff;font-size:15px;font-weight:800;letter-spacing:1.5px">KINGDOM SEEKERS<span style="display:block;margin-top:4px;color:#eacbbd;font-size:9px;font-weight:600;letter-spacing:2px">PASSION &nbsp;·&nbsp; LOVE &nbsp;·&nbsp; PEACE</span></td>
        </tr></table>
      </td></tr>
      <tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid #eee5df;border-top:0;padding:44px 38px 38px">
        <p style="margin:0 0 15px;color:#a44932;font-size:11px;font-weight:800;letter-spacing:2px;line-height:17px">${template.eyebrow}</p>
        <h1 style="margin:0 0 18px;color:#2d2522;font-family:Georgia,'Times New Roman',serif;font-size:31px;font-weight:700;line-height:1.2;letter-spacing:-.5px">${template.title}</h1>
        <p style="margin:0 0 27px;color:#655852;font-size:15px;line-height:25px">${template.body}</p>
        ${code}${button}
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#faf7f3" style="background:#faf7f3;border-left:3px solid #a44932;border-radius:0 6px 6px 0;padding:14px 17px;color:#655852;font-size:13px;line-height:21px">${template.note}</td></tr></table>
      </td></tr>
      <tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid #eee5df;border-top:0;border-radius:0 0 14px 14px;padding:20px 38px 25px;color:#847570;font-size:12px;line-height:19px">
        <strong style="color:#2d2522">Kingdom Seekers</strong><br>Growing together in passion, love, and peace.<br>
        <a href="${siteURL}" style="color:#843522;text-decoration:underline">Visit Kingdom Seekers</a>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>
`;
}

function localPayload() {
  const payload = {
    mailer_notifications_password_changed_enabled: true,
    mailer_notifications_email_changed_enabled: true,
  };
  for (const template of templates) {
    const path = join(directory, `${template.name}.html`);
    if (!existsSync(path)) throw new Error(`Missing ${path}. Run npm run auth:templates:build first.`);
    const content = readFileSync(path, 'utf8');
    if (!content.includes(template.code ?? template.href)) throw new Error(`${template.name}.html is missing its action placeholder.`);
    payload[template.subjectKey] = template.subject;
    payload[template.contentKey] = content;
  }
  return payload;
}

const mode = process.argv[2];
if (mode === '--build') {
  mkdirSync(directory, { recursive: true });
  for (const template of templates) writeFileSync(join(directory, `${template.name}.html`), render(template));
  console.log(`Built ${templates.length} branded Supabase email templates.`);
} else if (mode === '--apply' || mode === '--verify') {
  if (!existsSync(envPath)) throw new Error('Missing .env.auth.local.');
  process.loadEnvFile(envPath);
  const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!projectRef || !accessToken) throw new Error('SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN are required.');
  const payload = localPayload();
  const url = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/config/auth`;
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  if (mode === '--apply') {
    const response = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`Could not apply email templates (HTTP ${response.status}).`);
  }
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Could not verify email templates (HTTP ${response.status}).`);
  const remote = await response.json();
  const mismatches = Object.keys(payload).filter(key => remote[key] !== payload[key]);
  if (mismatches.length) throw new Error(`${mismatches.length} template fields differ from local files.`);
  console.log(`${templates.length} Supabase email templates and subjects match the local files.`);
} else {
  console.error('Usage: node scripts/email-templates.mjs --build|--apply|--verify');
  process.exitCode = 1;
}
