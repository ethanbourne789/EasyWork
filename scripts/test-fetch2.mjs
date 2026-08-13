import { createClient } from '@supabase/supabase-js';

const url = 'https://nbcsywzqvvputqitmpla.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iY3N5d3pxdnZwdXRxaXRtcGxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MTQ1MDAsImV4cCI6MjA5Njk5MDUwMH0.KPiSoIVyMitVt7hk6Y6pE_BN9lr3W6YWJ3sqIZZ-NEQ';
const sb = createClient(url, key, { auth: { persistSession: false } });

const { error: authErr } = await sb.auth.signInWithPassword({ email: 'ethanbourne789@gmail.com', password: 'oceanking7' });
if (authErr) { console.error('AUTH_ERR', authErr.message); process.exit(1); }
const { data: sess } = await sb.auth.getSession();
const jwt = sess.session.access_token;

const start = Date.now();
const res = await fetch(`${url}/functions/v1/fetch-mail`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${jwt}`, apikey: key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ accountId: '22ea9f42-12f0-48a6-9c9b-22569ff78c6e' }),
});
const elapsed = Date.now() - start;
console.log('STATUS', res.status, 'elapsed_ms', elapsed);
console.log('ACAO', res.headers.get('access-control-allow-origin'));
console.log('CONTENT_TYPE', res.headers.get('content-type'));
const body = await res.text();
console.log('BODY', body.slice(0, 1500));
