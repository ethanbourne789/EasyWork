import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nbcsywzqvvputqitmpla.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iY3N5d3pxdnZwdXRxaXRtcGxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MTQ1MDAsImV4cCI6MjA5Njk5MDUwMH0.KPiSoIVyMitVt7hk6Y6pE_BN9lr3W6YWJ3sqIZZ-NEQ';

const client = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: authData, error: authErr } = await client.auth.signInWithPassword({
  email: 'ethanbourne789@gmail.com',
  password: 'oceanking7',
});
if (authErr) {
  console.error('AUTH ERR', authErr.message);
  process.exit(1);
}
const userId = authData.user.id;
console.log('userId:', userId);

const { data: folders, error: fErr } = await client
  .from('email_folders')
  .select('id, name, imap_path, unread_count, email_account_id')
  .order('sort_order');
if (fErr) { console.error('FOLDERS ERR', fErr.message); }
console.log('FOLDERS:', JSON.stringify(folders, null, 2));

const { data: emails, error: eErr } = await client
  .from('emails')
  .select('id, folder_id, subject, is_read, received_at');
if (eErr) { console.error('EMAILS ERR', eErr.message); }
console.log('TOTAL EMAILS VISIBLE TO USER:', emails?.length ?? 0);

const byFolder = {};
for (const e of emails ?? []) {
  byFolder[e.folder_id] = (byFolder[e.folder_id] ?? 0) + 1;
}
console.log('EMAILS BY FOLDER_ID:', JSON.stringify(byFolder, null, 2));

// cross-check: does the INBOX folder id contain emails?
const inbox = (folders ?? []).find((f) => f.imap_path?.toUpperCase() === 'INBOX') ?? folders?.[0];
console.log('SELECTED INBOX FOLDER_ID:', inbox?.id, 'name=', inbox?.name);
console.log('EMAILS IN THAT FOLDER:', byFolder[inbox?.id] ?? 0);
