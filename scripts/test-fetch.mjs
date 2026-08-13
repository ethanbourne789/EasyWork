import { createClient } from '@supabase/supabase-js';

const url = 'https://nbcsywzqvvputqitmpla.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iY3N5d3pxdnZwdXRxaXRtcGxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MTQ1MDAsImV4cCI6MjA5Njk5MDUwMH0.KPiSoIVyMitVt7hk6Y6pE_BN9lr3W6YWJ3sqIZZ-NEQ';

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
  email: 'ethanbourne789@gmail.com',
  password: 'oceanking7',
});
if (authErr) { console.error('AUTH_ERR', authErr.message); process.exit(1); }
console.log('LOGGED_IN user=', auth.user?.id, 'email=', auth.user?.email);

// Find the QQ account id
const { data: accts, error: aerr } = await sb
  .from('email_accounts')
  .select('id, email, imap_host, imap_port, use_ssl, smtp_host, smtp_port')
  .eq('email', '1633856788@qq.com');
console.log('ACCOUNTS', JSON.stringify(accts), 'err', aerr?.message);

const body = accts && accts[0] ? { accountId: accts[0].id } : { scheduled: false };
console.log('INVOKE body', JSON.stringify(body));
const { data, error } = await sb.functions.invoke('fetch-mail', { body });
console.log('FETCH_DATA', JSON.stringify(data));
console.log('FETCH_ERROR', JSON.stringify(error));

// check emails count for this account
if (accts && accts[0]) {
  const { count } = await sb.from('emails').select('*', { count: 'exact', head: true }).eq('email_account_id', accts[0].id);
  console.log('EMAIL_COUNT', count);
}
