// Sends the two direct server checks from README section 3 and prints
// each response. Start the server first (npm start), then run:
//   node scripts/direct-checks.cjs
// Optional: BASE_URL=http://localhost:4000 node scripts/direct-checks.cjs

const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const TEST_PASSWORD = 'Wellspring-Test-2026'; // fictional test account (README section 2)

async function send(label, method, path, body, cookie) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json();
  console.log(`\n${label}\n  ${method} ${path} -> HTTP ${res.status}`);
  console.log('  ' + JSON.stringify(data, null, 2).replace(/\n/g, '\n  '));
  return { res, data };
}

(async () => {
  // Sign in as the volunteer Priya Shah and keep her session cookie.
  const login = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'priya.shah@example.com', password: TEST_PASSWORD })
  });
  if (!login.ok) throw new Error(`Sign-in failed with HTTP ${login.status}. Is the server running at ${BASE}?`);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  console.log(`Signed in as Priya Shah (Volunteer) at ${BASE}`);

  // Check 1: invalid request. Expected: HTTP 400 with a message per field; nothing saved.
  await send('CHECK 1 — invalid report (blank title, unknown room, bad urgency, short description)',
    'POST', '/api/requests', { title: '', room_id: 999, category_id: 4, urgency: 'Whenever', description: 'short' }, cookie);

  // Check 2a: a volunteer tries a staff-only update. Expected: HTTP 403.
  await send('CHECK 2a — volunteer tries to change a request\'s status (staff only)',
    'PATCH', '/api/requests/9', { status: 'Assigned', assigned_to_id: 2 }, cookie);

  // Check 2b: a volunteer asks for the full staff queue. Expected: HTTP 403.
  await send('CHECK 2b — volunteer asks for every report (staff queue)', 'GET', '/api/requests?scope=all', undefined, cookie);

  // Check 2c: no session cookie at all. Expected: HTTP 401.
  await send('CHECK 2c — not signed in', 'POST', '/api/requests',
    { title: 'Test', room_id: 1, category_id: 1, urgency: 'Low', description: 'No cookie sent.' });
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
